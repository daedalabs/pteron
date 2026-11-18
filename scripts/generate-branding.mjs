import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const brand = new URL('media/branding/', root);
const svg = await readFile(new URL('pteron-source.svg', brand), 'utf8');
assert.equal((svg.match(/<path\b/g) ?? []).length, 2);
assert.ok(!/<(?:image|script|foreignObject)\b/i.test(svg));
// One white-backed logo for every theme and output; legacy filenames are aliases.
const appIcon = svg.replace('  <path', '  <rect id="icon-background" x="4" y="4" width="248" height="248" rx="52" fill="#FFFFFF"/>\n  <path');
await writeFile(new URL('public/pteron.svg', root), appIcon);
for (const name of ['pteron-app-icon.svg', 'pteron-mark.svg', 'pteron-logo.svg', 'pteron-logo-dark.svg']) await writeFile(new URL(name, brand), appIcon);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function png(size, background = 'transparent', source = svg) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${background}}svg{display:block;width:100%;height:100%}</style>${source}`);
    return page.screenshot({ omitBackground: background === 'transparent' });
  }
  const large = await png(1024, 'transparent', appIcon);
  for (const name of ['pteron-logo.png', 'pteron-mark.png', 'pteron-logo-preview.png', 'pteron-logo-dark.png']) await writeFile(new URL(name, brand), large);
  await writeFile(new URL('public/pteron.png', root), large);
  function createDibFrame(width, height, rgbaBuffer) {
    const headerSize = 40;
    const imageSize = width * height * 4;
    const maskRowBytes = Math.ceil(width / 32) * 4;
    const maskSize = maskRowBytes * height;
    const totalSize = headerSize + imageSize + maskSize;
    const buf = Buffer.alloc(totalSize);

    buf.writeUInt32LE(40, 0);
    buf.writeInt32LE(width, 4);
    buf.writeInt32LE(height * 2, 8);
    buf.writeUInt16LE(1, 12);
    buf.writeUInt16LE(32, 14);
    buf.writeUInt32LE(0, 16);
    buf.writeUInt32LE(imageSize, 20);
    buf.writeInt32LE(0, 24);
    buf.writeInt32LE(0, 28);
    buf.writeUInt32LE(0, 32);
    buf.writeUInt32LE(0, 36);

    let pixelOffset = headerSize;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const r = rgbaBuffer[srcIdx];
        const g = rgbaBuffer[srcIdx + 1];
        const b = rgbaBuffer[srcIdx + 2];
        const a = rgbaBuffer[srcIdx + 3];
        buf[pixelOffset++] = b;
        buf[pixelOffset++] = g;
        buf[pixelOffset++] = r;
        buf[pixelOffset++] = a;
      }
    }

    let maskOffset = headerSize + imageSize;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const a = rgbaBuffer[srcIdx + 3];
        if (a === 0) {
          buf[maskOffset + Math.floor(x / 8)] |= (1 << (7 - (x % 8)));
        }
      }
      maskOffset += maskRowBytes;
    }

    return buf;
  }

  async function getRgba(size, source = appIcon) {
    const raw = await page.evaluate(async ({ size, svg }) => {
      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, size, size).data;
      return Array.from(data);
    }, { size, svg: source });
    return Buffer.from(raw);
  }

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of sizes) {
    if (size < 256) {
      images.push(createDibFrame(size, size, await getRgba(size, appIcon)));
    } else {
      images.push(await png(size, 'transparent', appIcon));
    }
  }
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  const ico = Buffer.concat([header, ...images]);
  await writeFile(new URL('public/pteron.ico', root), ico);
  for (let i = 0; i < sizes.length; i++) {
    const entry = 6 + i * 16;
    const start = ico.readUInt32LE(entry + 12);
    assert.equal(ico.readUInt32LE(entry + 8), images[i].length);
    if (sizes[i] < 256) {
      assert.equal(ico.readUInt32LE(start), 40);
      assert.equal(ico.readInt32LE(start + 4), sizes[i]);
      assert.equal(ico.readInt32LE(start + 8), sizes[i] * 2);
    } else {
      assert.equal(ico.readUInt32BE(start + 16), sizes[i]);
      assert.equal(ico.readUInt32BE(start + 20), sizes[i]);
    }
  }
  console.log('Generated editable SVG, 1024px PNGs and verified ICO sizes: ' + sizes.join(', '));
  await page.setViewportSize({ width: 720, height: 280 });
  await page.setContent(`<style>body{margin:0;display:flex;font:14px system-ui}section{width:360px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}svg{width:128px;height:128px}.small{display:flex;align-items:center;gap:16px}.small svg{width:32px;height:32px}</style><section style="background:#fff;color:#222">${appIcon}<div class="small">${appIcon}Light mode</div></section><section style="background:#202020;color:#eee">${appIcon}<div class="small">${appIcon}Dark mode</div></section>`);
  await page.screenshot({ path: fileURLToPath(new URL('app-icon-themes.png', brand)) });
  await page.setViewportSize({ width: 960, height: 380 });
  await page.setContent(`<style>body{margin:0;display:flex;font:14px system-ui}section{width:480px;height:380px;padding:28px;box-sizing:border-box}.sizes{height:220px;display:flex;align-items:center;gap:20px}.sample{text-align:center;font-size:11px}.sample svg{display:block;margin-bottom:16px;width:var(--size);height:var(--size)}</style>${['light','dark'].map(theme => `<section style="background:${theme === 'light' ? '#fff' : '#202020'};color:${theme === 'light' ? '#222' : '#eee'}"><p>${theme === 'light' ? 'Light' : 'Dark'} mode · actual pixel sizes</p><div class="sizes">${[16,24,32,48,64,96].map(size => `<div class="sample" style="--size:${size}px">${appIcon}${size}px</div>`).join('')}</div></section>`).join('')}`);
  await page.screenshot({ path: fileURLToPath(new URL('app-icon-sizes.png', brand)) });
  await page.setViewportSize({ width: 480, height: 280 });
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 480px; height: 280px; background: #101214;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e9ecf0; user-select: none;
    }
    .icon-box { width: 72px; height: 72px; margin-bottom: 14px; }
    .icon-box svg { width: 100%; height: 100%; }
    .name { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
    .desc { font-size: 13px; color: #8c95a0; margin-bottom: 22px; }
    .bar {
      width: 180px; height: 3px; background: #23282e; border-radius: 2px; overflow: hidden;
      position: relative;
    }
    .progress {
      width: 90px; height: 100%; background: linear-gradient(90deg, #4936B8, #EE623F);
      border-radius: 2px;
    }
    .note { font-size: 11px; color: #6e7681; margin-top: 10px; }
  </style></head><body>
    <div class="icon-box">${appIcon}</div>
    <div class="name">pteron</div>
    <div class="desc">Motion Design &amp; Video Authoring</div>
    <div class="bar"><div class="progress"></div></div>
    <div class="note">Starting workstation runtime…</div>
  </body></html>`);
  const splashPng = await page.screenshot({ omitBackground: false });
  await writeFile(new URL('splash.png', brand), splashPng);
  await mkdir(new URL('build/', root), { recursive: true });
  await writeFile(new URL('build/splash.png', root), splashPng);
  const pythonExe = fileURLToPath(new URL('.venv/Scripts/python.exe', root));
  execFileSync(pythonExe, ['-c', `
from PIL import Image
im = Image.open('build/splash.png').convert('RGB')
im.save('build/splash.bmp', 'BMP')
im.save('media/branding/splash.bmp', 'BMP')
`]);
  console.log('Generated splash.bmp for portable loader');
} finally { await browser.close(); }
