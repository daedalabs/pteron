import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'none' });
const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

const ALLOWED_ENVIRONMENTS = new Set([
  'matrix',
  'pmatrix',
  'bmatrix',
  'aligned',
  'cases',
]);

const ALLOWED_MACROS = new Set([
  'frac',
  'sqrt',
  'sum',
  'prod',
  'int',
  'iint',
  'lim',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'left',
  'right',
  'begin',
  'end',
  'matrix',
  'pmatrix',
  'bmatrix',
  'aligned',
  'cases',
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'mathcal',
  'operatorname',
  'overline',
  'underline',
  'vec',
  'hat',
  'bar',
  'dot',
  'ddot',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'theta',
  'lambda',
  'mu',
  'pi',
  'rho',
  'sigma',
  'tau',
  'phi',
  'omega',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Pi',
  'Sigma',
  'Phi',
  'Omega',
  'infty',
  'times',
  'cdot',
  'div',
  'pm',
  'mp',
  'le',
  'leq',
  'ge',
  'geq',
  'ne',
  'neq',
  'approx',
  'equiv',
  'to',
  'rightarrow',
  'leftarrow',
  'mapsto',
  'in',
  'notin',
  'subset',
  'subseteq',
  'cup',
  'cap',
  'emptyset',
  'forall',
  'exists',
  'partial',
  'nabla',
  'quad',
  'qquad',
  ',',
  ';',
  '!',
  '{',
  '}',
  '%',
]);

/**
 * Validates LaTeX equation source against the allowed whitelist.
 */
export function validateEquationSource(source: string): void {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('Equation source cannot be empty');
  }
  if (trimmed.includes('^^') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) {
    throw new Error('TeX character escapes and control codes are unsupported');
  }
  const envRegex = /\\(?:begin|end)\s*\{([^}]+)\}/g;
  let envMatch: RegExpExecArray | null;
  while ((envMatch = envRegex.exec(trimmed)) !== null) {
    if (!ALLOWED_ENVIRONMENTS.has(envMatch[1])) {
      throw new Error(`Unsupported mathematical environment: ${envMatch[1]}`);
    }
  }
  const macroRegex = /\\([A-Za-z]+|.)/g;
  let macroMatch: RegExpExecArray | null;
  while ((macroMatch = macroRegex.exec(trimmed)) !== null) {
    const macro = macroMatch[1];
    if (!ALLOWED_MACROS.has(macro) && macro !== '\\') {
      throw new Error(`Unsupported mathematical command: \\${macro}`);
    }
  }
}

/**
 * Compiles a LaTeX math string into a pure, self-contained SVG with path-based glyphs.
 * Runs completely in-memory via MathJax (Apache 2.0) with zero external TeX / GPL dependencies.
 */
export function compileEquationSvg(source: string): string {
  validateEquationSource(source);
  const trimmed = source.trim();

  const node = doc.convert(trimmed, { display: true });
  let rawSvg = adaptor.innerHTML(node);

  const errorMatch = rawSvg.match(/data-mjx-error="([^"]+)"/);
  if (errorMatch) {
    throw new Error(`LaTeX compilation failed: ${errorMatch[1]}`);
  }
  if (!/<path\b/.test(rawSvg)) {
    throw new Error('Equation produced no visible glyphs');
  }

  // Sanitize MathJax-specific presentation attributes so paths are editable vector shapes
  rawSvg = rawSvg
    .replace(/\s*stroke="currentColor"/g, '')
    .replace(/\s*stroke-width="0"/g, '')
    .replace(/\s*fill="currentColor"/g, '')
    .replace(/\s*data-mml-node="[^"]*"/g, '')
    .replace(/\s*data-c="[^"]*"/g, '')
    .replace(/\s*role="[^"]*"/g, '')
    .replace(/\s*focusable="[^"]*"/g, '');

  return rawSvg;
}
