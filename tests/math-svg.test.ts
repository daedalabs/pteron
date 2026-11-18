import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileEquationSvg } from '../src/core/math-svg';

test('compileEquationSvg produces valid SVG vector paths for simple and complex math', () => {
  const simple = compileEquationSvg('x + 2 = 5');
  assert.match(simple, /<svg\b/);
  assert.match(simple, /<path\b/);
  assert.doesNotMatch(simple, /<(?:image|text|use)\b/);

  const frac = compileEquationSvg('\\frac{a}{b} = c');
  assert.match(frac, /<path\b/);

  const sum = compileEquationSvg('\\sum_{i=1}^n x_i = \\int_0^1 f(t) dt');
  assert.match(sum, /<path\b/);

  const matrix = compileEquationSvg('\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}');
  assert.match(matrix, /<path\b/);
});

test('compileEquationSvg rejects invalid syntax or empty input with actionable error', () => {
  assert.throws(() => compileEquationSvg(''), /empty/);
  assert.throws(() => compileEquationSvg('   '), /empty/);
  assert.throws(() => compileEquationSvg('x + ^^41'), /unsupported/);
  assert.throws(() => compileEquationSvg('\\notallowed{x}'), /Unsupported mathematical command: \\notallowed/);
  assert.throws(() => compileEquationSvg('\\begin{badenv} x \\end{badenv}'), /Unsupported mathematical environment: badenv/);
  assert.throws(() => compileEquationSvg('\\frac{a}{'), /LaTeX compilation failed/);
});
