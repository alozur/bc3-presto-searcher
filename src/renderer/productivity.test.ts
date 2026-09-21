import { describe, expect, it } from 'vitest';
import { presentBreakdownQuantity } from './productivity';

describe('presentBreakdownQuantity', () => {
  it.each([
    [{ yieldText: '0.3', componentUnit: 'h', parentUnit: 'm2' }, { source: '0,3 h', daily: '26,67 m2/día' }],
    [{ yieldText: '2', componentUnit: 'H', parentUnit: 'm2' }, { source: '2 H', daily: '4,00 m2/día' }],
    [{ yieldText: '1.050', componentUnit: ' H ', parentUnit: 'm2' }, { source: '1,050  H ', daily: '7,62 m2/día' }],
    [{ yieldText: '1.25', componentUnit: 'h', parentUnit: 'u' }, { source: '1,25 h', daily: '6,40 u/día' }],
    [{ yieldText: '3', componentUnit: 'h', parentUnit: 'u' }, { source: '3 h', daily: '2,67 u/día' }],
    [{ yieldText: '64', componentUnit: 'h', parentUnit: 'u' }, { source: '64 h', daily: '0,13 u/día' }],
  ])('preserves source values and derives qualified daily output for %#', (input, expected) => {
    expect(presentBreakdownQuantity(input)).toEqual(expected);
  });

  it.each([
    [{ yieldText: '1.05', componentUnit: 'm2', parentUnit: 'm2' }, '1,05 m2'],
    [{ yieldText: '1', componentUnit: '', parentUnit: 'm2' }, '1'],
    [{ yieldText: '1', componentUnit: '  ', parentUnit: 'm2' }, '1   '],
    [{ yieldText: '1', componentUnit: 'h', parentUnit: '' }, '1 h'],
    [{ yieldText: '1', componentUnit: 'h', parentUnit: '  ' }, '1 h'],
    [{ yieldText: ' 1', componentUnit: 'h', parentUnit: 'm2' }, ' 1 h'],
    [{ yieldText: '1e2', componentUnit: 'h', parentUnit: 'm2' }, '1e2 h'],
    [{ yieldText: '1,2', componentUnit: 'h', parentUnit: 'm2' }, '1,2 h'],
    [{ yieldText: '+1', componentUnit: 'h', parentUnit: 'm2' }, '+1 h'],
    [{ yieldText: '01', componentUnit: 'h', parentUnit: 'm2' }, '01 h'],
    [{ yieldText: 'NaN', componentUnit: 'h', parentUnit: 'm2' }, 'NaN h'],
    [{ yieldText: 'Infinity', componentUnit: 'h', parentUnit: 'm2' }, 'Infinity h'],
    [{ yieldText: '0.000', componentUnit: 'h', parentUnit: 'm2' }, '0,000 h'],
    [{ yieldText: '-0.5', componentUnit: 'h', parentUnit: 'm2' }, '-0,5 h'],
  ])('returns No aplica for ineligible or invalid input %#', (input, source) => {
    const result = presentBreakdownQuantity(input);

    expect(result.source).toBe(source);
    expect(result.daily).toBe('No aplica');
    expect(result.daily).not.toMatch(/—|NaN|Infinity|^$|^\s*[^\d\s].*\/día$/);
  });
});
