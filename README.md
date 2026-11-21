# pteron

<p align="center">
  <img src="public/pteron.svg" width="96" height="96" alt="pteron logo"/>
</p>

<p align="center">
  <strong>Desktop vector animation and motion graphics editor</strong>
</p>

pteron is a Windows desktop application for creating animated vector videos and mathematical explanations. Draw and arrange SVG artwork, apply component motion presets, edit multi-scene timelines with synchronized narration and captions, and render high-fidelity MP4 video locally through Manim.

Manual authoring is complete by design. External AI control is optional and communicates through the Model Context Protocol (MCP) using the exact same validated command layer, monotonic revisions, and undo history as the UI.

---

## Features

- **Vector Artwork Canvas**: Isolated SVG-Edit workspace supporting nested vector groups, shapes, paths, text-to-path conversion, alignment, color palettes, and edge/center/gap snapping.
- **Scenes & Main Timeline**: Work in focused scene timelines or switch to **Main** for full video sequencing. Scene continuity automatically carries poses and surviving objects across cuts while preserving local edits.
- **Motion & Component Timing**: 30 animation presets (Write On, Erase, Stagger, Smooth Match, Crossfade, Scale, Rotate) with custom quadratic Bézier motion paths, rotation pivots, and integer-frame timing.
- **LaTeX Math Support**: Mathematical equations compile in-process to editable vector shapes via MathJax, with zero external TeX distribution required.
- **Audio & Captions**: Dedicated narration and subtitle tracks on the overall project clock. Import `.wav`/`.mp3` audio, trim waveform sources, and import/export retimed SRT subtitles.
- **Local Video Export**: High-quality MP4 rendering powered by an integrated Manim/Python engine with isolated opacity composition and frame-exact synchronization.
- **Model Context Protocol (MCP)**: Built-in stdio adapter and UI status panel allowing AI coding and motion agents to inspect state and dispatch editing commands.
- **Safety & Versioned Recovery**: Atomic `.pteron` project packages and a built-in multi-version recovery browser supporting preview, comparison, restore, and safe rotation under user data.

---

## Quick Start

### Prerequisites

- **Node.js**: 22.12 or later and `npm`
- **Python**: 3.12 (can be provisioned via `uv`)
- **uv**: Python package and environment manager

### Setup

```powershell
# Clone the repository
git clone https://github.com/daedalabs/pteron.git
cd pteron

# Install Node and Python dependencies
npm ci
uv sync --python 3.12

# Launch the desktop application
npm start
```

### Development Mode

For live UI editing with React Fast Refresh, CSS hot reloading, and automated Electron process restarts:

```powershell
npm run dev
```

---

## Building Binaries & Installers

Pteron packages into standalone executables with zero external runtime requirements (no Node.js, Python, FFmpeg, or TeX installation needed by the end user):

```powershell
# Build standalone directory (artifacts/standalone/win-unpacked/pteron.exe)
npm run build:standalone

# Build portable single-file executable (artifacts/standalone/pteron-0.1.0-portable.exe)
npm run build:portable

# Build Windows NSIS installer (artifacts/standalone/pteron-0.1.0-setup.exe)
npm run build:installer
```

---

## Testing & Verification

Run the automated test suites:

```powershell
# TypeScript type check
npm run typecheck

# Full unit test suite (TypeScript + Python)
npm run test:unit

# Feasibility and vector geometry probes
npm run test:feasibility

# Desktop Electron & MCP acceptance
npm run test:desktop
```

---

## Documentation

- [Product specification](docs/product-spec.md)
- [Architecture and project format](docs/architecture.md)
- [Workspace design principles](docs/design.md)
- [Workspace controls](docs/workspace.md)
- [Animation authoring & motion controls](docs/motion.md)
- [Development workflows](docs/development-workflows.md)
- [Contributor guidelines](AGENTS.md)
- [SVG artwork engine](docs/artwork.md)
- [LaTeX equations](docs/latex.md)
- [Narration and export](docs/narration-export.md)
- [MCP interface](docs/mcp.md)
- [Implementation status & roadmap](docs/implementation-status.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

---

## License

Pteron source code is available under the **Pteron Source Code License and EULA**. See [LICENSE](LICENSE) for the complete legal terms.

- **Source Code Inspection & Personal Use**: You are free to view, study, and compile the source code for personal, educational, or internal evaluation purposes.
- **Mandatory Attribution**: Any permitted distribution, demonstration, or documentation must visibly display `"Powered by Pteron / DaedaLabs (Deogenes Maranan)"`.
- **No Standalone Reselling or Binary Redistribution**: You may not redistribute, package, sell, rebrand, or host binary builds or derivative applications, standalone or as a service.
- **Official Prebuilt Releases**: Official prebuilt installers and portable executables are packaged and distributed exclusively by the author.
- **Contributions**: Contributions are welcomed under our Contributor License Agreement; see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Third-Party Notices**: Licenses and acknowledgments for third-party open-source components (MIT, Apache-2.0, BSD, ISC, LGPL) are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
