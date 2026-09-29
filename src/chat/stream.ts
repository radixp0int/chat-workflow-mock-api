// Turns a scenario script into a paced sequence of WSEvents.
//
// The runner owns everything time- and id-related: jittered delays between
// chunks, monotonic per-stream chunk indexes, and timestamps. Scenarios stay
// declarative — just text and tool descriptions.

import type { ToolStatus, WSEvent, WSHighlight, WSSource, WSTurnError } from './types.js';

/** One step of a scenario, in the order it should play out. */
export type ScenarioStep =
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool';
      name: string;
      input?: Record<string, unknown>;
      /** How the call ends. Defaults to 'completed'. */
      outcome?: Exclude<ToolStatus, 'started'>;
      output?: unknown;
      error?: string;
      /** How long the tool "runs" between started and its outcome, in ms. */
      durationMs?: number;
    }
  | {
      kind: 'answer';
      text: string;
      /** Reference docs cited by this answer; delivered on the summary event. */
      sources?: WSSource[];
      /** Supporting passages to highlight on citation click; each section's
       *  offsets index its own source markdown (keyed by referenceNumber). */
      highlights?: WSHighlight[];
      /** Suggested next prompts, phrased as the user would type them;
       *  delivered on the summary event. */
      followups?: string[];
      /** Problems reported *with* the answer rather than as they happen — the
       *  shape a server that only tallies failures at the end produces. They
       *  reach the client without timing, so the trace lists them after the
       *  timed steps. */
      errors?: WSTurnError[];
    }
  | ({ kind: 'error' } & WSTurnError);

export type Scenario = ScenarioStep[];

// Pacing, all in milliseconds. Chunk delays get ±40% jitter.
const PACING = {
  beforeFirstEvent: 350,
  perThinkingChunk: 45,
  perTokenChunk: 40,
  betweenSteps: 400,
  defaultToolMs: 700,
};

const jitter = (ms: number) => Math.max(5, Math.round(ms * (0.6 + Math.random() * 0.8)));

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Splits text into chunks of 1–3 words, each carrying its own trailing
 * whitespace (including newlines), so the client can concatenate chunks
 * verbatim: chunks.join('') === text.
 */
export function chunkText(text: string): string[] {
  const words = text.split(/(?<=\s)/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length;) {
    const take = 1 + Math.floor(Math.random() * 3);
    chunks.push(words.slice(i, i + take).join(''));
    i += take;
  }
  return chunks;
}

/**
 * Plays a scenario, calling `send` for each event. Resolves when the scenario
 * finishes or the signal aborts (abort is swallowed — the caller decided to
 * stop, there is nothing to report).
 */
export async function runScenario(
  scenario: Scenario,
  streamId: string,
  send: (event: WSEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const base = () => ({ streamId, timestamp: Date.now() });
  let thinkingIndex = 0;
  let tokenIndex = 0;
  let toolSeq = 0;
  const thoughtParts: string[] = [];
  const answerParts: string[] = [];
  const answerSources: WSSource[] = [];
  const answerHighlights: WSHighlight[] = [];
  const answerFollowups: string[] = [];
  const answerErrors: WSTurnError[] = [];

  try {
    await sleep(jitter(PACING.beforeFirstEvent), signal);

    for (const step of scenario) {
      switch (step.kind) {
        case 'thinking': {
          // Separator travels in-stream so joined chunks equal the final thought.
          const text = thoughtParts.length ? `\n\n${step.text}` : step.text;
          for (const chunk of chunkText(text)) {
            send({ type: 'thinking', text: chunk, index: thinkingIndex++, ...base() });
            await sleep(jitter(PACING.perThinkingChunk), signal);
          }
          thoughtParts.push(text);
          break;
        }
        case 'tool': {
          const toolCallId = `${streamId}-tool-${toolSeq++}`;
          const { name, input } = step;
          send({ type: 'tool', name, toolCallId, status: 'started', input, ...base() });
          await sleep(jitter(step.durationMs ?? PACING.defaultToolMs), signal);
          if ((step.outcome ?? 'completed') === 'completed') {
            send({
              type: 'tool',
              name,
              toolCallId,
              status: 'completed',
              output: step.output,
              ...base(),
            });
          } else {
            send({
              type: 'tool',
              name,
              toolCallId,
              status: 'failed',
              error: step.error ?? 'Tool call failed',
              ...base(),
            });
          }
          break;
        }
        case 'answer': {
          // The first answer step marks the end of reasoning.
          if (thoughtParts.length && answerParts.length === 0) {
            send({ type: 'thought', text: thoughtParts.join(''), ...base() });
          }
          for (const text of chunkText(step.text)) {
            send({ type: 'token', text, index: tokenIndex++, ...base() });
            await sleep(jitter(PACING.perTokenChunk), signal);
          }
          answerParts.push(step.text);
          if (step.sources) answerSources.push(...step.sources);
          // Highlight offsets index each source's own markdown, so they pass
          // through as-is (no answer-relative shift).
          if (step.highlights) answerHighlights.push(...step.highlights);
          if (step.followups) answerFollowups.push(...step.followups);
          if (step.errors) answerErrors.push(...step.errors);
          break;
        }
        case 'error': {
          // The step *is* the fault, minus its discriminant — so source, count
          // and detail travel without being listed one by one here.
          const { kind: _kind, ...fault } = step;
          send({ type: 'error', ...fault, ...base() });
          if (!step.recoverable) return;
          break;
        }
      }
      await sleep(jitter(PACING.betweenSteps), signal);
    }

    // A thinking-only scenario still needs its thought flushed.
    if (thoughtParts.length && answerParts.length === 0) {
      send({ type: 'thought', text: thoughtParts.join(''), ...base() });
    }
    if (answerParts.length) {
      send({
        type: 'summary',
        text: answerParts.join(''),
        sources: answerSources.length ? answerSources : undefined,
        highlights: answerHighlights.length ? answerHighlights : undefined,
        followups: answerFollowups.length ? answerFollowups : undefined,
        errors: answerErrors.length ? answerErrors : undefined,
        ...base(),
      });
    }
  } catch (err) {
    if (signal.aborted) return;
    throw err;
  }
}
