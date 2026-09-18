import type { SearchCandidate } from './catalog';
export function normalizeText(text:string){return text.toLocaleLowerCase('es').replace(/ñ/g,'\uE000').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\uE000]+/gu,' ').trim().replace(/\s+/g,' ').replace(/\uE000/g,'ñ');}
export function normalizeTokens(text:string){return [...new Set(normalizeText(text).split(' ').filter(Boolean))];}
export function rankCandidates(candidates: readonly SearchCandidate[], tokens: readonly string[]) {
  const distinctMatchCount = (text: string) => {
    const present = new Set(normalizeTokens(text));
    return tokens.filter((token) => present.has(token)).length;
  };
  return [...candidates].sort((a, b) => {
    const av = [
      distinctMatchCount(a.description),
      distinctMatchCount(a.description),
      distinctMatchCount(a.keywords.join(' ')),
      +a.exactCode,
      distinctMatchCount(a.code),
      distinctMatchCount(a.expandedText),
    ];
    const bv = [
      distinctMatchCount(b.description),
      distinctMatchCount(b.description),
      distinctMatchCount(b.keywords.join(' ')),
      +b.exactCode,
      distinctMatchCount(b.code),
      distinctMatchCount(b.expandedText),
    ];
    for (let i = 0; i < av.length; i += 1) if (av[i] !== bv[i]) return bv[i] - av[i];
    return normalizeText(a.description).localeCompare(normalizeText(b.description))
      || a.ref.codeKey.localeCompare(b.ref.codeKey)
      || a.ref.source.localeCompare(b.ref.source);
  });
}
