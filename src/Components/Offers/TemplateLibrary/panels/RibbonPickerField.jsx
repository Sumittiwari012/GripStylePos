import React from 'react'
import { RIBBON_STYLES } from '../components/RibbonLayer'
import { ColorField } from './FormFields'

export function RibbonPickerField({ styleValue, colorValue, accentFallback, onChangeStyle, onChangeColor }) {
  return (
    <section className="vs-section">
      <h4 className="vs-section-title">Ribbon</h4>
      <div className="vs-preset-row">
        {RIBBON_STYLES.map((r) => (
          <button
            type="button"
            key={r.value}
            className={`vs-chip ${styleValue === r.value ? 'vs-chip--active' : ''}`}
            onClick={() => onChangeStyle(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {styleValue !== 'none' && (
        <ColorField
          label="Ribbon color"
          value={colorValue}
          fallback={accentFallback}
          onChange={onChangeColor}
          onClear={() => onChangeColor(null)}
        />
      )}
    </section>
  )
}

export default RibbonPickerField