import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

/**
 * Source commands and the desktop use the same interpreter and dependency paths.
 * @param {string} root
 * @param {string | undefined} configured
 */
export function pythonRuntime(root, configured = process.env.PTERON_PYTHON) {
 const packages = join(root, '.venv', 'Lib', 'site-packages');
 const directory = join(root, '.tools', 'python');
 const managed = existsSync(directory) ? readdirSync(directory)
  .filter(name => /^cpython-3\.12(?:\.\d+)?-windows-x86_64-none$/.test(name))
  .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  .map(name => join(directory, name, 'python.exe')) : [];
 const venv = join(root, '.venv', 'Scripts', 'python.exe');
 const executable = configured ? resolve(root, configured)
  : [...(existsSync(packages) ? managed : []), venv].find(existsSync);
 if (!executable || !existsSync(executable)) {
  throw new Error('The development Python environment is missing. Run uv sync --python 3.12, or set PTERON_PYTHON to a Python 3.12 executable.');
 }
 const pdf = join(root, '.tools', 'pteron-pdf-vector');
 const usePdfTex = existsSync(join(pdf, 'pymupdf', '__init__.py'));
 const pythonPath = [root, existsSync(packages) ? packages : undefined, usePdfTex ? pdf : undefined, process.env.PYTHONPATH]
  .filter(Boolean).join(delimiter);
 return { executable, cwd: root, env: { PYTHONPATH: pythonPath, PTERON_SOURCE_PDF_TEX: usePdfTex ? '1' : undefined } };
}
