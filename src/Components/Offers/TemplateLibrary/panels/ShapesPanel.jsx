import React, { useState } from 'react'
import { SHAPE_KINDS, makeId } from '../lib/design'

// -----------------------------------------------------------------------
// ShapesPanel — a color picker followed by one button per shape kind,
// each shown as an actual little preview of the shape. Filled shapes
// preview with a thin black border and the interior in the selected
// color; line and chevron have no interior, so they preview fully in
// the selected color instead. Two shape families:
//   1. "polygon presets" (triangle, diamond, pentagon, hexagon, heptagon,
//      octagon) — these just add a `polygon` element with a fixed `sides`
//      count, reusing whatever polygon rendering already exists.
//   2. "freeform" shapes (arrows, heart, cloud, etc.) — these add a
//      `freeform` element carrying normalized outline data (`points` or
//      `path`, in a 0..1 unit box) that the canvas scales by width/height.
// Every shape added carries `color`, which VoucherCanvas's ShapeNode
// reads for the fill (falling back to black for older saved shapes
// without one).
// -----------------------------------------------------------------------

function defaultsFor(shape) {
  const base = { x: 70, y: 30, width: 40, height: 40, rotation: 0, opacity: 1, visible: true }
  switch (shape) {
    case 'line':
      return { ...base, height: 0 }
    case 'polygon':
      return { ...base, sides: 5 }
    case 'star':
      return { ...base, points: 5 }
    case 'rect':
      return { ...base, cornerRadius: 0 }
    default:
      return base
  }
}

// Maps a SHAPE_KINDS button value -> how to build the actual element.
// `polygon` entries just set `sides`. `freeform` entries carry outline
// data in a 0..1 unit box (canvas multiplies by element.width/height).
const SHAPE_PRESETS = {
  triangle: { shape: 'polygon', extra: { sides: 3 } },
  diamond: { shape: 'polygon', extra: { sides: 4 } },
  pentagon: { shape: 'polygon', extra: { sides: 5 } },
  hexagon: { shape: 'polygon', extra: { sides: 6 } },
  heptagon: { shape: 'polygon', extra: { sides: 7 } },
  octagon: { shape: 'polygon', extra: { sides: 8 } },

  rightTriangle: {
    shape: 'freeform',
    extra: { points: [[0, 1], [0, 0], [1, 1]] },
  },
  parallelogram: {
    shape: 'freeform',
    extra: { points: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]] },
  },
  trapezoid: {
    shape: 'freeform',
    extra: { points: [[0.25, 0], [0.75, 0], [1, 1], [0, 1]] },
  },
  arrowRight: {
    shape: 'freeform',
    extra: { points: [[0, 0.3], [0.55, 0.3], [0.55, 0], [1, 0.5], [0.55, 1], [0.55, 0.7], [0, 0.7]] },
  },
  arrowLeft: {
    shape: 'freeform',
    extra: { points: [[1, 0.3], [0.45, 0.3], [0.45, 0], [0, 0.5], [0.45, 1], [0.45, 0.7], [1, 0.7]] },
  },
  arrowUp: {
    shape: 'freeform',
    extra: { points: [[0.3, 1], [0.3, 0.45], [0, 0.45], [0.5, 0], [1, 0.45], [0.7, 0.45], [0.7, 1]] },
  },
  arrowDown: {
    shape: 'freeform',
    extra: { points: [[0.3, 0], [0.3, 0.55], [0, 0.55], [0.5, 1], [1, 0.55], [0.7, 0.55], [0.7, 0]] },
  },
  doubleArrow: {
    shape: 'freeform',
    extra: {
      points: [
        [0, 0.5], [0.22, 0.2], [0.22, 0.38], [0.78, 0.38],
        [0.78, 0.2], [1, 0.5], [0.78, 0.8], [0.78, 0.62],
        [0.22, 0.62], [0.22, 0.8],
      ],
    },
  },
  chevron: {
    shape: 'freeform',
    extra: { points: [[0.15, 0.1], [0.85, 0.5], [0.15, 0.9]], closed: false },
  },
  cross: {
    shape: 'freeform',
    extra: {
      points: [
        [0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65],
        [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35],
      ],
    },
  },
  heart: {
    shape: 'freeform',
    extra: {
      path:
        'M0.5 1 C0.5 1 0.02 0.65 0.02 0.32 C0.02 0.15 0.18 0.02 0.35 0.02 C0.44 0.02 0.5 0.1 0.5 0.2 C0.5 0.1 0.56 0.02 0.65 0.02 C0.82 0.02 0.98 0.15 0.98 0.32 C0.98 0.65 0.5 1 0.5 1 Z',
    },
  },
  speechBubble: {
    shape: 'freeform',
    extra: { path: 'M0 0 H1 V0.7 H0.4 L0.2 1 V0.7 H0 Z' },
  },
  cloud: {
    shape: 'freeform',
    extra: {
      path:
        'M0.2 0.8 A0.18 0.18 0 0 1 0.17 0.45 A0.24 0.24 0 0 1 0.63 0.35 A0.2 0.2 0 0 1 0.7 0.8 Z',
    },
  },
  halfCircle: {
    shape: 'freeform',
    extra: { path: 'M0 0.75 A0.5 0.5 0 0 1 1 0.75 Z' },
  },
}

// Filled shapes: thin black border, colored interior.
const ICON_PROPS = { fill: 'currentColor', stroke: '#000000', strokeWidth: 1, strokeLinejoin: 'round', strokeLinecap: 'round' }
// Line and chevron: no interior — fully colored stroke.
const OPEN_ICON_PROPS = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' }

function polygonPoints(cx, cy, r, sides, rotate = -90) {
  const step = 360 / sides
  return Array.from({ length: sides })
    .map((_, i) => {
      const a = ((rotate + i * step) * Math.PI) / 180
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    })
    .join(' ')
}
function starPoints(cx, cy, rOuter, rInner, points) {
  return Array.from({ length: points * 2 })
    .map((_, i) => {
      const r = i % 2 === 0 ? rOuter : rInner
      const a = (-90 + (i * 180) / points) * (Math.PI / 180)
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    })
    .join(' ')
}

const SHAPE_ICONS = {
  // --- existing five ---
  rect: () => <rect x={4} y={6} width={16} height={12} rx={1.5} {...ICON_PROPS} />,
  ellipse: () => <ellipse cx={12} cy={12} rx={9} ry={6.5} {...ICON_PROPS} />,
  line: () => <line x1={3.5} y1={18.5} x2={20.5} y2={5.5} {...OPEN_ICON_PROPS} />,
  polygon: () => <polygon points={polygonPoints(12, 12, 9, 5)} {...ICON_PROPS} />,
  star: () => <polygon points={starPoints(12, 12, 9.5, 4, 5)} {...ICON_PROPS} />,

  // --- polygon presets ---
  triangle: () => <polygon points={polygonPoints(12, 12, 9, 3)} {...ICON_PROPS} />,
  diamond: () => <polygon points={polygonPoints(12, 12, 9, 4)} {...ICON_PROPS} />,
  pentagon: () => <polygon points={polygonPoints(12, 12, 9, 5)} {...ICON_PROPS} />,
  hexagon: () => <polygon points={polygonPoints(12, 12, 9, 6)} {...ICON_PROPS} />,
  heptagon: () => <polygon points={polygonPoints(12, 12, 9, 7)} {...ICON_PROPS} />,
  octagon: () => <polygon points={polygonPoints(12, 12, 9, 8)} {...ICON_PROPS} />,

  // --- freeform shapes ---
  rightTriangle: () => <polygon points="4,20 4,4 20,20" {...ICON_PROPS} />,
  parallelogram: () => <polygon points="7,6 21,6 17,18 3,18" {...ICON_PROPS} />,
  trapezoid: () => <polygon points="7,6 17,6 21,18 3,18" {...ICON_PROPS} />,
  arrowRight: () => <polygon points="3,9 13,9 13,4 21,12 13,20 13,15 3,15" {...ICON_PROPS} />,
  arrowLeft: () => <polygon points="21,9 11,9 11,4 3,12 11,20 11,15 21,15" {...ICON_PROPS} />,
  arrowUp: () => <polygon points="9,21 9,11 4,11 12,3 20,11 15,11 15,21" {...ICON_PROPS} />,
  arrowDown: () => <polygon points="9,3 9,13 4,13 12,21 20,13 15,13 15,3" {...ICON_PROPS} />,
  doubleArrow: () => (
    <polygon points="3,12 8,7 8,10 16,10 16,7 21,12 16,17 16,14 8,14 8,17" {...ICON_PROPS} />
  ),
  chevron: () => <polyline points="5,4 15,12 5,20" {...OPEN_ICON_PROPS} />,
  cross: () => (
    <polygon
      points="9,3 15,3 15,9 21,9 21,15 15,15 15,21 9,21 9,15 3,15 3,9 9,9"
      {...ICON_PROPS}
    />
  ),
  heart: () => (
    <path
      d="M12 20 C12 20 3 13.5 3 8.5 C3 5.5 5.5 3.5 8 3.5 C10 3.5 11.3 4.6 12 6 C12.7 4.6 14 3.5 16 3.5 C18.5 3.5 21 5.5 21 8.5 C21 13.5 12 20 12 20 Z"
      {...ICON_PROPS}
    />
  ),
  speechBubble: () => <path d="M4 5 H20 V15 H10 L6 19 V15 H4 Z" {...ICON_PROPS} />,
  cloud: () => (
    <path
      d="M7 17 A4 4 0 0 1 6.5 9.1 A5 5 0 0 1 16.3 7.2 A4.5 4.5 0 0 1 17 17 Z"
      {...ICON_PROPS}
    />
  ),
  halfCircle: () => <path d="M4 16 A8 8 0 0 1 20 16 Z" {...ICON_PROPS} />,
}

function ShapeIcon({ shape, color = '#000000' }) {
  const render = SHAPE_ICONS[shape]
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ color }}>
      {render ? render() : null}
    </svg>
  )
}

const COLOR_SWATCHES = [
  'transparent', '#FFFFFF', '#000000', '#5B5B5B', '#E03131',
  '#F08C00', '#2F9E44', '#1971C2', '#7048E8', '#D6336C',
]

// Checkerboard pattern so "transparent" reads as no-fill, not a broken swatch.
const TRANSPARENT_BG =
  'linear-gradient(45deg, #ccc 25%, transparent 25%), ' +
  'linear-gradient(-45deg, #ccc 25%, transparent 25%), ' +
  'linear-gradient(45deg, transparent 75%, #ccc 75%), ' +
  'linear-gradient(-45deg, transparent 75%, #ccc 75%)'

export function ShapesPanel({ draft, updateDraft, onAdd }) {
  const elements = draft.elements || []
  const [color, setColor] = useState('#000000')

  const addShape = (shapeKind) => {
    const preset = SHAPE_PRESETS[shapeKind]
    const renderShape = preset ? preset.shape : shapeKind
    const extra = preset ? preset.extra : {}

    const element = {
      id: makeId('shape'),
      type: 'shape',
      shape: renderShape,
      color,
      ...defaultsFor(renderShape),
      ...extra,
    }
    updateDraft('elements', [...elements, element])
    onAdd && onAdd(element.id)
  }

  return (
    <section className="vs-section">
      <p className="vs-section-hint">Choose a color, then tap a shape to add it to the canvas.</p>

      <div className="vs-preset-row" style={{ alignItems: 'center', marginBottom: 12, gap: 8 }}>
        {COLOR_SWATCHES.map((c) => (
  <button
    type="button"
    key={c}
    onClick={() => setColor(c)}
    aria-label={c === 'transparent' ? 'Use no fill' : `Use color ${c}`}
    title={c === 'transparent' ? 'Transparent' : c}
    style={{
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: c === 'transparent' ? '#fff' : c,
      backgroundImage: c === 'transparent' ? TRANSPARENT_BG : undefined,
      backgroundSize: c === 'transparent' ? '6px 6px' : undefined,
      backgroundPosition: c === 'transparent' ? '0 0, 0 3px, 3px -3px, -3px 0px' : undefined,
      border: color === c ? '2px solid #2E7DB0' : '1px solid #D0D0D0',
      padding: 0,
      cursor: 'pointer',
    }}
  />
))}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Custom color"
          style={{ width: 26, height: 26, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
        />
      </div>

      <div className="vs-preset-row">
        {SHAPE_KINDS.map((s) => (
          <button
            type="button"
            key={s.value}
            className="vs-chip"
            onClick={() => addShape(s.value)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ShapeIcon shape={s.value} color={color} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default ShapesPanel