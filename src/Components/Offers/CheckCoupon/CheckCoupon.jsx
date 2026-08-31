// Place this file in the same folder as GetCoupon.jsx (e.g.
// src/.../GetCoupon/CheckCoupon.jsx) so the './GetCoupon.css' import below
// resolves and the toolbar/search styling matches the rest of the Coupon
// Voucher flow.
import '../GetCoupon/GetCoupon.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOMServer from 'react-dom/server'
import { RefreshCw, Search, TicketX, Loader2, Eye, X, Download, Printer, ChevronDown, ChevronRight } from 'lucide-react'
import _ from 'lodash'
// npm install jspdf — used to bundle the rasterized coupon artwork into a
// single downloadable PDF, one coupon per page.
import { jsPDF } from 'jspdf'
// Same renderer + default design shape GetCoupon.jsx uses for its preview.
// Adjust this path if CheckCoupon.jsx ends up at a different depth than
// GetCoupon.jsx relative to TemplateLibrary.
import { VoucherCanvas } from '../TemplateLibrary/components/VoucherCanvas'
import { baseDesign } from '../TemplateLibrary/lib/design'

// Adjust if your API is mounted elsewhere / behind a different host.
const API_BASE = 'https://gripstyleapi.runasp.net'

// --- Rasterization ---------------------------------------------------
// PERFORMANCE NOTE (why this replaced the old html2canvas pipeline):
// The old version mounted each coupon as real off-screen DOM, waited two
// animation frames for it to paint, then ran html2canvas over it —
// html2canvas re-implements layout/paint in JS by walking every node and
// reading its computed style, which is inherently slow and CPU-bound
// (only one node tree processed at a time). For ~174 coupons that's what
// pushed the export to ~160s, no matter how the mounting was pipelined.
//
// VoucherCanvas renders as a single <svg> root, so instead we serialize
// its markup directly (ReactDOMServer.renderToStaticMarkup — no DOM
// mount, no layout/paint wait needed at all, since size is derived
// analytically from design.widthMM/heightMM), load it into an Image, and
// draw that onto a canvas. The browser's own native SVG decoder does the
// rasterizing in one shot instead of walking the tree in JS. Because
// there's no shared live DOM involved, rasterizations can also run
// several at once (RASTERIZE_CONCURRENCY) with no layout-thrashing risk.
//
// Physical size (design.widthMM/heightMM, the same fields VoucherCanvas
// itself uses for its aspect ratio) drives the raster resolution, so
// output is print-accurate rather than tied to whatever size the
// on-screen CSS happened to render at.
const EXPORT_DPI = 300
const RASTERIZE_CONCURRENCY = 6

// Runs `fn` over `items` with at most `limit` in flight at once,
// preserving each result at its original index. Used for BOTH the
// GetCouponUi fetch and the rasterize step together (see
// runSelectedExport below) — the old version ran all fetches serially
// first and only pipelined the rasterize step, which meant ~174
// sequential network round-trips had to finish before any rasterization
// even began. Merging fetch+rasterize into a single concurrent pipeline
// removes that serial wait.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await fn(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Fetches a (possibly cross-origin) image URL and converts it to a
// base64 data: URL, caching by URL so a logo/asset reused across many
// coupons is only ever fetched once per export session. Inlining images
// this way — rather than leaving remote <image href="https://..."> refs
// in the SVG — avoids canvas tainting from cross-origin resources when
// the rasterized SVG is later drawn to a canvas.
const imageDataUrlCache = new Map()
function fetchAsDataUrl(url) {
  if (!imageDataUrlCache.has(url)) {
    const promise = fetch(url)
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('Failed to read image blob'))
            reader.readAsDataURL(blob)
          })
      )
    imageDataUrlCache.set(url, promise)
  }
  return imageDataUrlCache.get(url)
}

// Freeform Canvas-added image elements (design.elements[].type === 'image')
// are the only place VoucherCanvas can reference an external image URL —
// named slots (qr/barcode/medallion/etc.) are all drawn as vectors/text.
// Returns a design with any such http(s) src swapped for an inlined data
// URL; returns the same design unchanged if there's nothing to inline.
async function inlineExternalImages(design) {
  const elements = design.elements || []
  const targets = elements.filter(
    (el) => el.type === 'image' && typeof el.src === 'string' && /^https?:\/\//i.test(el.src)
  )
  if (targets.length === 0) return design

  const resolved = await Promise.all(
    targets.map(async (el) => {
      try {
        return [el.id, await fetchAsDataUrl(el.src)]
      } catch (err) {
        console.error('Failed to inline coupon image asset:', el.src, err)
        return null
      }
    })
  )
  const dataUrlById = new Map(resolved.filter(Boolean))
  if (dataUrlById.size === 0) return design

  return {
    ...design,
    elements: elements.map((el) => (dataUrlById.has(el.id) ? { ...el, src: dataUrlById.get(el.id) } : el)),
  }
}

// Renders `design` via VoucherCanvas straight to a PNG data URL, sized to
// the coupon's true physical dimensions (design.widthMM/heightMM) at
// EXPORT_DPI. No DOM mounting, no waiting for paint — the SVG markup is
// generated statically and rasterized by the browser's native decoder.
// Returns physical size in mm (for PDF page sizing) alongside the image.
async function rasterizeDesignToPng(design, dpi = EXPORT_DPI) {
  const safeDesign = await inlineExternalImages(design)
  const widthMM = safeDesign.widthMM || 1
  const heightMM = safeDesign.heightMM || 1
  const pxPerMm = dpi / 25.4
  const outW = Math.max(1, Math.round(widthMM * pxPerMm))
  const outH = Math.max(1, Math.round(heightMM * pxPerMm))

  // VoucherCanvas renders width="100%" height="100%" for in-page
  // embedding; a standalone rasterizable document needs explicit pixel
  // dimensions instead, plus its own SVG namespace declaration. Simply
  // prepending new width/height attributes (as an earlier version of this
  // did) left the original width="100%" height="100%" in place too —
  // producing a tag with the SAME attribute twice, e.g.
  // `<svg width="1181" height="591" ... width="100%" height="100%">`.
  // That's invalid XML (SVG is XML; an attribute can't repeat on one
  // tag), so the browser's Image decoder silently rejects the whole
  // document and onerror fires for every single coupon. Strip the
  // original width/height off the root <svg ...> tag before injecting
  // the export-sized ones so only one copy of each ever exists.
  const rawMarkup = ReactDOMServer.renderToStaticMarkup(<VoucherCanvas design={safeDesign} />)
  const rootSvgTagMatch = rawMarkup.match(/^<svg[^>]*>/)
  const restOfMarkup = rawMarkup.slice(rootSvgTagMatch ? rootSvgTagMatch[0].length : 0)
  const cleanedRootTag = (rootSvgTagMatch ? rootSvgTagMatch[0] : '<svg>')
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace(
      '<svg ',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" `
    )
  const markup = cleanedRootTag + restOfMarkup

  const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => {
        // Surface *what* failed to rasterize, not just that it did — a
        // bare "Failed to rasterize" with no markup/size makes this kind
        // of error impossible to diagnose after the fact.
        console.error('SVG failed to rasterize. outW/outH:', outW, outH)
        console.error('Failing SVG markup:', markup)
        reject(new Error('Failed to rasterize coupon artwork.'))
      }
      image.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)

    return { dataUrl: canvas.toDataURL('image/png'), widthMM, heightMM }
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

// Tolerates either a bare array or a { success, data } envelope, same as
// the rest of the coupon endpoints.
function unwrapEnvelope(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data
  return json
}

// Turns a backend field name into a readable header — "CouponExpiryDate" ->
// "Coupon Expiry Date", "contactNumberAssigned" -> "Contact Number Assigned".
// Purely cosmetic; the underlying key (and therefore the column's position
// and content) always comes straight from the response.
function humanizeKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

// Loose ISO-date sniff (yyyy-MM-dd, optionally with a time part) so date
// fields render as "12 Aug 2026" instead of a raw timestamp string, without
// having to know the field's name in advance.
function isDateLike(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value).getTime())
}

function formatDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (isDateLike(value)) return formatDate(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

// Pulls the fields the preview needs out of a row whose exact shape comes
// straight from GetCouponAssignment (unlike GetCoupon's rows, these are
// never passed through a normalizer). Confirmed shape from the live
// endpoint: { couponId, templateID (capital ID), couponName, couponType,
// couponExpiryDate, contactNumberAssigned, couponUniqueCode, couponCount }
// — note there's no discount info on this row, so the medallion below
// falls back to whatever GetCouponUi's template already has baked in.
function extractPreviewFields(row) {
  const couponId = row.couponId ?? row.CouponId ?? row.id ?? row.Id
  const templateId = row.templateID ?? row.templateId ?? row.TemplateID ?? row.TemplateId
  const name = row.couponName ?? row.CouponName ?? row.name ?? row.Name
  const discountPercentage = Number(row.discountPercentage ?? row.DiscountPercentage) || 0
  const discountAmount = Number(row.discountAmount ?? row.DiscountAmount) || 0
  // The value scanned off the QR/barcode/code-text defaults to this
  // coupon's own unique code, e.g. "FIRST50".
  const couponUniqueCode = row.couponUniqueCode ?? row.CouponUniqueCode ?? ''
  return { couponId, templateId, name, discountPercentage, discountAmount, couponUniqueCode }
}

// localStorage key for a per-coupon override of the value encoded into
// its QR / barcode / code-text elements. Kept separate from the design
// cache (which is in-memory only) since this is meant to persist.
function codeValueStorageKey(couponId) {
  return `checkCoupon_codeValue_${couponId}`
}

// Reads a coupon's persisted scan-value override, falling back to the
// given value (e.g. its own couponUniqueCode) if nothing was saved, or if
// localStorage isn't available.
function getStoredCodeValue(couponId, fallback) {
  try {
    const stored = localStorage.getItem(codeValueStorageKey(couponId))
    return stored ?? fallback
  } catch {
    return fallback
  }
}

// Layers a single scan value onto whichever of qr / barcode / qrText
// blocks actually exist on this design, without touching anything else.
// A block that isn't present on the design (e.g. a template with no
// barcode at all) is left untouched rather than being invented.
function withCodeValue(design, value) {
  if (!design || !value) return design
  return {
    ...design,
    qr: design.qr ? { ...design.qr, value } : design.qr,
    barcode: design.barcode ? { ...design.barcode, value } : design.barcode,
    qrText: design.qrText ? { ...design.qrText, value } : design.qrText,
  }
}

// Same call GetCoupon.jsx makes: GetCouponUi returns the template's config
// with the coupon's name + expiry already substituted server-side, merged
// over baseDesign() so any field an older template is missing falls back
// to a sane default.
async function fetchCouponUiDesign(couponId, templateId) {
  const res = await fetch(
    `${API_BASE}/api/Coupon/GetCouponUi?couponId=${couponId}&templateId=${templateId}`
  )
  if (!res.ok) throw new Error(`Failed to load coupon artwork (${res.status}).`)
  const config = unwrapEnvelope(await res.json())

  const merged = _.merge(baseDesign(), config || {})
  merged.id = String(templateId)
  return merged
}

// Same overrides GetCoupon.jsx layers on top of a GetCouponUi design: the
// discount medallion, QR payload, and corner flag text. `design` is never
// mutated.
function applyCouponOverrides(design, preview) {
  if (!design) return null

  const discountLabel =
    preview.discountPercentage > 0
      ? `${preview.discountPercentage}%`
      : preview.discountAmount > 0
      ? `₹${preview.discountAmount}`
      : design.medallion?.value

  return {
    ...design,
    medallion: design.medallion && { ...design.medallion, value: discountLabel },
    headline: design.headline && {
      ...design.headline,
      text: preview.name ? preview.name.toUpperCase() : design.headline.text,
    },
    qr: design.qr && {
      ...design.qr,
      value: preview.name
        ? `${design.qr.value}${design.qr.value.includes('?') ? '&' : '?'}code=${encodeURIComponent(preview.name)}`
        : design.qr.value,
    },
    cornerFlag: design.cornerFlag && {
      ...design.cornerFlag,
      text: preview.name ? preview.name.toUpperCase() : design.cornerFlag.text,
    },
  }
}

// Stable identifier for a row within its coupon-id group. Rows themselves
// don't carry a guaranteed unique id (assignment rows can repeat contact
// numbers etc.), so the key is the pair of (group, position-in-group) —
// stable as long as `rows` isn't reordered between renders, same
// assumption the existing `key={idx}` on <tr> already relies on.
function rowKey(couponId, idxInGroup) {
  return `${couponId}::${idxInGroup}`
}

// Opens a plain print window (no PDF, no viewer plugin) containing one
// rasterized coupon image per page, and triggers the browser's native
// print dialog directly on it once every image has actually loaded.
// `items` is [{ name, dataUrl, width, height }]. Each page gets its own
// named @page rule sized to that coupon's own rendered dimensions (Chrome/
// Edge/most modern browsers honor per-page @page sizing; browsers that
// don't will fall back to their default paper size but the content itself
// still prints correctly). Returns false if the window couldn't be opened
// (typically a pop-up blocker), so the caller can surface that.
function openCouponPrintWindow(items) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false

  const escapeAttr = (s) => String(s ?? '').replace(/"/g, '&quot;')

  const pageSizeRules = items
    .map((item, idx) => `@page coupon-page-${idx} { size: ${item.width}px ${item.height}px; margin: 0; }`)
    .join('\n')

  const pagesHtml = items
    .map(
      (item, idx) => `
      <div class="coupon-page" style="page: coupon-page-${idx};">
        <img src="${item.dataUrl}" width="${item.width}" height="${item.height}" alt="${escapeAttr(item.name)}" />
      </div>`
    )
    .join('')

  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print coupons</title>
    <style>
      @page { margin: 0; }
      ${pageSizeRules}
      html, body { margin: 0; padding: 0; background: #FFFFFF; }
      .coupon-page {
        display: flex;
        align-items: center;
        justify-content: center;
        page-break-after: always;
        break-after: page;
      }
      .coupon-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .coupon-page img { display: block; }
    </style>
  </head>
  <body>${pagesHtml}
  </body>
</html>`)
  printWindow.document.close()

  const triggerPrint = () => {
    printWindow.focus()
    printWindow.print()
  }

  const images = Array.from(printWindow.document.images)
  if (images.length === 0) {
    triggerPrint()
  } else {
    let loaded = 0
    images.forEach((img) => {
      const markLoaded = () => {
        loaded += 1
        if (loaded === images.length) triggerPrint()
      }
      if (img.complete) markLoaded()
      else {
        img.onload = markLoaded
        img.onerror = markLoaded
      }
    })
  }

  return true
}

// A checkbox that also drives its native `indeterminate` visual state
// (some-but-not-all children selected) — plain <input checked> can't
// express that on its own.
function TriStateCheckbox({ checked, indeterminate, onChange, onClick, ariaLabel }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={!!checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="cc-checkbox"
    />
  )
}

function CheckCoupon({ onCancel }) {
  // Rows are kept exactly as the backend sends them — no per-field
  // normalization — so the table always reflects whatever shape
  // GetCouponAssignment happens to return.
  const [rows, setRows] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  // --- Selection (for PDF export) -----------------------------------------
  // Set of rowKey(couponId, idxInGroup) strings. Kept independent of the
  // preview/design state below — selecting rows for export doesn't need
  // their artwork loaded up front (it's fetched on demand when exporting).
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())

  const toggleRowSelected = (key) => {
    setSelectedKeys((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setGroupSelected = (group, shouldSelect) => {
    setSelectedKeys((cur) => {
      const next = new Set(cur)
      group.rows.forEach((_row, idx) => {
        const key = rowKey(group.couponId, idx)
        if (shouldSelect) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }

  const groupSelectionState = (group) => {
    const total = group.rows.length
    const selectedCount = group.rows.reduce(
      (n, _row, idx) => n + (selectedKeys.has(rowKey(group.couponId, idx)) ? 1 : 0),
      0
    )
    return {
      all: total > 0 && selectedCount === total,
      some: selectedCount > 0 && selectedCount < total,
    }
  }

  const selectedCount = selectedKeys.size

  const clearSelection = () => setSelectedKeys(new Set())

  // Surfaced next to the Download PDF / Print buttons if artwork couldn't
  // be prepared for any of the selected rows.
  const [printError, setPrintError] = useState('')

  // --- Preview (same pattern as GetCoupon.jsx) --------------------------
  const [previewRow, setPreviewRow] = useState(null)
  // Cached/keyed by couponId, same as GetCoupon.jsx — the GetCouponUi
  // response has that specific coupon's name/expiry baked in server-side,
  // so it can't be shared across coupons. In-memory only. Also reused by
  // the PDF export flow below so exporting doesn't re-fetch artwork that's
  // already been previewed.
  const [designCache, setDesignCache] = useState({}) // { [couponId]: design }
  const [designStatus, setDesignStatus] = useState({}) // { [couponId]: 'loading' | 'error' }

  const ensureDesign = useCallback(
    async (preview) => {
      if (preview.couponId == null || preview.templateId == null) return
      if (designCache[preview.couponId] || designStatus[preview.couponId] === 'loading') return

      setDesignStatus((cur) => ({ ...cur, [preview.couponId]: 'loading' }))
      try {
        const design = await fetchCouponUiDesign(preview.couponId, preview.templateId)
        setDesignCache((cur) => ({ ...cur, [preview.couponId]: design }))
        setDesignStatus((cur) => {
          const next = { ...cur }
          delete next[preview.couponId]
          return next
        })
      } catch {
        setDesignStatus((cur) => ({ ...cur, [preview.couponId]: 'error' }))
      }
    },
    [designCache, designStatus]
  )

  const openPreview = (row) => {
    const preview = extractPreviewFields(row)
    setPreviewRow(preview)
    ensureDesign(preview)
  }
  const closePreview = () => {
    setPreviewRow(null)
    setDownloadError('')
  }

  // --- Scan value (QR / barcode / code text) ----------------------------
  // The value the person sees/edits and that gets baked into whichever of
  // qr/barcode/qrText the current design actually has. Defaults to a
  // previously-saved override (localStorage) if one exists, otherwise to
  // the coupon's own couponUniqueCode.
  const [codeValue, setCodeValue] = useState('')

  useEffect(() => {
    if (!previewRow) return
    const design = designCache[previewRow.couponId]
    if (!design) return
    setCodeValue(getStoredCodeValue(previewRow.couponId, previewRow.couponUniqueCode ?? design.qr?.value ?? ''))
  }, [previewRow, designCache])

  const handleCodeValueChange = (value) => {
    setCodeValue(value)
    if (!previewRow) return
    try {
      localStorage.setItem(codeValueStorageKey(previewRow.couponId), value)
    } catch (err) {
      console.error('Failed to persist coupon code value to localStorage:', err)
    }
  }

  // --- Download the previewed artwork as a PNG ---------------------------
  // The merged design actually being shown in the modal right now — kept
  // as its own memo (rather than only computed inline inside the JSX
  // below) so this download handler can rasterize the same thing the
  // person is looking at without re-deriving it or touching the DOM.
  const previewMergedDesign = useMemo(() => {
    if (!previewRow) return null
    const design = designCache[previewRow.couponId]
    if (!design) return null
    return withCodeValue(applyCouponOverrides(design, previewRow), codeValue)
  }, [previewRow, designCache, codeValue])

  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownloadPreview = async () => {
    if (!previewMergedDesign) return
    setIsDownloading(true)
    try {
      const { dataUrl } = await rasterizeDesignToPng(previewMergedDesign)
      const fileNameBase = (previewRow?.name || previewRow?.couponUniqueCode || 'coupon')
        .toString()
        .trim()
        .replace(/\s+/g, '_')
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${fileNameBase}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to download coupon preview:', err)
      showDownloadError()
    } finally {
      setIsDownloading(false)
    }
  }

  // Small transient banner-less error, since there's no existing banner
  // wiring inside the preview modal — just an inline note under the button.
  const [downloadError, setDownloadError] = useState('')
  const showDownloadError = () => {
    setDownloadError('Could not download the image. Please try again.')
    setTimeout(() => setDownloadError((cur) => (cur ? '' : cur)), 3200)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/CouponAssignment/GetCouponAssignment`)
      if (!res.ok) throw new Error(`Could not load created coupons (${res.status}).`)
      const json = unwrapEnvelope(await res.json())
      const list = Array.isArray(json) ? json : []
      setRows(list)
      // Column order follows the key order of the first row, which — for a
      // JSON array of same-shaped objects — matches the order the backend
      // declared them in its projection.
      setColumns(list.length > 0 ? Object.keys(list[0]) : [])
      // Row identities can shift after a refresh (new/removed assignments),
      // so any previous selection is no longer guaranteed to point at the
      // same rows — drop it rather than risk exporting the wrong ones.
      setSelectedKeys(new Set())
    } catch (err) {
      setError(err.message || 'Something went wrong while loading created coupons.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      columns.some((col) => String(row[col] ?? '').toLowerCase().includes(q))
    )
  }, [rows, columns, query])

  // --- Group rows by couponId (e.g. "Coupon 7" holding every assignment
  // row for coupon id 7) ---------------------------------------------------
  const groupedRows = useMemo(() => {
    const map = new Map()
    filtered.forEach((row) => {
      const couponId = row.couponId ?? row.CouponId ?? row.id ?? row.Id ?? 'Unknown'
      if (!map.has(couponId)) map.set(couponId, [])
      map.get(couponId).push(row)
    })
    return Array.from(map.entries())
      .map(([couponId, groupRows]) => ({
        couponId,
        rows: groupRows,
        name: groupRows[0]?.couponName ?? groupRows[0]?.CouponName ?? null,
      }))
      .sort((a, b) => {
        const na = Number(a.couponId)
        const nb = Number(b.couponId)
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
        return String(a.couponId).localeCompare(String(b.couponId))
      })
  }, [filtered])

  // Which coupon-id groups are currently expanded. Starts empty (all
  // collapsed) — clicking a group's header toggles just that group.
  const [expandedCouponIds, setExpandedCouponIds] = useState(() => new Set())
  const toggleGroup = (couponId) => {
    setExpandedCouponIds((cur) => {
      const next = new Set(cur)
      if (next.has(couponId)) next.delete(couponId)
      else next.add(couponId)
      return next
    })
  }

  // --- Export the selected rows as a PDF of their voucher artwork --------
  // Instead of the old html2canvas-based pipeline (mount off-screen DOM,
  // wait for paint, walk the tree node-by-node), the selected rows' actual
  // coupon images are produced by rasterizeDesignToPng — direct SVG
  // serialization + native browser rasterization, no DOM mount needed at
  // all. Fetching each coupon's artwork (GetCouponUi) and rasterizing it
  // both happen inside the SAME concurrent worker pool
  // (RASTERIZE_CONCURRENCY in flight at once) instead of one big serial
  // fetch loop followed by a separate rasterize phase — that merge is
  // what removes the "174 sequential network round-trips before anything
  // else can start" bottleneck.
  //
  // Each page is sized to that coupon's own true physical dimensions
  // (design.widthMM/heightMM), so a mixed selection of differently-sized
  // templates still gets one correctly-sized page per coupon. The SAME
  // rasterize step backs both buttons below — "Download PDF" bundles the
  // images into a PDF and saves it; "Print" skips the PDF entirely and
  // opens a plain print window with the images, printing it directly —
  // they only diverge after rasterization.
  //
  // activePdfAction tracks which of the two actions is currently running
  // (or null when idle) so both buttons can be disabled together, while
  // each button's own spinner only lights up for its own action.
  const [activePdfAction, setActivePdfAction] = useState(null) // null | 'download' | 'print'
  const isPreparingPdf = activePdfAction !== null

  const runSelectedExport = async (action) => {
    const selectedRows = []
    groupedRows.forEach((group) => {
      group.rows.forEach((row, idx) => {
        if (selectedKeys.has(rowKey(group.couponId, idx))) selectedRows.push(row)
      })
    })
    if (selectedRows.length === 0) return

    setPrintError('')
    setActivePdfAction(action)

    try {
      // Local copy so repeated coupon ids within the selection (multiple
      // assignment rows for the same coupon) only fetch artwork once, and
      // so we're not relying on React state updates landing between
      // concurrent workers. Plain-object read/write here is fine even
      // under concurrency: a duplicate re-fetch of the same couponId from
      // two workers racing is wasted work, not a correctness bug.
      const localDesignCache = { ...designCache }

      const results = await mapWithConcurrency(selectedRows, RASTERIZE_CONCURRENCY, async (row, i) => {
        const preview = extractPreviewFields(row)
        if (preview.couponId == null || preview.templateId == null) return null

        let design = localDesignCache[preview.couponId]
        if (!design) {
          try {
            design = await fetchCouponUiDesign(preview.couponId, preview.templateId)
            localDesignCache[preview.couponId] = design
          } catch (err) {
            console.error('Failed to load artwork for coupon', preview.couponId, err)
            return null // skip rows whose artwork can't be loaded, export the rest
          }
        }

        const overridden = applyCouponOverrides(design, preview)
        const codeValueForRow = getStoredCodeValue(preview.couponId, preview.couponUniqueCode)
        const merged = withCodeValue(overridden, codeValueForRow)
        const name = preview.name || preview.couponUniqueCode || `Coupon ${preview.couponId}`

        try {
          const { dataUrl, widthMM, heightMM } = await rasterizeDesignToPng(merged)
          return { name, dataUrl, widthMM, heightMM }
        } catch (err) {
          console.error('Failed to rasterize coupon:', rowKey(preview.couponId, i), err)
          return null
        }
      })

      // Fold any newly-fetched designs back into the shared cache so the
      // preview modal doesn't have to re-fetch them later.
      setDesignCache((cur) => ({ ...cur, ...localDesignCache }))

      const rasterized = results.filter(Boolean)

      if (rasterized.length === 0) {
        setPrintError('Could not prepare the selected coupons.')
        setActivePdfAction(null)
        return
      }

      if (action === 'print') {
        // The print window sizes pages via CSS px (@page { size }), so
        // convert each coupon's true mm dimensions to px at the standard
        // 96px/inch CSS reference, independent of the raster resolution.
        const printItems = rasterized.map(({ name, dataUrl, widthMM, heightMM }) => ({
          name,
          dataUrl,
          width: Math.round((widthMM * 96) / 25.4),
          height: Math.round((heightMM * 96) / 25.4),
        }))
        const opened = openCouponPrintWindow(printItems)
        if (!opened) {
          setPrintError('Could not open the print window. Please allow pop-ups and try again.')
        }
      } else {
        let pdf = null
        rasterized.forEach(({ dataUrl, widthMM, heightMM }) => {
          const orientation = widthMM >= heightMM ? 'landscape' : 'portrait'
          if (!pdf) {
            // First page also defines the jsPDF document's initial size.
            // unit: 'mm' + the coupon's true physical size means the PDF
            // page is exactly the shape and size of the printed coupon.
            pdf = new jsPDF({ orientation, unit: 'mm', format: [widthMM, heightMM] })
          } else {
            // Each subsequent page gets its own [width, height], so a
            // mixed selection of differently-sized templates still gets
            // one correctly-sized page per coupon.
            pdf.addPage([widthMM, heightMM], orientation)
          }
          // Image fills the page exactly, at its full mm size — crispness
          // comes from the EXPORT_DPI resolution baked into the PNG, not
          // from the page's own size.
          pdf.addImage(dataUrl, 'PNG', 0, 0, widthMM, heightMM)
        })

        const fileName =
          rasterized.length === 1
            ? `${(rasterized[0].name || 'coupon').toString().trim().replace(/\s+/g, '_')}.pdf`
            : `coupons_${new Date().toISOString().slice(0, 10)}.pdf`
        pdf.save(fileName)
      }
    } catch (err) {
      console.error('Failed to prepare coupons for export:', err)
      setPrintError('Could not prepare the selected coupons for export.')
    } finally {
      setActivePdfAction(null)
    }
  }

  const handleDownloadSelectedPdf = () => runSelectedExport('download')
  const handlePrintSelectedPdf = () => runSelectedExport('print')

  return (
    <div className="gc-wrap">
      <div className="gc-toolbar">
        <div className="gc-search">
          <Search size={16} strokeWidth={2.25} color="#8A85A0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search created coupons"
            aria-label="Search created coupons"
          />
        </div>
        <button
          type="button"
          className="cc-print-button"
          onClick={handleDownloadSelectedPdf}
          disabled={selectedCount === 0 || isPreparingPdf}
          title={selectedCount === 0 ? 'Select coupons to download' : `Download ${selectedCount} selected as PDF`}
        >
          {activePdfAction === 'download' ? (
            <Loader2 size={16} strokeWidth={2.25} className="gc-spin" />
          ) : (
            <Download size={16} strokeWidth={2.25} />
          )}
          {activePdfAction === 'download' ? 'Preparing…' : `Download PDF${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </button>
        <button
          type="button"
          className="cc-print-button"
          onClick={handlePrintSelectedPdf}
          disabled={selectedCount === 0 || isPreparingPdf}
          title={selectedCount === 0 ? 'Select coupons to print' : `Print ${selectedCount} selected`}
        >
          {activePdfAction === 'print' ? (
            <Loader2 size={16} strokeWidth={2.25} className="gc-spin" />
          ) : (
            <Printer size={16} strokeWidth={2.25} />
          )}
          {activePdfAction === 'print' ? 'Preparing…' : `Print${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </button>
        {selectedCount > 0 && !isPreparingPdf && (
          <button type="button" className="cc-clear-button" onClick={clearSelection}>
            Clear selection
          </button>
        )}
        {printError && <span className="cc-print-error">{printError}</span>}
        <button type="button" className="gc-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={16} strokeWidth={2.25} className={loading ? 'gc-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="cc-loading">
          <Loader2 size={20} strokeWidth={2.25} className="gc-spin" />
          <span>Loading created coupons…</span>
        </div>
      )}

      {!loading && error && (
        <div className="gc-empty">
          <TicketX size={28} strokeWidth={1.75} color="#B9762E" />
          <p className="gc-empty__title">Couldn't load created coupons</p>
          <p className="gc-empty__sub">{error}</p>
          <button type="button" className="gc-retry" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="gc-empty">
          <TicketX size={28} strokeWidth={1.75} color="#B9762E" />
          <p className="gc-empty__title">{query ? 'No matches' : 'No coupons created yet'}</p>
          <p className="gc-empty__sub">
            {query ? 'Try a different search term.' : 'Coupons you add or assign will show up here.'}
          </p>
        </div>
      )}

      {!loading && !error && groupedRows.length > 0 && (
        <div className="cc-groups">
          {groupedRows.map((group) => {
            const isExpanded = expandedCouponIds.has(group.couponId)
            const { all: groupAllSelected, some: groupSomeSelected } = groupSelectionState(group)
            return (
              <div key={group.couponId} className="cc-group">
                <button
                  type="button"
                  className="cc-group-header"
                  onClick={() => toggleGroup(group.couponId)}
                  aria-expanded={isExpanded}
                >
                  <span className="cc-group-header-left">
                    <TriStateCheckbox
                      checked={groupAllSelected}
                      indeterminate={groupSomeSelected}
                      ariaLabel={`Select all rows in Coupon ${group.couponId}`}
                      // Stop the click from also toggling expand/collapse
                      // (the header itself is the button we're inside of).
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setGroupSelected(group, e.target.checked)}
                    />
                    {isExpanded ? (
                      <ChevronDown size={16} strokeWidth={2.25} />
                    ) : (
                      <ChevronRight size={16} strokeWidth={2.25} />
                    )}
                    <span className="cc-group-title">Coupon {group.couponId}</span>
                    {group.name && <span className="cc-group-subtitle">{group.name}</span>}
                  </span>
                  <span className="cc-group-count">
                    {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="cc-table-wrap">
                    <table className="cc-table">
                      <thead>
                        <tr>
                          <th className="cc-select-col">
                            <TriStateCheckbox
                              checked={groupAllSelected}
                              indeterminate={groupSomeSelected}
                              ariaLabel={`Select all rows in Coupon ${group.couponId}`}
                              onChange={(e) => setGroupSelected(group, e.target.checked)}
                            />
                          </th>
                          {columns.map((col) => (
                            <th key={col}>{humanizeKey(col)}</th>
                          ))}
                          <th>Preview</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, idx) => {
                          const key = rowKey(group.couponId, idx)
                          const isChecked = selectedKeys.has(key)
                          return (
                            <tr key={idx} className={isChecked ? 'cc-row-selected' : ''}>
                              <td className="cc-select-col">
                                <input
                                  type="checkbox"
                                  className="cc-checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleRowSelected(key)}
                                  aria-label="Select row for PDF export"
                                />
                              </td>
                              {columns.map((col) => (
                                <td key={col}>{formatCellValue(row[col])}</td>
                              ))}
                              <td>
                                <button
                                  type="button"
                                  className="cc-view-button"
                                  onClick={() => openPreview(row)}
                                  aria-label="View coupon"
                                  title="View coupon"
                                >
                                  <Eye size={16} strokeWidth={2.25} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {previewRow && (
        <div className="gc-overlay" onClick={closePreview}>
          <div className="gc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gc-modal__head">
              <h3>{previewRow.name || 'Coupon'}</h3>
              <div className="cc-modal-head-actions">
                <button
                  type="button"
                  className="cc-download-button"
                  onClick={handleDownloadPreview}
                  disabled={isDownloading}
                  aria-label="Download coupon image"
                  title="Download as PNG"
                >
                  {isDownloading ? (
                    <Loader2 size={16} strokeWidth={2.25} className="gc-spin" />
                  ) : (
                    <Download size={16} strokeWidth={2.25} />
                  )}
                  {isDownloading ? 'Downloading…' : 'Download'}
                </button>
                <button type="button" className="gc-modal__close" onClick={closePreview} aria-label="Close preview">
                  <X size={18} strokeWidth={2.25} />
                </button>
              </div>
            </div>
            {downloadError && <p className="cc-download-error">{downloadError}</p>}
            {(() => {
              if (previewRow.couponId == null || previewRow.templateId == null) {
                return <div className="gc-art-error">No artwork available for this coupon.</div>
              }
              const status = designStatus[previewRow.couponId]
              const design = designCache[previewRow.couponId]
              if (status === 'loading') return <div className="gc-art-skel" />
              if (status === 'error') {
                return <div className="gc-art-error">Couldn't load the coupon artwork.</div>
              }
              if (!design) return null

              const qrVisible = !!design.qr?.visible
              const barcodeVisible = !!design.barcode?.visible
              const qrTextVisible = !!design.qrText?.visible
              const anyCodeVisible = qrVisible || barcodeVisible || qrTextVisible

              const codeSourceLabels = [
                qrVisible && 'QR code',
                barcodeVisible && 'barcode',
                qrTextVisible && 'code text',
              ].filter(Boolean)

              return (
                <>
                  {anyCodeVisible && (
                    <div className="cc-code-value-row">
                      <label htmlFor="cc-code-value">
                        Scan value ({codeSourceLabels.join(', ')})
                      </label>
                      <input
                        id="cc-code-value"
                        type="text"
                        value={codeValue}
                        onChange={(e) => handleCodeValueChange(e.target.value)}
                        placeholder="Value encoded when this is scanned"
                      />
                    </div>
                  )}
                  <div className="gc-art">
                    <VoucherCanvas design={previewMergedDesign || design} />
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      <style>{`
        .cc-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 24px 4px;
          color: #6B667F;
          font-size: 14px;
          font-weight: 500;
        }

        .cc-groups {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .cc-group {
          border: 1px solid #E4E1EE;
          border-radius: 12px;
          background: #FFFFFF;
          overflow: hidden;
        }

        .cc-group-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: #FBFAFD;
          border: none;
          cursor: pointer;
          text-align: left;
        }

        .cc-group-header:hover {
          background: #F6F5FA;
        }

        .cc-group-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #1C1A24;
          min-width: 0;
        }

        .cc-group-title {
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
        }

        .cc-group-subtitle {
          font-size: 13px;
          color: #6B667F;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cc-group-count {
          font-size: 12px;
          font-weight: 600;
          color: #6B667F;
          background: #F0EEF6;
          padding: 3px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }

        .cc-group .cc-table-wrap {
          border: none;
          border-top: 1px solid #E4E1EE;
          border-radius: 0;
        }

        .cc-table-wrap {
          overflow-x: auto;
          border: 1px solid #E4E1EE;
          border-radius: 12px;
          background: #FFFFFF;
        }

        .cc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          white-space: nowrap;
        }

        .cc-table thead th {
          text-align: left;
          padding: 10px 14px;
          background: #F6F5FA;
          color: #6B667F;
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border-bottom: 1px solid #E4E1EE;
          position: sticky;
          top: 0;
        }

        .cc-table tbody td {
          padding: 10px 14px;
          color: #1C1A24;
          border-bottom: 1px solid #F0EEF6;
        }

        .cc-table tbody tr:last-child td {
          border-bottom: none;
        }

        .cc-table tbody tr:hover {
          background: #FAF9FD;
        }

        .cc-row-selected {
          background: #FBF3E8;
        }

        .cc-row-selected:hover {
          background: #F8ECDA !important;
        }

        .cc-select-col {
          width: 36px;
          text-align: center !important;
        }

        .cc-checkbox {
          width: 16px;
          height: 16px;
          accent-color: #B9762E;
          cursor: pointer;
        }

        .cc-view-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid #E4E1EE;
          background: #FFFFFF;
          color: #6B667F;
          cursor: pointer;
        }

        .cc-view-button:hover {
          background: #F6F5FA;
          color: #1C1A24;
        }

        .cc-print-button,
        .cc-clear-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid #E4E1EE;
          background: #FFFFFF;
          color: #1C1A24;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        .cc-print-button:hover,
        .cc-clear-button:hover {
          background: #F6F5FA;
        }

        .cc-print-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .cc-clear-button {
          color: #6B667F;
          border-color: transparent;
          background: transparent;
          padding: 8px 10px;
        }

        .cc-print-error {
          font-size: 12px;
          color: #B3261E;
        }

        .cc-code-value-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin: 0 0 14px;
        }

        .cc-code-value-row label {
          font-size: 12px;
          font-weight: 600;
          color: #6B667F;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .cc-code-value-row input {
          padding: 9px 12px;
          border: 1px solid #E4E1EE;
          border-radius: 8px;
          font-size: 14px;
          color: #1C1A24;
          background: #FFFFFF;
        }

        .cc-code-value-row input:focus {
          outline: none;
          border-color: #B9762E;
        }

        .cc-modal-head-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cc-download-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid #E4E1EE;
          background: #FFFFFF;
          color: #1C1A24;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .cc-download-button:hover {
          background: #F6F5FA;
        }

        .cc-download-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .cc-download-error {
          margin: 0 0 12px;
          font-size: 13px;
          color: #B3261E;
        }

        @media (min-width: 780px) {
          .cc-table-wrap {
            border-radius: 14px;
          }

          .cc-table {
            font-size: 14px;
            white-space: normal;
          }

          .cc-table thead th {
            padding: 14px 20px;
            font-size: 12px;
          }

          .cc-table tbody td {
            padding: 14px 20px;
          }
        }
      `}</style>
    </div>
  )
}

export default CheckCoupon