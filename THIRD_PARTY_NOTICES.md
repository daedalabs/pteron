# Third-party license status

No distributable pteron installer has been produced. This is a direct-dependency notice inventory, **not a completed transitive-license audit**.

The local unsigned standalone development candidate retains npm/Python license files, exact installed-version inventories, Electron LICENSE and Chromium notices under `resources/notices`. `scripts/collect-notices.py` and `scripts/collect-notices.mjs` reproduce that collection. Collection is not a completed redistribution audit: native codec build/source obligations, Python runtime, fonts and optional TeX still need review before public release. The candidate bundles a PyInstaller worker/PyAV libraries and now includes a reduced MiKTeX-based equation runtime with its TeX math fonts.

The single-file portable development candidate contains the same app and worker. Python notice collection additionally requires and retains the bundled CPython runtime's LICENSE.txt and exact runtime version. Python runs inside the packaged worker; end users do not install it separately. This does not complete the public-release audit described above.

| Component | License | Source |
| --- | --- | --- |
| mathjax-full 3.2.1 | Apache-2.0 | https://github.com/mathjax/MathJax-src/blob/master/LICENSE |
| lucide-react 1.61.0 | ISC | https://github.com/lucide-icons/lucide/blob/main/LICENSE |
| @svgedit/svgcanvas 7.4.2 | MIT | https://github.com/SVG-Edit/svgedit/blob/master/LICENSE-MIT.txt |
| Manim Community 0.22.0 | MIT | https://github.com/ManimCommunity/manim/blob/main/LICENSE |
| Vite | MIT | https://github.com/vitejs/vite/blob/main/LICENSE |
| Playwright | Apache-2.0 | https://github.com/microsoft/playwright/blob/main/LICENSE |
| skia-pathops 0.9.2 | BSD-3-Clause | https://github.com/fonttools/skia-pathops/blob/main/LICENSE |
| svgelements 1.9.6 | MIT | https://github.com/meerk40t/svgelements/blob/master/LICENSE |

Exact installed versions are recorded in package-lock.json and uv.lock. Retain original upstream license/copyright notices when distributing covered software. The complete runtime includes additional Python/native/npm dependencies; inventory and license-file collection must cover those before shipping.

Electron, React, Radix, Tailwind, zod, xmldom, fflate and build dependencies are installed at exact versions in package-lock.json. This notice inventory has not yet been expanded into their complete distributed notices; do not produce a release installer until that audit is complete. A portable MiKTeX distribution under ignored .tools/ supplies the reduced embedded equation runtime described below. Its exact file/package inventory and upstream notices/sources are retained during packaging. FFmpeg licensing depends on optional components and encoder build settings; a Manim MIT license does not clear every dependency. Provider service terms and generated-output permissions are separate from library licenses.

Sources: https://ffmpeg.org/legal.html and https://www.mozilla.org/en-US/MPL/2.0/FAQ/ (historical Penpot evaluation; Penpot is not adopted).


### Local vector editing dependencies

- pathkit-wasm 1.0.0 — Skia PathKit, BSD-3-Clause. The production dependency includes its WASM binary and LICENSE; the standalone notice collector retains that license.
- svgpath 2.6.0 — MIT. Used for SVG path transformations before vector operations; LICENSE is retained by the standalone notice collector.

These additions do not complete the release-wide font, codec, TeX and transitive dependency audit.

### Vector equation engine

Equations are compiled in-process to vector SVG paths via `mathjax-full` 3.2.1 (Apache-2.0).
This replaces external TeX subprocesses (such as MiKTeX, dvisvgm, and Ghostscript), providing 100% standalone, in-memory equation rendering without external dependencies or copyleft (GPL/AGPL) runtime requirements.

### Video encoding and codecs

Video rendering leverages native hardware acceleration and OS-level codecs (e.g. `h264_mf` via Windows Media Foundation) where available. PyAV / FFmpeg shared libraries are utilized under LGPL-3.0 as dynamically linked runtime libraries.

### Embedded equation runtime (Historical / Optional)

Legacy versions supported an optional local MiKTeX 26.5 runtime. Modern standalone builds compile equations directly using MathJax (Apache 2.0). Staged notices and inventory references for legacy TeX packages remain accessible under `resources/notices/tex` if legacy TeX staging is enabled.

### Native text outlines

fontkit 2.0.4 (MIT) reads installed Windows fonts for the explicit text-to-path action. The portable app does not redistribute Arial, Georgia, Consolas or Segoe UI. Its production transitive packages and their original notices are retained by `scripts/collect-notices.mjs` in the exact npm inventory. The production dependency audit for this addition reports no known vulnerabilities (`artifacts/shape-usability/npm-audit.json`). This does not replace the release-wide audit above.
