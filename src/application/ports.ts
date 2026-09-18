import type { ImportSnapshot, ItemDetail, ItemRef, SearchCandidate, SourceKey } from '../domain/catalog';
export type SelectedSource={source:SourceKey;displayName:string;bytes:Uint8Array};
export interface SourceFilePort{chooseAndReadApprovedSource():Promise<SelectedSource|'cancelled'>}
export interface CatalogRepository{replaceSource(snapshot:ImportSnapshot):Promise<void>;findSearchCandidates(tokens:readonly string[]):Promise<readonly SearchCandidate[]>;getDetail(ref:ItemRef):Promise<ItemDetail|null>}
export interface ClockPort{nowIso():string}
