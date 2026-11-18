import {openSync,type Font} from 'fontkit';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import svgpath from 'svgpath';
import {parseSvg} from '../src/core/svg';
import {effectiveAttribute} from '../src/core/shape-path';

const families:Record<string,string[]>={arial:['arial.ttf','arialbd.ttf','ariali.ttf','arialbi.ttf'],georgia:['georgia.ttf','georgiab.ttf','georgiai.ttf','georgiaz.ttf'],consolas:['consola.ttf','consolab.ttf','consolai.ttf','consolaz.ttf'],'segoe ui':['segoeui.ttf','segoeuib.ttf','segoeuii.ttf','segoeuiz.ttf']};
const fonts=new Map<string,Font>();

export function textOutlines(source:string,objectIds:string[],fontDirectory=join(process.env.SystemRoot??'C:/Windows','Fonts')){
 const {elements}=parseSvg(source),result:Record<string,string>={};
 for(const id of [...new Set(objectIds)]){
  const node=elements.find(element=>element.getAttribute('id')===id);
  if(!node||node.localName!=='text')throw new Error('Select text labels to convert');
  if(Array.from(node.childNodes).some(child=>child.nodeType===1))throw new Error(`Text spans require separate labels: ${id}`);
  const family=(effectiveAttribute(node,'font-family')||'Arial').split(',')[0].trim().replace(/^['"]|['"]$/g,'').toLowerCase();
  const files=families[family];if(!files)throw new Error(`Unsupported outline font: ${family}`);
  const weight=effectiveAttribute(node,'font-weight')||'normal',style=effectiveAttribute(node,'font-style')||'normal';
  if(!['normal','400','bold','700'].includes(weight)||!['normal','italic'].includes(style))throw new Error('Use regular, bold or italic text before outlining');
  const layouts:readonly (readonly [string,readonly string[]])[]=[['dominant-baseline',['','auto','alphabetic']],['alignment-baseline',['','auto','baseline']],['writing-mode',['','horizontal-tb','lr-tb']],['direction',['','ltr']],['text-decoration',['','none']],['font-stretch',['','normal']],['font-variant',['','normal']],['font-feature-settings',['','normal']]];
  for(const [property,allowed] of layouts)if(!allowed.includes(effectiveAttribute(node,property)))throw new Error(`Unsupported text layout: ${property}`);
  if(node.hasAttribute('textLength')||node.hasAttribute('rotate'))throw new Error('Text length adjustments and per-glyph rotation are unsupported');
  const number=(property:string,fallback:number)=>{const raw=effectiveAttribute(node,property);if(!raw||raw==='normal')return fallback;const value=Number(raw.replace(/px$/,''));if(!Number.isFinite(value))throw new Error(`Use a single pixel value for text ${property}`);return value;};
  const size=number('font-size',16);if(size<=0)throw new Error('Text size must be positive');
  const file=join(fontDirectory,files[(weight==='bold'||weight==='700'?1:0)+(style==='italic'?2:0)]);
  if(!existsSync(file))throw new Error(`Outline font is not installed: ${family}`);
  let font=fonts.get(file);if(!font){const loaded=openSync(file);if('fonts'in loaded)throw new Error('Font collections are unsupported');font=loaded;fonts.set(file,font);}
  const text=effectiveAttribute(node,'xml:space')==='preserve'?node.textContent??'':(node.textContent??'').replace(/\s+/g,' ').trim();
  if(!text||[...text].some(character=>!font.hasGlyphForCodePoint(character.codePointAt(0)!)))throw new Error(`Text contains missing glyphs: ${id}`);
  const run=font.layout(text,{kern:effectiveAttribute(node,'font-kerning')!=='none'});if(run.direction==='rtl'||run.positions.some(position=>position.yAdvance))throw new Error('Vertical and right-to-left labels are unsupported');
  const scale=size/font.unitsPerEm,spacing=number('letter-spacing',0),wordSpacing=number('word-spacing',0);
  if(spacing||wordSpacing)throw new Error('Custom text spacing is unsupported');
  const advance=run.positions.reduce((sum,position)=>sum+position.xAdvance,0)*scale;
  const anchor=effectiveAttribute(node,'text-anchor')||'start';if(!['start','middle','end'].includes(anchor))throw new Error('Unsupported text anchor');
  let x=number('x',0)+number('dx',0)-(anchor==='middle'?advance/2:anchor==='end'?advance:0);const y=number('y',0)+number('dy',0);
  const paths:string[]=[];
  for(const [index,glyph] of run.glyphs.entries()){
   const position=run.positions[index],path=glyph.path.toSVG();
   if(path)paths.push(svgpath(path).matrix([scale,0,0,-scale,x+position.xOffset*scale,y-position.yOffset*scale]).toString());
   x+=position.xAdvance*scale;
  }
  if(!paths.length)throw new Error('Text contains no visible outlines');result[id]=paths.join(' ');
 }
 return result;
}
