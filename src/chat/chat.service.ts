import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { readPort } from '../common/config.js';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { pickScenario } from './scenarios.js';
import { runScenario } from './stream.js';
import type { WSEvent } from './types.js';

@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private server?: WebSocketServer;
  private cleanup = () => {};
  async onModuleInit() {
    const wss = (this.server = new WebSocketServer({ port: readPort('CHAT_PORT', 8787) }));
    let connSeq = 0;

    wss.on('connection', (socket: WebSocket) => {
      const connId = `conn-${++connSeq}`;
      let active: AbortController | null = null;
      console.log(`[${connId}] connected`);

      const send = (event: WSEvent) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      };

      socket.on('message', (data) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          console.log(`[${connId}] ignoring non-JSON message`);
          return;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        const msg = parsed as { type?: string; prompt?: string };
        if (msg.type !== 'chat' || typeof msg.prompt !== 'string') {
          console.log(`[${connId}] ignoring unknown message`, parsed);
          return;
        }

        // One active stream per connection; a new chat cancels the old one.
        active?.abort();
        const controller = new AbortController();
        active = controller;

        const streamId = randomUUID();
        console.log(
          `[${connId}] stream ${streamId} started — prompt: ${JSON.stringify(msg.prompt)}`,
        );

        runScenario(pickScenario(msg.prompt), streamId, send, controller.signal)
          .then(() => {
            const outcome = controller.signal.aborted ? 'cancelled' : 'finished';
            console.log(`[${connId}] stream ${streamId} ${outcome}`);
          })
          .catch((err) => {
            console.error(`[${connId}] stream ${streamId} crashed:`, err);
            send({
              type: 'error',
              streamId,
              timestamp: Date.now(),
              message: 'Internal mock-server error',
              code: 'INTERNAL',
              recoverable: false,
            });
          });
      });

      socket.on('close', () => {
        active?.abort();
        console.log(`[${connId}] disconnected`);
      });

      socket.on('error', (err) => {
        console.error(`[${connId}] socket error:`, err.message);
      });
    });

    await new Promise<void>((resolve, reject) => {
      wss.once('listening', resolve);
      wss.once('error', reject);
    });
  }
  async onModuleDestroy() {
    const server = this.server;
    if (!server) return;
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.cleanup();
  }
}
