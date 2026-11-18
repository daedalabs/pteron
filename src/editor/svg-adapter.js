/** Stable project identity transported in SVG classes that svgcanvas preserves. */
const markerPrefix = 'pteron-id-';
const keyPattern = /^pteron-id-([a-zA-Z0-9_-]+)$/;
const elements = root => [root, ...root.querySelectorAll('*')];

function remapReferences(root, replacements) {
  const urls = value => value.replace(/url\(\s*(['"]?)#([^\s)'"]+)\1\s*\)/g,
    (whole, quote, id) => replacements.has(id) ? `url(#${replacements.get(id)})` : whole);
  for (const element of elements(root)) {
    for (const attribute of [...element.attributes]) {
      let value = urls(attribute.value);
      if (attribute.localName === 'href' && value.startsWith('#')) {
        value = `#${replacements.get(value.slice(1)) ?? value.slice(1)}`;
      }
      if (value !== attribute.value) element.setAttributeNS(attribute.namespaceURI, attribute.name, value);
    }
    if (element.localName === 'style') {
      // Rewrite selectors separately from declarations, avoiding accidental edits
      // to literal hex colours when a source ID happens to equal a colour.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(element.textContent);
      for (const rule of sheet.cssRules) {
        if (!('selectorText' in rule)) throw new Error('Nested CSS rules are not supported by SVG import');
        rule.selectorText = rule.selectorText.replace(/#([a-zA-Z_][\w-]*)/g,
          (whole, id) => replacements.has(id) ? `#${replacements.get(id)}` : whole);
        for (const property of rule.style) rule.style.setProperty(property, urls(rule.style.getPropertyValue(property)), rule.style.getPropertyPriority(property));
      }
      element.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
    }
  }
}

export function prepareSvg(xml, { fresh = false } = {}) {
  const document = new DOMParser().parseFromString(xml, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw new Error('Invalid SVG document');
  const root = document.documentElement;
  if (root.querySelector('script,foreignObject')) throw new Error('Active SVG content is unsupported');
  // SVG-Edit moves root-level shapes into a new topmost layer. Give the canvas
  // background an explicit bottom layer so loading cannot cover foreground art.
  const background=root.querySelector('.pteron-canvas-background');
  if(background){
    let layer=[...root.children].find(el=>el.classList.contains('pteron-background-layer'));
    if(!layer){layer=document.createElementNS(root.namespaceURI,'g');layer.setAttribute('class','layer pteron-background-layer');const title=document.createElementNS(root.namespaceURI,'title');title.textContent='Canvas background';layer.append(title);root.insertBefore(layer,root.firstChild);}
    layer.append(background);
    if(![...root.children].some(el=>el!==layer&&!['defs','title','desc','metadata'].includes(el.localName))){
      const foreground=document.createElementNS(root.namespaceURI,'g');foreground.setAttribute('class','layer');const title=document.createElementNS(root.namespaceURI,'title');title.textContent='Layer 1';foreground.append(title);root.append(foreground);
    }
  }
  const replacements = new Map();
  const used = new Set();
  for (const element of elements(root)) {
    const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    const keys = classes.filter(value => keyPattern.test(value));
    if (keys.length > 1) throw new Error('Object has multiple project identities');
    let key = !fresh && keys.length ? keys[0].slice(markerPrefix.length) : crypto.randomUUID();
    if (used.has(key)) throw new Error('Duplicate project object identity');
    used.add(key);
    const id = `p_${key}`;
    const old = element.getAttribute('id');
    if (old && replacements.has(old)) throw new Error(`Duplicate SVG id: ${old}`);
    if (old) replacements.set(old, id);
    element.setAttribute('class', [...classes.filter(value => !keyPattern.test(value)), markerPrefix + key].join(' '));
    if (element.localName === 'svg') {
      const overflow = element.getAttribute('overflow') ?? element.style.overflow;
      if (overflow) {
        if (!['visible','hidden','scroll','auto'].includes(overflow)) throw new Error('Unsupported SVG overflow');
        element.classList.remove(...[...element.classList].filter(value => value.startsWith('pteron-overflow-')));
        element.classList.add(`pteron-overflow-${overflow}`);
      }
    }
    element.setAttribute('id', id);
  }
  remapReferences(root, replacements);
  return new XMLSerializer().serializeToString(root);
}

export function restoreProjectIds(root) {
  const replacements = new Map();
  const used = new Set();
  // svgcanvas controls its document root id; persistent identities address its
  // editable descendants, never that private root element.
  for (const element of root.querySelectorAll('*')) {
    // SVG-Edit wraps nested viewports in anonymous groups on load. Their source
    // is retained, but they must not appear as newly authored components.
    if(element.localName==='g' && ![...element.classList].some(value=>keyPattern.test(value)) &&
       [...element.attributes].every(attribute=>attribute.name==='id') &&
       element.children.length===1 && element.firstElementChild.localName==='svg') {
      element.classList.add('pteron-editor-wrapper');
    }
    const marker = [...element.classList].find(value => keyPattern.test(value));
    if (!marker) continue;
    const key = marker.slice(markerPrefix.length);
    if (used.has(key)) throw new Error('Duplicate project identity after editor load');
    used.add(key);
    const id = `p_${key}`;
    if (element.id) replacements.set(element.id, id);
    element.id = id;
    if (element.localName === 'svg') {
      const overflow = [...element.classList].find(value => /^pteron-overflow-(visible|hidden|scroll|auto)$/.test(value));
      if (overflow) element.setAttribute('overflow',overflow.slice('pteron-overflow-'.length));
    }
  }
  remapReferences(root, replacements);
  return [...used];
}

export function loadProjectSvg(canvas, xml, options) {
  const prepared = prepareSvg(xml, options);
  // Release selectors while their old elements still belong to the live document.
  // Reloading first leaves SVG-Edit's cached boxes attached to detached artwork.
  canvas.clearSelection();
  if (!canvas.setSvgString(prepared)) throw new Error('Editor rejected SVG');
  // Project ID restoration can outlive native selector-map keys. Recreate the
  // editor-only overlay on reload so detached selections cannot remain visible.
  canvas.selectorManager.initGroup();
  canvas.setRubberBox(canvas.selectorManager.getRubberBandBox());
  restoreProjectIds(canvas.getSvgContent());
  return canvas.getSvgContent();
}

export function saveProjectSvg(canvas) {
  const root=canvas.getSvgContent();
  restoreProjectIds(root);
  // Newly drawn objects need a project identity before the command crosses the
  // bridge, so their current selection survives authoritative state reloads.
  for(const element of root.querySelectorAll('*'))if(![...element.classList].some(value=>keyPattern.test(value)))element.classList.add(markerPrefix+crypto.randomUUID());
  restoreProjectIds(root);
  return canvas.svgCanvasToString();
}
