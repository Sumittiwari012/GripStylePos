import _ from 'lodash'
import { baseDesign } from './design'

// -----------------------------------------------------------------------
// Persistence — backed by the GripStyleBackend Template API
// (TemplateController: SaveTemplate / UpdateTemplate / GetTemplate /
// GetAllTemplates / DeleteTemplate). Everything funnels through the
// small set of api* functions below; swap API_BASE if the backend is
// mounted somewhere other than same-origin `/api/Template`.
//
// The backend's Width/Height columns are `long`, but a design's
// widthMM/heightMM are often fractional (e.g. 76.2mm). Those columns are
// only used for quick sorting/filtering server-side, so we store them
// as tenths of a millimeter. The full-precision values always live in
// `Config`, which holds the entire design object (name, widthMM,
// heightMM, colors, and the freeform `elements` array) — Config is the
// source of truth on the frontend.
//
// A `dependency` element inside `elements` only ever stores which
// MCoupon field it's bound to (plus its own styling) — never a value.
// Real coupon values (Name, DiscountPercentage, DiscountAmount,
// MinSpendAmount, IssuingLastdate, ExpiryDate) live on the Coupon
// record itself, not here, and are supplied separately at render time.
// -----------------------------------------------------------------------
export const API_BASE = 'https://gripstyleapi.runasp.net/api/Template'

export function designToPayload(design) {
  return {
    templateName: design.name || 'Untitled voucher',
    width: Math.round((design.widthMM || 0) * 10),
    height: Math.round((design.heightMM || 0) * 10),
    config: design,
  }
}

// Merges the saved config back over a fresh baseDesign() so older saved
// templates that predate a newly-added top-level field (name, colors,
// etc.) still render correctly. `elements` is replaced wholesale rather
// than deep-merged — it's a freeform ordered list, not a fixed set of
// named slots, so merging it index-by-index against baseDesign()'s
// (empty) array would be meaningless. This also guarantees a template's
// saved elements — including which fields are or aren't bound as
// dependencies — always come from `entity.config` alone, never patched
// with anything else.
export function entityToDesign(entity) {
  const config = entity.config || {}
  const merged = _.mergeWith({}, baseDesign(), config, (objValue, srcValue) =>
    Array.isArray(srcValue) ? srcValue : undefined
  )
  merged.id = String(entity.id)
  merged.name = merged.name || entity.templateName || 'Untitled voucher'
  return merged
}

async function parseErrorMessage(res, fallback) {
  try {
    const body = await res.json()
    return body?.message || fallback
  } catch (e) {
    return fallback
  }
}

export async function apiGetAllTemplates() {
  const res = await fetch(`${API_BASE}/GetAllTemplates`)
  if (!res.ok) throw new Error(await parseErrorMessage(res, `Failed to load templates (${res.status}).`))
  const data = await res.json()
  return data.map(entityToDesign)
}

export async function apiGetTemplate(id) {
  const res = await fetch(`${API_BASE}/GetTemplate/${id}`)
  if (!res.ok) throw new Error(await parseErrorMessage(res, `Failed to load template (${res.status}).`))
  const data = await res.json()
  return entityToDesign(data)
}

export async function apiCreateTemplate(design) {
  const res = await fetch(`${API_BASE}/SaveTemplate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(designToPayload(design)),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res, `Failed to save template (${res.status}).`))
  const data = await res.json()
  return entityToDesign(data.template)
}

export async function apiUpdateTemplate(id, design) {
  const res = await fetch(`${API_BASE}/UpdateTemplate/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(designToPayload(design)),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res, `Failed to update template (${res.status}).`))
  const data = await res.json()
  return entityToDesign(data.template)
}

export async function apiDeleteTemplate(id) {
  const res = await fetch(`${API_BASE}/DeleteTemplate/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await parseErrorMessage(res, `Failed to delete template (${res.status}).`))
  return true
}

// Read-only helpers other components (e.g. the Add Coupon form) can use
// to list saved templates without importing the whole editor. Both hit
// the backend directly and resolve to `[]` / `null` on failure rather
// than throwing, so callers don't need their own try/catch.
export async function getSavedTemplates() {
  try {
    return await apiGetAllTemplates()
  } catch (e) {
    return []
  }
}

export async function getSavedTemplateById(id) {
  try {
    return await apiGetTemplate(id)
  } catch (e) {
    return null
  }
}