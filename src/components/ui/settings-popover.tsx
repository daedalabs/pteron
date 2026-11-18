import * as Popover from '@radix-ui/react-popover';
import type {ReactElement,ReactNode} from 'react';
export function SettingsPopover({label,trigger,open,onOpenChange,children,className='',side='left'}:{label:string,trigger:ReactElement,open:boolean,onOpenChange:(open:boolean)=>void,children:ReactNode,className?:string,side?:'left'|'right'|'top'|'bottom'}){
 return <Popover.Root open={open} onOpenChange={onOpenChange}><Popover.Trigger asChild>{trigger}</Popover.Trigger><Popover.Portal><Popover.Content aria-label={label} className={`settings-popover ${className}`} side={side} align="start" sideOffset={6} collisionPadding={8}>{children}</Popover.Content></Popover.Portal></Popover.Root>;
}
