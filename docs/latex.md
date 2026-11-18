# LaTeX and Mathematical Equations

Pteron includes a built-in, in-process mathematical equation engine powered by `mathjax-full` (Apache-2.0). Supported LaTeX equations compile directly in-memory into pure vector `<path>` SVG elements in ~5ms with zero external dependencies, zero network requests, and zero copyleft (GPL/AGPL) licensing requirements.

The fixed mathematical whitelist and allowed command/environment restrictions ensure clean, predictable vector shapes suitable for animation, morphing, and highlighting.

Advanced and legacy development overrides through `PTERON_TEX_ROOT`, an adjacent portable `tex` directory, or a local MiKTeX installation remain available as optional development fallbacks. Standard portable and packaged standalone releases use the embedded MathJax vector engine.

Equations are source-linked canvas shapes with editable source in Properties. The Σ tool inserts a cached vector equation without requiring TeX. Custom source compilation uses the embedded MathJax vector compiler (with optional local worker/TeX fallback). Recompilation preserves the outer object identity, placement, styling and compatible clip references; errors retain the last valid artwork.

Named terms map semantic names to editable descendant glyph/group IDs through `equation.terms`. Select an equation or one of its glyphs and open Named terms. Use identical names in successive equations for Match terms; select specific names for Highlight terms. The shared evaluator moves corresponding source terms toward target geometry and crossfades the replacement. Ambiguous/repeated terms need distinct user-authored names. A recompilation that removes an active named term is rejected; remove its referencing animation, compile, and remap before animating the new glyphs. This does not infer symbolic meaning from TeX.

For legacy offline TeX testing or fallback evaluation, `npm run setup:tex` installs a portable development distribution. The bootstrap verifies the setup archive SHA-256, installs an essential portable distribution and required math packages, and builds the latex format. No system PATH change is made. `renderer/runtime.py` discovers `.tools/miktex/texmfs/install/miktex/bin/x64` for the worker process. In standard releases, equation compilation runs in-process via MathJax without spawning subprocesses.

Implemented equation flow: edit source, compile with a fixed mathematical template, preview generated SVG and readable diagnostics. Support standard expressions, fractions, roots, sums, matrices and aligned equations. Preserve source, generated vectors and named-term mappings.

Expose Write on, Highlight terms and Match terms through the regular preset/timeline interface, with full MCP access. Users author equation steps and can correct ambiguous repeated-term correspondence. Matching TeX is not symbolic algebra solving.

Use identical geometry for browser and export. Keep the last valid preview after invalid source. Arbitrary preambles and custom package installation are outside v1. Direct glyph path editing must not silently destroy source linkage.

Sources: https://docs.manim.community/en/stable/reference/manim.mobject.text.tex_mobject.MathTex.html and https://docs.manim.community/en/stable/reference/manim.utils.tex_file_writing.html

