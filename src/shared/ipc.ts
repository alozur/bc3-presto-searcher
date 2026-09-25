import type { ImportDiagnostic, ItemDetail, ItemRef, SearchResponse, SourceKey } from '../domain/catalog';

export const IPC_CHANNELS = { import: 'presto:import', importProgress: 'presto:import-progress', search: 'presto:search', detail: 'presto:detail' } as const;

export type SearchRequest = { query: string; limit?: number };
export type DetailRequest = ItemRef;
export type ImportProgress =
  | { stage: 'processing-records'; completed: number; total: number }
  | { stage: 'validating-relations' }
  | { stage: 'storing'; completed: number; total: number };
export type ImportResponse =
  | { status: 'cancelled' }
  | {
      source: SourceKey;
      sourceDisplayName: string;
      importedPartidas: number;
      importedResources: number;
      skippedRecords: number;
      diagnostics: readonly ImportDiagnostic[];
      completedAt: string;
    };
export type PrestoApi = {
  importApprovedSource(): Promise<ImportResponse>;
  onImportProgress(listener: (progress: ImportProgress) => void): () => void;
  search(request: SearchRequest): Promise<SearchResponse>;
  getDetail(request: DetailRequest): Promise<ItemDetail | null>;
};
const sources = new Set<SourceKey>(['guadalajara-2016-rm', 'guadalajara-2016-eu']);

export function clampLimit(n = 100) {
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.trunc(n))) : 100;
}
function plainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-request');
  return value as Record<string, unknown>;
}
export function validateSearchRequest(value: unknown): { query: string; limit: number } {
  const request = plainObject(value);
  if (Object.keys(request).some((key) => !['query', 'limit'].includes(key)) || typeof request.query !== 'string' || request.query.length > 10000) throw new Error('invalid-request');
  if (request.limit !== undefined && (typeof request.limit !== 'number' || !Number.isFinite(request.limit))) throw new Error('invalid-request');
  return { query: request.query, limit: clampLimit(request.limit as number | undefined) };
}
export function validateDetailRequest(value: unknown): ItemRef {
  const request = plainObject(value);
  if (Object.keys(request).length !== 2 || !sources.has(request.source as SourceKey) || typeof request.codeKey !== 'string' || !/^[\w%+-]{1,200}$/u.test(request.codeKey)) throw new Error('invalid-request');
  return { source: request.source as SourceKey, codeKey: request.codeKey.toLocaleLowerCase('es') };
}
