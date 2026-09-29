// A commercial loan review that stops on a human approval.
//
// This is the run the hard-coded /workflow-demo draws, ported to the wire so the
// two can be compared side by side. Its columns are the ones layout.ts was
// checked against: fed these, the client derives x = 0/300/600/900/1174/1474,
// which is exactly where the authored version put them.

import { work, type RunScript, type ScriptStep } from '../script.js';
import type { WireEdge, WireStep } from '../types.js';

const steps: WireStep[] = [
  {
    id: 'trigger',
    kind: 'trigger',
    stageId: 'intake',
    title: 'Application received',
    meta: 'Loan portal · 9:02 AM',
    column: 0,
    row: 0,
    detail: {
      summary: 'The run starts when the loan portal posts a completed application.',
      rows: [
        ['Source', 'Loan portal'],
        ['Received', '9:02 AM'],
        ['Documents', '6 files'],
      ],
    },
  },
  {
    id: 'intake',
    kind: 'agent',
    stageId: 'intake',
    title: 'Intake agent',
    meta: 'Waiting to start',
    column: 0,
    row: 1,
    detail: {
      summary: 'Classifies the application and extracts fields from uploaded documents.',
      rows: [['Reads', 'Every uploaded document']],
    },
  },
  {
    id: 'bureau',
    kind: 'tool',
    stageId: 'gather',
    title: 'credit_bureau.pull',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 0,
    detail: {
      summary: 'Pulls the business credit file.',
      rows: [['Bureau', 'Commercial file']],
    },
  },
  {
    id: 'spread',
    kind: 'agent',
    stageId: 'gather',
    title: 'Spread financials',
    meta: 'Queued',
    column: 1,
    row: 1,
    detail: {
      summary: 'Spreads three years of tax returns into the bank’s standard template.',
      rows: [['Reads', '3 years of returns']],
    },
  },
  {
    id: 'kyc',
    kind: 'tool',
    stageId: 'gather',
    title: 'kyc.verify',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 2,
    detail: {
      summary: 'Verifies the identity of every listed beneficial owner.',
      rows: [['Checks', 'Every beneficial owner']],
    },
  },
  {
    id: 'risk',
    kind: 'agent',
    stageId: 'analyze',
    title: 'Risk scoring',
    meta: 'Queued',
    column: 2,
    row: 0,
    detail: {
      summary: 'Scores the borrower against the commercial risk model.',
      rows: [['Model', 'CRM v3.2']],
    },
  },
  {
    id: 'memo',
    kind: 'agent',
    stageId: 'analyze',
    title: 'Draft credit memo',
    meta: 'Queued',
    column: 2,
    row: 1,
    detail: {
      summary: 'Writes the credit memo and a recommendation for the analyst.',
      rows: [['Produces', 'Memo and recommendation']],
    },
  },
  {
    id: 'policy',
    kind: 'decision',
    stageId: 'approve',
    title: 'Policy check',
    meta: 'Queued',
    column: 3,
    row: 0,
    detail: {
      summary: 'Routes the run by loan size and policy exceptions.',
      rows: [['Senior officer', 'Required at $500,000']],
    },
  },
  {
    id: 'approve',
    kind: 'human',
    stageId: 'approve',
    initials: 'DW',
    title: 'Approve credit memo',
    meta: 'Waiting on the memo',
    assignee: 'Dana W.',
    column: 4,
    row: 0,
    detail: {
      summary:
        'Review the drafted memo and the policy exception. Nothing after this step runs until you decide.',
      rows: [
        ['Assigned', 'Dana Whitfield'],
        ['Routed by', 'Policy check'],
      ],
    },
  },
  {
    id: 'senior',
    kind: 'human',
    stageId: 'approve',
    title: 'Senior officer review',
    meta: 'Only if loan ≥ $500,000',
    column: 4,
    row: 1,
    detail: {
      summary: 'A second approval that only runs on larger loans.',
      rows: [
        ['Role', 'Senior credit officer'],
        ['Threshold', '$500,000'],
        ['This run', 'Skipped — $450,000'],
      ],
    },
  },
  {
    id: 'letter',
    kind: 'agent',
    stageId: 'decide',
    title: 'Draft decision letter',
    meta: 'Starts after your approval',
    column: 5,
    row: 0,
    detail: {
      summary: 'Prepares the approval letter with the analyst’s conditions.',
      rows: [
        ['Starts after', 'Your approval'],
        ['Typical time', '~40s'],
      ],
    },
  },
  {
    id: 'notify',
    kind: 'tool',
    stageId: 'decide',
    title: 'portal.notify',
    mono: true,
    meta: 'Emails the applicant',
    column: 5,
    row: 1,
    detail: {
      summary: 'Sends the decision letter to the applicant through the portal.',
      rows: [['Sends', 'Decision letter to applicant']],
    },
  },
];

const edges: WireEdge[] = [
  { from: 'trigger', to: 'intake', rule: 'feeds' },
  { from: 'intake', to: 'bureau', rule: 'feeds' },
  { from: 'intake', to: 'spread', rule: 'feeds' },
  { from: 'intake', to: 'kyc', rule: 'feeds' },
  { from: 'bureau', to: 'risk', rule: 'feeds' },
  { from: 'spread', to: 'risk', rule: 'feeds' },
  { from: 'spread', to: 'memo', rule: 'feeds' },
  { from: 'kyc', to: 'memo', rule: 'feeds' },
  { from: 'risk', to: 'policy', rule: 'feeds' },
  { from: 'memo', to: 'policy', rule: 'feeds' },
  { from: 'policy', to: 'approve', rule: 'feeds' },
  // The senior-officer branch exists so the canvas can show a road not taken.
  { from: 'policy', to: 'senior', rule: 'never' },
  { from: 'senior', to: 'letter', rule: 'never' },
  { from: 'approve', to: 'letter', rule: 'feeds' },
  { from: 'letter', to: 'notify', rule: 'feeds' },
];

/** The detail the approval step gets once there is actually something to read. */
const approvalDetail = (verdict: string) => ({
  summary:
    'Review the drafted memo and the policy exception. Nothing after this step runs until you decide.',
  rows: [
    ['Assigned', 'Dana Whitfield'],
    ['Due', 'Today 2:00 PM · 3h 40m left'],
    ['Routed by', 'Policy check'],
    ['If approved', 'Draft decision letter'],
  ] as [string, string][],
  recommendation: {
    from: 'Draft credit memo',
    verdict,
    figures: [
      ['Loan', '$450,000'],
      ['Risk grade', '4 of 10'],
      ['DSCR', '1.38×'],
    ] as [string, string][],
  },
  exception: {
    text: 'Guarantor credit score is 672. Policy asks for 680.',
    mitigant: 'Mitigant in memo: 24 months of cash reserves.',
  },
});

/**
 * How many times the memo may be sent back before the analyst has to decide.
 * The re-ask is written out rather than looped: a branch that rebuilt itself
 * lazily would need the script model to carry thunks, and a script that rebuilt
 * itself eagerly recurses forever at construction time. Two is also the honest
 * answer — the third time round, "request changes" stops being on offer.
 */
const MAX_REASKS = 2;

/**
 * The approval gate, at a given round of asking. A function rather than a
 * constant because the `changes` branch ends by asking again; `round` is what
 * makes that terminate. The runtime's own gate-depth cap is a backstop behind it.
 */
function askAgain(round = 0): ScriptStep {
  const canAskAgain = round < MAX_REASKS;
  return {
    kind: 'gate',
    stepId: 'approve',
    // Once the memo has been round twice, the only way out is a decision.
    decisions: canAskAgain ? ['approved', 'changes', 'declined'] : ['approved', 'declined'],
    dueLabel: '3h 40m',
    branches: {
      approved: approvedBranch(),
      ...(canAskAgain && { changes: changesBranch(round + 1) }),
      declined: declinedBranch(),
    },
  };
}

const approvedBranch = (): ScriptStep[] => [
  { kind: 'stage' as const, stageId: 'approve', status: 'done' as const, sub: 'Approved' },
  { kind: 'stage' as const, stageId: 'decide', status: 'current' as const, sub: 'Drafting' },
  work('letter', 4_000, '2 pages · conditions attached', {
    startLog: 'Drafting the approval letter',
    detail: {
      summary: 'Prepares the approval letter with the analyst\u2019s conditions.',
      rows: [
        ['Pages', '2'],
        ['Conditions', 'Carried from the memo'],
      ],
    },
  }),
  work('notify', 1_500, 'Emailed the applicant', {
    detail: {
      summary: 'Sends the decision letter to the applicant through the portal.',
      rows: [['Sent to', 'Applicant contact on file']],
    },
  }),
  {
    kind: 'stage' as const,
    stageId: 'decide',
    status: 'done' as const,
    sub: '2 steps \u00b7 0:06',
  },
];

/** Sent back: the memo goes `running` again — a status moving backwards. */
const changesBranch = (round: number): ScriptStep[] => [
  {
    kind: 'log' as const,
    level: 'info' as const,
    text: 'Revising the memo with your notes',
    stepId: 'memo',
  },
  { kind: 'status' as const, stepId: 'memo', status: 'running' as const, meta: 'Revising' },
  { kind: 'wait' as const, ms: 4_000 },
  {
    kind: 'status' as const,
    stepId: 'memo',
    status: 'done' as const,
    meta: 'Approve \u2014 conditions tightened',
  },
  {
    kind: 'status' as const,
    stepId: 'approve',
    status: 'queued' as const,
    detail: approvalDetail('Approve \u2014 conditions tightened'),
  },
  askAgain(round),
];

const declinedBranch = (): ScriptStep[] => [
  {
    kind: 'skip' as const,
    stepIds: ['letter', 'notify'],
    log: 'Decision letter and notification skipped \u2014 the memo was declined',
  },
  { kind: 'stage' as const, stageId: 'approve', status: 'done' as const, sub: 'Declined' },
  { kind: 'stage' as const, stageId: 'decide', status: 'upcoming' as const, sub: 'Not reached' },
];

export const loanReview: RunScript = {
  id: 'loan-review',
  label: 'Loan review',
  blurb: 'A commercial loan that stops on one human approval.',
  title: 'Commercial loan review',
  header: {
    primary: 'Harbor Street Bakery LLC',
    secondary: 'Commercial term loan · $450,000',
    tertiary: 'Run 4821 · started 9:02 AM',
  },
  actor: { initials: 'DW', name: 'Dana Whitfield', role: 'Credit analyst' },
  stages: [
    { id: 'intake', name: 'Intake', sub: '2 steps', status: 'current' },
    { id: 'gather', name: 'Gather', sub: '3 steps', status: 'upcoming' },
    { id: 'analyze', name: 'Analyze', sub: '2 steps', status: 'upcoming' },
    { id: 'approve', name: 'Approve', sub: 'Not reached', status: 'upcoming' },
    { id: 'decide', name: 'Decide & notify', sub: '2 steps', status: 'upcoming' },
  ],
  steps,
  edges,
  initialStatuses: {
    trigger: 'done',
    intake: 'queued',
    bureau: 'queued',
    spread: 'queued',
    kyc: 'queued',
    risk: 'queued',
    memo: 'queued',
    policy: 'queued',
    approve: 'queued',
    // The branch this run will never take ships already skipped: the node set
    // must not change mid-run, or the canvas re-frames under the reader.
    senior: 'skipped',
    letter: 'queued',
    notify: 'queued',
  },
  focusStepId: 'trigger',
  play: [
    { kind: 'log', level: 'info', text: 'Application received · 6 documents', stepId: 'trigger' },
    work('intake', 5_000, '14 fields from 6 docs', {
      startLog: 'Classifying the application',
      detail: {
        summary: 'Classifies the application and extracts fields from uploaded documents.',
        rows: [
          ['Extracted', '14 fields'],
          ['Documents', '6 of 6 read'],
        ],
      },
    }),
    { kind: 'stage', stageId: 'intake', status: 'done', sub: '2 steps · 0:05' },
    { kind: 'stage', stageId: 'gather', status: 'current', sub: '3 steps running' },
    {
      // Three calls at once — the fan-out the canvas draws as one intake feeding
      // three lanes.
      kind: 'parallel',
      steps: [
        work('bureau', 2_500, 'Score 742 · no derogatories', {
          detail: {
            summary: 'Pulls the business credit file.',
            rows: [
              ['Business score', '742'],
              ['Derogatories', 'None'],
            ],
          },
        }),
        work('spread', 6_000, '3 years · DSCR 1.38×', {
          detail: {
            summary: 'Spreads three years of tax returns into the bank’s standard template.',
            rows: [
              ['DSCR', '1.38×'],
              ['Revenue, 2025', '−18%'],
            ],
          },
        }),
        work('kyc', 3_500, '2 of 2 owners verified', {
          detail: {
            summary: 'Verifies the identity of every listed beneficial owner.',
            rows: [['Owners', '2 of 2 verified']],
          },
        }),
      ],
    },
    { kind: 'log', level: 'warn', text: 'Revenue down 18% year over year', stepId: 'spread' },
    { kind: 'stage', stageId: 'gather', status: 'done', sub: '3 steps · 0:06' },
    { kind: 'stage', stageId: 'analyze', status: 'current', sub: '2 steps running' },
    work('risk', 4_000, 'Grade 4 of 10 · CRM v3.2', {
      detail: {
        summary: 'Scores the borrower against the commercial risk model.',
        rows: [
          ['Risk grade', '4 of 10'],
          ['Model', 'CRM v3.2'],
        ],
      },
    }),
    work('memo', 5_000, 'Approve with conditions', {
      startLog: 'Writing the credit memo',
      detail: {
        summary: 'Writes the credit memo and a recommendation for the analyst.',
        rows: [
          ['Recommends', 'Approve with conditions'],
          ['Memo', '7 pages'],
        ],
      },
    }),
    { kind: 'stage', stageId: 'analyze', status: 'done', sub: '2 steps · 0:09' },
    { kind: 'stage', stageId: 'approve', status: 'current', sub: 'Waiting on Dana W.' },
    work('policy', 2_000, '1 exception', {
      detail: {
        summary: 'Routes the run by loan size and policy exceptions.',
        rows: [
          ['Exceptions', '1'],
          ['Routed to', 'Analyst approval'],
          ['Senior officer', 'Not required under $500,000'],
        ],
      },
    }),
    {
      kind: 'log',
      level: 'warn',
      text: '1 exception: guarantor score 672 under 680',
      stepId: 'policy',
    },
    {
      kind: 'status',
      stepId: 'approve',
      status: 'queued',
      meta: 'Due in 3h 40m',
      detail: approvalDetail('Approve with conditions'),
    },
    askAgain(),
  ],
};
