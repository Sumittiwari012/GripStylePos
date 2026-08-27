import React, { useState } from 'react'
import { Link2, X } from 'lucide-react'
import { DEPENDENCY_FIELDS, TOKEN_FONTS, makeId } from '../lib/design'

// Dependencies are no longer tied to whatever's selected on the canvas.
// Clicking a chip drops a brand-new freeform text element containing
// the token (e.g. "{{CouponName}}") onto the canvas, using whatever
// font/size/weight/style is currently set in the controls above the
// chip row — so what you see in the preview line is what actually
// lands on the canvas. From there it's just a normal text element —
// drag it, restyle it further via the element panel, or delete it
// like anything else. The dependency is still marked "used" on
// draft.dependencies so it round-trips through save/load.
const MIN_FONT_SIZE = 1
const MAX_FONT_SIZE = 50
const DEFAULT_FONT_SIZE = 3.5 // small enough that even the longest
// token ("DiscountPercentage" style names) fits inside a 200-unit-wide
// canvas without overflowing — see approxW math in VoucherCanvas's
// elementBounds, ~0.55 * fontSize per character.

const WEIGHTS = [
  { label: 'Regular', value: 400 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'Black', value: 800 },
]

export function DependenciesPanel({ draft, updateDraft, onSelect }) {
  const dependencies = draft.dependencies || {}
  const elements = draft.elements || []

  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  // Separate string buffer for the input itself. Lets the field go
  // empty / hold a partial value ("", "1.", "-") while typing, without
  // React snapping it back to the last committed numeric fontSize on
  // every keystroke. Only clamped into a real number on blur.
  const [fontSizeInput, setFontSizeInput] = useState(String(DEFAULT_FONT_SIZE))
  const [font, setFont] = useState(TOKEN_FONTS[0].fonts[0].value)
  const [weight, setWeight] = useState(600)
  const [italic, setItalic] = useState(false)

  function handleFontSizeChange(e) {
    const raw = e.target.value
    setFontSizeInput(raw)
    const v = parseFloat(raw)
    if (!Number.isNaN(v)) {
      // Update the committed numeric value live (for the preview) as
      // soon as what's typed parses to a real number, but don't clamp
      // yet — clamping mid-typing (e.g. forcing "1" while trying to
      // type "12") is what breaks editing.
      setFontSize(v)
    }
  }

  function handleFontSizeBlur() {
    let v = parseFloat(fontSizeInput)
    if (Number.isNaN(v)) v = DEFAULT_FONT_SIZE
    v = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, v))
    setFontSize(v)
    setFontSizeInput(String(v))
  }

  function insertToken(key, template) {
    const newEl = {
      id: makeId('text'),
      type: 'text',
      text: template,
      x: 20,
      y: 20 + (elements.length % 8) * 6, // stagger repeated inserts so they don't stack exactly
      fontSize,
      fontWeight: weight,
      fontStyle: italic ? 'italic' : 'normal',
      color: null,
      bgColor: 'transparent',
      opacity: 1,
      font,
      visible: true,
    }
    updateDraft('elements', [...elements, newEl])
    updateDraft(`dependencies.${key}`, template)
    onSelect && onSelect(newEl.id) // select it immediately so it's easy to drag/restyle further
  }

  function clearDependency(key) {
    updateDraft(`dependencies.${key}`, '')
  }

  return (
    <section className="vs-section">
      <h4 className="vs-section-title">Dependencies</h4>

      <p className="vs-section-hint">
        These map 1:1 to <code>MCoupon</code> fields. Set the style below, then click a
        field to drop its token onto the canvas as a new text box.
      </p>

      <div className="vs-dep-controls">
        <label className="vs-dep-control vs-dep-control--grow">
          <span>Font</span>
          <select value={font} onChange={(e) => setFont(e.target.value)}>
            {TOKEN_FONTS.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.fonts.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="vs-dep-control">
          <span>Size</span>
          <input
            type="number"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={0.5}
            value={fontSizeInput}
            onChange={handleFontSizeChange}
            onBlur={handleFontSizeBlur}
          />
        </label>
      </div>

      <div className="vs-dep-controls">
        <label className="vs-dep-control vs-dep-control--grow">
          <span>Weight</span>
          <select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
            {WEIGHTS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </label>

        <label className="vs-dep-control vs-dep-control--checkbox">
          <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />
          <span>Italic</span>
        </label>
      </div>

      {/* Live preview — renders at a fixed on-screen pixel size scaled
          proportionally to the chosen fontSize, so relative size
          differences between fields are visible without needing an
          actual SVG canvas here. */}
      <div className="vs-dep-preview">
        <span
          style={{
            fontFamily: font,
            fontWeight: weight,
            fontStyle: italic ? 'italic' : 'normal',
            fontSize: `${Math.min(fontSize * 2.6, 34)}px`,
            color: '#8F5720',
            whiteSpace: 'nowrap',
          }}
        >
          {'Hello World'}
        </span>
      </div>

      <div className="vs-preset-row vs-preset-row--compact">
        {DEPENDENCY_FIELDS.map((f) => {
          const used = !!dependencies[f.key]
          return (
            <button
              type="button"
              key={f.key}
              className={`vs-chip vs-chip--compact ${used ? 'vs-chip--active' : ''}`}
              onClick={() => insertToken(f.key, f.template)}
              title={`Insert ${f.template} at size ${fontSize}`}
            >
              <Link2 size={11} strokeWidth={2.25} />
              {f.key}
              {used && (
                <span
                  role="button"
                  tabIndex={0}
                  className="vs-chip-clear"
                  onClick={(e) => { e.stopPropagation(); clearDependency(f.key) }}
                  aria-label={`Clear ${f.key} dependency`}
                >
                  <X size={10} strokeWidth={2.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default DependenciesPanel