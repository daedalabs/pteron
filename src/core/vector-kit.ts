let kit:any,initializing:Promise<void>|undefined;
export function initializeGeometry(){return initializing??=(async()=>{
 // The renderer imports geometry predicates too; load Node-only facilities only
 // when the main-process command service initializes the vector engine.
 const [{createRequire},{readFileSync}]=await Promise.all([import('node:module'),import('node:fs')]);
 const require=createRequire(import.meta.url);
 kit=await require('pathkit-wasm')({wasmBinary:readFileSync(require.resolve('pathkit-wasm/bin/pathkit.wasm'))});
})();}
export function vectorKit(){if(!kit)throw new Error('Vector geometry is not initialized');return kit;}
