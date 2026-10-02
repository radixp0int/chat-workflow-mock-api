# workflow-ws-server

Mock WebSocket server that drives the workflow canvas in `chat-interfaces`:
it streams a run as it happens, and takes approvals back. No build step — runs
`.ts` directly via Node's type stripping (Node 22.6+).

It is the sibling of [chat-ws-server](../chat-ws-server), and deliberately
separate from it: chat and workflows share no protocol, and this one can be
lifted out on its own.

Unlike the chat server, the socket here is **long-lived and bi-directional**. A
run stops at a human gate and nothing moves again until a `run.decide` arrives —
which is the whole point of the demo.

## Run the demo

```sh
# terminal 1 — this directory
npm install
npm run dev            # ws://localhost:8788

# terminal 2 — ../chat-interfaces
npm run dev:workflows  # http://localhost:5174, then open /workflow-live
```

`PORT` overrides the port (default `8788` — `8787` belongs to the chat server, and
both are meant to run side by side). If you change it, change
`VITE_WORKFLOW_WS_URL` in the UI's `apps/workflows/.env.development` to match, and restart the
Vite dev server, which only reads `.env` at startup.

With this server down, `/workflow-live` says so and falls back to the UI's
hard-coded run. `/workflow-demo` never touches this server at all.

## The three variants

Each is a different graph, not the same run with different words. Between them
they cover everything the canvas can draw.

| Variant           | The run                             | What it is there to show                                                                                         |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `loan-review`     | Commercial loan, 12 steps, 5 stages | The baseline — a three-way fan-out and one gate offering approve / changes / decline                             |
| `incident-triage` | SEV-2 latency incident, 14 steps    | A step that ends **`failed` and the run carries on**, and a status moving **backwards** to `running` for a retry |
| `onboarding`      | New hire across 5 systems, 16 steps | **Five tools running at once** in one column, and **two gates open together** — "Needs you" reads 2              |

`loan-review`'s "request changes" branch redoes the memo and asks again, twice.
The third time round the gate stops offering `changes`, so it terminates.

## Try it without the UI

```sh
npm run smoke                                  # loan review, approve at the gate
npm run smoke -- --variant onboarding          # a different run
npm run smoke -- --decide changes              # take the other branch
npm run smoke -- --decide declined --quiet     # statuses only
```

The smoke client answers a gate with `--decide` when that gate offers it, and
otherwise takes the first option it does offer — which is also what a real client
must do, because the server **ignores a decision that is not on offer**. That is
what keeps two browser tabs on the same run honest: the second click is a logged
no-op and both tabs see one outcome.

## Protocol

Full types in [src/types.ts](src/types.ts). Client → server:

| Message       | Effect                                                             |
| ------------- | ------------------------------------------------------------------ |
| `run.start`   | Creates a run from a variant and subscribes this socket to it      |
| `run.attach`  | Subscribes to an existing run by id; misses return `RUN_NOT_FOUND` |
| `run.decide`  | Answers the open gate on a step — approve / changes / decline      |
| `run.control` | `pause`, `resume`, `restart`                                       |

Server → client:

| Message        | Carries                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `run.snapshot` | The whole graph, current statuses, the log so far, the open gates, and the variant catalogue |
| `step.update`  | One step's status, result line and/or detail                                                 |
| `stage.update` | One stage's status or subtitle                                                               |
| `log.append`   | Run log entries                                                                              |
| `run.awaiting` | A gate has just opened                                                                       |
| `run.phase`    | `idle` / `running` / `paused` / `awaiting` / `finished` / `failed`                           |
| `run.error`    | Something went wrong; `recoverable` says whether the run is over                             |

Four decisions in here are worth knowing before changing anything:

1. **The graph arrives whole and never changes shape mid-run.** Steps that will
   be skipped ship already at `skipped`. A node set that changes flips React
   Flow's `useNodesInitialized()` back to false and re-frames the canvas under
   the reader, so only a snapshot may change it.
2. **Open gates are state, not just the `run.awaiting` event.** They ride on
   every snapshot. A client attaching to a run that is already waiting has no
   other way to learn what that step accepts.
3. **`declined` has no status of its own** — a declined step lands on `failed`.
4. **`finished` means the script ran to its end**, not that everything went well.
   A failed probe or a declined approval is an outcome the statuses already
   record; `failed` as a _phase_ means the server could not finish playing the run.

`seq` is monotonic per run and reset by every snapshot, which is what makes an
attach landing mid-flight idempotent rather than a replay.

## Runs outlive sockets

The server keeps `Map<runId, RunHandle>` and only disposes a run **five minutes
after its last subscriber leaves**. So a browser reload re-attaches by id and
picks the run up where it got to, and a second tab is simply a second
subscriber — both see every event, and a decision from either reaches both.

## Adding a variant

Write the script, then import it in [src/variants/index.ts](src/variants/index.ts).
A script is declarative — content only; [src/runtime.ts](src/runtime.ts) owns
every id, timestamp and delay, the way `runScenario` does in the chat server.

The step kinds are in [src/script.ts](src/script.ts): `work`, `parallel`,
`status`, `stage`, `log`, `skip`, `wait`, `gate`, `gateAll`.

Two things to watch:

- **A `gate` branch that re-declares the same gate must be bounded by the
  author.** Branches are built eagerly, so a branch that rebuilds itself
  unconditionally recurses forever at _construction_ time — see `MAX_REASKS` in
  [loanReview.ts](src/variants/loanReview.ts). The runtime's own gate-depth cap
  is a backstop behind that, not the primary bound.
- **Steps carry `{column, row}`, not pixels.** The client derives x from the
  accumulated column widths and centres each column vertically. `row` _orders_
  within a column; it is not an index, so gaps are fine.

## Keeping the wire types in sync

[src/types.ts](src/types.ts) and
`../chat-interfaces/apps/workflows/src/run/wireProtocol.ts` are the
same file with different headers. There is no shared package and no codegen, and
the failure mode of drift is an `undefined` field at runtime rather than a type
error — so `scripts/check-protocol-sync.sh` diffs them on commit and push. It
skips cleanly when the UI checkout isn't beside this one, and fails when the
checkout is there but the file isn't, since that means the path above is stale.

```sh
npm run check:protocol
```

The **UI's copy is canonical**: that repo runs Prettier over it and this one does
not, so `npm run format` there will otherwise reformat it out from under this
file. Edit either, copy the UI's body over this one's (keeping each file's own
header), commit both.
