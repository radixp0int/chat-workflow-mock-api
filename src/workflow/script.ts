// The declarative half of a run: what happens, in what order, with what text.
//
// Same division of labour as the sibling chat server's ScenarioStep — a script
// says *what*, the runtime owns everything to do with time, ids, sequence
// numbers and broadcasting. That is what keeps a variant readable as prose and
// keeps the pacing logic in one place.

import type {
  Decision,
  LogLevel,
  RunActor,
  RunDetail,
  RunHeader,
  VariantId,
  WireEdge,
  WireStage,
  WireStageStatus,
  WireStep,
  WireStepStatus,
} from './types.js';

/**
 * One step doing its work: it goes `running`, waits, then lands on `done` (or
 * `failed`) with a new result line and, usually, a filled-in detail panel.
 */
export type WorkStep = {
  kind: 'work';
  stepId: string;
  durationMs: number;
  /** What the node's result line becomes when it finishes. */
  meta: string;
  /** Replaces the step's whole detail. Omit to leave the forward-looking one. */
  detail?: RunDetail;
  /** Logged when the step starts. */
  startLog?: string;
  /** Logged when it finishes. Defaults to `meta`. */
  log?: string;
  /** Ends `failed` rather than `done`. A failure is not necessarily the end. */
  outcome?: 'done' | 'failed';
};

export type ScriptStep =
  | WorkStep
  /** Several steps at once — a fan-out lights up the canvas in every place. */
  | { kind: 'parallel'; steps: WorkStep[] }
  /**
   * A raw status move. This is how a run goes *backwards* — a retry putting a
   * failed step back to `running`, or a memo sent back for changes.
   */
  | {
      kind: 'status';
      stepId: string;
      status: WireStepStatus;
      meta?: string;
      statusLabel?: string;
      detail?: RunDetail;
      afterMs?: number;
    }
  | { kind: 'stage'; stageId: string; status: WireStageStatus; sub?: string }
  | { kind: 'log'; level: LogLevel; text: string; stepId?: string; source?: string }
  | { kind: 'skip'; stepIds: string[]; log?: string }
  | { kind: 'wait'; ms: number }
  /**
   * Stop and ask a person. The run does nothing until a `run.decide` names this
   * step, and then plays the branch that decision chose.
   *
   * A branch may end by declaring the same gate again — that is how "request
   * changes" loops without a loop construct. The runtime caps how deep that can
   * nest, so a script cannot ask forever.
   */
  | {
      kind: 'gate';
      stepId: string;
      decisions: Decision[];
      /** Shown on the node while it waits, e.g. "3h 40m". */
      dueLabel?: string;
      branches: Partial<Record<Decision, ScriptStep[]>>;
    }
  /**
   * Two or more gates open at once, each answerable in any order. The run waits
   * for all of them — which is what lets "Needs you" read more than 1.
   */
  | {
      kind: 'gateAll';
      gates: { stepId: string; decisions: Decision[]; dueLabel?: string }[];
      afterGates: ScriptStep[];
      /** Taken as soon as any one gate is declined; the rest are abandoned. */
      onDecline?: ScriptStep[];
    };

export type RunScript = {
  id: VariantId;
  /** The variant switcher's button text. */
  label: string;
  blurb: string;
  /** The top bar's title. */
  title: string;
  header: RunHeader;
  actor: RunActor;
  stages: WireStage[];
  steps: WireStep[];
  edges: WireEdge[];
  /** Where every step starts. Steps this run will never reach start `skipped`. */
  initialStatuses: Record<string, WireStepStatus>;
  focusStepId?: string;
  play: ScriptStep[];
};

/** Sugar so a variant reads as a list of sentences rather than a list of objects. */
export const work = (
  stepId: string,
  durationMs: number,
  meta: string,
  extra: Omit<WorkStep, 'kind' | 'stepId' | 'durationMs' | 'meta'> = {},
): WorkStep => ({ kind: 'work', stepId, durationMs, meta, ...extra });
