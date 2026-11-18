import {useId,type ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';

export function InspectorSection({title,children,defaultOpen=true,className=''}:{title:string,children:ReactNode,defaultOpen?:boolean,className?:string}){
 const id=useId();
 return <details className={`inspector-section ${className}`} open={defaultOpen}>
  <summary aria-controls={id}><ChevronRight size={13} aria-hidden="true"/>{title}</summary>
  <div id={id} className="inspector-section-body">{children}</div>
 </details>;
}
