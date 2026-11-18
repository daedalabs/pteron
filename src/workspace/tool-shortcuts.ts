export const canvasTools=[
 {label:'Select',mode:'select',key:'V',hint:'Select and move artwork'},
 {label:'Rectangle',mode:'rect',key:'M',hint:'Draw a rectangle'},
 {label:'Ellipse',mode:'ellipse',key:'L',hint:'Draw an ellipse'},
 {label:'Path',mode:'path',key:'P',hint:'Draw a path with straight or curved segments'},
 {label:'Text',mode:'text',key:'T',hint:'Add editable text'},
 {label:'LaTeX equation',mode:'equation',key:'',hint:'Insert an editable LaTeX equation'}
] as const;

export function toolShortcut(event:KeyboardEvent):string|undefined{
 if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.repeat)return;
 const target=event.target as Element|null;
 if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="menu"],[role="combobox"]'))return;
 return canvasTools.find(tool=>tool.key&&tool.key.toLowerCase()===event.key.toLowerCase())?.mode;
}
