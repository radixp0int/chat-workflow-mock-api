// A new hire being set up across every system that has to know about them.
//
// The shape this variant is here for is width, in two places:
//
//  1. Five provisioning calls run at once, in one column. At ROW_PITCH that is a
//     720px column — which is why the canvas's stage lanes take their height
//     from the run rather than from a constant.
//  2. Two approvals open together. "Needs you" reads 2, the sidebar lists both,
//     and neither can be the one hardcoded step the old page looked for.

import { work, type RunScript, type ScriptStep } from '../script.js';
import type { WireEdge, WireStep } from '../types.js';

const steps: WireStep[] = [
  {
    id: 'signed',
    kind: 'trigger',
    stageId: 'offer',
    title: 'Offer signed',
    meta: 'Greenhouse · 08:40',
    column: 0,
    row: 0,
    detail: {
      summary: 'The run starts when a countersigned offer lands in the ATS.',
      rows: [
        ['Candidate', 'Priya Raman'],
        ['Role', 'Solutions Engineer'],
        ['Start date', 'Mon 28 Sep'],
      ],
    },
  },
  {
    id: 'hris',
    kind: 'agent',
    stageId: 'offer',
    title: 'Create HRIS record',
    meta: 'Queued',
    column: 0,
    row: 1,
    detail: {
      summary: 'Opens the employee record everything else keys off.',
      rows: [['System', 'Workday']],
    },
  },
  {
    id: 'okta',
    kind: 'tool',
    stageId: 'provision',
    title: 'okta.create_user',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 0,
    detail: {
      summary: 'Creates the identity every other system authenticates against.',
      rows: [['Directory', 'Okta']],
    },
  },
  {
    id: 'gsuite',
    kind: 'tool',
    stageId: 'provision',
    title: 'gsuite.provision',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 1,
    detail: { summary: 'Mailbox, calendar and drive.', rows: [['Domain', 'Company mail']] },
  },
  {
    id: 'slack',
    kind: 'tool',
    stageId: 'provision',
    title: 'slack.invite',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 2,
    detail: {
      summary: 'Invites them to the workspace and the team channels.',
      rows: [['Channels', 'By team']],
    },
  },
  {
    id: 'github',
    kind: 'tool',
    stageId: 'provision',
    title: 'github.add_member',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 3,
    detail: {
      summary: 'Adds them to the org at the base access level.',
      rows: [['Level', 'Read, until approved']],
    },
  },
  {
    id: 'laptop',
    kind: 'tool',
    stageId: 'provision',
    title: 'laptop.order',
    mono: true,
    meta: 'Queued',
    column: 1,
    row: 4,
    detail: {
      summary: 'Orders and images the machine against the start date.',
      rows: [['Model', 'Standard engineering']],
    },
  },
  {
    id: 'badge',
    kind: 'tool',
    stageId: 'compliance',
    title: 'facilities.badge',
    mono: true,
    meta: 'Queued',
    column: 2,
    row: 0,
    detail: {
      summary: 'Issues a building badge for the office they are based at.',
      rows: [['Office', 'London']],
    },
  },
  {
    id: 'payroll',
    kind: 'agent',
    stageId: 'compliance',
    title: 'Enrol in payroll',
    meta: 'Queued',
    column: 2,
    row: 1,
    detail: {
      summary: 'Sets up pay, tax and benefits against the start date.',
      rows: [['Cycle', 'Monthly']],
    },
  },
  {
    id: 'bgcheck',
    kind: 'tool',
    stageId: 'compliance',
    title: 'checkr.run',
    mono: true,
    meta: 'Queued',
    column: 2,
    row: 2,
    detail: {
      summary: 'Runs the pre-employment background check.',
      rows: [['Package', 'Standard']],
    },
  },
  {
    id: 'tier',
    kind: 'decision',
    stageId: 'approvals',
    title: 'Access tier',
    meta: 'Queued',
    column: 3,
    row: 0,
    detail: {
      summary: 'Decides which approvals this hire needs before day one.',
      rows: [
        ['Elevated access', 'Needs the manager'],
        ['Check exceptions', 'Needs HR'],
      ],
    },
  },
  {
    id: 'manager-approve',
    kind: 'human',
    stageId: 'approvals',
    initials: 'RO',
    title: 'Approve elevated access',
    meta: 'Waiting on the access tier',
    assignee: 'R. Okafor',
    column: 4,
    row: 0,
    detail: {
      summary: 'Production read-write is not granted by default; the hiring manager signs it off.',
      rows: [['Manager', 'Rachel Okafor']],
    },
  },
  {
    id: 'hr-approve',
    kind: 'human',
    stageId: 'approvals',
    initials: 'NT',
    title: 'Confirm background check',
    meta: 'Waiting on the check',
    assignee: 'Nia T.',
    column: 4,
    row: 1,
    detail: {
      summary: 'The check came back with one item to read before the start date is confirmed.',
      rows: [['HR partner', 'Nia Thompson']],
    },
  },
  {
    id: 'welcome',
    kind: 'agent',
    stageId: 'dayone',
    title: 'Build welcome pack',
    meta: 'Starts after both approvals',
    column: 5,
    row: 0,
    detail: {
      summary: 'Assembles the first-week guide, the team map and the reading list.',
      rows: [['Pages', '~12']],
    },
  },
  {
    id: 'calendar',
    kind: 'tool',
    stageId: 'dayone',
    title: 'calendar.schedule',
    mono: true,
    meta: 'Queued',
    column: 5,
    row: 1,
    detail: {
      summary: 'Books orientation, the manager 1:1 and the buddy coffee.',
      rows: [['Meetings', '3']],
    },
  },
  {
    id: 'notify',
    kind: 'tool',
    stageId: 'dayone',
    title: 'slack.dm',
    mono: true,
    meta: 'Queued',
    column: 5,
    row: 2,
    detail: {
      summary: 'Tells the team who is starting and when.',
      rows: [['Audience', 'Team channel']],
    },
  },
];

const edges: WireEdge[] = [
  { from: 'signed', to: 'hris', rule: 'feeds' },
  ...['okta', 'gsuite', 'slack', 'github', 'laptop'].map(
    (to) => ({ from: 'hris', to, rule: 'feeds' }) as WireEdge,
  ),
  { from: 'okta', to: 'badge', rule: 'feeds' },
  { from: 'okta', to: 'payroll', rule: 'feeds' },
  { from: 'okta', to: 'bgcheck', rule: 'feeds' },
  { from: 'gsuite', to: 'payroll', rule: 'feeds' },
  { from: 'github', to: 'tier', rule: 'feeds' },
  { from: 'badge', to: 'tier', rule: 'feeds' },
  { from: 'payroll', to: 'tier', rule: 'feeds' },
  { from: 'bgcheck', to: 'tier', rule: 'feeds' },
  { from: 'tier', to: 'manager-approve', rule: 'feeds' },
  { from: 'tier', to: 'hr-approve', rule: 'feeds' },
  { from: 'manager-approve', to: 'welcome', rule: 'feeds' },
  { from: 'hr-approve', to: 'welcome', rule: 'feeds' },
  { from: 'welcome', to: 'calendar', rule: 'feeds' },
  { from: 'welcome', to: 'notify', rule: 'feeds' },
];

const managerDetail = {
  summary:
    'Production read-write is not granted by default. Nothing after this step runs until both approvals are in.',
  rows: [
    ['Manager', 'Rachel Okafor'],
    ['Requested', 'prod-readwrite, deploy'],
    ['Default', 'Read only'],
    ['Start date', 'Mon 28 Sep'],
  ] as [string, string][],
  recommendation: {
    label: 'Access request',
    from: 'Access tier',
    verdict: 'Grant prod-readwrite',
    figures: [
      ['Team', 'Solutions'],
      ['Tier', '3 of 5'],
      ['Peers', '6 of 7'],
    ] as [string, string][],
  },
};

const hrDetail = {
  summary:
    'The background check came back clear except for one item worth reading before the start date is confirmed.',
  rows: [
    ['HR partner', 'Nia Thompson'],
    ['Package', 'Standard'],
    ['Items', '1 to review'],
  ] as [string, string][],
  exception: {
    label: 'Check exception',
    text: 'Employment gap of 7 months in 2024 could not be verified by the provider.',
    mitigant: 'Candidate disclosed it at interview: full-time study, transcript on file.',
  },
};

const bothApproved = (): ScriptStep[] => [
  { kind: 'stage', stageId: 'approvals', status: 'done', sub: 'Both approved' },
  { kind: 'stage', stageId: 'dayone', status: 'current', sub: '3 steps running' },
  { kind: 'status', stepId: 'github', status: 'done', meta: 'prod-readwrite granted' },
  work('welcome', 4_500, '12 pages · team map included', {
    startLog: 'Assembling the welcome pack',
    detail: {
      summary: 'Assembles the first-week guide, the team map and the reading list.',
      rows: [
        ['Pages', '12'],
        ['Reading list', '6 links'],
      ],
    },
  }),
  {
    kind: 'parallel',
    steps: [
      work('calendar', 2_000, 'Orientation, 1:1, buddy coffee', {
        detail: {
          summary: 'Books orientation, the manager 1:1 and the buddy coffee.',
          rows: [
            ['Meetings', '3'],
            ['First', 'Mon 09:30'],
          ],
        },
      }),
      work('notify', 1_200, 'Posted to #team-solutions', {
        detail: {
          summary: 'Tells the team who is starting and when.',
          rows: [['Channel', '#team-solutions']],
        },
      }),
    ],
  },
  { kind: 'stage', stageId: 'dayone', status: 'done', sub: '3 steps · 0:07' },
];

const anyDeclined = (): ScriptStep[] => [
  {
    kind: 'skip',
    stepIds: ['welcome', 'calendar', 'notify'],
    log: 'Day-one setup held — one of the two approvals was declined',
  },
  {
    kind: 'status',
    stepId: 'github',
    status: 'done',
    meta: 'Read only — elevated access not granted',
  },
  { kind: 'stage', stageId: 'approvals', status: 'done', sub: 'Declined' },
  { kind: 'stage', stageId: 'dayone', status: 'upcoming', sub: 'On hold' },
];

export const onboarding: RunScript = {
  id: 'onboarding',
  label: 'Employee onboarding',
  blurb: 'Five systems provisioned at once, and two approvals open together.',
  title: 'New hire · Priya Raman',
  header: {
    primary: 'Priya Raman',
    secondary: 'Solutions Engineer · starts Mon 28 Sep',
    tertiary: 'ONB-3310 · opened 08:40',
  },
  actor: { initials: 'RO', name: 'Rachel Okafor', role: 'Hiring manager' },
  stages: [
    { id: 'offer', name: 'Offer', sub: '2 steps', status: 'current' },
    { id: 'provision', name: 'Provision', sub: '5 systems', status: 'upcoming' },
    { id: 'compliance', name: 'Compliance', sub: '3 steps', status: 'upcoming' },
    { id: 'approvals', name: 'Approvals', sub: 'Not reached', status: 'upcoming' },
    { id: 'dayone', name: 'Day one', sub: '3 steps', status: 'upcoming' },
  ],
  steps,
  edges,
  initialStatuses: {
    signed: 'done',
    hris: 'queued',
    okta: 'queued',
    gsuite: 'queued',
    slack: 'queued',
    github: 'queued',
    laptop: 'queued',
    badge: 'queued',
    payroll: 'queued',
    bgcheck: 'queued',
    tier: 'queued',
    'manager-approve': 'queued',
    'hr-approve': 'queued',
    welcome: 'queued',
    calendar: 'queued',
    notify: 'queued',
  },
  focusStepId: 'signed',
  play: [
    { kind: 'log', level: 'info', text: 'Countersigned offer received', stepId: 'signed' },
    work('hris', 3_000, 'Employee 4471 · starts 28 Sep', {
      detail: {
        summary: 'Opens the employee record everything else keys off.',
        rows: [
          ['Employee', '4471'],
          ['Start date', 'Mon 28 Sep'],
        ],
      },
    }),
    { kind: 'stage', stageId: 'offer', status: 'done', sub: '2 steps · 0:03' },
    { kind: 'stage', stageId: 'provision', status: 'current', sub: '5 systems at once' },
    {
      // Five at once: the canvas lights up across a whole column rather than
      // marching left to right.
      kind: 'parallel',
      steps: [
        work('okta', 2_000, 'praman@ · MFA enrolled', {
          detail: {
            summary: 'Creates the identity every other system authenticates against.',
            rows: [
              ['Username', 'praman'],
              ['MFA', 'Enrolled'],
            ],
          },
        }),
        work('gsuite', 3_000, 'Mailbox, calendar, drive', {
          detail: {
            summary: 'Mailbox, calendar and drive.',
            rows: [
              ['Mailbox', '30 GB'],
              ['Groups', '4'],
            ],
          },
        }),
        work('slack', 1_500, 'Invited · 6 channels', {
          detail: {
            summary: 'Invites them to the workspace and the team channels.',
            rows: [['Channels', '6']],
          },
        }),
        work('github', 2_500, 'Added · read only for now', {
          detail: {
            summary: 'Adds them to the org at the base access level.',
            rows: [
              ['Teams', 'solutions'],
              ['Access', 'Read — pending approval'],
            ],
          },
        }),
        work('laptop', 4_000, 'MacBook Pro · ships 24 Sep', {
          detail: {
            summary: 'Orders and images the machine against the start date.',
            rows: [
              ['Model', 'MacBook Pro 14'],
              ['Ships', 'Thu 24 Sep'],
            ],
          },
        }),
      ],
    },
    { kind: 'stage', stageId: 'provision', status: 'done', sub: '5 systems · 0:04' },
    { kind: 'stage', stageId: 'compliance', status: 'current', sub: '3 steps running' },
    {
      kind: 'parallel',
      steps: [
        work('badge', 1_800, 'London · collects day one', {
          detail: {
            summary: 'Issues a building badge for the office they are based at.',
            rows: [
              ['Office', 'London'],
              ['Collect', 'Reception, day one'],
            ],
          },
        }),
        work('payroll', 3_000, 'Monthly · benefits from day one', {
          detail: {
            summary: 'Sets up pay, tax and benefits against the start date.',
            rows: [
              ['Cycle', 'Monthly'],
              ['Benefits', 'From day one'],
            ],
          },
        }),
        work('bgcheck', 4_000, 'Clear · 1 item to review', {
          detail: {
            summary: 'Runs the pre-employment background check.',
            rows: [
              ['Result', 'Clear'],
              ['Items to review', '1'],
            ],
          },
        }),
      ],
    },
    {
      kind: 'log',
      level: 'warn',
      text: 'Background check came back with 1 item to review',
      stepId: 'bgcheck',
    },
    { kind: 'stage', stageId: 'compliance', status: 'done', sub: '3 steps · 0:04' },
    { kind: 'stage', stageId: 'approvals', status: 'current', sub: 'Waiting on 2 people' },
    work('tier', 2_000, 'Tier 3 · 2 approvals needed', {
      detail: {
        summary: 'Decides which approvals this hire needs before day one.',
        rows: [
          ['Tier', '3 of 5'],
          ['Approvals needed', '2'],
          ['Blocking', 'Day one setup'],
        ],
      },
    }),
    {
      kind: 'status',
      stepId: 'manager-approve',
      status: 'queued',
      meta: 'Due today',
      detail: managerDetail,
    },
    { kind: 'status', stepId: 'hr-approve', status: 'queued', meta: 'Due today', detail: hrDetail },
    {
      // Both gates open together, answerable in either order — which is what
      // makes "Needs you" read 2.
      kind: 'gateAll',
      gates: [
        { stepId: 'manager-approve', decisions: ['approved', 'declined'], dueLabel: 'Today' },
        { stepId: 'hr-approve', decisions: ['approved', 'declined'], dueLabel: 'Today' },
      ],
      afterGates: bothApproved(),
      onDecline: anyDeclined(),
    },
  ],
};
