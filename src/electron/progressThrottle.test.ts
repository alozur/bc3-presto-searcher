import { describe, expect, it } from 'vitest';
import type { ImportProgress } from '../shared/ipc';
import { createProgressThrottle, measuredPercent } from './progressThrottle';

function recording() {
  const seen: ImportProgress[] = [];
  return { seen, report: (progress: ImportProgress) => void seen.push(progress) };
}

describe('measuredPercent', () => {
  it('floors the measured completion ratio and rejects unusable totals', () => {
    expect(measuredPercent({ completed: 1, total: 3 })).toBe(33);
    expect(measuredPercent({ completed: 3, total: 3 })).toBe(100);
    expect(measuredPercent({ completed: 0, total: 0 })).toBeNull();
    expect(measuredPercent({ completed: 5, total: -1 })).toBeNull();
  });
});

describe('createProgressThrottle', () => {
  it('forwards one event per measured percent instead of one per record', () => {
    const { seen, report } = recording();
    const throttle = createProgressThrottle(report, { minIntervalMs: 0, now: () => 0 });
    for (let completed = 1; completed <= 200; completed += 1) {
      throttle({ stage: 'processing-records', completed, total: 200 });
    }
    expect(seen).toHaveLength(101);
    expect(seen[0]).toEqual({ stage: 'processing-records', completed: 1, total: 200 });
    expect(seen.at(-1)).toEqual({ stage: 'processing-records', completed: 200, total: 200 });
  });

  it('honours the interval floor but always delivers the final measured percent', () => {
    const { seen, report } = recording();
    let clock = 0;
    const throttle = createProgressThrottle(report, { minIntervalMs: 100, now: () => clock });
    throttle({ stage: 'processing-records', completed: 0, total: 100 });
    clock = 10;
    throttle({ stage: 'processing-records', completed: 10, total: 100 });
    clock = 90;
    throttle({ stage: 'processing-records', completed: 90, total: 100 });
    clock = 100;
    throttle({ stage: 'processing-records', completed: 91, total: 100 });
    clock = 110;
    throttle({ stage: 'processing-records', completed: 100, total: 100 });
    expect(seen.map((progress) => (progress.stage === 'validating-relations' ? null : progress.completed))).toEqual([0, 91, 100]);
  });

  it('resets its window across stages and forwards the indeterminate stage', () => {
    const { seen, report } = recording();
    const throttle = createProgressThrottle(report, { minIntervalMs: 1000, now: () => 0 });
    throttle({ stage: 'processing-records', completed: 5, total: 5 });
    throttle({ stage: 'validating-relations' });
    throttle({ stage: 'storing', completed: 0, total: 4 });
    expect(seen).toEqual([
      { stage: 'processing-records', completed: 5, total: 5 },
      { stage: 'validating-relations' },
      { stage: 'storing', completed: 0, total: 4 },
    ]);
  });

  it('never forwards an unmeasurable total', () => {
    const { seen, report } = recording();
    const throttle = createProgressThrottle(report, { minIntervalMs: 0, now: () => 0 });
    throttle({ stage: 'storing', completed: 3, total: 0 });
    expect(seen).toEqual([]);
  });
});
