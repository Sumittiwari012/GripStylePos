import React from 'react'
import { Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react'
import { elementSummary, ELEMENT_TYPE_LABELS, makeId } from '../lib/design'
import { ElementFields } from './ElementFields'

// Mirrors CanvasPanel's layout: a row of chips (one per placed element)
// picks which element is active, then a single section below shows that
// element's fields. There is no fixed set of named slots any more —
// this list is exactly `draft.elements`.
//
// Stacking is plain array order (front = last item) — Bring Forward /
// Send Backward swap adjacent elements in that single array. Dragging
// an element on the canvas also bumps it to the very end/front (see
// TemplateLibrary's onBeginDrag), so this is just the keyboard-free
// fallback for fine adjustment without touching the canvas.
export function ElementsPanel({ draft, updateDraft, selected, setSelected }) {
  const elements = draft.elements || []
  const activeIndex = elements.findIndex((el) => el.id === selected)
  const active = activeIndex >= 0 ? elements[activeIndex] : null

  const replaceElements = (next) => updateDraft('elements', next)

  const setField = (field, value) => {
    if (!active) return
    const next = elements.map((el) => (el.id === active.id ? { ...el, [field]: value } : el))
    replaceElements(next)
  }

  const remove = (id) => {
    replaceElements(elements.filter((el) => el.id !== id))
    if (selected === id) setSelected(null)
  }

  const duplicate = (id) => {
    const source = elements.find((el) => el.id === id)
    if (!source) return
    const copy = { ...source, id: makeId(source.type), x: (source.x || 0) + 4, y: (source.y || 0) + 4 }
    const next = [...elements, copy]
    replaceElements(next)
    setSelected(copy.id)
  }

  // Swaps an element with its neighbor in the flat elements array.
  const move = (id, direction) => {
    const i = elements.findIndex((el) => el.id === id)
    const j = direction === 'up' ? i + 1 : i - 1
    if (i < 0 || j < 0 || j >= elements.length) return
    const next = [...elements]
    ;[next[i], next[j]] = [next[j], next[i]]
    replaceElements(next)
  }

  if (elements.length === 0) {
    return (
      <div className="vs-section-stack">
        <section className="vs-section">
          <h4 className="vs-section-title">Elements</h4>
          <p className="vs-section-hint">Nothing placed yet — add a shape, text, image, or QR code from the Add panel.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="vs-section-stack">
      <div className="vs-preset-row">
        {elements.map((el) => (
          <button
            type="button"
            key={el.id}
            className={`vs-chip ${active?.id === el.id ? 'vs-chip--active' : ''}`}
            onClick={() => setSelected(el.id)}
          >
            {elementSummary(el)}
          </button>
        ))}
      </div>

      {active && (
        <section className="vs-section">
          <div className="vs-section-header-row">
            <h4 className="vs-section-title">{ELEMENT_TYPE_LABELS[active.type] || 'Element'}</h4>
            <label className="vs-toggle-row vs-toggle-row--inline">
              <input type="checkbox" checked={active.visible} onChange={(e) => setField('visible', e.target.checked)} />
              <span>Visible</span>
            </label>
          </div>

          <div className="vs-preset-row">
            <button type="button" className="vs-btn vs-btn--ghost vs-btn--small" onClick={() => move(active.id, 'up')} disabled={activeIndex === elements.length - 1}>
              <ArrowUp size={13} /> Bring forward
            </button>
            <button type="button" className="vs-btn vs-btn--ghost vs-btn--small" onClick={() => move(active.id, 'down')} disabled={activeIndex === 0}>
              <ArrowDown size={13} /> Send backward
            </button>
            <button type="button" className="vs-btn vs-btn--ghost vs-btn--small" onClick={() => duplicate(active.id)}>
              <Copy size={13} /> Duplicate
            </button>
            <button type="button" className="vs-btn vs-btn--ghost vs-btn--small" onClick={() => remove(active.id)}>
              <Trash2 size={13} /> Delete
            </button>
          </div>

          <ElementFields element={active} set={setField} colors={draft.colors} />
        </section>
      )}
    </div>
  )
}

export default ElementsPanel