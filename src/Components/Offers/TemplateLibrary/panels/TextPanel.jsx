import React, { useState } from 'react'
import { makeId } from '../lib/design'

// -----------------------------------------------------------------------
// TextPanel — type text, pick a font, text color, and background color
// (with a "transparent" option), preview it live, then add it to the
// canvas as a `type: 'text'` element. VoucherCanvas reads el.font/
// el.color/el.bgColor when rendering.
// -----------------------------------------------------------------------

const FONTS = [
  'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New',
  'Verdana', 'Trebuchet MS', 'Garamond', 'Palatino Linotype', 'Comic Sans MS',
  'Impact', 'Lucida Console', 'Tahoma', 'Century Gothic', 'Book Antiqua',
  'Calibri', 'Cambria', 'Consolas', 'Segoe UI', 'Futura',
]

const TEXT_COLOR_SWATCHES = [
  '#000000', '#FFFFFF', '#5B5B5B', '#E03131',
  '#F08C00', '#2F9E44', '#1971C2', '#7048E8', '#D6336C',
]

const BG_COLOR_SWATCHES = [
  '#FFFFFF', '#000000', '#F5F5F5', '#FFE066',
  '#FFB3B3', '#B3E6B3', '#B3D9FF', '#D9B3FF',
]

const CHECKERBOARD = {
  backgroundImage:
    'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
}

function SwatchButton({ color, selected, onClick, transparent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={transparent ? 'Transparent' : `Use color ${color}`}
      title={transparent ? 'Transparent' : color}
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: transparent ? undefined : color,
        border: selected ? '2px solid #2E7DB0' : '1px solid #D0D0D0',
        padding: 0,
        cursor: 'pointer',
        ...(transparent ? CHECKERBOARD : null),
      }}
    />
  )
}

export function TextPanel({ draft, updateDraft, onAdd }) {
  const elements = draft.elements || []
  const [text, setText] = useState('Your text here')
  const [font, setFont] = useState(FONTS[0])
  const [color, setColor] = useState('#000000')
  const [bgColor, setBgColor] = useState('transparent')

  const addText = () => {
    if (!text.trim()) return
    const element = {
      id: makeId('text'),
      type: 'text',
      text,
      font,
      color,
      bgColor,
      fontSize: 8,
      fontWeight: 600,
      x: 60,
      y: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
    }
    updateDraft('elements', [...elements, element])
    onAdd && onAdd(element.id)
  }

  return (
    <section className="vs-section">
      <p className="vs-section-hint">Type your text, pick a font and colors, then add it to the canvas.</p>

      <label className="vs-field" style={{ display: 'block', marginBottom: 12 }}>
        <span className="vs-field-label">Text</span>
        <input
          type="text"
          className="vs-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something..."
        />
      </label>

      <label className="vs-field" style={{ display: 'block', marginBottom: 12 }}>
        <span className="vs-field-label">Font</span>
        <select
          className="vs-input"
          value={font}
          onChange={(e) => setFont(e.target.value)}
          style={{ fontFamily: font }}
        >
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginBottom: 12 }}>
        <span className="vs-field-label" style={{ display: 'block', marginBottom: 6 }}>Text color</span>
        <div className="vs-preset-row" style={{ alignItems: 'center', gap: 8 }}>
          {TEXT_COLOR_SWATCHES.map((c) => (
            <SwatchButton key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Custom text color"
            style={{ width: 26, height: 26, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <span className="vs-field-label" style={{ display: 'block', marginBottom: 6 }}>Background color</span>
        <div className="vs-preset-row" style={{ alignItems: 'center', gap: 8 }}>
          <SwatchButton transparent selected={bgColor === 'transparent'} onClick={() => setBgColor('transparent')} />
          {BG_COLOR_SWATCHES.map((c) => (
            <SwatchButton key={c} color={c} selected={bgColor === c} onClick={() => setBgColor(c)} />
          ))}
          <input
            type="color"
            value={bgColor === 'transparent' ? '#FFFFFF' : bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            aria-label="Custom background color"
            style={{ width: 26, height: 26, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div
        style={{
          padding: '10px 14px',
          marginBottom: 16,
          borderRadius: 6,
          border: '1px dashed #D0D0D0',
          display: 'inline-block',
          background: bgColor === 'transparent' ? undefined : bgColor,
          ...(bgColor === 'transparent' ? CHECKERBOARD : null),
        }}
      >
        <span style={{ fontFamily: font, color, fontWeight: 600, fontSize: 18 }}>
          {text || 'Preview'}
        </span>
      </div>

      <div>
        <button type="button" className="vs-chip vs-chip--active" onClick={addText}>
          Add text to canvas
        </button>
      </div>
    </section>
  )
}

export default TextPanel