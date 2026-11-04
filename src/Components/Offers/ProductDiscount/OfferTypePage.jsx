import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Power } from 'lucide-react'

// Change this if your API lives on a different base URL
const API = 'https://gripstyleapi.runasp.net/api/MOffer'
const MAX_SLOTS = 10

// Offer type ids match the ones seeded in the backend (1 flat, 2 percent, 3 bxgy, 4 bundle)
export const OFFER_TYPES = {
  flat: {
    typeId: 1,
    title: 'Flat Off',
    blurb: 'A fixed amount off for the sub-categories you choose.',
    reward: 'flat',
    hasGet: false,
    base: '#2F7E72',
    deep: '#215C54',
  },
  percent: {
    typeId: 2,
    title: 'Percentage Off',
    blurb: 'A percentage off for the sub-categories you choose.',
    reward: 'percent',
    hasGet: false,
    base: '#C0503C',
    deep: '#8F392B',
  },
  bxgy: {
    typeId: 3,
    title: 'Buy X Get Y',
    blurb: 'Buy from one set of sub-categories, get another set free or discounted.',
    reward: 'getReward',
    hasGet: true,
    base: '#5B4A8A',
    deep: '#413267',
  },
  bundle: {
    typeId: 4,
    title: 'Bundle Price',
    blurb: 'A set of sub-categories sold together at one price.',
    reward: 'combo',
    hasGet: false,
    base: '#2E6DA4',
    deep: '#204E78',
  },
}

async function request(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.message) msg = body.message
      else if (body?.title) msg = body.title
    } catch {
      /* keep default message */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return null
  return res.json()
}

const emptySlot = () => ({ categoryId: '', subCategoryId: '', qty: 1 })

// ---------------- slot editor (category is only a filter, never saved) ----------------

function SlotEditor({ title, hint, slots, onChange, categories, subsByCat, ensureSubs }) {
  const update = (i, patch) =>
    onChange(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const remove = (i) => onChange(slots.filter((_, idx) => idx !== i))
  const add = () => onChange([...slots, emptySlot()])

  const takenElsewhere = (i) =>
    new Set(slots.filter((_, idx) => idx !== i).map((s) => String(s.subCategoryId)).filter(Boolean))

  return (
    <section className="of-block">
      <div className="of-block__head">
        <h2 className="of-block__title">{title}</h2>
        <span className="of-block__count">
          {slots.length}/{MAX_SLOTS}
        </span>
      </div>
      {hint && <p className="of-hint">{hint}</p>}

      {slots.map((s, i) => {
        const subs = s.categoryId ? subsByCat[s.categoryId] : null
        const taken = takenElsewhere(i)
        return (
          <div className="of-slot" key={i}>
            <select
              className="of-input"
              value={s.categoryId}
              onChange={(e) => {
                const v = e.target.value
                update(i, { categoryId: v, subCategoryId: '' })
                if (v) ensureSubs(v)
              }}
              aria-label="Category"
            >
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              className="of-input"
              value={s.subCategoryId}
              disabled={!s.categoryId || !subs}
              onChange={(e) => update(i, { subCategoryId: e.target.value })}
              aria-label="Sub-category"
            >
              <option value="">
                {!s.categoryId ? 'Pick a category first' : !subs ? 'Loading…' : 'Sub-category…'}
              </option>
              {(subs || [])
                .filter((sc) => !taken.has(String(sc.id)))
                .map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
            </select>

            <input
              className="of-input of-input--qty"
              type="number"
              min="1"
              step="1"
              value={s.qty}
              onChange={(e) => update(i, { qty: e.target.value })}
              aria-label="Quantity"
            />

            <button
              type="button"
              className="of-icon-btn"
              onClick={() => remove(i)}
              disabled={slots.length === 1}
              aria-label="Remove row"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )
      })}

      <button type="button" className="of-ghost-btn" onClick={add} disabled={slots.length >= MAX_SLOTS}>
        <Plus size={16} /> Add sub-category
      </button>
    </section>
  )
}

// ---------------- helpers for the list ----------------

function rewardText(o) {
  if (o.offerTypeId === 1) return `₹${o.flatAmount} off`
  if (o.offerTypeId === 2) return `${o.discountPercentage}% off`
  if (o.offerTypeId === 4) return `Bundle at ₹${o.comboPrice}`
  if (o.discountPercentage > 0) return `GET items ${o.discountPercentage}% off`
  if (o.flatAmount > 0) return `GET items ₹${o.flatAmount} off`
  return 'GET items free'
}

// Shows the sub-category name from the API, falling back to the id if it is ever missing
const slotsText = (slots) =>
  slots.map((s) => `${s.subCategoryName ?? `#${s.subCategoryId}`} × ${s.qty}`).join(', ')

// ---------------- the page ----------------

// onBack is supplied by ProductDiscounts, which swaps this page in on the same route
export function OfferTypePage({ config, onBack }) {
  const [categories, setCategories] = useState([])
  const [subsByCat, setSubsByCat] = useState({})
  const [offers, setOffers] = useState([])

  const [name, setName] = useState('')
  const [validTill, setValidTill] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [immuneToCoupon, setImmuneToCoupon] = useState(false)
  const [buySlots, setBuySlots] = useState([emptySlot()])
  const [getSlots, setGetSlots] = useState([emptySlot()])

  const [amount, setAmount] = useState('') // flat amount, percentage or bundle price
  const [getMode, setGetMode] = useState('free') // bxgy: free | percent | flat

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const id = 'offers-font-link'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href =
        'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  const loadOffers = useCallback(async () => {
    try {
      const all = await request(API)
      setOffers(all.filter((o) => o.offerTypeId === config.typeId))
    } catch (e) {
      setError(e.message)
    }
  }, [config.typeId])

  useEffect(() => {
    request(`${API}/categories`)
      .then(setCategories)
      .catch((e) => setError(e.message))
    loadOffers()
  }, [loadOffers])

  const ensureSubs = useCallback(
    async (catId) => {
      if (!catId || subsByCat[catId]) return
      try {
        const list = await request(`${API}/categories/${catId}/subcategories`)
        setSubsByCat((p) => ({ ...p, [catId]: list }))
      } catch (e) {
        setError(e.message)
      }
    },
    [subsByCat]
  )

  const resetForm = () => {
    setName('')
    setValidTill('')
    setIsActive(true)
    setImmuneToCoupon(false)
    setBuySlots([emptySlot()])
    setGetSlots([emptySlot()])
    setAmount('')
    setGetMode('free')
  }

  const validateSlots = (slots, label) => {
    if (slots.some((s) => !s.subCategoryId)) return `Choose a sub-category for every ${label} row`
    if (slots.some((s) => !(Number(s.qty) >= 1))) return `Every ${label} quantity must be at least 1`
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim()) return setError('Give the offer a name')

    let msg = validateSlots(buySlots, 'BUY')
    if (msg) return setError(msg)
    if (config.hasGet) {
      msg = validateSlots(getSlots, 'GET')
      if (msg) return setError(msg)
    }

    const value = Number(amount)
    let flatAmount = null
    let discountPercentage = null
    let comboPrice = null

    if (config.reward === 'flat') {
      if (!(value > 0)) return setError('Enter a flat amount greater than 0')
      flatAmount = value
    } else if (config.reward === 'percent') {
      if (!(value > 0 && value <= 100)) return setError('Percentage must be between 0 and 100')
      discountPercentage = value
    } else if (config.reward === 'combo') {
      if (!(value > 0)) return setError('Enter a bundle price greater than 0')
      comboPrice = value
    } else if (config.reward === 'getReward') {
      if (getMode === 'percent') {
        if (!(value > 0 && value <= 100)) return setError('Percentage must be between 0 and 100')
        discountPercentage = value
      } else if (getMode === 'flat') {
        if (!(value > 0)) return setError('Enter a flat amount greater than 0')
        flatAmount = value
      }
    }

    const toSlots = (list) =>
      list.map((s) => ({ subCategoryId: Number(s.subCategoryId), qty: Number(s.qty) }))

    const payload = {
      name: name.trim(),
      offerTypeId: config.typeId,
      isActive,
      validTill: validTill || null,
      immuneToCoupon,
      buySlots: toSlots(buySlots),
      getSlots: config.hasGet ? toSlots(getSlots) : [],
      comboPrice,
      discountPercentage,
      flatAmount,
    }

    setSaving(true)
    try {
      await request(API, { method: 'POST', body: JSON.stringify(payload) })
      setSuccess('Offer saved')
      resetForm()
      loadOffers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (o) => {
    setError('')
    try {
      await request(`${API}/${o.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !o.isActive }),
      })
      loadOffers()
    } catch (err) {
      setError(err.message)
    }
  }

  const removeOffer = async (o) => {
    if (!window.confirm(`Delete "${o.name}"? This cannot be undone.`)) return
    setError('')
    try {
      await request(`${API}/${o.id}`, { method: 'DELETE' })
      loadOffers()
    } catch (err) {
      setError(err.message)
    }
  }

  const rewardLabel =
    config.reward === 'flat'
      ? 'Flat amount off (₹)'
      : config.reward === 'percent'
      ? 'Discount percentage (%)'
      : config.reward === 'combo'
      ? 'Bundle price (₹)'
      : getMode === 'percent'
      ? 'Percentage off the GET items (%)'
      : 'Flat amount off the GET items (₹)'

  const showAmountInput = config.reward !== 'getReward' || getMode !== 'free'

  return (
    <div className="of-page" style={{ '--base': config.base, '--deep': config.deep }}>
      <div className="of-wrap">
        <button type="button" className="of-back" onClick={onBack}>
          <ArrowLeft size={18} strokeWidth={2.2} />
          <span>Product Discount</span>
        </button>

        <header className="of-hero">
          <h1>{config.title}</h1>
          <p>{config.blurb}</p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <section className="of-block">
            <h2 className="of-block__title">Details</h2>

            <label className="of-field">
              <span>Offer name</span>
              <input
                className="of-input"
                type="text"
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Diwali weekend special"
              />
            </label>

            <label className="of-field">
              <span>Valid till (leave empty if it never expires)</span>
              <input
                className="of-input"
                type="datetime-local"
                value={validTill}
                onChange={(e) => setValidTill(e.target.value)}
              />
            </label>

            <label className="of-check">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span>Active</span>
            </label>
            <label className="of-check">
              <input
                type="checkbox"
                checked={immuneToCoupon}
                onChange={(e) => setImmuneToCoupon(e.target.checked)}
              />
              <span>Immune to coupons (coupons can’t be used with this offer)</span>
            </label>
          </section>

          <SlotEditor
            title={config.hasGet ? 'BUY — customer buys' : 'Applies to'}
            hint="Pick a category to filter, then choose the sub-category and how many units are needed."
            slots={buySlots}
            onChange={setBuySlots}
            categories={categories}
            subsByCat={subsByCat}
            ensureSubs={ensureSubs}
          />

          {config.hasGet && (
            <SlotEditor
              title="GET — customer receives"
              hint="The sub-categories (and quantities) the customer gets."
              slots={getSlots}
              onChange={setGetSlots}
              categories={categories}
              subsByCat={subsByCat}
              ensureSubs={ensureSubs}
            />
          )}

          <section className="of-block">
            <h2 className="of-block__title">Reward</h2>

            {config.reward === 'getReward' && (
              <div className="of-radios" role="radiogroup" aria-label="GET reward">
                {[
                  ['free', 'Free'],
                  ['percent', '% off'],
                  ['flat', 'Flat ₹ off'],
                ].map(([val, label]) => (
                  <label key={val} className={`of-radio ${getMode === val ? 'is-on' : ''}`}>
                    <input
                      type="radio"
                      name="getMode"
                      value={val}
                      checked={getMode === val}
                      onChange={() => {
                        setGetMode(val)
                        setAmount('')
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}

            {showAmountInput && (
              <label className="of-field">
                <span>{rewardLabel}</span>
                <input
                  className="of-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
          </section>

          {error && (
            <p className="of-msg of-msg--error" role="alert">
              {error}
            </p>
          )}
          {success && <p className="of-msg of-msg--ok">{success}</p>}

          <button type="submit" className="of-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save offer'}
          </button>
        </form>

        <section className="of-list">
          <h2 className="of-block__title">Existing {config.title} offers</h2>
          {offers.length === 0 && <p className="of-hint">Nothing here yet.</p>}

          {offers.map((o) => {
            const status = o.isExpired ? 'Expired' : o.isActive ? 'Active' : 'Inactive'
            return (
              <article className="of-offer" key={o.id}>
                <div className="of-offer__main">
                  <div className="of-offer__top">
                    <strong>{o.name}</strong>
                    <span className={`of-badge of-badge--${status.toLowerCase()}`}>{status}</span>
                    {o.immuneToCoupon && <span className="of-badge of-badge--note">No coupons</span>}
                  </div>
                  <p className="of-offer__line">{rewardText(o)}</p>
                  <p className="of-offer__line">
                    Buy: {slotsText(o.buySlots)}
                    {config.hasGet && o.getSlots.length > 0 && <> · Get: {slotsText(o.getSlots)}</>}
                  </p>
                  {o.validTill && (
                    <p className="of-offer__line">Valid till {new Date(o.validTill).toLocaleString()}</p>
                  )}
                </div>
                <div className="of-offer__actions">
                  <button
                    type="button"
                    className="of-icon-btn"
                    onClick={() => toggleStatus(o)}
                    aria-label={o.isActive ? 'Deactivate' : 'Activate'}
                    title={o.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <Power size={16} />
                  </button>
                  <button
                    type="button"
                    className="of-icon-btn of-icon-btn--danger"
                    onClick={() => removeOffer(o)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      </div>

      <style>{`
        .of-page {
          background: #F1F0F5;
          font-family: 'Inter', system-ui, sans-serif;
          min-height: 100%;
          padding: 20px 16px 40px;
          box-sizing: border-box;
          color: #1C1A24;
        }
        .of-wrap { max-width: 640px; margin: 0 auto; }

        .of-back {
          display: inline-flex; align-items: center; gap: 6px;
          border: none; background: transparent; padding: 6px 8px 6px 0;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14px;
          color: #1C1A24; cursor: pointer; -webkit-tap-highlight-color: transparent;
        }

        .of-hero {
          margin: 10px 0 18px; padding: 18px 16px; border-radius: 18px; color: #fff;
          background: linear-gradient(155deg, var(--base) 0%, var(--deep) 100%);
          box-shadow: 0 8px 20px -10px rgba(28, 26, 36, 0.45);
        }
        .of-hero h1 {
          font-family: 'Space Grotesk', sans-serif; font-weight: 700;
          font-size: clamp(22px, 5vw, 28px); margin: 0 0 4px;
        }
        .of-hero p { margin: 0; font-size: 13px; opacity: 0.82; line-height: 1.4; }

        .of-block {
          background: #fff; border-radius: 16px; padding: 16px 14px; margin-bottom: 14px;
          box-shadow: 0 4px 14px -10px rgba(28, 26, 36, 0.4);
        }
        .of-block__head { display: flex; justify-content: space-between; align-items: baseline; }
        .of-block__title {
          font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 700;
          margin: 0 0 10px; color: #1C1A24;
        }
        .of-block__count { font-size: 12px; color: #8A85A0; font-weight: 600; }
        .of-hint { font-size: 12.5px; color: #6B667F; margin: -4px 0 12px; line-height: 1.4; }

        .of-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
        .of-field > span { font-size: 12.5px; font-weight: 600; color: #4A4560; }

        .of-input {
          width: 100%; box-sizing: border-box; min-height: 42px; padding: 9px 11px;
          border: 1.5px solid #D9D6E4; border-radius: 10px; background: #FAFAFD;
          font: inherit; font-size: 14px; color: #1C1A24;
        }
        .of-input:focus { outline: none; border-color: var(--base); background: #fff; }
        .of-input:disabled { opacity: 0.6; }

        .of-check { display: flex; align-items: center; gap: 9px; font-size: 13.5px; padding: 6px 0; cursor: pointer; }
        .of-check input { width: 18px; height: 18px; accent-color: var(--base); }

        .of-slot {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;
          padding-bottom: 10px; border-bottom: 1px dashed #E2DFEC;
        }
        .of-slot .of-input--qty { grid-column: 1; }
        .of-slot .of-icon-btn { grid-column: 2; justify-self: end; }

        .of-icon-btn {
          width: 40px; height: 40px; border-radius: 10px; border: 1.5px solid #D9D6E4;
          background: #fff; color: #4A4560; display: inline-flex; align-items: center;
          justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .of-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .of-icon-btn--danger { color: #B3261E; }

        .of-ghost-btn {
          display: inline-flex; align-items: center; gap: 6px; border: 1.5px dashed var(--base);
          background: transparent; color: var(--deep); font-weight: 600; font-size: 13.5px;
          padding: 9px 14px; border-radius: 10px; cursor: pointer;
        }
        .of-ghost-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .of-radios { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .of-radio {
          display: inline-flex; align-items: center; padding: 8px 14px; border-radius: 999px;
          border: 1.5px solid #D9D6E4; font-size: 13.5px; font-weight: 600; cursor: pointer; background: #fff;
        }
        .of-radio input { position: absolute; opacity: 0; pointer-events: none; }
        .of-radio.is-on { background: var(--base); border-color: var(--base); color: #fff; }

        .of-msg { font-size: 13.5px; border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; }
        .of-msg--error { background: #FDECEA; color: #8C1D18; }
        .of-msg--ok { background: #E6F4EA; color: #1E6B35; }

        .of-primary {
          width: 100%; min-height: 48px; border: none; border-radius: 14px; cursor: pointer;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; color: #fff;
          background: linear-gradient(155deg, var(--base) 0%, var(--deep) 100%);
          box-shadow: 0 8px 20px -10px rgba(28, 26, 36, 0.5);
        }
        .of-primary:disabled { opacity: 0.6; cursor: wait; }

        .of-list { margin-top: 28px; }
        .of-offer {
          display: flex; gap: 10px; justify-content: space-between; align-items: flex-start;
          background: #fff; border-radius: 14px; padding: 12px 12px 12px 14px; margin-bottom: 10px;
          box-shadow: 0 4px 14px -10px rgba(28, 26, 36, 0.4);
        }
        .of-offer__main { min-width: 0; }
        .of-offer__top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .of-offer__line { margin: 2px 0 0; font-size: 12.5px; color: #5C5772; line-height: 1.4; word-break: break-word; }
        .of-offer__actions { display: flex; gap: 6px; flex-shrink: 0; }

        .of-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
        .of-badge--active { background: #E6F4EA; color: #1E6B35; }
        .of-badge--inactive { background: #ECEAF2; color: #5C5772; }
        .of-badge--expired { background: #FDECEA; color: #8C1D18; }
        .of-badge--note { background: #FFF1DA; color: #8F5720; }

        @media (min-width: 480px) {
          .of-slot { grid-template-columns: 1.2fr 1.2fr 80px 40px; align-items: center; }
          .of-slot .of-input--qty, .of-slot .of-icon-btn { grid-column: auto; }
        }
      `}</style>
    </div>
  )
}

export default OfferTypePage