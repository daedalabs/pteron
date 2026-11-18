# Text outline runtime notices

The exact npm inventory is retained under `notices/npm-inventory.json`.

- fontkit 2.0.4: upstream package and README declare MIT; author Devon Govett; repository https://github.com/foliojs/fontkit.
- dfa 1.2.0: upstream package and README declare MIT; author Devon Govett; repository https://github.com/devongovett/dfa.
- brotli 1.3.3: upstream package and README declare MIT; author Devon Govett; repository https://github.com/devongovett/brotli.js. Its decoder source contains Google Inc. copyright notices and Apache-2.0 license headers, retained verbatim in `npm/brotli/decoder-source`. Apache-2.0 terms are included here.

These packages omit a standalone MIT license document from their npm distributions. Original README and package metadata are retained verbatim; this inventory does not invent an upstream copyright year or permission notice. Resolving missing standalone notices remains part of the public-release audit. Other fontkit production dependencies retain their distributed license files in `npm/`.

System Windows fonts are read locally and are not bundled with Pteron.
