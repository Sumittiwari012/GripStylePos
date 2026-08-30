// Place this file in the same folder as GetCoupon.jsx (e.g.
// src/.../GetCoupon/CheckCoupon.jsx) so the './GetCoupon.css' import below
// resolves and the toolbar/search styling matches the rest of the Coupon
// Voucher flow.
import '../GetCoupon/GetCoupon.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Search, TicketX, Loader2, Eye, X, Download, ChevronDown, ChevronRight } from 'lucide-react'
import _ from 'lodash'
// npm install html2canvas — used to rasterize both the modal preview and
// the per-row artwork queued for PDF export, since VoucherCanvas's exact
// DOM output (SVG vs plain HTML) isn't known here; capturing the rendered
// node works either way.
import html2canvas from 'html2canvas'
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

  // Surfaced next to the Download PDF button if artwork couldn't be
  // prepared for any of the selected rows.
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
  const artRef = useRef(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownloadPreview = async () => {
    if (!artRef.current) return
    setIsDownloading(true)
    try {
      const canvas = await html2canvas(artRef.current, {
        backgroundColor: '#FFFFFF',
        scale: 2, // sharper output than the on-screen size
        useCORS: true, // template images (medallion art, etc.) may be cross-origin
      })
      const dataUrl = canvas.toDataURL('image/png')
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
  // Instead of opening a browser print dialog, the selected rows' actual
  // coupon images (the same VoucherCanvas design used in the preview
  // modal) are rasterized and bundled straight into a downloadable PDF —
  // one coupon per page. Each page's dimensions are taken from that
  // coupon's own rendered size (measured via getBoundingClientRect on its
  // off-screen node), so the PDF page is exactly the shape of the
  // template — not a fixed A4/Letter sheet with the artwork centered or
  // cropped inside it. Different templates in the same export can each
  // have their own page size.
  const [isPreparingPdf, setIsPreparingPdf] = useState(false)
  // Queue of { key, name, design } rendered off-screen so html2canvas has
  // real DOM nodes to rasterize. Cleared once the PDF has been generated.
  const [printItems, setPrintItems] = useState([])
  const printNodeRefs = useRef({})

  const handleDownloadSelectedPdf = async () => {
    const selectedRows = []
    groupedRows.forEach((group) => {
      group.rows.forEach((row, idx) => {
        if (selectedKeys.has(rowKey(group.couponId, idx))) selectedRows.push(row)
      })
    })
    if (selectedRows.length === 0) return

    setPrintError('')
    setIsPreparingPdf(true)

    try {
      // Local copy so repeated coupon ids within the selection (multiple
      // assignment rows for the same coupon) only fetch artwork once, and
      // so we're not relying on React state updates landing between awaits.
      const localDesignCache = { ...designCache }
      const items = []

      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i]
        const preview = extractPreviewFields(row)
        if (preview.couponId == null || preview.templateId == null) continue

        let design = localDesignCache[preview.couponId]
        if (!design) {
          try {
            design = await fetchCouponUiDesign(preview.couponId, preview.templateId)
            localDesignCache[preview.couponId] = design
          } catch (err) {
            console.error('Failed to load artwork for coupon', preview.couponId, err)
            continue // skip rows whose artwork can't be loaded, export the rest
          }
        }

        const overridden = applyCouponOverrides(design, preview)
        const codeValueForRow = getStoredCodeValue(preview.couponId, preview.couponUniqueCode)
        const merged = withCodeValue(overridden, codeValueForRow)

        items.push({
          key: `pdf-${rowKey(preview.couponId, i)}`,
          name: preview.name || preview.couponUniqueCode || `Coupon ${preview.couponId}`,
          design: merged,
        })
      }

      // Fold any newly-fetched designs back into the shared cache so the
      // preview modal doesn't have to re-fetch them later.
      setDesignCache((cur) => ({ ...cur, ...localDesignCache }))

      if (items.length === 0) {
        setPrintError("Couldn't load artwork for the selected coupons.")
        setIsPreparingPdf(false)
        return
      }

      // Rendering + rasterizing + PDF assembly happens in the effect below
      // once these off-screen nodes have actually painted.
      setPrintItems(items)
    } catch (err) {
      console.error('Failed to prepare coupons for PDF export:', err)
      setPrintError('Could not prepare the selected coupons for PDF export.')
      setIsPreparingPdf(false)
    }
  }

  // Once printItems are queued, wait a couple of frames for the off-screen
  // VoucherCanvas nodes (and any images inside them) to paint, rasterize
  // each one, then assemble a PDF — one page per coupon, each page sized
  // to that coupon's own rendered dimensions — and trigger its download.
  useEffect(() => {
    if (printItems.length === 0) return
    let cancelled = false

    const run = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      let pdf = null

      for (const item of printItems) {
        const node = printNodeRefs.current[item.key]
        if (!node) continue
        try {
          // The node's actual rendered CSS-pixel size — this becomes the
          // PDF page's dimensions, so the page shape always matches the
          // template rather than a fixed paper size.
          const rect = node.getBoundingClientRect()
          const pageWidth = rect.width
          const pageHeight = rect.height
          if (!pageWidth || !pageHeight) continue

          const canvas = await html2canvas(node, {
            backgroundColor: '#FFFFFF',
            scale: 2, // rasterize at higher resolution for a crisp printed/zoomed result
            useCORS: true,
          })
          const dataUrl = canvas.toDataURL('image/png')
          const orientation = pageWidth >= pageHeight ? 'landscape' : 'portrait'

          if (!pdf) {
            // First page also defines the jsPDF document's initial size.
            pdf = new jsPDF({
              orientation,
              unit: 'px',
              format: [pageWidth, pageHeight],
              hotfixes: ['px_scaling'],
            })
          } else {
            // Each subsequent page gets its own [width, height], so a
            // mixed selection of differently-sized templates still gets
            // one correctly-sized page per coupon.
            pdf.addPage([pageWidth, pageHeight], orientation)
          }

          // Image is drawn to fill the page exactly, since the page was
          // sized to match it (the higher-resolution canvas is simply
          // downscaled to fit — quality comes from the scale:2 capture,
          // not from the page size).
          pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight)
        } catch (err) {
          console.error('Failed to rasterize coupon for PDF:', item.key, err)
        }
      }

      if (cancelled) return

      if (!pdf) {
        setPrintError('Could not prepare the selected coupons for PDF export.')
        setPrintItems([])
        setIsPreparingPdf(false)
        return
      }

      const fileName =
        printItems.length === 1
          ? `${(printItems[0].name || 'coupon').toString().trim().replace(/\s+/g, '_')}.pdf`
          : `coupons_${new Date().toISOString().slice(0, 10)}.pdf`

      pdf.save(fileName)

      setPrintItems([])
      setIsPreparingPdf(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [printItems])

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
          {isPreparingPdf ? (
            <Loader2 size={16} strokeWidth={2.25} className="gc-spin" />
          ) : (
            <Download size={16} strokeWidth={2.25} />
          )}
          {isPreparingPdf ? 'Preparing…' : `Download PDF${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
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

              const overridden = applyCouponOverrides(design, previewRow)
              const merged = withCodeValue(overridden, codeValue)

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
                  <div className="gc-art" ref={artRef}>
                    <VoucherCanvas design={merged} />
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Off-screen render target for the PDF export flow: each selected
          coupon's design is mounted here (never visible to the user) so
          html2canvas has a real DOM node per coupon to rasterize, and so
          getBoundingClientRect() can measure its true rendered size for
          the PDF page dimensions. Cleared as soon as the PDF is generated. */}
      {printItems.length > 0 && (
        <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: -99999, pointerEvents: 'none' }}>
          {printItems.map((item) => (
            <div
              key={item.key}
              ref={(el) => {
                printNodeRefs.current[item.key] = el
              }}
              className="gc-art"
            >
              <VoucherCanvas design={item.design} />
            </div>
          ))}
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