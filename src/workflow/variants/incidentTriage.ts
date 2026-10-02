// A production incident, triaged and mitigated.
//
// This variant exists to exercise the two things the loan review never does:
//
//  1. A step that ends `failed` and the run carries on anyway. The synthetic
//     probe timing out is a *finding*, not a stop — a canvas that treats red as
//     terminal gets that wrong.
//  2. A status moving backwards. `verify` fails, then goes back to `running` for
//     a retry, which smokes out anything that assumes progress is monotonic.

import { work, type RunScript, type ScriptStep } from '../script.js';
import type { WireEdge, WireStep } from '../types.js';

const steps: WireStep[] = [
  {
    id: 'alert',
    kind: 'trigger',
    stageId: 'detect',
    title: 'Latency SLO burn',
    meta: 'Checkout p99 · 14:02',
    column: 0,
    row: 0,
    detail: {
      summary:
        'The checkout service burned through its latency budget four times faster than allowed.',
      rows: [
        ['Service', 'checkout-api'],
        ['Indicator', 'p99 latency'],
        ['Burn rate', '4.1× budget'],
      ],
    },
  },
  {
    id: 'page',
    kind: 'tool',
    stageId: 'detect',
    title: 'pagerduty.page',
    mono: true,
    meta: 'Queued',
    column: 0,
    row: 1,
    detail: {
      summary: 'Pages whoever is on call for the checkout service.',
      rows: [['Rotation', 'checkout-primary']],
    },
  },
  {
    id: 'metrics',
    kind: 'tool',
    stageId: 'triage',
    title: 'datadog.query',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 0,
    detail: {
      summary: 'Pulls the last hour of checkout latency and error rate.',
      rows: [['Window', '60 minutes']],
    },
  },
  {
    id: 'logs',
    kind: 'tool',
    stageId: 'triage',
    title: 'loki.search',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 1,
    detail: {
      summary: 'Searches checkout logs for new error signatures.',
      rows: [['Window', '60 minutes']],
    },
  },
  {
    id: 'deploys',
    kind: 'tool',
    stageId: 'triage',
    title: 'deploys.recent',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 2,
    detail: {
      summary: 'Lists anything shipped to checkout in the last six hours.',
      rows: [['Window', '6 hours']],
    },
  },
  {
    id: 'correlate',
    kind: 'agent',
    stageId: 'diagnose',
    title: 'Correlate signals',
    meta: 'Queued',
    column: 2,
    row: 0,
    detail: {
      summary: 'Lines the metrics, logs and deploys up against one another.',
      rows: [['Looking for', 'A common start time']],
    },
  },
  {
    id: 'canary',
    kind: 'tool',
    stageId: 'diagnose',
    title: 'synthetic.probe',
    mono: true,
    meta: 'Queued',
    column: 2,
    row: 1,
    detail: {
      summary: 'Runs the checkout journey against the canary pool.',
      rows: [['Journey', 'Add to cart → pay']],
    },
  },
  {
    id: 'traces',
    kind: 'agent',
    stageId: 'diagnose',
    title: 'Trace analysis',
    meta: 'Queued',
    column: 2,
    row: 2,
    detail: {
      summary: 'Reads sampled traces for the slowest checkout requests.',
      rows: [['Sample', '500 traces']],
    },
  },
  {
    id: 'blast',
    kind: 'decision',
    stageId: 'decide',
    title: 'Blast radius',
    meta: 'Queued',
    column: 3,
    row: 0,
    detail: {
      summary: 'Routes by how much of the traffic is affected and whether a rollback is safe.',
      rows: [['Vendor path', 'Only if the cause is upstream']],
    },
  },
  {
    id: 'rollback-approve',
    kind: 'human',
    stageId: 'decide',
    initials: 'SR',
    title: 'Approve rollback',
    meta: 'Waiting on the diagnosis',
    assignee: 'Sam R.',
    column: 4,
    row: 0,
    detail: {
      summary:
        'Rolling back is the fast fix but it drops the feature flag work that shipped with it.',
      rows: [
        ['On call', 'Sam Raines'],
        ['Routed by', 'Blast radius'],
      ],
    },
  },
  {
    id: 'page-vendor',
    kind: 'human',
    stageId: 'decide',
    title: 'Escalate to vendor',
    meta: 'Only if the cause is upstream',
    column: 4,
    row: 1,
    detail: {
      summary: 'A second path for an incident that turns out not to be ours.',
      rows: [
        ['Route', 'Payments vendor on-call'],
        ['This run', 'Skipped — the cause is our own deploy'],
      ],
    },
  },
  {
    id: 'rollback',
    kind: 'agent',
    stageId: 'mitigate',
    title: 'deploy.rollback',
    mono: true,
    meta: 'Starts after your approval',
    column: 5,
    row: 0,
    detail: {
      summary: 'Rolls checkout back to the last known good build.',
      rows: [['Target', 'Previous release']],
    },
  },
  {
    id: 'verify',
    kind: 'tool',
    stageId: 'mitigate',
    title: 'synthetic.verify',
    mono: true,
    meta: 'Queued',
    column: 5,
    row: 1,
    detail: {
      summary: 'Re-runs the checkout journey to confirm the rollback took.',
      rows: [['Journey', 'Add to cart → pay']],
    },
  },
  {
    id: 'postmortem',
    kind: 'agent',
    stageId: 'mitigate',
    title: 'Draft postmortem',
    meta: 'Queued',
    column: 5,
    row: 2,
    detail: {
      summary: 'Writes the timeline and the contributing factors while they are fresh.',
      rows: [['Template', 'Blameless postmortem']],
    },
  },
];

const edges: WireEdge[] = [
  { from: 'alert', to: 'page', rule: 'feeds' },
  { from: 'page', to: 'metrics', rule: 'feeds' },
  { from: 'page', to: 'logs', rule: 'feeds' },
  { from: 'page', to: 'deploys', rule: 'feeds' },
  { from: 'metrics', to: 'correlate', rule: 'feeds' },
  { from: 'logs', to: 'correlate', rule: 'feeds' },
  { from: 'deploys', to: 'correlate', rule: 'feeds' },
  { from: 'metrics', to: 'canary', rule: 'feeds' },
  { from: 'logs', to: 'traces', rule: 'feeds' },
  { from: 'correlate', to: 'blast', rule: 'feeds' },
  { from: 'canary', to: 'blast', rule: 'feeds' },
  { from: 'traces', to: 'blast', rule: 'feeds' },
  { from: 'blast', to: 'rollback-approve', rule: 'feeds' },
  // The road not taken: this incident is ours, so the vendor path never opens.
  { from: 'blast', to: 'page-vendor', rule: 'never' },
  { from: 'page-vendor', to: 'rollback', rule: 'never' },
  { from: 'rollback-approve', to: 'rollback', rule: 'feeds' },
  { from: 'rollback', to: 'verify', rule: 'feeds' },
  { from: 'verify', to: 'postmortem', rule: 'feeds' },
];

const approvalDetail = {
  summary:
    'Rolling back is the fast fix but it drops the feature flag work that shipped with it. Nothing after this step runs until you decide.',
  rows: [
    ['On call', 'Sam Raines'],
    ['Affected', '31% of checkout traffic'],
    ['Suspect', 'checkout-api 2026.9.14-3'],
    ['If approved', 'Roll back, then verify'],
  ] as [string, string][],
  recommendation: {
    label: 'Agent diagnosis',
    from: 'Correlate signals',
    verdict: 'Roll back checkout-api',
    figures: [
      ['Confidence', 'High'],
      ['Started', '14:01'],
      ['Affected', '31%'],
    ] as [string, string][],
  },
  exception: {
    label: 'Probe failure',
    text: 'synthetic.probe timed out after 30s against the canary pool.',
    mitigant:
      'Treated as corroborating evidence, not as a blocker — the canary carries the suspect build.',
  },
};

const approvedBranch = (): ScriptStep[] => [
  { kind: 'stage', stageId: 'decide', status: 'done', sub: 'Rollback approved' },
  { kind: 'stage', stageId: 'mitigate', status: 'current', sub: 'Rolling back' },
  work('rollback', 5_000, 'Rolled back to 2026.9.14-2', {
    startLog: 'Rolling checkout-api back to the last good build',
    detail: {
      summary: 'Rolls checkout back to the last known good build.',
      rows: [
        ['From', '2026.9.14-3'],
        ['To', '2026.9.14-2'],
        ['Instances', '18 of 18'],
      ],
    },
  }),
  // The verify fails once. A status going backwards to `running` for the retry
  // is the thing this variant is here to prove the canvas survives.
  work('verify', 3_000, 'p99 still above budget', {
    outcome: 'failed',
    log: 'Verification failed — p99 still 2.4× budget, caches are cold',
  }),
  {
    kind: 'log',
    level: 'info',
    text: 'Waiting 20s for caches to warm, then retrying',
    stepId: 'verify',
  },
  { kind: 'status', stepId: 'verify', status: 'running', meta: 'Retrying', afterMs: 2_500 },
  { kind: 'wait', ms: 3_500 },
  {
    kind: 'status',
    stepId: 'verify',
    status: 'done',
    meta: 'p99 back inside budget',
    detail: {
      summary: 'Re-runs the checkout journey to confirm the rollback took.',
      rows: [
        ['Attempts', '2'],
        ['p99', '380ms · inside budget'],
      ],
    },
  },
  {
    kind: 'log',
    level: 'info',
    text: 'p99 back inside budget on the second attempt',
    stepId: 'verify',
  },
  work('postmortem', 4_000, 'Timeline · 3 contributing factors', {
    detail: {
      summary: 'Writes the timeline and the contributing factors while they are fresh.',
      rows: [
        ['Contributing factors', '3'],
        ['Action items', '2'],
      ],
    },
  }),
  { kind: 'stage', stageId: 'mitigate', status: 'done', sub: '3 steps · 0:18' },
];

const declinedBranch = (): ScriptStep[] => [
  {
    kind: 'skip',
    stepIds: ['rollback', 'verify'],
    log: 'Rollback declined — holding the current build and staying on the call',
  },
  { kind: 'stage', stageId: 'decide', status: 'done', sub: 'Rollback declined' },
  { kind: 'stage', stageId: 'mitigate', status: 'current', sub: 'Postmortem only' },
  work('postmortem', 4_000, 'Timeline · rollback declined', {
    detail: {
      summary: 'Writes the timeline and the contributing factors while they are fresh.',
      rows: [
        ['Mitigation', 'None — build held'],
        ['Still open', 'Yes'],
      ],
    },
  }),
  { kind: 'stage', stageId: 'mitigate', status: 'done', sub: '1 step' },
];

export const incidentTriage: RunScript = {
  id: 'incident-triage',
  label: 'Incident triage',
  blurb: 'A SEV-2 with a failed probe and a retry — red that is not the end.',
  title: 'SEV-2 · checkout p99 latency',
  header: {
    primary: 'checkout-api',
    secondary: 'SEV-2 · p99 latency · 31% of traffic',
    tertiary: 'INC-2291 · opened 14:02',
  },
  actor: { initials: 'SR', name: 'Sam Raines', role: 'On call, checkout' },
  stages: [
    { id: 'detect', name: 'Detect', sub: '2 steps', status: 'current' },
    { id: 'triage', name: 'Triage', sub: '3 steps', status: 'upcoming' },
    { id: 'diagnose', name: 'Diagnose', sub: '3 steps', status: 'upcoming' },
    { id: 'decide', name: 'Decide', sub: 'Not reached', status: 'upcoming' },
    { id: 'mitigate', name: 'Mitigate', sub: '3 steps', status: 'upcoming' },
  ],
  steps,
  edges,
  initialStatuses: {
    alert: 'done',
    page: 'queued',
    metrics: 'queued',
    logs: 'queued',
    deploys: 'queued',
    correlate: 'queued',
    canary: 'queued',
    traces: 'queued',
    blast: 'queued',
    'rollback-approve': 'queued',
    'page-vendor': 'skipped',
    rollback: 'queued',
    verify: 'queued',
    postmortem: 'queued',
  },
  focusStepId: 'alert',
  play: [
    { kind: 'log', level: 'warn', text: 'Latency SLO burning at 4.1× budget', stepId: 'alert' },
    work('page', 1_500, 'Paged checkout-primary', {
      detail: {
        summary: 'Pages whoever is on call for the checkout service.',
        rows: [['Paged', 'Sam Raines']],
      },
    }),
    { kind: 'stage', stageId: 'detect', status: 'done', sub: '2 steps · 0:02' },
    { kind: 'stage', stageId: 'triage', status: 'current', sub: '3 queries running' },
    {
      kind: 'parallel',
      steps: [
        work('metrics', 2_500, 'p99 2.9s from 14:01', {
          detail: {
            summary: 'Pulls the last hour of checkout latency and error rate.',
            rows: [
              ['p99', '2.9s'],
              ['Step change at', '14:01'],
            ],
          },
        }),
        work('logs', 3_500, 'New signature · 1.2k matches', {
          detail: {
            summary: 'Searches checkout logs for new error signatures.',
            rows: [
              ['Signature', 'PoolTimeout'],
              ['Matches', '1,204'],
            ],
          },
        }),
        work('deploys', 1_800, '1 deploy at 13:58', {
          detail: {
            summary: 'Lists anything shipped to checkout in the last six hours.',
            rows: [
              ['Deploy', '2026.9.14-3'],
              ['Shipped', '13:58'],
            ],
          },
        }),
      ],
    },
    { kind: 'stage', stageId: 'triage', status: 'done', sub: '3 steps · 0:04' },
    { kind: 'stage', stageId: 'diagnose', status: 'current', sub: '3 steps running' },
    {
      kind: 'parallel',
      steps: [
        work('correlate', 4_000, 'Deploy 2026.9.14-3 at 13:58', {
          startLog: 'Lining up metrics, logs and deploys',
          detail: {
            summary: 'Lines the metrics, logs and deploys up against one another.',
            rows: [
              ['Suspect', '2026.9.14-3'],
              ['Deploy at', '13:58'],
              ['Burn from', '14:01'],
            ],
          },
        }),
        // Fails, and the run carries on — a probe timing out is evidence.
        work('canary', 3_000, 'timeout after 30s', {
          outcome: 'failed',
          log: 'synthetic.probe timed out after 30s against the canary pool',
          detail: {
            summary: 'Runs the checkout journey against the canary pool.',
            rows: [
              ['Result', 'Timed out at 30s'],
              ['Canary build', '2026.9.14-3'],
            ],
          },
        }),
        work('traces', 3_500, 'Connection pool exhaustion', {
          detail: {
            summary: 'Reads sampled traces for the slowest checkout requests.',
            rows: [
              ['Hot span', 'db.acquire'],
              ['Waiting', '2.6s median'],
            ],
          },
        }),
      ],
    },
    {
      kind: 'log',
      level: 'warn',
      text: 'Canary probe failed — the canary carries the suspect build, so this corroborates rather than blocks',
      stepId: 'canary',
    },
    { kind: 'stage', stageId: 'diagnose', status: 'done', sub: '3 steps · 0:04 · 1 failed' },
    { kind: 'stage', stageId: 'decide', status: 'current', sub: 'Waiting on Sam R.' },
    work('blast', 2_000, '31% of traffic · ours', {
      detail: {
        summary: 'Routes by how much of the traffic is affected and whether a rollback is safe.',
        rows: [
          ['Affected', '31% of checkout'],
          ['Cause', 'Our own deploy'],
          ['Vendor path', 'Not taken'],
        ],
      },
    }),
    {
      kind: 'status',
      stepId: 'rollback-approve',
      status: 'queued',
      meta: 'Due in 10m',
      detail: approvalDetail,
    },
    {
      kind: 'gate',
      stepId: 'rollback-approve',
      // No "request changes" here: an incident gate is yes or no.
      decisions: ['approved', 'declined'],
      dueLabel: '10m',
      branches: { approved: approvedBranch(), declined: declinedBranch() },
    },
  ],
};
