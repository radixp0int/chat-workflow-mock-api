/**
 * Wire protocol for the workflow run server.
 *
 * KEEP IN SYNC with chat-interfaces/src/demo/workflow-demo/run/wireProtocol.ts —
 * that file is a verbatim copy of this one. There is no shared package and no
 * codegen: the two repos are independent checkouts, so a protocol change is two
 * commits. scripts/check-protocol-sync.sh diffs the pair on commit and push.
 *
 * Everything below the header must match that file byte for byte — including the
 * comments, which describe the client's side of the contract as much as this one's.
 *
 * The UI's copy is the canonical one, because that repo runs Prettier over it and
 * this one does not. Edit either, then copy the UI's body over this file's.
 */

export type WireStepKind = 'trigger' | 'agent' | 'tool' | 'human' | 'decision';

export type WireStepStatus =
  | 'done'
  | 'running'
  | 'waiting'
  | 'queued'
  | 'skipped'
  | 'failed'
  | 'approved'
  | 'changes';

export type WireStageStatus = 'done' | 'current' | 'upcoming';

/** The two edge rules the kit ships. `never` is a branch this run won't take. */
export type EdgeRule = 'feeds' | 'never';

/**
 * What a person can do at a gate. Note `declined` has no `WireStepStatus` of
 * its own — a declined step lands on `failed`. That mapping is protocol, not a
 * reducer detail, which is why it is written down here.
 */
export type Decision = 'approved' | 'changes' | 'declined';

export type RunPhase = 'idle' | 'running' | 'paused' | 'awaiting' | 'finished' | 'failed';

export type LogLevel = 'info' | 'warn' | 'error' | 'human';

export type VariantId = 'loan-review' | 'incident-triage' | 'onboarding';

/**
 * What every variant puts in the detail panel. The canvas only carries it — see
 * `StepDetail` in ../canvas/types.ts — but the *host's* inspector has to render
 * it, so all three variants share one shape rather than one per run.
 *
 * `recommendation.label` and `exception.label` exist so incident triage can say
 * "Probe failure" where the loan run says "Policy exception", without either the
 * kit or the panel learning what a run is about.
 */
export type RunDetail = {
  summary: string;
  /** When this is due, written out. The step's `statusLabel` is the terse
      version the node's marker wants ("3h 40m"); this is the sentence. */
  due?: string;
  rows: [string, string][];
  recommendation?: {
    label?: string;
    from: string;
    verdict: string;
    figures: [string, string][];
  };
  exception?: { label?: string; text: string; mitigant: string };
  trace?: [string, string, string][];
};

export type WireStep = {
  id: string;
  kind: WireStepKind;
  stageId: string;
  title: string;
  /** The result line under the title. Replaced wholesale as work completes. */
  meta: string;
  /** Tool names render in the mono face. */
  mono?: boolean;
  /** Initials for a named person; omit for a step routed to a role. */
  initials?: string;
  /** What the status marker says in words, e.g. "3h 40m". */
  statusLabel?: string;
  assignee?: string;
  /** Placement. The client derives x/y — see ../run/layout.ts. */
  column: number;
  /** Orders steps within a column. It orders; it is not an index, so gaps are fine. */
  row: number;
  /** Escape hatch: an explicit position wins over column/row. */
  x?: number;
  y?: number;
  /** Overrides the width the kind implies (NODE_W, or GATE_W for a decision). */
  w?: number;
  detail: RunDetail;
};

export type WireStage = {
  id: string;
  name: string;
  sub: string;
  status: WireStageStatus;
};

export type WireEdge = { from: string; to: string; rule: EdgeRule };

/** A gate that is open: which step, and what it will accept. */
export type OpenGate = { stepId: string; decisions: Decision[]; dueLabel?: string };

/** The run card at the top of the left panel. */
export type RunHeader = { primary: string; secondary: string; tertiary: string };

/** Whose seat this is — the left panel's footer. */
export type RunActor = { initials: string; name: string; role: string };

/**
 * The whole graph. It arrives complete on every snapshot and its node set never
 * changes mid-run: steps that will be skipped ship already at `skipped`. A
 * changing node set flips React Flow's `useNodesInitialized()` back to false and
 * refits the viewport under the reader, so only a snapshot may change it.
 */
export type WireRun = {
  runId: string;
  variantId: VariantId;
  /** The top bar's title. */
  title: string;
  header: RunHeader;
  actor: RunActor;
  stages: WireStage[];
  steps: WireStep[];
  edges: WireEdge[];
  statuses: Record<string, WireStepStatus>;
  phase: RunPhase;
  /**
   * Every gate open right now. This has to be state rather than only the
   * `run.awaiting` event: a client attaching to a run that is already waiting
   * has no other way to learn what the waiting step will accept, and would draw
   * a decision it cannot make.
   */
  awaiting: OpenGate[];
  /** Which step to open in the inspector on arrival. */
  focusStepId?: string;
};

export type LogEntry = {
  /** `${runId}-${seq}`. Key rows on this — the client caps the log from the head. */
  id: string;
  at: number;
  /** Since the run started. What the row shows, as m:ss. */
  elapsedMs: number;
  level: LogLevel;
  /** Clicking the row selects this step. */
  stepId?: string;
  /** Short attribution: 'Intake agent', 'credit_bureau.pull', 'Dana W.' */
  source?: string;
  text: string;
};

/**
 * A patch to one step. `meta` and `detail` are whole replacements: `detail` is
 * opaque to the canvas, so merging into it would mean a deep merge for nothing.
 */
export type StepPatch = Partial<Pick<WireStep, 'meta' | 'statusLabel' | 'assignee' | 'detail'>> & {
  status?: WireStepStatus;
};

export type StagePatch = { status?: WireStageStatus; sub?: string };

/**
 * `seq` is monotonic per run. The client drops anything at or below the last
 * seq it saw and resets that watermark on every snapshot, which is what makes
 * an attach arriving mid-flight idempotent.
 *
 * `runId` is `''` on an error that belongs to no run — a start that failed, or
 * an attach to an id the server has already disposed.
 */
type Envelope = { runId: string; seq: number; timestamp: number };

export type ServerMessage =
  /** The catalogue rides along so the variant switcher needs no second call. */
  | ({ type: 'run.snapshot'; run: WireRun; log: LogEntry[]; variants: VariantInfo[] } & Envelope)
  | ({ type: 'step.update'; stepId: string; patch: StepPatch } & Envelope)
  | ({ type: 'stage.update'; stageId: string; patch: StagePatch } & Envelope)
  | ({ type: 'log.append'; entries: LogEntry[] } & Envelope)
  | ({ type: 'run.awaiting' } & OpenGate & Envelope)
  | ({ type: 'run.phase'; phase: RunPhase } & Envelope)
  | ({ type: 'run.error'; message: string; code?: string; recoverable: boolean } & Envelope);

export type ControlAction = 'pause' | 'resume' | 'restart';

export type ClientMessage =
  | { type: 'run.start'; variantId: VariantId }
  | { type: 'run.attach'; runId: string }
  | { type: 'run.decide'; runId: string; stepId: string; decision: Decision; note?: string }
  | { type: 'run.control'; runId: string; action: ControlAction };

/** What the variant switcher needs to draw a button. Rides on every snapshot. */
export type VariantInfo = { id: VariantId; label: string; blurb: string };
