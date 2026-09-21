const NOT_APPLICABLE = 'No aplica';
const CANONICAL_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

type BreakdownQuantityInput = {
  readonly yieldText: string;
  readonly componentUnit: string;
  readonly parentUnit: string;
};

function localizeSourceDecimal(yieldText: string) {
  return CANONICAL_DECIMAL.test(yieldText) ? yieldText.replace('.', ',') : yieldText;
}

function formatDailyOutput(yieldText: string): string | null {
  if (!CANONICAL_DECIMAL.test(yieldText) || yieldText.startsWith('-')) return null;

  const [whole, fraction = ''] = yieldText.split('.');
  const coefficient = BigInt(`${whole}${fraction}`);
  if (coefficient <= 0n) return null;

  const scale = 10n ** BigInt(fraction.length);
  const numerator = 800n * scale;
  let hundredths = numerator / coefficient;
  const remainder = numerator % coefficient;
  if (2n * remainder >= coefficient) hundredths += 1n;

  return `${hundredths / 100n},${(hundredths % 100n).toString().padStart(2, '0')}`;
}

export function presentBreakdownQuantity({ yieldText, componentUnit, parentUnit }: BreakdownQuantityInput) {
  const source = `${localizeSourceDecimal(yieldText)}${componentUnit ? ` ${componentUnit}` : ''}`;
  const dailyOutput = componentUnit.trim().toLowerCase() === 'h' && parentUnit.trim()
    ? formatDailyOutput(yieldText)
    : null;

  return {
    source,
    daily: dailyOutput ? `${dailyOutput} ${parentUnit}/día` : NOT_APPLICABLE,
  };
}
