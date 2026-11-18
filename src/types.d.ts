declare module '@svgedit/svgcanvas' { const SvgCanvas:any;export default SvgCanvas; }
interface Window {pteron:{call:(method:string,args?:any)=>Promise<any>;subscribe:(callback:()=>void)=>()=>void;onAction:(callback:(action:string)=>void)=>()=>void};}
