import React from 'react'

// -----------------------------------------------------------------------
// Lets a person pick which code type(s) render in the QR slot — QR code,
// Barcode, Text — as independent toggles, not a single-select. Any
// combination is valid except all-off: at least one must always stay
// selected, since this slot can never be left with nothing to show.
// Defaults to QR code only (see baseDesign()/blankDesign() in
// lib/design.js). Persisted on draft.codeTypes as three booleans.
// -----------------------------------------------------------------------

const CODE_TYPES = [
  { key: 'qrCode', label: 'QR code' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'text', label: 'Text' },
]

export function CodeTypePanel({ draft, updateDraft }) {
  const codeTypes = draft.codeTypes || { qrCode: true, barcode: false, text: false }
  const activeCount = CODE_TYPES.filter((c) => codeTypes[c.key]).length

  function toggle(key) {
    const isOn = !!codeTypes[key]
    // Block turning off the last remaining active type — never allow
    // all three to end up false at once.
    if (isOn && activeCount <= 1) return
    updateDraft(`codeTypes.${key}`, !isOn)
  }

  return (
    <section className="vs-section">
      <h4 className="vs-section-title">QR code</h4>
      <p className="vs-section-hint">
        Choose which code type(s) appear on this voucher. Any combination works, but at least one
        must always stay selected.
      </p>

      <div className="vs-preset-row">
        {CODE_TYPES.map((c) => {
          const isOn = !!codeTypes[c.key]
          const isLastActive = isOn && activeCount <= 1
          return (
            <button
              type="button"
              key={c.key}
              className={`vs-chip ${isOn ? 'vs-chip--active' : ''}`}
              onClick={() => toggle(c.key)}
              disabled={isLastActive}
              title={isLastActive ? 'At least one code type must stay selected' : undefined}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default CodeTypePanel