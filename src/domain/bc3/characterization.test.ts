import { describe, expect, it } from 'vitest';
import { parseBc3 } from './parser';

describe('bounded BC3 scanner characterization', () => {
  it('tracks physical record-start lines across blank and non-record lines', () => {
    const bytes = new TextEncoder().encode('header\r\n\r\n~C||u|Sin codigo|1|x|0|\r\n');
    const snapshot = parseBc3(bytes, 'guadalajara-2016-rm', 'Guadalajara2016_r+m.bc3');
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'invalid-concept', line: 3 });
  });
  it('reports unsupported tags at their physical line', () => {
    const bytes = new TextEncoder().encode('\n~Z|unsupported|\n');
    const snapshot = parseBc3(bytes, 'guadalajara-2016-rm', 'Guadalajara2016_r+m.bc3');
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'unknown-tag', line: 2, recordTag: 'Z' });
  });
  it('decodes a UTF-8 BOM as UTF-8 rather than legacy bytes', () => {
    const bytes = new TextEncoder().encode('\uFEFF~C|R1|u|Niño|1|x|0|\n');
    const snapshot = parseBc3(bytes, 'guadalajara-2016-rm', 'Guadalajara2016_r+m.bc3');
    expect(snapshot.items[0].description).toBe('Niño');
  });
  it('keeps unresolved child context and physical decomposition line', () => {
    const source = '~C|P1|u|Parent|1|x|0|\n~D|P1|M1\\\\1\\\\1\\\\M2\\\\1\\\\1|\n';
    const snapshot = parseBc3(new TextEncoder().encode(`header\n\n${source}`), 'guadalajara-2016-eu', 'synthetic.bc3');
    expect(snapshot.diagnostics.filter((x) => x.code === 'unresolved-child')).toMatchObject([
      { parentCode: 'P1', childCode: 'M1', recordTag: 'D', line: 4 },
      { parentCode: 'P1', childCode: 'M2', recordTag: 'D', line: 4 },
    ]);
  });
});
