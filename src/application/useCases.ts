import { parseBc3 } from '../domain/bc3/parser';
import { normalizeTokens, rankCandidates } from '../domain/search';
import type { ItemRef } from '../domain/catalog';
import { countSkippedRecords } from '../domain/importDiagnostics';
import type { CatalogRepository, ClockPort, SelectedSource, SourceFilePort } from './ports';

export type ApplicationErrorCode = 'fatal-read' | 'fatal-parse' | 'fatal-storage';
export class ApplicationError extends Error {
  constructor(readonly code: ApplicationErrorCode, cause?: unknown) {
    super(code, { cause });
    this.name = 'ApplicationError';
  }
}

export class ImportApprovedSource {
  constructor(private files: SourceFilePort, private repo: CatalogRepository, private clock: ClockPort) {}
  async execute(selection?: SelectedSource) {
    let selected: SelectedSource | 'cancelled';
    try { selected = selection ?? await this.files.chooseAndReadApprovedSource(); }
    catch (error) { throw new ApplicationError('fatal-read', error); }
    if (selected === 'cancelled') return { status: 'cancelled' as const };
    let snapshot;
    try { snapshot = parseBc3(selected.bytes, selected.source, selected.displayName); }
    catch (error) { throw new ApplicationError('fatal-parse', error); }
    try { await this.repo.replaceSource(snapshot); }
    catch (error) { throw new ApplicationError('fatal-storage', error); }
    return {
      source: snapshot.source, sourceDisplayName: snapshot.sourceDisplayName,
      importedPartidas: snapshot.items.filter((item) => item.kind === 'partida').length,
      importedResources: snapshot.items.filter((item) => item.kind === 'resource').length,
      skippedRecords: countSkippedRecords(snapshot.diagnostics), diagnostics: snapshot.diagnostics,
      completedAt: this.clock.nowIso(),
    };
  }
}

export type SearchPage = { limit?: number; offset?: number };

function boundedLimit(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(100, Math.trunc(value))) : 100;
}

// An offset past the end is served the last reachable window instead of an empty
// one, and `offset` reports what was served. Without this, a shrinking match set
// (a re-import, or a query edited while paged) renders "N resultados." above an
// empty list with no pager.
function boundedOffset(value: number | undefined, total: number, limit: number) {
  const requested = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  const lastWindow = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;
  return Math.min(requested, lastWindow);
}

export class SearchCatalog {
  constructor(private repo: CatalogRepository) {}
  async execute(query: string, page: SearchPage = {}) {
    const tokens = normalizeTokens(query);
    if (!tokens.length) return { status: 'empty-query' as const };
    const candidates = await this.repo.findSearchCandidates(tokens);
    const ranked = rankCandidates(candidates, tokens);
    const limit = boundedLimit(page.limit);
    const offset = boundedOffset(page.offset, ranked.length, limit);
    return { status: 'ok' as const, items: ranked.slice(offset, offset + limit), total: ranked.length, offset, limit };
  }
}

export class GetItemDetail {
  constructor(private repo: CatalogRepository) {}
  execute(ref: ItemRef) { return this.repo.getDetail(ref); }
}
