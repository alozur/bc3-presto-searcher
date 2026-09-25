import type { ImportProgress } from '../shared/ipc';

export function measuredPercent({ completed, total }: { completed: number; total: number }): number | null {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed)) return null;
  return Math.min(100, Math.max(0, Math.floor((completed * 100) / total)));
}

type ProgressThrottleOptions = { minIntervalMs?: number; now?: () => number };

/**
 * Coalesces per-unit progress events into one forwarding per measured percent.
 * Stage-scoping is what keeps the reported percent truthful: every stage measures
 * only its own work, so a percent is never carried across stage boundaries.
 */
export function createProgressThrottle(
  report: (progress: ImportProgress) => void,
  options: ProgressThrottleOptions = {},
): (progress: ImportProgress) => void {
  const minIntervalMs = options.minIntervalMs ?? 80;
  const now = options.now ?? (() => Date.now());
  let stage: ImportProgress['stage'] | null = null;
  let forwardedPercent: number | null = null;
  let sentAt = Number.NEGATIVE_INFINITY;

  return (progress: ImportProgress) => {
    if (progress.stage === 'validating-relations') {
      stage = progress.stage;
      forwardedPercent = null;
      sentAt = now();
      report(progress);
      return;
    }
    const percent = measuredPercent(progress);
    if (percent === null) return;
    const changedStage = progress.stage !== stage;
    if (!changedStage && percent === forwardedPercent) return;
    if (!changedStage && percent !== 100 && now() - sentAt < minIntervalMs) return;
    stage = progress.stage;
    forwardedPercent = percent;
    sentAt = now();
    report(progress);
  };
}
