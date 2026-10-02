import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createRun } from '../dist/workflow/runtime.js';
import { VARIANTS, VARIANT_INFO, pickVariant } from '../dist/workflow/variants/index.js';

// Exercise every real variant and approval branch without demo pacing.
function fast(steps) {
  return steps.map((step) => ({
    ...step,
    ...(step.durationMs !== undefined && { durationMs: 0 }),
    ...(step.afterMs !== undefined && { afterMs: 0 }),
    ...(step.kind === 'wait' && { ms: 0 }),
    ...(step.steps && { steps: fast(step.steps) }),
    ...(step.branches && {
      branches: Object.fromEntries(
        Object.entries(step.branches).map(([key, value]) => [key, fast(value)]),
      ),
    }),
    ...(step.afterGates && { afterGates: fast(step.afterGates) }),
    ...(step.onDecline && { onDecline: fast(step.onDecline) }),
  }));
}
for (const [id, script] of Object.entries(VARIANTS)) {
  for (const decision of ['approved', 'changes', 'declined']) {
    test(`${id} completes ${decision} branch and restarts`, async () => {
      const run = createRun(
        { ...script, play: fast(script.play) },
        `${id}-${decision}`,
        VARIANT_INFO,
      );
      try {
        for (let i = 0; i < 100; i++) {
          await setImmediate();
          const { run: snapshot } = run.snapshot();
          assert.notEqual(snapshot.phase, 'failed');
          if (snapshot.phase === 'finished') break;
          for (const gate of snapshot.awaiting) {
            run.decide(gate.stepId, 'invalid');
            assert.ok(run.snapshot().run.awaiting.some((item) => item.stepId === gate.stepId));
            run.decide(
              gate.stepId,
              gate.decisions.includes(decision) ? decision : gate.decisions[0],
            );
          }
        }
        assert.equal(run.snapshot().run.phase, 'finished');
        run.control('restart');
        assert.notEqual(run.snapshot().run.phase, 'finished');
      } finally {
        run.dispose();
      }
    });
  }
}
test('unknown and inherited variant keys fall back safely', () => {
  for (const key of [undefined, 'unknown', '__proto__', 'constructor'])
    assert.equal(pickVariant(key).id, 'loan-review');
});
