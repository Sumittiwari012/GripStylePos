import React from 'react'
import { RefreshCcw } from 'lucide-react'

// -----------------------------------------------------------------------
// Small reusable field controls for the properties panel
// -----------------------------------------------------------------------
export function Field({ label, children }) {
  return (
    <label className="vs-field">
      <span className="vs-field-label">{label}</span>
      {children}
    </label>
  )
}

export function NumberField({ label, value, onChange, step = 0.5, min, max, suffix }) {
  return (
    <Field label={label}>
      <div className="vs-number-wrap">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            onChange(Number.isFinite(v) ? v : 0)
          }}
          className="vs-input vs-input--number"
        />
        {suffix && <span className="vs-suffix">{suffix}</span>}
      </div>
    </Field>
  )
}

export function ColorField({ label, value, fallback, onChange, onClear }) {
  return (
    <Field label={label}>
      <div className="vs-color-wrap">
        <input
          type="color"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
          className="vs-color-input"
        />
        <span className="vs-color-hex">{(value || fallback).toUpperCase()}</span>
        {value && (
          <button type="button" className="vs-color-clear" onClick={onClear} aria-label={`Reset ${label} to default`}>
            <RefreshCcw size={12} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </Field>
  )
}
