// -----------------------------------------------------------------------
// The single base voucher design. Color, illustration layer, QR
// position/size, and the physical print size (mm) live on this object
// and are editable in the studio. The old fixed text slots (corner
// flag, headline, subtitle, expiry, terms, medallion) have been
// removed — only the QR code + its caption remain as named slots.
// Everything else (shapes/text/images/QR) is added freeform via the
// Canvas panel and lives in `elements`.
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// The single base voucher design. ...
// -----------------------------------------------------------------------
export function baseDesign() {
  return {
    name: 'Untitled voucher',
    widthMM: 152.4,
    heightMM: 76.2,
    dependencies: makeBlankDependencies(),
    colors: { /* unchanged */
      accent: '#B9762E',
      accentDark: '#8F5720',
      tint: '#FBF3E8',
      onDark: '#FFFFFF',
    },
    layers: { /* unchanged */
      backgroundPattern: 'texture',
      backgroundPatternColor: null,
      backgroundPatternOpacity: null,
      backgroundImage: null,
      backgroundImageOpacity: null,
      sidePanelPattern: 'none',
      sidePanelPatternColor: null,
      sidePanelPatternOpacity: null,
      sidePanel: true,
      dots: true,
      ribbonStyle: 'diagonal',
      ribbonColor: null,
      frame: true,
    },
    // Freeform layer for shapes/text/images/QR codes added via the
    // Canvas panel. Array order IS stacking order — front = last item.
    // No separate per-type ordering; dragging an element on the canvas
    // moves it to the end of this array (see TemplateLibrary's
    // onBeginDrag).
           elements: [],
        // All three code types share one encoded value (qr.value) — a
    // dependency token dropped in once drives QR, barcode, and text
    // together — but each has its own independent position/size so it
    // can be dragged and resized on its own, same as QR.
    qr: { visible: true, value: 'https://yourstore.com/redeem', x: 10, y: 57, size: 17, color: null },
    barcode: { visible: true, x: 10, y: 40, width: 60, height: 15, color: null, rotation: 0 },
    qrText: { visible: true, x: 10, y: 80, fontSize: 6, color: null },
    codeTypes: { qrCode: true, barcode: false, text: false }
    
    
  }
}

// -----------------------------------------------------------------------
// A blank starting point for brand-new templates — same shape as
// baseDesign() (so every field the editor/canvas expects is present),
// but with every decorative layer switched off and the QR hidden. The
// canvas renders as a plain white rectangle until the person adds
// shapes, text, or an image via the Shapes/Text/Image panel.
// -----------------------------------------------------------------------
export function blankDesign() {
  return {
    name: 'Untitled voucher',
    widthMM: 152.4,
    heightMM: 76.2,
    dependencies: makeBlankDependencies(),
    colors: {
      accent: '#B9762E',
      accentDark: '#8F5720',
      tint: '#FFFFFF',
      onDark: '#FFFFFF',
    },
    layers: {
      backgroundPattern: 'none',
      backgroundPatternColor: null,
      backgroundPatternOpacity: null,
      backgroundImage: null,
      backgroundImageOpacity: null,
      sidePanelPattern: 'none',
      sidePanelPatternColor: null,
      sidePanelPatternOpacity: null,
      sidePanel: false,
      dots: false,
      ribbonStyle: 'none',
      ribbonColor: null,
      frame: false,
    },
        elements: [],
        // All three code types share one encoded value (qr.value) — a
    // dependency token dropped in once drives QR, barcode, and text
    // together — but each has its own independent position/size so it
    // can be dragged and resized on its own, same as QR.
    qr: { visible: true, value: 'https://yourstore.com/redeem', x: 10, y: 57, size: 17, color: null },
    barcode: { visible: true, x: 10, y: 40, width: 60, height: 15, color: null, rotation: 0 },
    qrText: { visible: true, x: 10, y: 80, fontSize: 6, color: null },
    codeTypes: { qrCode: true, barcode: false, text: false }
    
  }
}

// The default stacking order of element *types* — independent of when
// an individual element was added. draft.layerOrder holds the current
// order (front = last); the person can reorder it via the Layers
// control in ElementsPanel, which lets any type come above any other,
// not a fixed hierarchy. New elements always join at the front *within
// their own type's slice* (see VoucherCanvas's grouping + ElementsPanel's
// move()), never jumping in front of a different type just by being
// added later.


export const ELEMENT_POS_KEYS = {
  qr: ['x', 'y'],
  barcode: ['x', 'y'],
  qrText: ['x', 'y'],
}
// Full paint order (front = last) across BOTH named slots (qr, qrLabel)
// and freeform elements — this is the single source of truth for
// z-order now, replacing the old hardcoded "qr, then qrLabel, then
// elements" order in VoucherCanvas. design.stackOrder is a flat array
// of keys: 'qr', 'qrLabel', or an element id.
//
// Backward-compatible: any key not yet present in a saved
// design.stackOrder (older templates saved before this existed, or a
// freeform element that was just added and hasn't been dragged) falls
// back to the legacy default order — qr, then qrLabel, then elements
// in their array order — appended after whatever *is* already ordered.
export function resolveStackOrder(design) {
  const elementIds = (design.elements || []).map((el) => el.id)
  const legacyDefault = ['qr', ...elementIds]
  const saved = Array.isArray(design.stackOrder) ? design.stackOrder : []
  const knownKeys = new Set(legacyDefault)
  const kept = saved.filter((k) => knownKeys.has(k))
  const missing = legacyDefault.filter((k) => !kept.includes(k))
  return [...kept, ...missing]
}
// Mirrors GripStyleBackend.Models.MCoupon exactly — one entry per
// property on that model, in the same order. `key` is the C# property
// name verbatim, used both as the display label and as the token
// inside `template`. If a property is ever renamed on the backend,
// rename it here too and everything downstream (design JSON, panel,
// backend substitution) stays in sync.
export const DEPENDENCY_FIELDS = [
  { key: 'Name', template: '{{CouponName}}', sample: 'Summer Sale' },
  { key: 'DiscountPercentage', template: '{{DiscountPercentage}}', sample: '20%' },
  { key: 'DiscountAmount', template: '{{DiscountAmount}}', sample: 'Rs 200' },
  { key: 'MinSpendAmount', template: '{{MinSpendAmount}}', sample: 'Rs 500' },
  { key: 'ExpiryDate', template: '{{ExpiryDate}}', sample: '31/12/26' },
]
export function sampleForToken(text) {
  const match = DEPENDENCY_FIELDS.find((f) => f.template === text)
  return match ? match.sample : null
}

// draft.dependencies lives directly on the design object (see
// baseDesign()/blankDesign() above) and is saved/loaded with the rest
// of the template through the normal Template API — no separate
// payload step. Every MCoupon key is always present on this object; a
// key holds its template token once the person has used it somewhere
// on the canvas, and stays '' otherwise.
export function makeBlankDependencies() {
  const obj = {}
  DEPENDENCY_FIELDS.forEach(({ key }) => { obj[key] = '' })
  return obj
}

// Fills in any missing dependency keys on an existing (possibly older)
// design without touching keys it already has — used when opening a
// template saved before `dependencies` existed on the shape.
export function normalizeDependencies(dependencies) {
  return { ...makeBlankDependencies(), ...(dependencies || {}) }
}

// Named slots (+ field) that a dependency token can be inserted into.
// Only `qr` remains as a fixed named slot; freeform `elements` of type
// 'text' are handled separately in DependenciesPanel since they live
// in draft.elements, not as a fixed top-level key.
export const DEPENDENCY_TARGET_FIELDS = {
  qr: 'value',
}

export const ELEMENT_LABELS = {
  qr: 'QR code'
}

// Labels for elements placed in the freeform `elements` array (used by
// ElementsPanel), distinct from ELEMENT_LABELS above which covers the
// fixed named slots (qr, qrLabel).
export const ELEMENT_TYPE_LABELS = {
  shape: 'Shape',
  text: 'Text',
  image: 'Image',
  qr: 'QR code',
}

let elementIdCounter = 0
export function makeId(type) {
  elementIdCounter += 1
  return `${type}-${Date.now()}-${elementIdCounter}`
}

export function elementSummary(el) {
  if (el.type === 'text') return sampleForToken(el.text) || (el.text?.trim() ? el.text.slice(0, 18) : 'Text')
  if (el.type === 'shape') return el.shape ? el.shape[0].toUpperCase() + el.shape.slice(1) : 'Shape'
  if (el.type === 'image') return 'Image'
  if (el.type === 'qr') return 'QR code'
  return ELEMENT_TYPE_LABELS[el.type] || 'Element'
}

export const SHAPE_KINDS = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'line', label: 'Line' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'star', label: 'Star' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'heptagon', label: 'Heptagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'rightTriangle', label: 'Right triangle' },
  { value: 'parallelogram', label: 'Parallelogram' },
  { value: 'trapezoid', label: 'Trapezoid' },
  { value: 'arrowRight', label: 'Arrow right' },
  { value: 'arrowLeft', label: 'Arrow left' },
  { value: 'arrowUp', label: 'Arrow up' },
  { value: 'arrowDown', label: 'Arrow down' },
  { value: 'doubleArrow', label: 'Double arrow' },
  { value: 'chevron', label: 'Chevron' },
  { value: 'cross', label: 'Cross' },
  { value: 'heart', label: 'Heart' },
  { value: 'speechBubble', label: 'Speech bubble' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'halfCircle', label: 'Half circle' },
]

export const DISPLAY_FONTS = [
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
  { label: 'Fraunces', value: "'Fraunces', serif" },
  { label: 'Playfair Display', value: "'Playfair Display', serif" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  { label: 'Bebas Neue', value: "'Bebas Neue', sans-serif" },
  { label: 'Anton', value: "'Anton', sans-serif" },
  { label: 'Archivo Black', value: "'Archivo Black', sans-serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Oswald', value: "'Oswald', sans-serif" },
  { label: 'Abril Fatface', value: "'Abril Fatface', serif" },
  { label: 'DM Serif Display', value: "'DM Serif Display', serif" },
  { label: 'Cormorant Garamond', value: "'Cormorant Garamond', serif" },
  { label: 'Libre Baskerville', value: "'Libre Baskerville', serif" },
  { label: 'Syne', value: "'Syne', sans-serif" },
  { label: 'Sora', value: "'Sora', sans-serif" },
  { label: 'Unbounded', value: "'Unbounded', sans-serif" },
  { label: 'Outfit', value: "'Outfit', sans-serif" },
  { label: 'Righteous', value: "'Righteous', sans-serif" },
  { label: 'Rubik Mono One', value: "'Rubik Mono One', monospace" },
  { label: 'Big Shoulders Display', value: "'Big Shoulders Display', sans-serif" },
  { label: 'Josefin Sans', value: "'Josefin Sans', sans-serif" },
  { label: 'Bodoni Moda', value: "'Bodoni Moda', serif" },
  { label: 'Zilla Slab', value: "'Zilla Slab', serif" },
]

export const BODY_FONTS = [
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Manrope', value: "'Manrope', sans-serif" },
  { label: 'IBM Plex Sans', value: "'IBM Plex Sans', sans-serif" },
  { label: 'Source Serif 4', value: "'Source Serif 4', serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Lato', value: "'Lato', sans-serif" },
  { label: 'Nunito', value: "'Nunito', sans-serif" },
  { label: 'Work Sans', value: "'Work Sans', sans-serif" },
  { label: 'Karla', value: "'Karla', sans-serif" },
  { label: 'Mulish', value: "'Mulish', sans-serif" },
  { label: 'Rubik', value: "'Rubik', sans-serif" },
  { label: 'DM Sans', value: "'DM Sans', sans-serif" },
  { label: 'Barlow', value: "'Barlow', sans-serif" },
  { label: 'Inconsolata', value: "'Inconsolata', monospace" },
  { label: 'Quicksand', value: "'Quicksand', sans-serif" },
  { label: 'Raleway', value: "'Raleway', sans-serif" },
  { label: 'PT Sans', value: "'PT Sans', sans-serif" },
  { label: 'Noto Sans', value: "'Noto Sans', sans-serif" },
  { label: 'Hind', value: "'Hind', sans-serif" },
  { label: 'Overpass', value: "'Overpass', sans-serif" },
  { label: 'Cabin', value: "'Cabin', sans-serif" },
  { label: 'Assistant', value: "'Assistant', sans-serif" },
  { label: 'Public Sans', value: "'Public Sans', sans-serif" },
]

export const SIZE_PRESETS = [
  { label: '3" x 6"', widthMM: 152.4, heightMM: 76.2 },
  { label: 'Credit card', widthMM: 85.6, heightMM: 54 },
  { label: 'A6', widthMM: 148, heightMM: 105 },
  { label: 'Square', widthMM: 100, heightMM: 100 },
]

export function round1(n) {
  return Math.round(n * 10) / 10
}
// A small, deliberately diverse set for the Dependencies panel — one
// or two representatives per *category* of letterform (geometric sans,
// neutral sans, elegant serif, high-contrast serif, slab, condensed
// display, heavy display, rounded, mono, typewriter, script) rather
// than many near-identical sans options. Grouped so the panel can show
// them under <optgroup> headings and make the differences obvious at a
// glance instead of scrolling a flat list of lookalikes.
export const TOKEN_FONTS = [
  {
    category: 'Sans',
    fonts: [
      { label: 'Inter', value: "'Inter', sans-serif" },
      { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
      { label: 'Josefin Sans', value: "'Josefin Sans', sans-serif" },
    ],
  },
  {
    category: 'Serif',
    fonts: [
      { label: 'Playfair Display', value: "'Playfair Display', serif" },
      { label: 'Fraunces', value: "'Fraunces', serif" },
      { label: 'Bodoni Moda', value: "'Bodoni Moda', serif" },
    ],
  },
  {
    category: 'Slab',
    fonts: [
      { label: 'Zilla Slab', value: "'Zilla Slab', serif" },
    ],
  },
  {
    category: 'Condensed / Display',
    fonts: [
      { label: 'Oswald', value: "'Oswald', sans-serif" },
      { label: 'Bebas Neue', value: "'Bebas Neue', sans-serif" },
      { label: 'Anton', value: "'Anton', sans-serif" },
      { label: 'Archivo Black', value: "'Archivo Black', sans-serif" },
    ],
  },
  {
    category: 'Rounded / Decorative',
    fonts: [
      { label: 'Righteous', value: "'Righteous', sans-serif" },
      { label: 'Abril Fatface', value: "'Abril Fatface', serif" },
    ],
  },
  {
    category: 'Mono / Typewriter',
    fonts: [
      { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
      { label: 'Courier Prime', value: "'Courier Prime', monospace" },
    ],
  },
  {
    category: 'Script',
    fonts: [
      { label: 'Caveat', value: "'Caveat', cursive" },
    ],
  },
]

// Flat lookup used when we just need the list without categories.
export const TOKEN_FONTS_FLAT = TOKEN_FONTS.flatMap((g) => g.fonts)