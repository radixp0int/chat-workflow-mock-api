import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { NestFactory } from '@nestjs/core';
import { WebSocket } from 'ws';
import { AppModule } from '../dist/app.module.js';
import { ChatService } from '../dist/chat/chat.service.js';
import { WorkflowService } from '../dist/workflow/workflow.service.js';
import { chunkText, runScenario } from '../dist/chat/stream.js';
import { readPort } from '../dist/common/config.js';

test('chunking preserves whitespace and summary preserves answer and citations', async () => {
  const text = 'Hello  world\n\nNext line.\tDone.';
  assert.equal(chunkText(text).join(''), text);
  const events = [];
  await runScenario(
    [{ kind: 'answer', text: 'Hi', sources: [{ id: 1, title: 'Doc', markdown: 'Hi' }] }],
    'test',
    (event) => events.push(event),
    new AbortController().signal,
  );
  const summary = events.at(-1);
  assert.equal(summary.type, 'summary');
  assert.equal(
    events
      .filter((e) => e.type === 'token')
      .map((e) => e.text)
      .join(''),
    summary.text,
  );
  assert.equal(summary.sources[0].id, 1);
});

test(
  'Nest hosts both protocols, validates input, reconnects runs, and shuts down',
  { timeout: 15000 },
  async () => {
    process.env.CHAT_PORT = '0';
    process.env.WORKFLOW_PORT = '0';
    const app = await NestFactory.create(AppModule, { logger: false });
    const sockets = [];
    const connect = async (service) => {
      const port = app.get(service).server.address().port;
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      sockets.push(socket);
      await once(socket, 'open');
      return socket;
    };
    const receive = (socket) =>
      once(socket, 'message').then(([data]) => JSON.parse(data.toString()));
    try {
      await app.listen(0, '127.0.0.1');
      const health = await fetch(`${await app.getUrl()}/health`);
      assert.deepEqual(await health.json(), { status: 'ok' });
      const chat = await connect(ChatService);
      for (const bad of ['null', '[]', '{', '{"type":"chat","prompt":3}']) chat.send(bad);
      const firstChat = receive(chat);
      chat.send(JSON.stringify({ type: 'chat', prompt: 'hello' }));
      assert.equal((await firstChat).type, 'thinking');
      chat.close();
      const workflow = await connect(WorkflowService);
      for (const bad of ['null', '[]', '{']) workflow.send(bad);
      const snapshotPromise = receive(workflow);
      workflow.send(JSON.stringify({ type: 'run.start', variantId: 'onboarding' }));
      const snapshot = await snapshotPromise;
      assert.equal(snapshot.type, 'run.snapshot');
      assert.equal(snapshot.run.variantId, 'onboarding');
      const second = await connect(WorkflowService);
      const attach = receive(second);
      second.send(JSON.stringify({ type: 'run.attach', runId: snapshot.runId }));
      assert.equal((await attach).runId, snapshot.runId);
      const unknown = await connect(WorkflowService);
      const error = receive(unknown);
      unknown.send(JSON.stringify({ type: 'run.attach', runId: 'missing' }));
      assert.equal((await error).code, 'RUN_NOT_FOUND');
    } finally {
      for (const socket of sockets) socket.terminate();
      await app.close();
    }
  },
);

test('invalid ports fail early', () => {
  process.env.TEST_PORT = 'not-a-port';
  assert.throws(() => readPort('TEST_PORT', 3000));
  delete process.env.TEST_PORT;
  assert.equal(readPort('TEST_PORT', 3000), 3000);
});
