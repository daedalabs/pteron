import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pythonRuntime } from '../electron/python-runtime.mjs';

const runtime = pythonRuntime(fileURLToPath(new URL('../', import.meta.url)));
const result = spawnSync(runtime.executable, process.argv.slice(2), {
 cwd: runtime.cwd, env: { ...process.env, ...runtime.env }, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
