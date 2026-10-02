/**
 * Native WebSocket stream event types for a mock LLM stream.
 *
 * There are two parallel streams of text:
 *   - reasoning: many `thinking` chunks, then one final `thought`
 *   - answer:    many `token` chunks, then one final `summary`
 *
 * `tool` reports a tool call, and `error` reports a failure.
 *
 * Everything here is plain JSON, so it survives JSON.stringify / JSON.parse
 * across the socket without any custom serialization.
 */

/** The string tags that tell the events apart. */
export type WSEventType = 'token' | 'thinking' | 'thought' | 'summary' | 'tool' | 'error';

/** Fields that every event carries. */
export interface WSEventBase {
  /** Groups all events that belong to one response. */
  streamId: string;
  /** When the server sent this event (epoch milliseconds). */
  timestamp: number;
}

/** A chunk of streaming text. Used by token and thinking. */
export interface StreamChunk extends WSEventBase {
  /** The piece of text in this chunk. */
  text: string;
  /**
   * Order of this chunk in its stream, starting at 0.
   * Handy for testing a mock. Drop it if you don't need ordering checks.
   */
  index: number;
}

/** A finished block of text. Used by thought and summary. */
export interface StreamComplete extends WSEventBase {
  /** The full text, all chunks joined together. */
  text: string;
}

/** A reference document the answer cites with inline [n] markers. `id` is the
 *  number that appears as [n] in the summary text. */
export interface WSSource {
  id: number;
  title: string;
  markdown: string;
}

/** One passage to highlight, as character offsets into the source document's
 *  markdown. `idx` is a stable per-section id (not a reference), used only as a
 *  key. */
export interface WSHighlightSection {
  idx: number;
  start: number;
  end: number;
}

/** The passages of a cited source to highlight. `referenceNumber` is the source
 *  id (the [n] marker the chip shows); opening that reference highlights every
 *  section here. One source can own several sections. */
export interface WSHighlight {
  referenceNumber: number;
  sections: WSHighlightSection[];
}

/**
 * One problem reported during a turn. Sent two ways, and the client merges
 * both: streamed as an `error` event the moment it happens (which is what gives
 * it a position on the turn's timeline), or listed on the `summary` event when
 * the server only tallies problems once the answer is done.
 *
 * `code` is the identity used to dedupe a fault reported by both routes.
 */
export interface WSTurnError {
  /** Plain language description of the problem. */
  message: string;
  /** True if the stream kept going, false if it is dead. */
  recoverable: boolean;
  /** Optional short code you can switch on in code. */
  code?: string;
  /** Which part of the turn it came from — 'retrieval', 'tool:live_quote'. */
  source?: string;
  /** Times it occurred, when the server collapses repeats. */
  count?: number;
  /** Structured payload for debugging; shown as JSON when the row expands. */
  detail?: Record<string, unknown>;
}

/** A small chunk of the final answer. */
export interface TokenEvent extends StreamChunk {
  type: 'token';
}

/** A small chunk of the model's reasoning. */
export interface ThinkingEvent extends StreamChunk {
  type: 'thinking';
}

/** The complete reasoning, sent once thinking is done. */
export interface ThoughtEvent extends StreamComplete {
  type: 'thought';
}

/** The complete final answer, sent once tokens are done. Carries the answer's
 *  cited reference documents, if any. */
export interface SummaryEvent extends StreamComplete {
  type: 'summary';
  /** References backing this answer, resolved by their inline [n] markers. */
  sources?: WSSource[];
  /** Passages to highlight in the cited source docs, keyed by referenceNumber. */
  highlights?: WSHighlight[];
  /** Suggested next prompts, phrased as the user would type them. */
  followups?: string[];
  /** Which model produced the answer. Shown in the turn's trace. */
  model?: string;
  /** Tokens the answer cost. Shown in the turn's trace. */
  tokens?: number;
  /** Problems reported with the finished answer rather than as they happened.
   *  These carry no timing — the client renders them after the timed steps. */
  errors?: WSTurnError[];
}

/** Where a tool call is in its life. */
export type ToolStatus = 'started' | 'completed' | 'failed';

/** A tool call and its progress. */
export interface ToolEvent extends WSEventBase {
  type: 'tool';
  /** Name of the tool being called. */
  name: string;
  /** Unique id for this one tool call, so you can match start and finish. */
  toolCallId: string;
  /** Current stage of the call. */
  status: ToolStatus;
  /** Arguments passed in. Present when the call starts. */
  input?: Record<string, unknown>;
  /** Whatever the tool returned. Present when status is 'completed'. */
  output?: unknown;
  /** Why it failed. Present when status is 'failed'. */
  error?: string;
}

/** Something went wrong, reported the moment it happens. */
export interface ErrorEvent extends WSEventBase, WSTurnError {
  type: 'error';
}

/** Any event that can come across the socket. */
export type WSEvent =
  | TokenEvent
  | ThinkingEvent
  | ThoughtEvent
  | SummaryEvent
  | ToolEvent
  | ErrorEvent;

/** Maps each type tag to its event shape. Useful for a typed on(type, handler) API. */
export interface WSEventMap {
  token: TokenEvent;
  thinking: ThinkingEvent;
  thought: ThoughtEvent;
  summary: SummaryEvent;
  tool: ToolEvent;
  error: ErrorEvent;
}

/**
 * One type guard that works for every event type.
 *
 *   if (isEvent(evt, 'summary')) {
 *     // evt is narrowed to SummaryEvent here
 *     console.log(evt.text);
 *   }
 */
export function isEvent<K extends WSEventType>(event: WSEvent, type: K): event is WSEventMap[K] {
  return event.type === type;
}
