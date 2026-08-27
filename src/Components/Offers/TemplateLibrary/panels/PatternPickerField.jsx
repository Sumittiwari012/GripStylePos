import React from 'react'
import { RefreshCcw } from 'lucide-react'
import { PATTERN_STYLES, getDefaultOpacity } from '../components/BackgroundPattern'
import { Field, ColorField } from './FormFields'

// -----------------------------------------------------------------------
// One self-contained "pick a pattern, pick its color, set its intensity"
// block. Used for the main background AND the side panel — pass a
// different `title` and a different set of value/onChange props for
// each surface you want a picker for.
// -----------------------------------------------------------------------
export function PatternPickerField({
  title,
  styleValue,
  colorValue,
  opacityValue,
  accentFallback,
  onChangeStyle,
  onChangeColor,
  onChangeOpacity,
}) {
  const effectiveOpacity =
    opacityValue != null
      ? opacityValue
      : colorValue
        ? Math.max(getDefaultOpacity(styleValue), 0.55)
        : getDefaultOpacity(styleValue)

  return (
    <section className="vs-section">
      <h4 className="vs-section-title">{title}</h4>
      <div className="vs-preset-row">
        {PATTERN_STYLES.map((p) => (
          <button
            type="button"
            key={p.value}
            className={`vs-chip ${styleValue === p.value ? 'vs-chip--active' : ''}`}
            onClick={() => onChangeStyle(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {styleValue !== 'none' && (
        <>
          <ColorField
            label="Pattern color"
            value={colorValue}
            fallback={accentFallback}
            onChange={onChangeColor}
            onClear={() => onChangeColor(null)}
          />
          <Field label="Pattern intensity">
            <div className="vs-intensity-row">
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={effectiveOpacity}
                onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
                className="vs-intensity-slider"
              />
              <span className="vs-intensity-value">{Math.round(effectiveOpacity * 100)}%</span>
              {opacityValue != null && (
                <button
                  type="button"
                  className="vs-color-clear"
                  onClick={() => onChangeOpacity(null)}
                  aria-label="Reset intensity to automatic"
                >
                  <RefreshCcw size={12} strokeWidth={2.25} />
                </button>
              )}
            </div>
          </Field>
        </>
      )}
    </section>
  )
}

export default PatternPickerField