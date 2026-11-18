import {InspectorSection} from '../components/ui/inspector-section';
import {composeTransform,decomposeTransform,type Affine} from '../core/transform';
import {onScrubPointerDown} from './scrubber';

export function TransformInputs({value,onChange,defaultOpen=true}:{value?:string,onChange:(value:string)=>void,defaultOpen?:boolean}){
 const element=document.createElementNS('http://www.w3.org/2000/svg','g');element.setAttribute('transform',value??'');
 const m=element.transform.baseVal.consolidate()?.matrix??{a:1,b:0,c:0,d:1,e:0,f:0};const parts=decomposeTransform(m);
 const matrix:Affine={a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f};
 const fields=parts?(['x','y','rotation','skew','scaleX','scaleY'] as const).map(key=>[key,parts[key]] as const):Object.entries(matrix);
 const labels:Record<string,string>={x:'X',y:'Y',rotation:'Angle',scaleX:'Scale X',scaleY:'Scale Y',skew:'Skew'};
 return <InspectorSection title="Transform" defaultOpen={defaultOpen} className="transform-disclosure"><fieldset className="property-section transform-section" role="group" aria-label="Transform"><legend className="sr-only">Transform</legend><div className="field-grid transform-inputs">{fields.map(([key,num])=><label key={key+value} className="scrubbable-label"><span className="scrubber-handle" onPointerDown={e=>onScrubPointerDown(e,key.startsWith('scale')?.05:1)}>{labels[key]??`Matrix ${key}`}</span><input aria-label={`Transform ${key}`} type="number" step={key.startsWith('scale')?'.1':'1'} defaultValue={Number(Number(num).toFixed(6))} onBlur={event=>{const next=event.target.valueAsNumber;if(!Number.isFinite(next)||Math.abs(next-Number(num))<1e-6)return;if(parts)onChange(composeTransform({...parts,[key]:next}));else{const n={...matrix,[key]:next};onChange(`matrix(${n.a} ${n.b} ${n.c} ${n.d} ${n.e} ${n.f})`);}}}/></label>)}</div></fieldset></InspectorSection>;
}
