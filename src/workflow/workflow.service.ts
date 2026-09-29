import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { readPort } from '../common/config.js';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createRun, type RunHandle } from './runtime.js';
import { pickVariant, VARIANT_INFO } from './variants/index.js';
import type { ClientMessage, ServerMessage } from './types.js';

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private server?: WebSocketServer;
  private cleanup = () => {};
  async onModuleInit() {
    /** How long a run survives with nobody watching, so a reload can find it again. */
    const RUN_TTL_MS = 5 * 60_000;

    const runs = new Map<string, RunHandle>();
    const reapers = new Map<string, NodeJS.Timeout>();

    const wss = (this.server = new WebSocketServer({ port: readPort('WORKFLOW_PORT', 8788) }));
    let connSeq = 0;

    /** Schedules disposal once a run has nobody left watching it. */
    function scheduleReap(runId: string) {
      const run = runs.get(runId);
      if (!run || run.subscriberCount() > 0) return;
      clearTimeout(reapers.get(runId));
      reapers.set(
        runId,
        setTimeout(() => {
          const still = runs.get(runId);
          if (still && still.subscriberCount() === 0) {
            still.dispose();
            runs.delete(runId);
            reapers.delete(runId);
            console.log(`[${runId}] disposed after ${RUN_TTL_MS / 1000}s idle`);
          }
        }, RUN_TTL_MS),
      );
    }

    function cancelReap(runId: string) {
      const timer = reapers.get(runId);
      if (timer) {
        clearTimeout(timer);
        reapers.delete(runId);
      }
    }

    wss.on('connection', (socket: WebSocket) => {
      const connId = `conn-${++connSeq}`;
      /** Every run this socket is watching, and how to stop watching it. */
      const subs = new Map<string, () => void>();
      console.log(`[${connId}] connected`);

      const send = (message: ServerMessage) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      };

      const fail = (message: string, code: string, recoverable: boolean) =>
        send({
          type: 'run.error',
          runId: '',
          seq: 0,
          timestamp: Date.now(),
          message,
          code,
          recoverable,
        });

      const attach = (run: RunHandle) => {
        cancelReap(run.runId);
        if (!subs.has(run.runId)) subs.set(run.runId, run.subscribe(send));
        const { run: wire, log } = run.snapshot();
        send({
          type: 'run.snapshot',
          runId: run.runId,
          seq: 0,
          timestamp: Date.now(),
          run: wire,
          log,
          variants: VARIANT_INFO,
        });
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
        const msg = parsed as Partial<ClientMessage> & { type?: string };

        switch (msg.type) {
          case 'run.start': {
            if (msg.variantId !== undefined && typeof msg.variantId !== 'string') return;
            const script = pickVariant((msg as { variantId?: string }).variantId);
            const runId = randomUUID();
            const run = createRun(script, runId, VARIANT_INFO);
            runs.set(runId, run);
            console.log(`[${connId}] started ${script.id} as ${runId}`);
            attach(run);
            return;
          }

          case 'run.attach': {
            const runId = (msg as { runId?: string }).runId;
            const run = runId ? runs.get(runId) : undefined;
            if (!run) {
              console.log(`[${connId}] attach to unknown run ${runId}`);
              // Recoverable: the client answers this by starting a fresh run.
              fail('That run is no longer on the server.', 'RUN_NOT_FOUND', true);
              return;
            }
            console.log(`[${connId}] attached to ${runId}`);
            attach(run);
            return;
          }

          case 'run.decide': {
            const { runId, stepId, decision, note } = msg as Extract<
              ClientMessage,
              { type: 'run.decide' }
            >;
            const run = runs.get(runId);
            if (!run) return fail('That run is no longer on the server.', 'RUN_NOT_FOUND', true);
            console.log(`[${connId}] ${runId} ${stepId} → ${decision}`);
            if (
              typeof stepId !== 'string' ||
              !['approved', 'changes', 'declined'].includes(decision) ||
              (note !== undefined && typeof note !== 'string')
            )
              return;
            run.decide(stepId, decision, note);
            return;
          }

          case 'run.control': {
            const { runId, action } = msg as Extract<ClientMessage, { type: 'run.control' }>;
            const run = runs.get(runId);
            if (!run) return fail('That run is no longer on the server.', 'RUN_NOT_FOUND', true);
            console.log(`[${connId}] ${runId} ${action}`);
            if (!['pause', 'resume', 'restart'].includes(action)) return;
            run.control(action);
            return;
          }

          default:
            console.log(`[${connId}] ignoring unknown message`, parsed);
        }
      });

      socket.on('close', () => {
        for (const [runId, unsubscribe] of subs) {
          unsubscribe();
          scheduleReap(runId);
        }
        subs.clear();
        console.log(`[${connId}] disconnected`);
      });

      socket.on('error', (err) => {
        console.error(`[${connId}] socket error:`, err.message);
      });
    });

    this.cleanup = () => {
      for (const timer of reapers.values()) clearTimeout(timer);
      for (const run of runs.values()) run.dispose();
      reapers.clear();
      runs.clear();
    };

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
