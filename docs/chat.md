# chat-ws-server

Mock WebSocket server that streams fake LLM events to the `chat-interfaces` UI.
No build step — runs `.ts` directly via Node's type stripping (Node 22.6+).

It exists to cover what the UI's built-in canned responder can't: tool calls,
faults reported two different ways, and large citation corpora. See
[Response modes](../chat-interfaces/README.md#response-modes) in the UI README
for the full split of what needs this server and what doesn't.

## Run the demo

```sh
# terminal 1 — this directory
npm install
npm run dev            # ws://localhost:8787

# terminal 2 — ../chat-interfaces
npm run dev            # http://localhost:5173 (VITE_WS_URL in .env.development points here)
```

`PORT` overrides the port (default `8787`). If you change it, change
`VITE_WS_URL` in the UI's `.env.development` to match — and restart the Vite dev
server, which only reads `.env` at startup.

## Demo keywords

`pickScenario` ([src/scenarios.ts](src/scenarios.ts)) routes the prompt to a
scenario. Matching is case-insensitive substring, not word-boundary — "failure"
trips `fail` — and **the order below is the evaluation order: the first rule that
matches wins.**

| Prompt contains                                                      | Scenario                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagram`, `mermaid`, `flowchart`, `draw`                            | A policy-lookup tool call, then an answer carrying two ` ```mermaid ` fences — a flowchart, then a sequence diagram — streamed like any other text so the client's draw-while-streaming path gets exercised |
| `degraded`, `partial`, `unhealthy`, `issues`                         | A streamed `RETRIEVAL_TIMEOUT`, a fallback keyword search, a failed rerank call, then an answer; three problems tallied on the summary, one code (`RETRIEVAL_TIMEOUT`) sent by both routes                  |
| `error`                                                              | Two tool calls succeed (positions, cost basis), the answer starts, then the stream dies mid-answer with a fatal error event (`UPSTREAM_UNAVAILABLE`)                                                        |
| `fail`                                                               | Two quote sources fail in sequence, a cached quote succeeds and gets range-checked, the model recovers and answers                                                                                          |
| `50` (standalone), `stress`, `many ref`, `lots of ref`               | A corpus-ranking tool call, then an answer citing a 50-document corpus, markers scattered across the range                                                                                                  |
| `cite`, `citation`, `reference`, `source`, `budget`, `save`/`saving` | A reference-search tool call, then an answer citing five references, with highlighted passages                                                                                                              |
| `tool`, `search`, `rate`, `market`                                   | Four sequential tool calls (rates, index moves, volatility, account allocation) before the answer                                                                                                           |
| anything else                                                        | Cycles the default scenarios (tool-heavy ↔ plain)                                                                                                                                                           |

Every scenario runs several `thinking` steps — the model reacting to each tool
result in turn rather than deciding everything up front in one paragraph —
interleaved with however many tool calls its story needs. The tool-heavy
scenarios run 4–6 thinking steps; `plain` runs 3 with no tool calls at all,
since forcing a tool into a pure conceptual question would be dishonest about
what real models do.

Two collisions to know about: `error` is tested before `fail`, and `source`
beats `search`.

Note that `fail` produces a turn the UI labels **`recovered`**, not failed — a
failed tool the model works around still ends in an answer. `error` is the only
route here to a genuinely failed turn.

## Protocol

The client sends `{"type":"chat","prompt":"..."}`. Anything else is ignored. The
server streams `WSEvent`s ([src/types.ts](src/types.ts)) until the response
finishes.

There are two parallel text streams, each many chunks followed by one complete
block:

| Chunks     | Completion | Carries               |
| ---------- | ---------- | --------------------- |
| `thinking` | `thought`  | the model's reasoning |
| `token`    | `summary`  | the final answer      |

Chunks concatenate verbatim — `chunks.join('') === text`, newlines included — so
a client can append them without re-inserting whitespace. `chunkText`
([src/stream.ts](src/stream.ts)) is what guarantees that.

Everything else about the answer rides out on the single `summary` event:
`sources`, `highlights`, `followups`, and any `errors`. `tool` events report a
call's `started` → `completed`/`failed` progress, matched by `toolCallId`.

One active stream per connection: sending a new chat message aborts the previous
one, and closing the socket cancels whatever is in flight.

### Two ways to report a fault

This is the part worth understanding, because the client treats them differently.

- **Streamed** as an `error` event the moment it happens. It carries a
  `timestamp`, so it earns a position on the turn's timeline.
- **Tallied** in `summary.errors` when the server only counts problems once the
  answer is done. These reach the client with no timing, so they render after
  every timed step rather than being given an invented position.

`recoverable` decides whether the turn survives: a streamed error with
`recoverable: false` ends the stream where it stands. `code` is the identity the
client dedupes on, so a fault sent by _both_ routes appears once, keeping the
timed copy.

The `degraded` scenario exists to prove exactly this — it emits
`RETRIEVAL_TIMEOUT` as a streamed event _and_ in the summary list.

### Keeping the wire types in sync

The UI holds a verbatim copy of `src/types.ts` at
`chat-interfaces/src/lib/engine/wsProtocol.ts`. The two are identical apart from
Prettier formatting. **Change one, change the other.**

## Adding a scenario

A `Scenario` is an array of declarative `ScenarioStep`s
([src/stream.ts](src/stream.ts)) — `thinking`, `tool`, `answer`, or `error`. The
steps say only what happens; `runScenario` owns all the timing, chunk indexes,
tool-call ids, timestamps, and jitter.

So adding one is two edits: write the step array in
[src/scenarios.ts](src/scenarios.ts), then add a line to `pickScenario` (or push
it onto `defaults` to put it in the no-keyword rotation).

## Smoke test

```sh
npm run smoke -- "how does the market look"
```

Prints every event and verifies streamed chunks reassemble into the final
`thought`/`summary` texts.

## Scripts

| Script              | Does                                                |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Server with `--watch` (restarts on edit)            |
| `npm start`         | Server without watch                                |
| `npm run smoke`     | Connect, send a prompt, print and verify the stream |
| `npm run typecheck` | `tsc --noEmit`                                      |
