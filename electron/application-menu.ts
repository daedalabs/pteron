import {Menu,type MenuItemConstructorOptions} from 'electron';
import {z} from 'zod';
import {applicationMenus,defaultMenuState,type MenuEntry,type MenuState,type RecentMenuProject} from '../src/workspace/application-actions';
export const menuStateSchema=z.object(Object.fromEntries(Object.entries(defaultMenuState).map(([key,value])=>[key,typeof value==='boolean'?z.boolean():z.number().int().min(0).max(100000)])));
export function buildApplicationMenu(state:MenuState,recent:RecentMenuProject[],debug:boolean,dispatch:(action:string)=>void){
 // Leave pane-scoped and typing keys with their focused editor/timeline handlers.
 const entries=(items:MenuEntry[]):MenuItemConstructorOptions[]=>items.map(item=>'separator'in item?{type:'separator'}:'children'in item?{label:item.label,submenu:entries(item.children)}:{id:item.id,label:item.label,...(item.checked!==undefined?{type:'checkbox',checked:item.checked}:{}),enabled:item.enabled!==false,accelerator:item.shortcut&&!['Delete','Space','Ctrl+=','Ctrl+-','Ctrl+0'].includes(item.shortcut)?item.shortcut.replace('Ctrl+','CmdOrCtrl+'):undefined,click:()=>dispatch(item.id)});
 return Menu.buildFromTemplate(applicationMenus(state,recent,debug).map(menu=>({label:`&${menu.label}`,submenu:entries(menu.items)})));
}
