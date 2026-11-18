# pteron wing-P logo

One approved logo is used in light and dark themes: a violet wing-P (`#4936B8`) and broad orange feather (`#EE623F`) on a rounded pure-white (`#FFFFFF`) tile. Corners outside the tile are transparent. The orange shape is enlarged and more saturated to remain visible at small icon sizes.

- `pteron-logo.svg`, `pteron-mark.svg`, `pteron-app-icon.svg` and the compatibility filename `pteron-logo-dark.svg` are identical editable masters: one background rectangle and two named paths, with no raster content or fonts.
- All root logo PNGs are identical 1024px exports of this same logo. There is no separate dark-mode design.
- `app-icon-themes.png` shows this logo on light and dark surfaces.
- `app-icon-sizes.png` reviews the same geometry at 16–96px in both themes. `pteron-source.svg` is the editable two-path source used by the generator.
- Both lower edges share the diagonal baseline `y = 270 - 0.6x`; the orange feather meets that baseline tangentially before its straight lower segment.

`public/pteron.svg`, `public/pteron.png` and `public/pteron.ico` supply the favicon, Electron window icon and packaged Windows icon. The ICO contains 16, 24, 32, 48, 64, 128 and 256px images. Run `node scripts/generate-branding.mjs` using the existing Playwright dependency and installed Edge to regenerate these assets.

Existing packaged executables require rebuilding to acquire changes.
