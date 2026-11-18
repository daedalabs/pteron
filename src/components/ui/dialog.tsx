import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({title,open,onOpenChange,children,description,trigger,className}:{title:string,description?:string,open:boolean,onOpenChange:(open:boolean)=>void,children:ReactNode,trigger?:ReactNode,className?:string}){
 return <Dialog.Root open={open} onOpenChange={onOpenChange}>
  {trigger&&<Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
  <Dialog.Portal>
   <Dialog.Overlay className="dialog-overlay"/>
   <Dialog.Content className={className?`dialog-content ${className}`:'dialog-content'} {...(!description?{'aria-describedby':undefined}:{})}>
    <Dialog.Title>{title}</Dialog.Title>
    {description&&<Dialog.Description className="muted">{description}</Dialog.Description>}
    {children}
    <Dialog.Close className="dialog-close" aria-label="Close" title="Close"><X size={16} aria-hidden="true"/></Dialog.Close>
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
