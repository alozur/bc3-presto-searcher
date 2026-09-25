export type SourceKey = 'guadalajara-2016-rm' | 'guadalajara-2016-eu';
export type ItemKind = 'partida' | 'resource';
export type DecimalText = string;
export type ItemRef = { source: SourceKey; codeKey: string };
export type CatalogItem = { ref: ItemRef; kind: ItemKind; code: string; description: string; unit: string; price: DecimalText; keywords: readonly string[]; expandedText: string; sourceDisplayName: string };
export type BreakdownLine = { ordinal:number; sourceLine:number; component:{code:string;kind:ItemKind;description:string;unit:string;unitPrice:DecimalText}; factor:DecimalText; yield:DecimalText};
export type ItemDetail = {kind:'partida';item:CatalogItem;breakdown:readonly BreakdownLine[]} | {kind:'resource';item:CatalogItem};
export type ImportDiagnostic = {code:string;sourceDisplayName:string;line:number;recordTag?:string;messageEs:string;parentCode?:string;childCode?:string};
export type UnresolvedChildDiagnostic = ImportDiagnostic & {code:'unresolved-child';recordTag:'D';parentCode:string;childCode:string};
export type ImportSnapshot = {source:SourceKey;sourceDisplayName:string;contentHash?:string;items:readonly CatalogItem[];breakdowns:readonly {parent:ItemRef;line:BreakdownLine}[];diagnostics:readonly ImportDiagnostic[]};
export type SearchCandidate = CatalogItem & {fieldCounts:{description:number;keywords:number;code:number;expandedText:number};exactCode:boolean};
export type SearchResponse = {status:'ok';items:readonly SearchCandidate[]}|{status:'empty-query'};
export function codeKey(code:string){return code.trim().toLocaleLowerCase('es');}
