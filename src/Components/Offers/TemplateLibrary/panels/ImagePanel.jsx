import React, { useState } from 'react'
import { Trash2, Link2, Eye, EyeOff } from 'lucide-react'

// Generates a reasonably-unique id for freeform elements the same way
// ShapesPanel/TextPanel do — swap this for a shared helper if you have
// one in lib/design.js already.
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const DEFAULT_SIZE = 50 // svg units (viewBox is 200 wide)

export function ImagePanel({ draft, updateDraft, onAdd }) {
  const [url, setUrl] = useState('')

  const elements = draft.elements || []
  const images = elements.filter((el) => el.type === 'image')

  function addImage() {
    const src = url.trim()
    if (!src) return

    // Center a new default-size box on the canvas so it's always
    // visible/reachable regardless of the current page size.
    const viewW = 200
    const viewH = 200 * (draft.heightMM / Math.max(draft.widthMM, 1))
    const width = DEFAULT_SIZE
    const height = DEFAULT_SIZE

    const el = {
      id: makeId('img'),
      type: 'image',
      x: round1((viewW - width) / 2),
      y: round1((viewH - height) / 2),
      width,
      height,
      src,
      fit: 'cover', // 'cover' | 'contain' — see VoucherCanvas preserveAspectRatio
      opacity: 1,
      rotation: 0,
      visible: true,
    }

    updateDraft('elements', [...elements, el])
    setUrl('')
    onAdd && onAdd(el.id)
  }

  function removeImage(id) {
    updateDraft('elements', elements.filter((el) => el.id !== id))
  }

  function patchImage(id, patch) {
    updateDraft('elements', elements.map((el) => (el.id === id ? { ...el, ...patch } : el)))
  }

  function toggleVisible(el) {
    patchImage(el.id, { visible: !el.visible })
  }

  return (
    <section className="vs-section">
      <h4 className="vs-section-title">Image</h4>

      <label className="vs-field">
        <span className="vs-field-label">Image URL</span>
        <div className="vs-field-row">
          <input
            type="text"
            className="vs-input"
            placeholder="https://example.com/logo.png"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addImage() }}
          />
          <button type="button" className="vs-btn vs-btn--primary vs-btn--small" onClick={addImage} disabled={!url.trim()}>
            <Link2 size={14} strokeWidth={2.25} />
            Add
          </button>
        </div>
      </label>

      <p className="vs-section-hint">
        Click any image on the canvas to select it, then drag to move, drag a corner to resize, or drag the top handle to rotate.
      </p>

      {images.length > 0 && (
        <div className="vs-element-list">
          {images.map((el) => (
            <div key={el.id} className="vs-element-row" onClick={() => onAdd && onAdd(el.id)}>
              <div className="vs-element-meta">
                <span className="vs-element-src" title={el.src}>{el.src}</span>
                <div className="vs-field-row">
                  <select
                    className="vs-input vs-input--small"
                    value={el.fit || 'cover'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => patchImage(el.id, { fit: e.target.value })}
                  >
                    <option value="cover">Fill (cover)</option>
                    <option value="contain">Fit (contain)</option>
                  </select>
                </div>
              </div>

              <div className="vs-element-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="vs-btn vs-btn--ghost vs-btn--small"
                  onClick={() => toggleVisible(el)}
                  aria-label={el.visible ? 'Hide image' : 'Show image'}
                >
                  {el.visible ? <Eye size={13} strokeWidth={2.25} /> : <EyeOff size={13} strokeWidth={2.25} />}
                </button>
                <button
                  type="button"
                  className="vs-btn vs-btn--danger vs-btn--small"
                  onClick={() => removeImage(el.id)}
                  aria-label="Delete image"
                >
                  <Trash2 size={13} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Local copy so this file has no import dependency beyond React/lucide.
// If lib/design.js already exports round1, delete this and import it
// instead (`import { round1 } from '../lib/design'`).
function round1(n) {
  return Math.round(n * 10) / 10
}

export default ImagePanel