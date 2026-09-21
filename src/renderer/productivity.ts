const INVALID_PRODUCTIVITY = '—';
const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function formatEightHourProductivity(input: unknown): string {
  if (typeof input !== 'string' || !CANONICAL_DECIMAL.test(input)) return INVALID_PRODUCTIVITY;

  const [whole, fraction = ''] = input.split('.');
  const coefficient = BigInt(`${whole}${fraction}`);
  if (coefficient <= 0n) return INVALID_PRODUCTIVITY;

  const scale = 10n ** BigInt(fraction.length);
  const numerator = 800n * scale;
  let hundredths = numerator / coefficient;
  const remainder = numerator % coefficient;
  if (2n * remainder >= coefficient) hundredths += 1n;

  return `${hundredths / 100n},${(hundredths % 100n).toString().padStart(2, '0')}`;
}
