import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants=cva('button',{variants:{variant:{default:'button-default',outline:'button-outline',ghost:'button-ghost'}},defaultVariants:{variant:'default'}});
export function Button({className,variant,asChild=false,static:isStatic=false,reserveLabel,hint,children,...props}:React.ComponentProps<'button'>&VariantProps<typeof variants>&{asChild?:boolean,static?:boolean,reserveLabel?:string,hint?:string}){
 const Comp=asChild?Slot:'button';
 return <Comp className={twMerge(clsx(variants({variant}),className))} data-static={isStatic||undefined} title={hint} aria-description={hint} {...props}>
  {reserveLabel&&!asChild?<span className="button-state-label"><span aria-hidden="true" data-reserve-label={reserveLabel}/><span>{children}</span></span>:children}
 </Comp>;
}
