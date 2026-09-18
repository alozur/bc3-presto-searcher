import type { SourceKey } from './catalog';
const approved: Record<string,SourceKey> = {'guadalajara2016_r+m.bc3':'guadalajara-2016-rm','guadalajara2016_e+u.bc3':'guadalajara-2016-eu'};
export function admitSource(basename:string): SourceKey|undefined { return approved[basename.toLocaleLowerCase('en-US')]; }
export function sourceDisplayName(name:string){return name.split(/[\\/]/).pop() ?? name;}
