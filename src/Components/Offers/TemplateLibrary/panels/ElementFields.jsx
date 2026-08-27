import React from 'react'
import { Field, NumberField, ColorField } from './FormFields'
import { DISPLAY_FONTS, BODY_FONTS, SHAPE_KINDS } from '../lib/design'

function FontField({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <select className="vs-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </Field>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <select className="vs-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

// `elKey` is the element's id; `path(field)` builds the dotted update
// path for that element's field, e.g. "3.x" if elements is a flat array
// addressed by index, or the id-based path the parent's updateDraft
// expects — ElementsPanel passes in the already-resolved element object
// plus a `set(field, value)` callback so this component stays agnostic
// to how the parent addresses array items.
export function ElementFields({ element, set, colors }) {
  const fallbackColor = colors.accentDark

  // Shared geometry controls every shape/image/text/qr element uses.
  const Geometry = () => (
    <div className="vs-field-row">
      <NumberField label="X" value={element.x} onChange={(v) => set('x', v)} />
      <NumberField label="Y" value={element.y} onChange={(v) => set('y', v)} />
    </div>
  )

  const SizeAndRotation = () => (
    <>
      <div className="vs-field-row">
        <NumberField label="Width" value={element.width} min={2} onChange={(v) => set('width', v)} />
        <NumberField label="Height" value={element.height} min={2} onChange={(v) => set('height', v)} />
      </div>
      <NumberField label="Rotation" value={element.rotation || 0} step={1} onChange={(v) => set('rotation', v)} suffix="°" />
    </>
  )

  const Opacity = () => (
    <Field label="Opacity">
      <div className="vs-intensity-row">
        <input
          type="range" min={0.05} max={1} step={0.05}
          value={element.opacity ?? 1}
          onChange={(e) => set('opacity', parseFloat(e.target.value))}
          className="vs-intensity-slider"
        />
        <span className="vs-intensity-value">{Math.round((element.opacity ?? 1) * 100)}%</span>
      </div>
    </Field>
  )

    if (element.type === 'shape') {
    return (
      <>
        <SelectField label="Shape" value={element.shape} options={SHAPE_KINDS} onChange={(v) => set('shape', v)} />
        <Geometry />
        <SizeAndRotation />
        {element.shape === 'rect' && (
          <NumberField label="Corner radius" value={element.cornerRadius || 0} min={0} onChange={(v) => set('cornerRadius', v)} />
        )}
        {element.shape === 'polygon' && (
          <NumberField label="Sides" value={element.sides || 5} min={3} max={12} step={1} onChange={(v) => set('sides', v)} />
        )}
        {element.shape === 'star' && (
          <NumberField label="Points" value={element.points || 5} min={3} max={12} step={1} onChange={(v) => set('points', v)} />
        )}
        <Opacity />
      </>
    )
  }

  if (element.type === 'text') {
    return (
      <>
        <Field label="Text">
          <input className="vs-input" type="text" value={element.text} onChange={(e) => set('text', e.target.value)} />
        </Field>
        <Geometry />
        <NumberField label="Font size" value={element.fontSize} min={2} onChange={(v) => set('fontSize', v)} />
        <FontField label="Font" value={element.font} options={[...DISPLAY_FONTS, ...BODY_FONTS]} onChange={(v) => set('font', v)} />
        <NumberField label="Rotation" value={element.rotation || 0} step={1} onChange={(v) => set('rotation', v)} suffix="°" />
        <ColorField label="Color" value={element.color} fallback={fallbackColor} onChange={(v) => set('color', v)} onClear={() => set('color', null)} />
        <Opacity />
      </>
    )
  }

  if (element.type === 'image') {
    return (
      <>
        <Field label="Image URL">
          <input
            className="vs-input" type="url" placeholder="https://example.com/image.jpg"
            value={element.src || ''} onChange={(e) => set('src', e.target.value)}
          />
        </Field>
        <Geometry />
        <SizeAndRotation />
        <SelectField
          label="Fit"
          value={element.fit}
          options={[{ value: 'cover', label: 'Cover (crop to fill)' }, { value: 'contain', label: 'Contain (fit inside)' }]}
          onChange={(v) => set('fit', v)}
        />
        <Opacity />
      </>
    )
  }

  if (element.type === 'qr') {
    return (
      <>
        <Field label="Redemption link / code">
          <input className="vs-input" type="text" value={element.value} onChange={(e) => set('value', e.target.value)} />
        </Field>
        <Geometry />
        <NumberField label="Size" value={element.size} min={6} onChange={(v) => set('size', v)} />
        <ColorField label="Color" value={element.color} fallback={fallbackColor} onChange={(v) => set('color', v)} onClear={() => set('color', null)} />
      </>
    )
  }

  return null
}

export default ElementFields