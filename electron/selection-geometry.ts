import {BrowserWindow} from 'electron';
import {join} from 'node:path';
import type {TextMeasurements} from '../src/core/selection';

/** Font metrics come from the same Chromium renderer as the artwork canvas. */
export async function measureSelectionText(source:string,ui:string):Promise<TextMeasurements>{
 if(!/<(?:\w+:)?text\b/.test(source))return {};
 const browser=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await browser.loadFile(join(ui,'geometry.html'));
  return await browser.webContents.executeJavaScript(`(async()=>{
   window.sampleSvg(${JSON.stringify(source)},{});await document.fonts.ready;
   return Object.fromEntries(Array.from(document.querySelectorAll('svg text')).map(el=>{const b=el.getBBox();return [el.id,{x:b.x,y:b.y,width:b.width,height:b.height}];}));
  })()`);
 }finally{browser.destroy();}
}
