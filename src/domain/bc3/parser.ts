import { parseDecimalText } from '../decimal';
import { codeKey, type ImportSnapshot, type ImportDiagnostic, type UnresolvedChildDiagnostic, type CatalogItem, type BreakdownLine, type SourceKey, type ItemKind } from '../catalog';
import { normalizeTokens } from '../search';

type Concept={code:string;unit:string;description:string;price:string;kindCode:string;line:number;keywords:string[];expandedText:string;edges:{code:string;factor:string;yield:string;line:number}[]};
export type Bc3ParseProgress = {stage:'processing-records';completed:number;total:number}|{stage:'validating-relations'};

export function parseBc3(bytes: Uint8Array, source: SourceKey, display: string, reportProgress?: (progress:Bc3ParseProgress)=>void): ImportSnapshot {
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder(hasUtf8Bom ? 'utf-8' : 'windows-1252').decode(bytes).replace(/^\uFEFF/, '');
  const concepts = new Map<string, Concept[]>(); const diagnostics:ImportDiagnostic[]=[]; let order=0;
  const addDiag=(code:string,line:number,tag:string,msg:string)=>diagnostics.push({code,sourceDisplayName:display,line,recordTag:tag,messageEs:msg});
  // BC3 hierarchy edges may omit the trailing # used by their concept definition; exact codes still win.
  const resolveComponent=(byKey:ReadonlyMap<string,CatalogItem>, childCode:string)=>{const exactKey=codeKey(childCode);return byKey.get(exactKey)??byKey.get(`${exactKey}#`)};
  const records=[...text.split(/\r\n|\n|\r/).entries()].filter(([,line])=>line.includes('~')); const attachments:{tag:string;body:string;line:number}[]=[];
  for(const [recordIndex,[idx,line]] of records.entries()){const lineNo=idx+1; reportProgress?.({stage:'processing-records',completed:recordIndex+1,total:records.length}); const m=line.match(/~([A-Z])\|([\s\S]*)/); if(!m)continue; const tag=m[1], body=m[2]; const f=body.split('|');
    if(tag==='C'){if(!f[0]){addDiag('invalid-concept',lineNo,tag,'Concepto sin código.');continue} try {const c={code:f[0],unit:f[1]??'',description:f[2]??'',price:parseDecimalText(f[3]??''),kindCode:f[6]??'',line:lineNo,keywords:[],expandedText:'',edges:[]}; const k=codeKey(c.code); concepts.set(k,[...(concepts.get(k)??[]),c]);}catch{addDiag('malformed-decimal',lineNo,tag,'Precio decimal no válido.')} }
    else if(tag==='A'||tag==='T'||tag==='D') attachments.push({tag,body,line:lineNo});
    else if(!['V','K'].includes(tag)) addDiag('unknown-tag',lineNo,tag,'Registro no compatible con el perfil aprobado.');
  }
  reportProgress?.({stage:'validating-relations'});
  for(const a of attachments){const f=a.body.split('|');const c=concepts.get(codeKey(f[0]??''))?.at(-1);if(!c){addDiag('unknown-parent',a.line,a.tag,'Registro asociado sin concepto padre.');continue}if(a.tag==='A')c.keywords=f.slice(1).join('|').replace(/\|$/,'').split('\\').filter(Boolean);else if(a.tag==='T')c.expandedText=f.slice(1).join('|').replace(/\|$/,'');else{const vals=a.body.slice((f[0]?.length??0)+1).replace(/\|$/,'').split('\\').filter(Boolean);if(vals.length%3){addDiag('malformed-decomposition',a.line,a.tag,'Descomposición mal formada.');continue}for(let i=0;i<vals.length;i+=3){try{c.edges.push({code:vals[i],factor:parseDecimalText(vals[i+1]),yield:parseDecimalText(vals[i+2]),line:a.line})}catch{addDiag('malformed-decomposition',a.line,a.tag,'Factor o rendimiento no válido.')}}}}
  const items:CatalogItem[]=[]; const byKey=new Map<string,CatalogItem>(); for(const [k, defs] of concepts){if(defs.length!==1){for(const d of defs)addDiag('duplicate-code',d.line,'C','Código duplicado.');continue} const c=defs[0]; const kind:ItemKind=c.edges.length?'partida':'resource'; const item={ref:{source,codeKey:k},kind,code:c.code,description:c.description,unit:c.unit,price:c.price,keywords:c.keywords,expandedText:c.expandedText,sourceDisplayName:display}; items.push(item);byKey.set(k,item)}
  const breakdowns:{parent:any;line:BreakdownLine}[]=[]; for(const c of [...concepts.values()].flat()){const parent=byKey.get(codeKey(c.code)); if(!parent||parent.kind!=='partida')continue; const lines:BreakdownLine[]=[]; let valid=true; for(const [i,e] of c.edges.entries()){const component=resolveComponent(byKey,e.code); if(!component){diagnostics.push({code:'unresolved-child',sourceDisplayName:display,line:e.line,recordTag:'D',messageEs:'Componente no resuelto.',parentCode:c.code,childCode:e.code} satisfies UnresolvedChildDiagnostic);valid=false;continue} lines.push({ordinal:i,sourceLine:e.line,component:{code:component.code,kind:component.kind,description:component.description,unit:component.unit,unitPrice:component.price},factor:e.factor,yield:e.yield});} if(!valid){const ix=items.findIndex(x=>x.ref.codeKey===parent.ref.codeKey);if(ix>=0)items.splice(ix,1);continue} for(const line of lines)breakdowns.push({parent:parent.ref,line}); }
  return {source,sourceDisplayName:display,items,breakdowns,diagnostics:diagnostics.sort((a,b)=>a.line-b.line||order++)};
}
