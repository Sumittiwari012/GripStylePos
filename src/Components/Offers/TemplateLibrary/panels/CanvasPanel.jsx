import React, { useState } from 'react'
import { ArrowUpToLine, ArrowDownToLine } from 'lucide-react'
import { SIZE_PRESETS, resolveStackOrder, elementSummary, ELEMENT_LABELS } from '../lib/design'
import { ShapesPanel } from './ShapesPanel'
import { TextPanel } from './TextPanel'
import { ImagePanel } from './ImagePanel'
import { DependenciesPanel } from './DependencyPanel'
import { CodeTypePanel } from './CodeTypePanel'
const SECTIONS = [
  { key: 'size', label: 'Size' },
  { key: 'shapes', label: 'Shapes' },
  { key: 'text', label: 'Text' },
  { key: 'image', label: 'Image' },
  { key: 'qrcode', label: 'QR code' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'layers', label: 'Layers' },
]
// Human-readable label for any stackOrder key — named slots (qr,
// qrLabel) use ELEMENT_LABELS, freeform elements use elementSummary
// (which already prefers a dependency token's short sample over its
// raw {{...}} text — see lib/design.js).
function labelForKey(draft, key) {
  if (ELEMENT_LABELS[key]) return ELEMENT_LABELS[key]
  const el = (draft.elements || []).find((item) => item.id === key)
  return el ? elementSummary(el) : key
}

function LayersPanel({ draft, selected, onSelect, onBringToFront, onSendToBack }) {
  // Front = last in resolveStackOrder's array, but the most intuitive
  // reading order for a person is "front of the stack listed first" —
  // so the visible list is reversed relative to the underlying array.
  const order = [...resolveStackOrder(draft)].reverse()

  return (
    <section className="vs-section">
      <h4 className="vs-section-title">Layers</h4>
      <p className="vs-section-hint">
        Top of the list is what's drawn in front. Select a layer, then use the arrows to move it in
        front of or behind everything else — repositioning or resizing never changes this order.
      </p>

      <div className="vs-element-list">
        {order.length === 0 && (
          <p className="vs-section-hint vs-section-hint--muted">Nothing on the canvas yet.</p>
        )}
        {order.map((key) => {
          const isActive = selected === key
          return (
            <div
              key={key}
              className={`vs-element-item ${isActive ? 'vs-element-item--active' : ''}`}
              onClick={() => onSelect(key)}
              role="button"
              tabIndex={0}
            >
              <span className="vs-layer-name">{labelForKey(draft, key)}</span>
              <span className="vs-layer-actions">
                <button
                  type="button"
                  className="vs-layer-btn"
                  title="Bring to front"
                  onClick={(e) => { e.stopPropagation(); onBringToFront(key) }}
                >
                  <ArrowUpToLine size={13} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  className="vs-layer-btn"
                  title="Send to back"
                  onClick={(e) => { e.stopPropagation(); onSendToBack(key) }}
                >
                  <ArrowDownToLine size={13} strokeWidth={2.25} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function CanvasPanel({ draft, updateDraft, onAddElement, selected, onSelect, onBringToFront, onSendToBack }) {
  const [activeSection, setActiveSection] = useState('size')

  const activePreset = SIZE_PRESETS.find(
    (p) => p.widthMM === draft.widthMM && p.heightMM === draft.heightMM
  )

  const applyPreset = (preset) => {
    updateDraft('widthMM', preset.widthMM)
    updateDraft('heightMM', preset.heightMM)
  }

  return (
    <div className="vs-section-stack">
      <div className="vs-preset-row">
        {SECTIONS.map((s) => (
          <button
            type="button"
            key={s.key}
            className={`vs-chip ${activeSection === s.key ? 'vs-chip--active' : ''}`}
            onClick={() => setActiveSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'size' && (
        <section className="vs-section">
          <h4 className="vs-section-title">Size</h4>
          <div className="vs-preset-row">
            {SIZE_PRESETS.map((p) => (
              <button
                type="button"
                key={p.label}
                className={`vs-chip ${activePreset?.label === p.label ? 'vs-chip--active' : ''}`}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="vs-field-row">
            <label className="vs-field">
              <span className="vs-field-label">Width (mm)</span>
              <input
                type="number"
                className="vs-input vs-input--number"
                value={draft.widthMM}
                step={0.1}
                min={1}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  updateDraft('widthMM', Number.isFinite(v) ? v : draft.widthMM)
                }}
              />
            </label>
            <label className="vs-field">
              <span className="vs-field-label">Height (mm)</span>
              <input
                type="number"
                className="vs-input vs-input--number"
                value={draft.heightMM}
                step={0.1}
                min={1}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  updateDraft('heightMM', Number.isFinite(v) ? v : draft.heightMM)
                }}
              />
            </label>
          </div>

          <p className="vs-section-hint">
            {draft.widthMM}mm × {draft.heightMM}mm — {(draft.widthMM / 25.4).toFixed(2)}in × {(draft.heightMM / 25.4).toFixed(2)}in
          </p>
        </section>
      )}

      {activeSection === 'shapes' && (
        <ShapesPanel draft={draft} updateDraft={updateDraft} onAdd={onAddElement} />
      )}

      {activeSection === 'text' && (
        <TextPanel draft={draft} updateDraft={updateDraft} onAdd={onAddElement} />
      )}

      {activeSection === 'image' && (
        <ImagePanel draft={draft} updateDraft={updateDraft} onAdd={onAddElement} />
      )}
      {activeSection === 'qrcode' && (
        <CodeTypePanel draft={draft} updateDraft={updateDraft} />
      )}

      {activeSection === 'dependencies' && (
        <DependenciesPanel draft={draft} updateDraft={updateDraft} selected={selected} />
      )}
      {activeSection === 'layers' && (
        <LayersPanel
          draft={draft}
          selected={selected}
          onSelect={onSelect}
          onBringToFront={onBringToFront}
          onSendToBack={onSendToBack}
        />
      )}
    </div>
  )
}

export default CanvasPanel