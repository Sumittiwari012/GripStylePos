import React, { useCallback, useEffect, useState } from 'react'
import { Ticket, LibraryBig, AlertTriangle } from 'lucide-react'
import TemplateLibrary, { VoucherCanvas, getSavedTemplates } from './TemplateLibrary'

// Discount types and coupon types are now loaded from the backend
// (GET api/Coupon/DiscountType, GET api/Coupon/CouponType) rather than
// hardcoded, so option ids/labels always match whatever's seeded in
// MDiscountType / MCouponType.
const DISCOUNT_TYPE_ENDPOINT = 'https://gripstyleapi.runasp.net/api/Coupon/DiscountType'
const COUPON_TYPE_ENDPOINT = 'https://gripstyleapi.runasp.net/api/Coupon/CouponType'
// POST api/Coupon/AddCoupon — creates the coupon on the backend
// (CouponController.AddCoupon). Expects the AddCouponDTO shape:
// Name, DiscountTypeId, DIscountPercentage, DiscountAmount,
// MinSpendAmount, IssuingLastdate, ExpiryDate, MinSpendToGetCoupon,
// CouponType, TemplateId.
const ADD_COUPON_ENDPOINT = 'https://gripstyleapi.runasp.net/api/Coupon/AddCoupon'

async function fetchDiscountTypes() {
  const res = await fetch(DISCOUNT_TYPE_ENDPOINT)
  if (!res.ok) throw new Error(`Failed to load discount types (${res.status})`)
  const data = await res.json()
  // Normalize casing since System.Text.Json may serialize as camelCase
  // (id/name) or, depending on config, PascalCase (Id/Name).
  return data.map((t) => ({ id: t.id ?? t.Id, name: t.name ?? t.Name }))
}

async function fetchCouponTypes() {
  const res = await fetch(COUPON_TYPE_ENDPOINT)
  if (!res.ok) throw new Error(`Failed to load coupon types (${res.status})`)
  const data = await res.json()
  return data.map((t) => ({
    id: t.id ?? t.Id,
    name: t.couponTypeName ?? t.CouponTypeName,
  }))
}

// Posts the coupon payload to the backend. Throws with a readable message
// on non-2xx so callers can surface it in the form's error banner — the
// backend returns 400 with a plain-text body for FK validation failures
// (bad DiscountTypeId / CouponType / TemplateId), so that text is
// preferred over a generic status-code message when present.
async function addCoupon(payload) {
  const res = await fetch(ADD_COUPON_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Failed to create coupon (${res.status})`)
  }

  return res.json()
}

const EMPTY_FORM = {
  name: '',
  discountTypeId: '',
  discountValue: '',
  minSpendAmount: '',
  minSpendToGetCoupon: '',
  issuingLastDate: '',
  expiryDate: '',
  couponType: '',
  templateId: '', // holds a saved template's id (numeric backend id, as a string)
}

// Rendered by CouponVoucher when "Add Coupon" is tapped — swapped in via
// local state, not a route, so there's no /offers/coupon/add URL. The
// template library lives in its own file (./TemplateLibrary) but is
// wired the same way: tapping "Select from library" swaps this form out
// for <TemplateLibrary />, and picking a card (or hitting back) swaps it
// back in. Still no separate URL — just a second imported component.
//
// Templates themselves are no longer a fixed list — they're whatever the
// person has designed and saved in the library (persisted via the
// Template API), each identified by an id. This form just stores that
// id on the coupon. Since `getSavedTemplates()` hits the backend, it's
// async — loaded here through `refreshTemplates` rather than read
// synchronously.
//
// Field names on submit are shaped to match the MCoupon backend model
// (Name, DiscountTypeId, DIscountPercentage, DiscountAmount,
// MinSpendAmount, IssuingLastdate, ExpiryDate, MinSpendToGetCoupon,
// CouponType, TemplateId) rather than the local camelCase form state,
// and are POSTed to api/Coupon/AddCoupon via `addCoupon()` before
// `onSubmit` fires — so the parent only hears about a coupon that
// actually made it into the DB.
function AddCoupon({ onCancel = () => {}, onSubmit = () => {} }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [view, setView] = useState('form') // 'form' | 'library'
  const [savedTemplates, setSavedTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState(null)

  const [discountTypes, setDiscountTypes] = useState([])
  const [discountTypesLoading, setDiscountTypesLoading] = useState(true)
  const [discountTypesError, setDiscountTypesError] = useState(null)

  const [couponTypes, setCouponTypes] = useState([])
  const [couponTypesLoading, setCouponTypesLoading] = useState(true)
  const [couponTypesError, setCouponTypesError] = useState(null)

  // Submission state for the POST to AddCoupon — separate from the
  // load-time loading/error states above, since this only applies once
  // the person hits "Create Coupon".
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const refreshTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplatesError(null)
    try {
      const list = await getSavedTemplates()
      setSavedTemplates(list)
    } catch (e) {
      // getSavedTemplates() already swallows its own errors and resolves
      // to [], but keep this in case that ever changes.
      setSavedTemplates([])
      setTemplatesError('Could not load your saved templates.')
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  const refreshDiscountTypes = useCallback(async () => {
    setDiscountTypesLoading(true)
    setDiscountTypesError(null)
    try {
      const list = await fetchDiscountTypes()
      setDiscountTypes(list)
      // Default the form to the first discount type once loaded, but
      // only if nothing's been picked yet (don't clobber a real choice).
      setForm((prev) =>
        prev.discountTypeId === '' && list.length > 0
          ? { ...prev, discountTypeId: list[0].id }
          : prev
      )
    } catch (e) {
      setDiscountTypes([])
      setDiscountTypesError('Could not load discount types.')
    } finally {
      setDiscountTypesLoading(false)
    }
  }, [])

  const refreshCouponTypes = useCallback(async () => {
    setCouponTypesLoading(true)
    setCouponTypesError(null)
    try {
      const list = await fetchCouponTypes()
      setCouponTypes(list)
      setForm((prev) =>
        prev.couponType === '' && list.length > 0
          ? { ...prev, couponType: list[0].id }
          : prev
      )
    } catch (e) {
      setCouponTypes([])
      setCouponTypesError('Could not load coupon types.')
    } finally {
      setCouponTypesLoading(false)
    }
  }, [])

  // Load on mount, then refresh templates whenever we come back from the
  // library, since the person may have added, edited, or deleted
  // templates there. Discount/coupon types don't change from the
  // library view, so those only need to load once.
  useEffect(() => {
    if (view === 'form') {
      refreshTemplates()
    }
  }, [view, refreshTemplates])

  useEffect(() => {
    refreshDiscountTypes()
    refreshCouponTypes()
  }, [refreshDiscountTypes, refreshCouponTypes])

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleNumericSelectChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: Number(e.target.value) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const numericDiscountValue = Number(form.discountValue) || 0
    const selectedDiscountType = discountTypes.find((t) => t.id === form.discountTypeId)
    const isPercentage = (selectedDiscountType?.name || '').toLowerCase().includes('percent')

    const payload = {
      Name: form.name,
      DiscountTypeId: form.discountTypeId,
      DIscountPercentage: isPercentage ? numericDiscountValue : 0,
      DiscountAmount: isPercentage ? 0 : numericDiscountValue,
      MinSpendAmount: Number(form.minSpendAmount) || 0,
      IssuingLastdate: form.issuingLastDate,
      ExpiryDate: form.expiryDate,
      MinSpendToGetCoupon: Number(form.minSpendToGetCoupon) || 0,
      CouponType: form.couponType,
      TemplateId: form.templateId ? Number(form.templateId) : null,
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await addCoupon(payload)
      onSubmit(created)
    } catch (err) {
      setSubmitError(err.message || 'Could not create the coupon. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectTemplate = (templateId) => {
    setForm((prev) => ({ ...prev, templateId }))
    setView('form')
    // refreshTemplates() also runs via the effect above once `view`
    // flips back to 'form', so the newly picked/saved template shows up.
  }

  if (view === 'library') {
    return (
      <TemplateLibrary
        selectedTemplate={form.templateId}
        onBack={() => setView('form')}
        onSelect={handleSelectTemplate}
      />
    )
  }

  const activeTemplate = savedTemplates.find((t) => String(t.id) === String(form.templateId))
  const selectedDiscountTypeForLabel = discountTypes.find((t) => t.id === form.discountTypeId)
  const discountValueLabel = (selectedDiscountTypeForLabel?.name || '').toLowerCase().includes('percent')
    ? 'Value (%)'
    : 'Value ($)'

  return (
    <div className="ac-wrap">
      <div className="ac-banner">
        <span className="ac-banner__icon">
          <Ticket size={20} strokeWidth={2} color="#FFFFFF" />
        </span>
        <div>
          <p className="ac-banner__eyebrow">New coupon</p>
          <h2 className="ac-banner__title">Add Coupon</h2>
        </div>
      </div>

      <form className="ac-form" onSubmit={handleSubmit}>
        {submitError && (
          <p className="ac-templates-warning">
            <AlertTriangle size={14} strokeWidth={2.25} />
            {submitError}
          </p>
        )}

        <label className="ac-field">
          <span className="ac-label">Coupon name</span>
          <input
            type="text"
            required
            value={form.name}
            onChange={handleChange('name')}
            placeholder="e.g. Welcome20"
            className="ac-input"
          />
        </label>

        <label className="ac-field">
          <span className="ac-label">Coupon type</span>
          {couponTypesError && (
            <p className="ac-templates-warning">
              <AlertTriangle size={14} strokeWidth={2.25} />
              {couponTypesError}
              <button type="button" className="ac-inline-retry" onClick={refreshCouponTypes}>Retry</button>
            </p>
          )}
          <select
            value={form.couponType}
            onChange={handleNumericSelectChange('couponType')}
            className="ac-input"
            disabled={couponTypesLoading || couponTypes.length === 0}
          >
            {couponTypesLoading ? (
              <option value="">Loading…</option>
            ) : couponTypes.length === 0 ? (
              <option value="">No coupon types available</option>
            ) : (
              couponTypes.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="ac-row">
          <label className="ac-field">
            <span className="ac-label">Discount type</span>
            {discountTypesError && (
              <p className="ac-templates-warning">
                <AlertTriangle size={14} strokeWidth={2.25} />
                {discountTypesError}
                <button type="button" className="ac-inline-retry" onClick={refreshDiscountTypes}>Retry</button>
              </p>
            )}
            <select
              value={form.discountTypeId}
              onChange={handleNumericSelectChange('discountTypeId')}
              className="ac-input"
              disabled={discountTypesLoading || discountTypes.length === 0}
            >
              {discountTypesLoading ? (
                <option value="">Loading…</option>
              ) : discountTypes.length === 0 ? (
                <option value="">No discount types available</option>
              ) : (
                discountTypes.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="ac-field">
            <span className="ac-label">{discountValueLabel}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.discountValue}
              onChange={handleChange('discountValue')}
              placeholder="0"
              className="ac-input"
            />
          </label>
        </div>

        <div className="ac-row">
          <label className="ac-field">
            <span className="ac-label">Minimum spend ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minSpendAmount}
              onChange={handleChange('minSpendAmount')}
              placeholder="0"
              className="ac-input"
            />
          </label>

          <label className="ac-field">
            <span className="ac-label">Min spend to get coupon ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minSpendToGetCoupon}
              onChange={handleChange('minSpendToGetCoupon')}
              placeholder="0"
              className="ac-input"
            />
          </label>
        </div>

        <div className="ac-row">
          <label className="ac-field">
            <span className="ac-label">Coupon issuing last date</span>
            <input
              type="date"
              required
              value={form.issuingLastDate}
              onChange={handleChange('issuingLastDate')}
              className="ac-input"
            />
          </label>

          <label className="ac-field">
            <span className="ac-label">Coupon expiry date</span>
            <input
              type="date"
              required
              value={form.expiryDate}
              onChange={handleChange('expiryDate')}
              className="ac-input"
            />
          </label>
        </div>

        <label className="ac-field">
          <span className="ac-label">Select coupon template</span>

          {templatesError && (
            <p className="ac-templates-warning">
              <AlertTriangle size={14} strokeWidth={2.25} />
              {templatesError}
              <button type="button" className="ac-inline-retry" onClick={refreshTemplates}>Retry</button>
            </p>
          )}

          {templatesLoading ? (
            <div className="ac-no-templates">
              <p>Loading your saved templates…</p>
            </div>
          ) : savedTemplates.length === 0 ? (
            <div className="ac-no-templates">
              <p>No saved templates yet. Design one in the library, then pick it here.</p>
              <button type="button" onClick={() => setView('library')} className="ac-library-btn">
                <LibraryBig size={15} strokeWidth={2.25} />
                Open template library
              </button>
            </div>
          ) : (
            <div className="ac-template-row">
              <select
                value={form.templateId}
                onChange={handleChange('templateId')}
                className="ac-input ac-template-select"
              >
                <option value="" disabled>Choose a template…</option>
                {savedTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || 'Untitled voucher'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setView('library')}
                className="ac-library-btn"
              >
                <LibraryBig size={15} strokeWidth={2.25} />
                Select from library
              </button>
            </div>
          )}

          {activeTemplate && (
            <div className="ac-template-preview">
              <div
                className="ac-template-preview-canvas"
                style={{ aspectRatio: `${activeTemplate.widthMM} / ${activeTemplate.heightMM}` }}
              >
                <VoucherCanvas design={activeTemplate} />
              </div>
              <span className="ac-template-hint">
                {activeTemplate.widthMM}mm × {activeTemplate.heightMM}mm · id: {activeTemplate.id}
              </span>
            </div>
          )}
        </label>

        <div className="ac-actions">
          <button type="button" onClick={onCancel} className="ac-cancel" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="ac-submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Coupon'}
          </button>
        </div>
      </form>

      <style>{`
        .ac-wrap {
          background: #FFFFFF;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 8px 20px -12px rgba(28, 26, 36, 0.35);
        }

        .ac-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 18px;
          background: linear-gradient(155deg, #B9762E 0%, #8F5720 100%);
        }

        .ac-banner__icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .ac-banner__eyebrow {
          margin: 0 0 2px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.75);
        }

        .ac-banner__title {
          margin: 0;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 18px;
          color: #FFFFFF;
        }

        .ac-form {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .ac-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        @media (min-width: 480px) {
          .ac-row { grid-template-columns: 1fr 1fr; }
        }

        .ac-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ac-label {
          font-size: 12.5px;
          font-weight: 600;
          color: #6B6680;
        }

        .ac-input {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: #1C1A24;
          background: #F7F6FA;
          border: 1.5px solid #E3E1EA;
          border-radius: 10px;
          padding: 10px 12px;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .ac-input:focus {
          border-color: #B9762E;
        }

        .ac-no-templates {
          border: 1.5px dashed #E3E1EA;
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ac-no-templates p {
          margin: 0;
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          color: #6B6680;
        }

        .ac-templates-warning {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0;
          padding: 10px 12px;
          border-radius: 8px;
          background: #FDEEEE;
          color: #8E2E2E;
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          font-weight: 600;
        }

        .ac-inline-retry {
          margin-left: auto;
          border: none;
          background: transparent;
          color: #8E2E2E;
          font-weight: 700;
          font-size: 12.5px;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
        }

        .ac-template-row {
          display: flex;
          gap: 8px;
          align-items: stretch;
          flex-wrap: wrap;
        }

        .ac-template-select {
          flex: 1;
          min-width: 140px;
        }

        .ac-library-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1.5px dashed #B9762E;
          background: #FBF3E8;
          border-radius: 10px;
          padding: 10px 12px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13px;
          color: #8F5720;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ac-library-btn:hover { background: #F5E7D2; }
        .ac-library-btn:focus-visible { outline: 3px solid #1C1A24; outline-offset: 2px; }

        .ac-template-preview {
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ac-template-preview-canvas {
          width: 100%;
          max-width: 320px;
          border-radius: 10px;
          overflow: hidden;
          border: 1.5px solid #E3E1EA;
        }

        .ac-template-hint {
          font-family: 'Inter', sans-serif;
          font-size: 11.5px;
          color: #9C98AC;
        }

        .ac-actions {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }

        .ac-cancel {
          flex: 1;
          border: 1.5px solid #E3E1EA;
          background: #FFFFFF;
          border-radius: 10px;
          padding: 12px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: #1C1A24;
          cursor: pointer;
          transition: background 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ac-cancel:hover { background: #F7F6FA; }
        .ac-cancel:focus-visible { outline: 3px solid #1C1A24; outline-offset: 2px; }
        .ac-cancel:disabled { opacity: 0.6; cursor: not-allowed; }

        .ac-submit {
          flex: 1;
          border: none;
          background: linear-gradient(155deg, #B9762E 0%, #8F5720 100%);
          border-radius: 10px;
          padding: 12px;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 14px;
          color: #FFFFFF;
          cursor: pointer;
          transition: opacity 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ac-submit:hover { opacity: 0.92; }
        .ac-submit:focus-visible { outline: 3px solid #1C1A24; outline-offset: 2px; }
        .ac-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (prefers-reduced-motion: reduce) {
          .ac-input, .ac-cancel, .ac-submit, .ac-library-btn { transition: none; }
        }
      `}</style>
    </div>
  )
}

export default AddCoupon