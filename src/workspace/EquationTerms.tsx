import {useState} from 'react';
import type {Screen} from '../core/model';
import {svgObjects} from '../core/svg';
import {Icon} from './Icon';
import {Button} from '../components/ui/button';

export function EquationTerms({screen,equationId,command,selectedId}:{selectedId?:string,screen:Screen,equationId:string,command:(command:unknown)=>Promise<unknown>}){
 const equation=screen.equations.find(eq=>eq.id===equationId)!;
 const objects=svgObjects(screen.svg),root=objects.find(object=>object.equationId===equationId);
 const children=objects.filter(object=>{let parent=object.parentId;while(parent){if(parent===root?.id)return true;parent=objects.find(value=>value.id===parent)?.parentId;}return false;});
 const [name,setName]=useState(''),[objectId,setObjectId]=useState(selectedId&&selectedId!==root?.id?selectedId:'');
 const put=(terms:Record<string,string>)=>command({type:'equation.terms',screenId:screen.id,equationId,terms});
 return <details className="equation-terms"><summary>Named terms</summary><p className="muted">Same term name in both equations</p>
 {Object.entries(equation.terms).map(([name,id])=><div className="term-row" key={name}><span>{name}: {children.find(object=>object.id===id)?.name??'Missing term'}</span><Button variant="ghost" className="icon-button" title={`Remove term ${name}`} aria-label={`Remove term ${name}`} onClick={()=>{const terms={...equation.terms};delete terms[name];void put(terms);}}><Icon name="trash"/></Button></div>)}
 <label>Term name<input aria-label="Term name" maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label><label>Artwork term<select aria-label="Artwork term" value={objectId} onChange={event=>setObjectId(event.target.value)}><option value="">Choose a glyph or group</option>{children.map((object,index)=><option value={object.id} key={object.id}>{index+1}. {object.name}</option>)}</select></label>
 <Button variant="outline" className="icon-button" aria-label="Save term" title="Save term" disabled={!name.trim()||!objectId} onClick={async()=>{if(await put({...equation.terms,[name.trim()]:objectId}))setName('');}}><Icon name="check"/></Button></details>;
}
