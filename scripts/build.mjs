import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await viteBuild();
await build({entryPoints:['electron/main.ts'],outfile:'dist/electron/main.js',bundle:true,platform:'node',format:'esm',packages:'external'});
await build({entryPoints:['electron/preload.ts'],outfile:'dist/electron/preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron']});
await build({entryPoints:['scripts/mcp.ts'],outfile:'dist/mcp.js',bundle:true,platform:'node',format:'esm',packages:'external'});
await build({entryPoints:['scripts/mcp.ts'],outfile:'dist/mcp.cjs',bundle:true,platform:'node',format:'cjs'});
