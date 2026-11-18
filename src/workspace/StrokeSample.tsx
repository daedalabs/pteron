import type {CSSProperties} from 'react';
/** Local SVG UI samples; these never enter authored artwork. */
export function StrokeSample({kind,style}:{kind:string,style?:CSSProperties}){
 const cap=kind.startsWith('cap-')?kind.slice(4):undefined,join=kind.startsWith('join-')?kind.slice(5):undefined;
 return <svg width="22" height="20" viewBox="0 0 28 24" fill="none" aria-hidden="true" style={style}>
 {kind.startsWith('edge-')?<><rect x="5" y="4" width="18" height="16" stroke="currentColor" strokeOpacity=".25"/><path d={({'edge-top':'M5 4H23','edge-right':'M23 4V20','edge-bottom':'M5 20H23','edge-left':'M5 4V20'} as Record<string,string>)[kind]} stroke="currentColor" strokeWidth="3"/></>:cap?<><path d="M7 3V21M21 3V21" stroke="currentColor" strokeOpacity=".35" strokeDasharray="2 2"/><path d="M7 12H21" stroke="currentColor" strokeWidth="6" strokeLinecap={cap as 'butt'|'round'|'square'}/></>:join?<path d="M5 20L14 5L23 20" stroke="currentColor" strokeWidth="5" strokeLinejoin={join as 'miter'|'round'|'bevel'}/>:kind==='corner'?<path d="M6 20V12A6 6 0 0 1 12 6H22" stroke="currentColor" strokeWidth="2"/>:<path d="M3 12H25" stroke="currentColor" strokeWidth="2" strokeDasharray={kind==='dashed'?'6 4':kind==='dotted'?'1 4':undefined} strokeLinecap={kind==='dotted'?'round':'butt'}/>}
 </svg>;
}
