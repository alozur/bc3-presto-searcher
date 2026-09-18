import { describe, expect, it } from 'vitest';
import { normalizeTokens } from './search';
describe('domain boundary', () => { it('runs without desktop dependencies', () => { expect(normalizeTokens('Árbol ñ')).toEqual(['arbol','ñ']); }); });