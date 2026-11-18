import {useEffect,useState} from 'react';
import {Button} from '../components/ui/button';
import type {Screen} from '../core/model';
export function EquationEditor({equation,onCompile,busy,diagnostic}:{equation?:Screen['equations'][number],onCompile:(source:string,id?:string)=>void,busy?:boolean,diagnostic?:string}){
 const [source,setSource]=useState(equation?.source??'x^2 + y^2 = z^2');
 useEffect(()=>setSource(equation?.source??'x^2 + y^2 = z^2'),[equation?.id,equation?.source]);
 return <section className="equation-editor" aria-label="LaTeX equation source"><label>LaTeX source<textarea aria-label="LaTeX source" rows={4} value={source} onChange={e=>setSource(e.target.value)}/></label><div className="equation-compile-actions"><Button reserveLabel="Compiling…" disabled={busy||!source.trim()} variant="outline" onClick={()=>onCompile(source,equation?.id)}>{busy?'Compiling…':equation?.svg?'Compile':'Create'}</Button>{equation?.svg&&equation.source!==(equation.compiledSource??equation.source)&&<small className="muted">Uncompiled changes</small>}</div>{(diagnostic??equation?.diagnostic)&&<p className="error" role="alert">{diagnostic??equation?.diagnostic}</p>}</section>;
}
