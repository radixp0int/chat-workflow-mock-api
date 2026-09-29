# Chat Workflow Mock API

A NestJS application that hosts the WebSocket backends for streaming chat and interactive workflow demos.

## Run

Use Node.js 22.14+ and npm:

```sh
npm ci
npm run dev
```

For a compiled build: `npm run build && npm start`.

| Endpoint           | Default                      | Environment variable |
| ------------------ | ---------------------------- | -------------------- |
| HTTP health        | http://localhost:3000/health | PORT                 |
| Chat WebSocket     | ws://localhost:8787          | CHAT_PORT            |
| Workflow WebSocket | ws://localhost:8788          | WORKFLOW_PORT        |

Stop the original servers before starting this app on their default ports. Both sockets retain their raw JSON protocols; no Socket.IO framing is required. PORT now controls HTTP; use CHAT_PORT and WORKFLOW_PORT for the sockets. Environment variables must be exported by your shell or process manager.

## Structure

- `src/chat`: Nest module/service, scenarios, citations, streaming engine, chat wire types.
- `src/workflow`: Nest module/service, run runtime, scripts, three variants, workflow wire types.
- `src/common`: shared configuration validation.
- `src/app.module.ts`: composition and health endpoint.
- `test`: automated protocol and lifecycle integration tests.
- `docs/chat.md` and `docs/workflow.md`: original scenario/protocol reference documentation; their standalone server commands describe the old repos.

Chat streams cancel on replacement/disconnect. Workflow runs remain attachable for five minutes after the last subscriber leaves. Nest shuts down both listeners and disposes runs on termination. State remains in memory and is lost on process restart.

## Quality and merge checks

`npm run check` runs conflict detection, Oxlint (warnings fail), Oxfmt, strict TypeScript, build, and tests. `npm run check:protocol` optionally compares the workflow contract to the sibling UI, ignoring formatting/comments; set WORKFLOW_PROTOCOL_FILE to require a specific contract file.

Husky pre-commit checks the staged content for conflict markers and unmerged entries, runs lint-staged (Oxlint fixes and Oxfmt), and typechecks. Pre-push runs the complete check. Hooks also reject unfinished merge/rebase/cherry-pick/revert operations; finish those operations deliberately before normal commits. If making a merge-resolution commit, use `HUSKY=0 git commit` after manually running the applicable checks.

`npm ci` installs the Git hooks automatically; `npm run prepare` reinstalls them when needed.

GitHub Actions runs the same checks on pull requests, `main` pushes, and merge queues. Configure branch protection to require the `quality` status check, pull-request review, resolved conversations, and an up-to-date branch or merge queue. Local hooks can be bypassed, so repository rules remain the authoritative merge guard.
