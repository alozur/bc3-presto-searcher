import { describe, expect, it } from 'vitest';
import { formatEightHourProductivity } from './productivity';

describe('formatEightHourProductivity', () => {
  it.each([
    ['0.3', '26,67'],
    ['2', '4,00'],
    ['1.25', '6,40'],
    ['3', '2,67'],
    ['64', '0,13'],
  ])('formats canonical yield %s as %s', (input, expected) => {
    const actual = formatEightHourProductivity(input);

    expect(actual).toBe(expected);
    expect(actual).toMatch(/^\d+,\d{2}$/);
  });

  it.each([
    null,
    undefined,
    2,
    '',
    ' ',
    ' 2',
    '2 ',
    '0',
    '0.0',
    '0.000',
    '-2',
    '+2',
    'abc',
    'NaN',
    'Infinity',
    '1e2',
    '0x10',
    '1,25',
    '.3',
    '3.',
    '00.3',
  ])('rejects invalid yield %j', (input) => {
    const actual = formatEightHourProductivity(input);

    expect(actual).toBe('—');
    expect(actual).not.toMatch(/NaN|Infinity|0,00/);
  });
});
