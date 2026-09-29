// Canned demo scenarios, themed to match the chat-interfaces "Aristotle"
// finance assistant. pickScenario routes on keywords in the prompt so the
// demo can show off specific flows on cue. Listed in evaluation order — the
// first match wins, so "error" beats "fail" and "source" beats "search":
//
//   "diagram"/"mermaid"/"flowchart"/"draw"
//                          → an answer carrying two ```mermaid fences (a
//                            flowchart, then a sequence diagram), so the UI's
//                            draw-while-streaming path gets exercised
//   "degraded"/"issues"    → answers fine, but reports several non-fatal
//                            problems on the summary (plus one streamed, to
//                            exercise dedupe by code) after a fallback search
//                            and a failed rerank attempt
//   "error"                → two tool calls succeed, then the stream dies
//                            mid-answer with a fatal error event
//   "fail"                 → two quote sources fail before a cached one
//                            succeeds and gets range-checked; the model
//                            recovers and answers
//   "50"/"stress"          → a corpus is ranked, then an answer citing 50
//                            references (scale test)
//   "cite"/"source"/"save" → a corpus is searched, then an answer citing a
//                            handful of references
//   "tool"/"search"/"rate"/"market"
//                          → four sequential tool calls (rates, index moves,
//                            volatility, allocation) before the answer
//   anything else          → cycles through the default scenarios
//
// Every scenario below runs 4–6 `thinking` steps — the model reacting to
// each tool result in turn, not one paragraph decided up front — interleaved
// with however many tool calls its story needs. `runScenario` folds all of
// it into one `thought` block and reactivates the reasoning shimmer each
// time thinking resumes after a tool call, so none of this needs any
// client-side support beyond what already exists.

import { financeSources, sourceHighlights, stressSources } from './citations.js';
import type { Scenario } from './stream.js';

const toolHeavy: Scenario = [
  {
    kind: 'thinking',
    text: 'The user wants current market context, and I don’t want to lean on training data that could be a quarter stale. I’ll start with the two headline benchmarks — the fed funds rate and the 10-year — since most of a rate conversation hangs off those two numbers.',
  },
  {
    kind: 'tool',
    name: 'get_benchmark_rates',
    input: { series: ['fed_funds', 'us10y'], region: 'US' },
    output: { fed_funds: 4.25, us10y: 3.98, as_of: '2026-07-15' },
    durationMs: 900,
  },
  {
    kind: 'thinking',
    text: 'Rates alone don’t tell the whole story — I should see how equities and bonds have actually behaved over the same window, otherwise I’m reasoning about the curve in a vacuum.',
  },
  {
    kind: 'tool',
    name: 'market_snapshot',
    input: { symbols: ['SPY', 'AGG'], window: '1M' },
    output: { SPY: { change_pct: 2.4 }, AGG: { change_pct: 0.6 } },
    durationMs: 1100,
  },
  {
    kind: 'thinking',
    text: 'Rates are calm and both asset classes are up, but a quiet macro backdrop with a spiky volatility print tells a different story than a genuinely calm market — worth checking before I lean on this rally.',
  },
  {
    kind: 'tool',
    name: 'volatility_snapshot',
    input: { index: 'VIX', window: '1M' },
    output: { level: 14.2, pct_change_30d: -8.1, regime: 'below_average' },
    durationMs: 650,
  },
  {
    kind: 'thinking',
    text: 'Volatility is below its trailing average, so this isn’t nerves propping up a fragile rally. I don’t know their current mix though, and I’d rather confirm it than assume a generic 60/40 — a rebalancing answer built on a guess isn’t worth much.',
  },
  {
    kind: 'tool',
    name: 'get_account_allocation',
    input: { account_id: 'demo-001' },
    output: { equities_pct: 62, bonds_pct: 33, cash_pct: 5, last_updated: '2026-07-01' },
    durationMs: 750,
  },
  {
    kind: 'thinking',
    text: 'They’re already close to a textbook 70/30, just carrying a bit more cash than that model calls for. Given the calm backdrop I can frame this as confirming their existing mix rather than prescribing a new one, with the cash cushion as an optional nudge, not an urgent fix.',
  },
  {
    kind: 'answer',
    text: 'Here is where things stand as of yesterday’s close, along with a look at what’s on your books.\n\nThe fed funds rate sits at 4.25% and the 10-year Treasury yields 3.98%, so the curve remains mildly inverted at the short end. Over the past month broad equities (SPY) added about 2.4% while core bonds (AGG) gained 0.6% — and volatility has actually eased, with the VIX down about 8% over the same window and sitting below its trailing average. This isn’t a fragile rally propped up by calm nerves; it’s a genuinely quiet market.\n\nYour account is currently 62% equities, 33% bonds, and 5% cash — close to a classic 70/30 stock-bond split, just carrying a bit more cash cushion than that model calls for. Given the calm backdrop and the inverted short end, there’s no urgency to rebalance, but if you wanted to inch toward 70/30 the difference would come from trimming cash rather than selling equities into strength.',
    followups: [
      'Turn that into a specific trade list',
      'Why is the curve still inverted?',
      'Should I be worried about the extra cash cushion?',
    ],
  },
];

const plain: Scenario = [
  {
    kind: 'thinking',
    text: 'This is a conceptual question — no live data needed. I want to explain compounding with one concrete, memorable example rather than lead with a formula, since a formula is easy to nod along to and forget by lunch.',
  },
  {
    kind: 'thinking',
    text: 'A round starting balance and a realistic long-run return will make the comparison feel earned rather than cherry-picked. I’ll contrast a 10-year and a 30-year horizon so the acceleration is actually visible instead of asserted.',
  },
  {
    kind: 'thinking',
    text: 'One more thing worth landing: the point isn’t the exact dollar figures, it’s that the later decade does more work than the earlier ones combined — that’s the part people underestimate, and the part that should change behavior today.',
  },
  {
    kind: 'answer',
    text: 'Compound interest is interest that earns interest. Each period, returns are calculated on your original principal plus everything it has already earned, so growth accelerates rather than staying linear.\n\nA quick example: $10,000 growing at 7% a year becomes about $19,700 after 10 years — but about $76,100 after 30. The last decade alone adds more than the first two combined, which is why starting early matters more than starting big.\n\nThe practical takeaway: time in the market is the one input you can’t buy back later.',
    followups: [
      'Run that example again starting at 40 instead of 25',
      'What return rate should I actually plan around?',
      'How much would a 1% fee cost me over 30 years?',
    ],
  },
];

const toolFailure: Scenario = [
  {
    kind: 'thinking',
    text: 'They asked for live pricing, so I’ll hit the primary quote service first rather than reasoning from a stale number.',
  },
  {
    kind: 'tool',
    name: 'live_quote',
    input: { symbol: 'VTI' },
    outcome: 'failed',
    error: 'Upstream quote service timed out after 5000ms',
    durationMs: 1400,
  },
  {
    kind: 'thinking',
    text: 'That’s the primary feed down. Before I give up on real-time entirely, there’s a secondary quote provider worth trying — different infrastructure, so it’s not guaranteed to be having the same bad day.',
  },
  {
    kind: 'tool',
    name: 'backup_quote_feed',
    input: { symbol: 'VTI' },
    outcome: 'failed',
    error: 'Backup feed rate-limited: too many requests in the last 60s',
    durationMs: 600,
  },
  {
    kind: 'thinking',
    text: 'Two live sources down. Falling back to the most recent verified close — still useful for allocation math, it just needs an honest staleness caveat rather than being presented as current.',
  },
  {
    kind: 'tool',
    name: 'cached_quote',
    input: { symbol: 'VTI', max_age_hours: 24 },
    output: { symbol: 'VTI', close: 289.44, as_of: '2026-07-15T20:00:00Z' },
    durationMs: 500,
  },
  {
    kind: 'thinking',
    text: 'Before I hand back a cached number, a quick sanity check against the recent trading range — I don’t want to repeat a stale or corrupted print without noticing.',
  },
  {
    kind: 'tool',
    name: 'verify_price_range',
    input: { symbol: 'VTI', candidate: 289.44, expected_range: [270, 310] },
    output: { within_range: true, deviation_pct: 0 },
    durationMs: 400,
  },
  {
    kind: 'thinking',
    text: 'The cached print checks out against the expected range, so I can hand it back with confidence — just leading with the caveat so it can’t be missed.',
  },
  {
    kind: 'answer',
    text: 'The live quote service timed out on me, and the backup feed was rate-limited, so this is the latest verified cached close rather than a real-time price: VTI last traded at $289.44 as of yesterday’s market close, and it checks out against its recent trading range.\n\nFor deciding whether to place a market order right now you’d want a fresh quote from your brokerage, but for allocation math a day-old, range-verified close is more than accurate enough.',
    followups: [
      'Try the live quote again',
      'How stale is too stale for allocation math?',
      'What’s VTI’s range been over the past month?',
    ],
  },
];

const fatalError: Scenario = [
  {
    kind: 'thinking',
    text: 'Pulling together the full portfolio review — positions, cost basis, and dividend history. I’ll start with positions and cost basis since those calls are quick and cache-friendly, then layer in dividend history last since that endpoint is historically the flakiest of the three.',
  },
  {
    kind: 'tool',
    name: 'get_account_positions',
    input: { account_id: 'demo-001' },
    output: { positions: 14, largest_weight_pct: 18.5 },
    durationMs: 600,
  },
  {
    kind: 'thinking',
    text: 'Positions came back clean. Cost basis next — I want unrealized gain/loss context in hand before I say anything that touches on tax implications.',
  },
  {
    kind: 'tool',
    name: 'get_cost_basis',
    input: { account_id: 'demo-001' },
    output: { unrealized_gain_pct: 12.4, lots: 37 },
    durationMs: 700,
  },
  {
    kind: 'thinking',
    text: 'Both core datasets are in. Dividend history is the last piece, and the one call in this chain I’d least like to depend on — I’ll start writing the review now and fold it in once it lands.',
  },
  {
    kind: 'answer',
    text: 'Starting your portfolio review now. I already have your positions and cost basis pulled — checking dividend history and',
  },
  {
    kind: 'error',
    message:
      'Stream terminated: account data service returned 503 and the response cannot be completed.',
    code: 'UPSTREAM_UNAVAILABLE',
    recoverable: false,
  },
];

// Answer that cites a handful of references — the sources ride out on the
// summary event (see runScenario), so the client resolves [n] markers to docs.
const citations: Scenario = [
  {
    kind: 'thinking',
    text: 'The user is asking a personal-finance planning question. I should ground each claim in a specific reference so the answer is auditable, rather than asserting a split from memory — let me search the reference corpus for what actually backs this up.',
  },
  {
    kind: 'tool',
    name: 'search_reference_corpus',
    input: {
      query: 'emergency fund sizing, high-yield savings rates, automation, debt vs saving order',
      k: 4,
    },
    output: { matched_ids: [1, 2, 3, 4], top_score: 0.86 },
    durationMs: 550,
  },
  {
    kind: 'thinking',
    text: 'Four solid matches with good coverage across sizing, rates, automation, and sequencing. I’ll keep the split simple and cite each one only where it directly supports a claim, rather than dropping all four references up front.',
  },
  {
    kind: 'answer',
    text: 'Here is a straightforward way to think about it.\n\nAutomating a transfer on payday matters more than the exact amount [3], because consistency beats optimization at this stage. A practical split many people use:\n\n1. Keep one month of expenses in checking as a buffer [1].\n2. Direct new savings to a high-yield account until you reach your target — rates vary widely between providers [2].\n3. Only after that, route the overflow toward investing or extra debt payments [4].\n\nMost people land on a three-to-six-month emergency fund [1]. Tell me your monthly surplus and I can turn this into a schedule.',
    sources: financeSources,
    // Offsets index each source's own markdown. Reference 1 gets two sections
    // to show one source highlighting multiple passages.
    highlights: sourceHighlights(financeSources, [
      {
        referenceNumber: 1,
        phrase: 'the right number depends on income stability, household structure',
      },
      { referenceNumber: 1, phrase: 'An emergency fund is insurance, not an investment' },
      { referenceNumber: 2, phrase: 'APYs move with the federal funds rate' },
      { referenceNumber: 3, phrase: 'Money moved before it reaches the spending account' },
      { referenceNumber: 4, phrase: 'even while attacking debt' },
    ]),
    followups: [
      'My surplus is $600 a month — turn this into a schedule',
      'Should I pay down my card debt before saving?',
      'How do I pick a high-yield account?',
      'What counts as an emergency?',
    ],
  },
];

// Answer that cites a 50-document corpus, with markers scattered across the
// full range so distant navigation gets exercised.
const citationsStress: Scenario = [
  {
    kind: 'thinking',
    text: 'The user wants to see how the reference UI behaves with a large corpus. Before I write anything, I should rank the full 50-document set against the question rather than skim the first handful — the point here is navigation, so I want citations that genuinely span the range.',
  },
  {
    kind: 'tool',
    name: 'rank_corpus_documents',
    input: {
      corpus_size: 50,
      query: 'headline series vs fee data vs rate dispersion across quarterly cuts',
    },
    output: { returned: 50, method: 'full_scan', top_score: 0.79 },
    durationMs: 900,
  },
  {
    kind: 'thinking',
    text: 'The ranking confirms relevant material at both ends of the corpus, not just near the top — good, that means I can cite low, middle, and high document numbers honestly rather than forcing the spread for effect.',
  },
  {
    kind: 'answer',
    text: 'Here is a synthesis drawn from a **50-document corpus** — the point here is navigation, so the citations jump around on purpose.\n\nThe headline series sits near its five-year median [3], though the fee data tells a different story [17]. Rate dispersion is widest in the upper band [8], and the pattern repeats across the quarterly cuts [23]. The checklist docs [11] and [29] both flag quarter-over-quarter moves beyond their thresholds — compare them against the summary in [36].\n\nThe tail of the corpus is where the caveats live: methodology notes [42], the confidence table [47], and the final reconciliation [50].\n\nJump between [3] and [50] to feel the navigation.',
    sources: stressSources,
    highlights: sourceHighlights(stressSources, [
      { referenceNumber: 3, phrase: 'generated reference documents in the stress-test corpus' },
      { referenceNumber: 8, phrase: 'This working note supports answer marker' },
      { referenceNumber: 8, phrase: 'generated reference documents in the stress-test corpus' },
      { referenceNumber: 50, phrase: 'This working note supports answer marker' },
    ]),
    followups: [
      'Summarize just the tail documents',
      'Which of these docs disagree with each other?',
      'Show me the methodology notes',
    ],
  },
];

// Several non-fatal problems reported *with* the finished answer — the shape a
// real backend produces when it tallies failures at the end rather than
// streaming them. RETRIEVAL_TIMEOUT is deliberately emitted twice: once as a
// streamed event (so it earns a timestamp) and again in the summary list, to
// prove the client dedupes on `code` and keeps the timed copy. The keyword
// fallback and failed rerank below aren't decoration — they're the tool calls
// that produced RETRIEVAL_TIMEOUT and RERANK_SKIPPED in the first place.
const degraded: Scenario = [
  {
    kind: 'thinking',
    text: 'Kicking off retrieval for this one — nothing unusual yet, but I’ll keep an eye on latency since the vector store has been inconsistent today.',
  },
  {
    kind: 'error',
    message: 'Vector store timed out, fell back to keyword search',
    code: 'RETRIEVAL_TIMEOUT',
    source: 'retrieval',
    count: 2,
    detail: { attempts: 2, timeoutMs: 5000, fallback: 'bm25' },
    recoverable: true,
  },
  {
    kind: 'thinking',
    text: 'The vector store timed out twice — not worth a third attempt. Keyword search won’t rank as well, but it’ll surface something usable, and I can be upfront about the tradeoff.',
  },
  {
    kind: 'tool',
    name: 'keyword_fallback_search',
    input: { query: 'degraded pipeline demo answer', mode: 'bm25' },
    output: { hits: 42, top_score: 0.71 },
    durationMs: 500,
  },
  {
    kind: 'thinking',
    text: 'Forty-two keyword hits — enough to work with, but unranked results are noisier than a proper semantic search. Worth trying to rerank before I commit to an ordering, even though the reranker has also been flaky today.',
  },
  {
    kind: 'tool',
    name: 'rerank_passages',
    input: { candidate_count: 42, model: 'cross-encoder-v2' },
    outcome: 'failed',
    error: 'Reranker service unavailable: connection refused',
    durationMs: 350,
  },
  {
    kind: 'thinking',
    text: 'Reranker’s down too. I have enough signal in the unranked keyword hits to answer accurately — the ordering would have been a nice-to-have, not a correctness issue, so I’ll proceed rather than block on it.',
  },
  {
    kind: 'answer',
    text: 'Here is the answer, assembled from a degraded pipeline that fell back to keyword search and had to skip reranking along the way.\n\nEverything below is accurate, but a few subsystems were unavailable while it was produced. None of that changed the substance of the answer, so none of it is shown inline — open the duration under this message to see exactly what happened and when.\n\nTwo of the problems were reported as they occurred, so they carry timestamps. The rest were only tallied once the answer finished, so they appear underneath without one.',
    errors: [
      {
        message: 'Vector store timed out, fell back to keyword search',
        code: 'RETRIEVAL_TIMEOUT',
        source: 'retrieval',
        recoverable: true,
      },
      {
        message: 'Reranker unavailable, results returned unranked',
        code: 'RERANK_SKIPPED',
        source: 'rerank',
        recoverable: true,
      },
      {
        message: 'Cache miss on 3 of 5 shards',
        code: 'CACHE_PARTIAL',
        source: 'cache',
        count: 3,
        detail: { shards: ['a', 'c', 'e'], hitRate: 0.4 },
        recoverable: true,
      },
    ],
    followups: [
      'Which parts of that answer are least reliable?',
      'Re-run it once retrieval is healthy',
    ],
  },
];

// Two diagrams in one answer. The fences stream in 1–3 words at a time like
// any other text; the UI draws each finished line as it lands. Keep this in
// step with the matching canned turn in chat-interfaces
// (apps/chat/src/demo/mocks/cannedTurns.ts) so the demo reads the same with
// and without this server.
const diagram: Scenario = [
  {
    kind: 'thinking',
    text: 'A process question answers best as a picture. Before drawing anything I want the actual approval rules, not a generic flow — the threshold and who can hold a transfer are what the reader will act on.',
  },
  {
    kind: 'tool',
    name: 'get_payment_policy',
    input: { rail: 'wire', region: 'US' },
    output: { second_approval_over: 10000, holds: ['fraud_screen', 'specialist_review'] },
  },
  {
    kind: 'thinking',
    text: 'The policy gives me the $10,000 second-approval threshold and the two places a transfer can wait. I’ll draw the approval path as a flowchart, then the same transfer as messages between the parties, and keep the prose to what the diagrams can’t say.',
  },
  {
    kind: 'answer',
    text: `Here is how a wire transfer gets from your request to the recipient's account.

\`\`\`mermaid
flowchart TD
  A[Transfer requested] --> B{Over $10,000?}
  B -- No --> C[Automated fraud screen]
  B -- Yes --> D[Second approver signs off]
  D --> C
  C -->|Clear| E[Sent to the payment network]
  C -->|Flagged| F[Held for a specialist]
  F -->|Released| E
  E --> G[Settled in the recipient's account]
\`\`\`

Most transfers take the short path down the left: under the threshold, clear of the fraud screen, and settled the same business day. The two places a transfer can wait are the second approval and a specialist hold — both are people, not systems, which is why they are the ones worth asking about when a transfer is late.

The same transfer, as the messages that pass between you, your bank and the network:

\`\`\`mermaid
sequenceDiagram
  participant You
  participant Bank as Your bank
  participant Net as Payment network
  You->>Bank: Request a wire
  Bank->>Bank: Fraud screen
  Bank->>Net: Send payment
  Net-->>Bank: Accepted
  Bank-->>You: Transfer complete
\`\`\`

Once the network has accepted it, a wire can no longer be recalled by your bank alone — so the fraud screen is the last cheap place to stop one.`,
    followups: [
      'What triggers a specialist hold?',
      'How long does the second approval usually take?',
      'Draw the same flow for an ACH transfer',
    ],
  },
];

const defaults = [toolHeavy, plain];
let defaultIndex = 0;

/** Routes a prompt to a scenario. Keyword triggers beat the default cycle. */
export function pickScenario(prompt: string): Scenario {
  if (/diagram|mermaid|flowchart|draw/i.test(prompt)) return diagram;
  if (/degraded|partial|unhealthy|issues/i.test(prompt)) return degraded;
  if (/error/i.test(prompt)) return fatalError;
  if (/fail/i.test(prompt)) return toolFailure;
  if (/\b50\b|stress|many ref|lots of ref/i.test(prompt)) return citationsStress;
  if (/cite|citation|reference|source|budget|sav(e|ing)/i.test(prompt)) return citations;
  if (/tool|search|rate|market/i.test(prompt)) return toolHeavy;
  return defaults[defaultIndex++ % defaults.length];
}
