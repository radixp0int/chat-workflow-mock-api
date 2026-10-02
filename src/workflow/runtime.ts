// Playing a script: pacing, human gates, pause/resume/restart, and the snapshot
// a reconnecting client gets handed.
//
// One RunHandle per run. It owns the run's mutable state, broadcasts every
// change to whoever is subscribed, and can rebuild a complete WireRun on demand
// so an attach needs no event replay.

import type { ScriptStep, RunScript, WorkStep } from './script.js';
import type {
  ControlAction,
  Decision,
  LogEntry,
  LogLevel,
  RunPhase,
  ServerMessage,
  VariantInfo,
  StepPatch,
  WireRun,
  WireStageStatus,
  WireStepStatus,
} from './types.js';

/** How often the pausable sleep wakes to look at the phase. */
const TICK_MS = 100;
/** The log a reconnecting client is handed; the UI caps at the same number. */
const LOG_CAP = 500;
/** How many times a gate may re-declare itself before the runtime stops asking. */
const MAX_GATE_DEPTH = 4;

/** Declining has no status of its own — see the note in types.ts. */
const STATUS_FOR: Record<Decision, WireStepStatus> = {
  approved: 'approved',
  changes: 'changes',
  declined: 'failed',
};

const VERDICT: Record<Decision, string> = {
  approved: 'Approved',
  changes: 'Sent back for changes',
  declined: 'Declined',
};

type Send = (message: ServerMessage) => void;

/**
 * A message before the envelope is stamped on. Distributive on purpose: a plain
 * `Omit` over a union collapses it to the keys every member shares, which here
 * is just the envelope — leaving a type that accepts nothing.
 */
type Unenveloped<T> = T extends unknown ? Omit<T, 'runId' | 'seq' | 'timestamp'> : never;
type Outgoing = Unenveloped<ServerMessage>;

type Pending = {
  stepId: string;
  decisions: Decision[];
  dueLabel?: string;
  settle: (outcome: { decision: Decision; note?: string }) => void;
};

export type RunHandle = {
  runId: string;
  variantId: string;
  snapshot(): { run: WireRun; log: LogEntry[] };
  subscribe(send: Send): () => void;
  subscriberCount(): number;
  decide(stepId: string, decision: Decision, note?: string): void;
  control(action: ControlAction): void;
  dispose(): void;
};

class Aborted extends Error {}

/**
 * `variants` is the catalogue the client's switcher draws. It rides on every
 * snapshot, including the one a restart broadcasts, so the run has to carry it.
 */
export function createRun(script: RunScript, runId: string, variants: VariantInfo[]): RunHandle {
  const subscribers = new Set<Send>();

  let statuses: Record<string, WireStepStatus> = { ...script.initialStatuses };
  /** Everything a step has been patched with, so snapshot() can rebuild it. */
  let patches = new Map<string, StepPatch>();
  let stageState = new Map<string, { status: WireStageStatus; sub: string }>();
  let phase: RunPhase = 'idle';
  let log: LogEntry[] = [];
  let seq = 0;
  /** Its own counter: a log id must be stable whatever else is being broadcast. */
  let logSeq = 0;
  let startedAt = Date.now();
  let pending: Pending[] = [];
  let controller = new AbortController();
  let disposed = false;

  const resetStages = () => {
    stageState = new Map(script.stages.map((s) => [s.id, { status: s.status, sub: s.sub }]));
  };
  resetStages();

  const broadcast = (message: Outgoing) => {
    const full = { ...message, runId, seq: ++seq, timestamp: Date.now() } as ServerMessage;
    for (const send of subscribers) send(full);
    return full;
  };

  const appendLog = (level: LogLevel, text: string, stepId?: string, source?: string) => {
    const entry: LogEntry = {
      id: `${runId}-${logSeq++}`,
      at: Date.now(),
      elapsedMs: Date.now() - startedAt,
      level,
      stepId,
      source: source ?? (stepId ? stepTitle(stepId) : undefined),
      text,
    };
    log.push(entry);
    if (log.length > LOG_CAP) log = log.slice(log.length - LOG_CAP);
    broadcast({ type: 'log.append', entries: [entry] });
  };

  const stepTitle = (stepId: string) => script.steps.find((s) => s.id === stepId)?.title;

  const setPhase = (next: RunPhase) => {
    if (phase === next) return;
    phase = next;
    broadcast({ type: 'run.phase', phase });
  };

  const patchStep = (stepId: string, patch: StepPatch) => {
    if (patch.status !== undefined) statuses[stepId] = patch.status;
    const merged = { ...patches.get(stepId), ...patch };
    patches.set(stepId, merged);
    broadcast({ type: 'step.update', stepId, patch });
  };

  const patchStage = (stageId: string, patch: { status?: WireStageStatus; sub?: string }) => {
    const current = stageState.get(stageId);
    if (current) stageState.set(stageId, { ...current, ...patch });
    broadcast({ type: 'stage.update', stageId, patch });
  };

  /**
   * Sleep that notices a pause. A plain setTimeout would keep running while the
   * run is stopped, so pausing would only hide the next event rather than
   * holding it — the obvious loop is worth the ugliness here.
   */
  async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    let remaining = ms;
    while (remaining > 0) {
      if (signal.aborted) throw new Aborted();
      await new Promise((r) => setTimeout(r, TICK_MS));
      if (phase !== 'paused') remaining -= TICK_MS;
    }
    if (signal.aborted) throw new Aborted();
  }

  async function runWork(step: WorkStep, signal: AbortSignal): Promise<void> {
    patchStep(step.stepId, { status: 'running' });
    if (step.startLog) appendLog('info', step.startLog, step.stepId);
    await sleep(step.durationMs, signal);
    const outcome = step.outcome ?? 'done';
    patchStep(step.stepId, {
      status: outcome,
      meta: step.meta,
      ...(step.detail && { detail: step.detail }),
    });
    appendLog(outcome === 'failed' ? 'error' : 'info', step.log ?? step.meta, step.stepId);
  }

  /** Opens a gate and resolves once someone answers it. */
  function openGate(
    stepId: string,
    decisions: Decision[],
    dueLabel: string | undefined,
    signal: AbortSignal,
  ): Promise<{ decision: Decision; note?: string }> {
    patchStep(stepId, { status: 'waiting', ...(dueLabel && { statusLabel: dueLabel }) });
    broadcast({ type: 'run.awaiting', stepId, decisions, dueLabel });
    appendLog('human', 'Waiting on a decision', stepId);

    return new Promise((resolve, reject) => {
      const entry: Pending = {
        stepId,
        decisions,
        dueLabel,
        settle: (outcome) => {
          pending = pending.filter((p) => p !== entry);
          resolve(outcome);
        },
      };
      pending.push(entry);
      signal.addEventListener(
        'abort',
        () => {
          pending = pending.filter((p) => p !== entry);
          reject(new Aborted());
        },
        { once: true },
      );
    });
  }

  /** Records the human outcome on the step and in the log. */
  function recordDecision(stepId: string, decision: Decision, note?: string) {
    const verdict = VERDICT[decision];
    appendLog('human', note ? `${verdict} — “${note}”` : verdict, stepId);
    patchStep(stepId, { status: STATUS_FOR[decision] });
  }

  async function play(steps: ScriptStep[], signal: AbortSignal, depth = 0): Promise<void> {
    for (const step of steps) {
      if (signal.aborted) throw new Aborted();

      switch (step.kind) {
        case 'work':
          await runWork(step, signal);
          break;

        case 'parallel': {
          // Every one goes `running` in the same tick, so the canvas lights up
          // in several places at once rather than marching left to right.
          await Promise.all(step.steps.map((s) => runWork(s, signal)));
          break;
        }

        case 'status': {
          if (step.afterMs) await sleep(step.afterMs, signal);
          patchStep(step.stepId, {
            status: step.status,
            ...(step.meta !== undefined && { meta: step.meta }),
            ...(step.statusLabel !== undefined && { statusLabel: step.statusLabel }),
            ...(step.detail && { detail: step.detail }),
          });
          break;
        }

        case 'stage':
          patchStage(step.stageId, { status: step.status, sub: step.sub });
          break;

        case 'log':
          appendLog(step.level, step.text, step.stepId, step.source);
          break;

        case 'skip': {
          for (const id of step.stepIds) patchStep(id, { status: 'skipped' });
          if (step.log) appendLog('warn', step.log, step.stepIds[0]);
          break;
        }

        case 'wait':
          await sleep(step.ms, signal);
          break;

        case 'gate': {
          if (depth >= MAX_GATE_DEPTH) {
            appendLog('warn', 'Asked too many times — closing this out', step.stepId);
            patchStep(step.stepId, { status: 'failed' });
            break;
          }
          setPhase('awaiting');
          const { decision, note } = await openGate(
            step.stepId,
            step.decisions,
            step.dueLabel,
            signal,
          );
          recordDecision(step.stepId, decision, note);
          setPhase('running');
          const branch = step.branches[decision];
          if (branch) await play(branch, signal, depth + 1);
          break;
        }

        case 'gateAll': {
          setPhase('awaiting');
          const answers = await Promise.all(
            step.gates.map((g) =>
              openGate(g.stepId, g.decisions, g.dueLabel, signal).then((outcome) => ({
                stepId: g.stepId,
                ...outcome,
              })),
            ),
          );
          for (const a of answers) recordDecision(a.stepId, a.decision, a.note);
          setPhase('running');
          const declined = answers.some((a) => a.decision === 'declined');
          const branch = declined ? step.onDecline : step.afterGates;
          if (branch) await play(branch, signal, depth + 1);
          break;
        }
      }
    }
  }

  function start() {
    const signal = controller.signal;
    setPhase('running');
    play(script.play, signal)
      .then(() => {
        if (signal.aborted) return;
        // `finished` means the script ran to its end, not that everything in it
        // went well. A probe that timed out or an approval that was declined are
        // outcomes the statuses already say; a run is only `failed` when the
        // server itself could not finish playing it.
        setPhase('finished');
        const failed = Object.values(statuses).filter((v) => v === 'failed').length;
        appendLog('info', failed ? `Run finished with ${failed} failed step(s)` : 'Run finished');
      })
      .catch((err) => {
        if (signal.aborted || err instanceof Aborted) return;
        console.error(`[${runId}] run crashed:`, err);
        broadcast({
          type: 'run.error',
          message: 'The run hit an internal error in the mock server.',
          code: 'INTERNAL',
          recoverable: false,
        });
        setPhase('failed');
      });
  }

  const handle: RunHandle = {
    runId,
    variantId: script.id,

    /** The run as it stands now, rebuilt from the base script plus every patch. */
    snapshot() {
      const run: WireRun = {
        runId,
        variantId: script.id,
        title: script.title,
        header: script.header,
        actor: script.actor,
        stages: script.stages.map((s) => ({ ...s, ...stageState.get(s.id) })),
        steps: script.steps.map((s) => ({ ...s, ...patches.get(s.id) })),
        edges: script.edges,
        statuses: { ...statuses },
        phase,
        // State, not just the event: a client attaching to a run that is
        // already waiting has no other way to learn what the gate accepts.
        awaiting: pending.map(({ stepId, decisions, dueLabel }) => ({
          stepId,
          decisions,
          dueLabel,
        })),
        focusStepId: pending[0]?.stepId ?? script.focusStepId,
      };
      return { run, log: [...log] };
    },

    subscribe(send) {
      subscribers.add(send);
      return () => subscribers.delete(send);
    },

    subscriberCount: () => subscribers.size,

    /**
     * Only the gate that is actually open can be answered, and only with an
     * option it offered. That is what makes two browser tabs safe: the second
     * click is a logged no-op and both tabs see the same outcome.
     */
    decide(stepId, decision, note) {
      const gate = pending.find((p) => p.stepId === stepId);
      if (!gate) {
        console.log(`[${runId}] ignoring decision for ${stepId}: no gate open there`);
        return;
      }
      if (!gate.decisions.includes(decision)) {
        console.log(`[${runId}] ignoring '${decision}' for ${stepId}: not on offer`);
        return;
      }
      gate.settle({ decision, note });
    },

    control(action) {
      if (disposed) return;
      if (action === 'pause') {
        if (phase === 'running') setPhase('paused');
        return;
      }
      if (action === 'resume') {
        if (phase === 'paused') setPhase('running');
        return;
      }
      // Restart: abandon the player, wind everything back, and hand out a fresh
      // snapshot. The client treats that as a new graph and re-frames once —
      // which is right, because this really is a different run of the same shape.
      controller.abort();
      controller = new AbortController();
      pending = [];
      statuses = { ...script.initialStatuses };
      patches = new Map();
      resetStages();
      log = [];
      logSeq = 0;
      startedAt = Date.now();
      phase = 'idle';
      const { run, log: fresh } = handle.snapshot();
      broadcast({ type: 'run.snapshot', run, log: fresh, variants });
      appendLog('info', 'Run restarted');
      start();
    },

    dispose() {
      disposed = true;
      controller.abort();
      subscribers.clear();
      pending = [];
    },
  };

  start();
  return handle;
}
