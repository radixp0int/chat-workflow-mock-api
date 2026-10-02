// Reference corpora the mock server attaches to a `summary` event. These
// mirror the demo docs the UI used to inject on the client, so citations now
// originate server-side. Inline [n] markers in the answer text resolve to a
// source `id` here.

import type { WSHighlight, WSSource } from './types.js';

/** A small finance corpus for the citations demo answer. */
export const financeSources: WSSource[] = [
  {
    id: 1,
    title: 'Emergency Fund Sizing Guidelines',
    markdown: `## How large should an emergency fund be?

The classic guidance is **three to six months of essential expenses**, but the right number depends on income stability, household structure, and insurance coverage.

| Situation | Suggested months | Rationale |
| :--- | :---: | :--- |
| Dual income, stable jobs | **3** | Two paychecks cushion a single job loss |
| Single income, stable job | **4–5** | No second earner to absorb a gap |
| Variable / gig income | **6–9** | Income itself is the risk |

> An emergency fund is insurance, not an investment. Judge it by how well it lets you sleep, not by its yield.`,
  },
  {
    id: 2,
    title: 'High-Yield Savings Accounts: 2026 Rate Survey',
    markdown: `## 2026 rate survey

A snapshot of widely available high-yield savings accounts. APYs move with the federal funds rate.

| Provider | APY | Monthly fee | Minimum | FDIC | Notes |
| :--- | ---: | ---: | ---: | :---: | :--- |
| Meridian Direct | **4.35%** | $0 | $0 | Yes | Rate drops above \`$250k\` |
| Bluepeak Savings | 4.20% | $0 | $500 | Yes | $500 min to earn APY |
| Foxglove Financial | **4.50%** | $0 | $0 | Yes | Promo, reverts in 6 months |

Insurance cap is **$250,000 per depositor, per institution** — split larger balances.`,
  },
  {
    id: 3,
    title: 'Why Automation Beats Willpower',
    markdown: `## The case for automatic transfers

Money moved before it reaches the spending account gets saved at 2–3× the rate of money saved "when there's some left over."

\`\`\`text
payday
  ├─ 60%  → checking     (fixed costs + spending)
  ├─ 25%  → high-yield   (emergency fund, then goals)
  └─ 15%  → retirement   (401k / IRA)
\`\`\`

> Consistency beats optimization: a mediocre plan you follow for ten years beats a perfect plan you abandon in March.`,
  },
  {
    id: 4,
    title: 'Ordering Savings, Debt, and Investing',
    markdown: `## Where the next dollar goes

1. **Employer match** — an instant 50–100% return.
2. **High-interest debt** — anything above ~8% APR.
3. **Emergency fund** — to your target.
4. **Tax-advantaged investing** — IRA / 401(k) beyond the match.

Keep a small starter buffer (**$1,000–$2,000**) even while attacking debt.`,
  },
];

const stressTopics = [
  'Savings Rates',
  'Account Fees',
  'Budget Ratios',
  'Card Rewards',
  'Loan Terms',
  'Tax Brackets',
  'Insurance Riders',
  'Index Funds',
  'Cash Flow',
  'Credit Scores',
];

/** A large generated corpus to exercise the reference UI at scale. */
export function makeStressSources(count: number): WSSource[] {
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    const topic = stressTopics[i % stressTopics.length];
    const flavor = id % 3;
    const body =
      flavor === 0
        ? `### Key figures

| Metric | Value | Percentile |
| :--- | ---: | ---: |
| Median | ${(2 + (id % 7) * 0.45).toFixed(2)}% | 50th |
| Upper band | ${(4 + (id % 5) * 0.6).toFixed(2)}% | 90th |
| Floor | ${(0.5 + (id % 3) * 0.25).toFixed(2)}% | 10th |

> Figures in doc ${id} are illustrative sample data for the ${topic.toLowerCase()} series.`
        : flavor === 1
          ? `### Checklist

1. Confirm the ${topic.toLowerCase()} assumptions against the latest statement.
2. Flag anything that moved more than **±${(id % 9) + 1}%** quarter over quarter.
3. Record exceptions with code \`${topic.replace(/\s/g, '-').toUpperCase()}-${id}\`.`
          : `### Notes

This working note supports answer marker [${id}]. The ${topic.toLowerCase()} series is summarized as:

\`\`\`json
{ "doc": ${id}, "series": "${topic}", "window": "${(id % 12) + 1}mo", "confidence": ${(0.6 + (id % 4) * 0.1).toFixed(1)} }
\`\`\``;
    return {
      id,
      title: `Doc ${id}: ${topic} Working Paper`,
      markdown: `## ${topic} — working paper ${id}\n\nOne of ${count} generated reference documents in the stress-test corpus.\n\n${body}`,
    };
  });
}

/** The stress corpus as a single shared array. The answer that cites it and the
 *  highlights that index it must be the *same* docs — building it twice would
 *  leave the offsets resolving against a different array than the one sent. */
export const stressSources: WSSource[] = makeStressSources(50);

/**
 * Authoring helper for the scenarios: turns `{ referenceNumber, phrase }` specs
 * into the nested highlight shape by locating each phrase in the matching
 * source's markdown (the source whose `id` equals `referenceNumber`). Sections
 * are grouped by `referenceNumber` and each gets a unique running `idx`. Keeps
 * mock offsets correct without hand-counting; unfound phrases are skipped.
 *
 * Mirrors `sourceHighlights` in the client's src/lib/highlights.ts — offsets
 * index the source's own markdown, so they cross the wire unchanged.
 */
export function sourceHighlights(
  sources: WSSource[],
  specs: { referenceNumber: number; phrase: string }[],
): WSHighlight[] {
  const groups = new Map<number, WSHighlight>();
  let idx = 1;
  for (const { referenceNumber, phrase } of specs) {
    const source = sources.find((s) => s.id === referenceNumber);
    if (!source) continue;
    const start = source.markdown.indexOf(phrase);
    if (start === -1) continue;
    const section = { idx: idx++, start, end: start + phrase.length };
    const group = groups.get(referenceNumber);
    if (group) group.sections.push(section);
    else groups.set(referenceNumber, { referenceNumber, sections: [section] });
  }
  return [...groups.values()];
}
