// CategorySalesDashboard.jsx
//
// Talks to SalesController:
//   GET /api/Sales/getCategory        -> [{ categorId, categoryName }]
//   GET /api/Sales/getCategoryPdts?categoryId=... ->
//       [{ id, productName, barcode, mrp, retailSalePrice, availableQuantity,
//          sales: [{ invoiceNumber, purchaseDate, soldQuantity, salePrice, isReturned }],
//          totalSoldQuantity, totalReturnedQuantity }]
//
// npm install recharts (if not already present)
import './CategorySalesDashBoard.css'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { RefreshCw, Loader2, TicketX, ChevronDown, ChevronRight } from 'lucide-react'

const API_BASE = 'https://gripstyleapi.runasp.net'

// Cycled through in order as categories are selected — distinct enough to
// stay readable when several lines overlap on the same chart.
const PALETTE = [
  '#B9762E', '#3B6EEA', '#1FA37A', '#D64545', '#8A5CD6',
  '#C99A1E', '#2FA6C9', '#E0578C', '#5C8A3A', '#7A5540',
]

function colorForIndex(i) {
  return PALETTE[i % PALETTE.length]
}

// "2026-08-15T..." -> "2026-08-15", used as the x-axis bucket (one point
// per day) so day-to-day ups and downs are visible instead of being
// smoothed away into a monthly trend.
function dayKey(dateStr) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Rolls up one category's product list (each carrying its own `sales`
// array) into { dayKey: totalForThatDay }, using either sold quantity
// or revenue (salePrice * soldQuantity) as the metric. Returned sales are
// excluded from both — mirrors the backend's own totalSoldQuantity
// definition (a returned sale isn't really "sold" from inventory's
// perspective).
function aggregateByDay(products, metric) {
  const byDay = {}
  products.forEach((product) => {
    ;(product.sales || []).forEach((sale) => {
      if (sale.isReturned) return
      const key = dayKey(sale.purchaseDate)
      if (!key) return
      const value = metric === 'revenue' ? sale.salePrice * sale.soldQuantity : sale.soldQuantity
      byDay[key] = (byDay[key] || 0) + value
    })
  })
  return byDay
}

// Merges each selected category's { dayKey: value } map into a single
// array recharts can consume directly: one row per day the data actually
// spans, one field per category. Missing days for a given category are
// filled with 0 rather than left undefined, so its area doesn't gap. The
// range is whatever the sales data covers — no artificial clamping to a
// fixed window like "Jul–Aug".
function buildChartData(categoryAggregates) {
  const allDays = new Set()
  categoryAggregates.forEach(({ byDay }) => {
    Object.keys(byDay).forEach((d) => allDays.add(d))
  })
  if (allDays.size === 0) return []

  const sortedDays = Array.from(allDays).sort()
  const [firstY, firstM, firstD] = sortedDays[0].split('-').map(Number)
  const [lastY, lastM, lastD] = sortedDays[sortedDays.length - 1].split('-').map(Number)
  const cursor = new Date(firstY, firstM - 1, firstD)
  const end = new Date(lastY, lastM - 1, lastD)

  // Walk every calendar day from the earliest to the latest sale date —
  // not just the days that had a sale — so quiet days show up as 0 on the
  // chart/table instead of being silently skipped.
  const fullRangeDays = []
  while (cursor <= end) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    fullRangeDays.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }

  return fullRangeDays.map((d) => {
    const row = { day: d, dayLabel: dayLabel(d) }
    categoryAggregates.forEach(({ categoryName, byDay }) => {
      row[categoryName] = byDay[d] || 0
    })
    return row
  })
}

function CategorySalesDashboard() {
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [categoriesError, setCategoriesError] = useState(null)

  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => new Set())

  // categoryId -> { products, loading, error }
  const [categoryData, setCategoryData] = useState({})

  const [metric, setMetric] = useState('quantity') // 'quantity' | 'revenue'
  const [expandedCategoryIds, setExpandedCategoryIds] = useState(() => new Set())

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true)
    setCategoriesError(null)
    try {
      const res = await fetch(`${API_BASE}/api/Sales/getCategory`)
      if (!res.ok) throw new Error(`Could not load categories (${res.status}).`)
      const json = await res.json()
      setCategories(Array.isArray(json) ? json : [])
    } catch (err) {
      setCategoriesError(err.message || 'Something went wrong while loading categories.')
    } finally {
      setLoadingCategories(false)
    }
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // Fetches a category's products/sales exactly once, the first time it's
  // selected — cached in categoryData so toggling it off and back on
  // doesn't re-fetch.
  const ensureCategoryData = useCallback(
    async (categoryId) => {
      setCategoryData((cur) => {
        if (cur[categoryId]) return cur // already loaded or loading
        return { ...cur, [categoryId]: { products: [], loading: true, error: null } }
      })

      try {
        const res = await fetch(`${API_BASE}/api/Sales/getCategoryPdts?categoryId=${categoryId}`)
        if (!res.ok) throw new Error(`Could not load products (${res.status}).`)
        const products = await res.json()
        setCategoryData((cur) => ({
          ...cur,
          [categoryId]: { products: Array.isArray(products) ? products : [], loading: false, error: null },
        }))
      } catch (err) {
        setCategoryData((cur) => ({
          ...cur,
          [categoryId]: { products: [], loading: false, error: err.message || 'Failed to load.' },
        }))
      }
    },
    []
  )

  const toggleCategory = (categoryId) => {
    setSelectedCategoryIds((cur) => {
      const next = new Set(cur)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
        // Fire the fetch when a category is newly checked, not on every
        // render — categoryData's own "already loaded" guard above makes
        // this safe to call repeatedly regardless.
        ensureCategoryData(categoryId)
      }
      return next
    })
  }

  const selectedCategories = useMemo(
    () => categories.filter((c) => selectedCategoryIds.has(c.categorId)),
    [categories, selectedCategoryIds]
  )

  const anySelectedStillLoading = selectedCategories.some(
    (c) => categoryData[c.categorId]?.loading
  )

  // The full day-by-day series for whatever categories/metric are
  // selected, spanning every calendar day from the earliest to the latest
  // sale — unfiltered by any date range the user picks.
  const fullChartData = useMemo(() => {
    const aggregates = selectedCategories
      .map((c) => {
        const entry = categoryData[c.categorId]
        if (!entry || entry.loading || entry.error) return null
        return {
          categoryName: c.categoryName,
          byDay: aggregateByDay(entry.products, metric),
        }
      })
      .filter(Boolean)
    return buildChartData(aggregates)
  }, [selectedCategories, categoryData, metric])

  // Bounds of the actual data, used as min/max on the date pickers so the
  // user can't pick a range outside what's available.
  const dataMinDay = fullChartData[0]?.day ?? ''
  const dataMaxDay = fullChartData[fullChartData.length - 1]?.day ?? ''

  // 'YYYY-MM-DD' strings, or '' meaning "no lower/upper bound picked yet"
  // — an empty from/to falls back to the full data range.
  const [dateRange, setDateRange] = useState({ from: '', to: '' })

  // Reset any selected range back to "show everything" whenever the
  // selected categories or metric change the underlying data, so a stale
  // range from a previous category selection doesn't silently hide data.
  useEffect(() => {
    setDateRange({ from: '', to: '' })
  }, [selectedCategoryIds, metric])

  const chartData = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return fullChartData
    return fullChartData.filter((row) => {
      if (dateRange.from && row.day < dateRange.from) return false
      if (dateRange.to && row.day > dateRange.to) return false
      return true
    })
  }, [fullChartData, dateRange])

  const clearDateRange = () => setDateRange({ from: '', to: '' })

  const toggleExpanded = (categoryId) => {
    setExpandedCategoryIds((cur) => {
      const next = new Set(cur)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const metricLabel = metric === 'revenue' ? 'Revenue (₹)' : 'Units Sold'
  const formatMetricValue = (v) =>
    metric === 'revenue' ? `₹${Number(v).toFixed(2)}` : String(v)

  return (
    <div className="csd-wrap">
      <div className="csd-header">
        <h2>Category Sales</h2>
        <div className="csd-metric-toggle">
          <button
            type="button"
            className={metric === 'quantity' ? 'csd-metric-btn active' : 'csd-metric-btn'}
            onClick={() => setMetric('quantity')}
          >
            Units Sold
          </button>
          <button
            type="button"
            className={metric === 'revenue' ? 'csd-metric-btn active' : 'csd-metric-btn'}
            onClick={() => setMetric('revenue')}
          >
            Revenue
          </button>
        </div>
        <button type="button" className="csd-refresh" onClick={loadCategories} disabled={loadingCategories}>
          <RefreshCw size={16} strokeWidth={2.25} className={loadingCategories ? 'csd-spin' : ''} />
          Refresh categories
        </button>
      </div>

      {loadingCategories && (
        <div className="csd-loading">
          <Loader2 size={20} strokeWidth={2.25} className="csd-spin" />
          <span>Loading categories…</span>
        </div>
      )}

      {!loadingCategories && categoriesError && (
        <div className="csd-empty">
          <TicketX size={28} strokeWidth={1.75} color="#B9762E" />
          <p className="csd-empty__title">Couldn't load categories</p>
          <p className="csd-empty__sub">{categoriesError}</p>
          <button type="button" className="csd-retry" onClick={loadCategories}>
            Try again
          </button>
        </div>
      )}

      {!loadingCategories && !categoriesError && (
        <>
          {/* --- Category multi-select chips --- */}
          <div className="csd-chip-row">
            {categories.map((c, i) => {
              const isSelected = selectedCategoryIds.has(c.categorId)
              return (
                <button
                  key={c.categorId}
                  type="button"
                  className={`csd-chip ${isSelected ? 'csd-chip--active' : ''}`}
                  style={isSelected ? { borderColor: colorForIndex(i), background: `${colorForIndex(i)}1A`, color: colorForIndex(i) } : undefined}
                  onClick={() => toggleCategory(c.categorId)}
                >
                  <span
                    className="csd-chip-dot"
                    style={{ background: isSelected ? colorForIndex(i) : '#D8D4E4' }}
                  />
                  {c.categoryName}
                </button>
              )
            })}
          </div>

          {/* --- Chart --- */}
          {selectedCategories.length === 0 && (
            <div className="csd-empty">
              <p className="csd-empty__title">No categories selected</p>
              <p className="csd-empty__sub">Pick one or more categories above to see their sales trend.</p>
            </div>
          )}

          {selectedCategories.length > 0 && (
            <div className="csd-chart-card">
              {!anySelectedStillLoading && fullChartData.length > 0 && (
                <div className="csd-date-filter">
                  <label className="csd-date-filter-field">
                    <span>From</span>
                    <input
                      type="date"
                      value={dateRange.from}
                      min={dataMinDay}
                      max={dateRange.to || dataMaxDay}
                      onChange={(e) => setDateRange((cur) => ({ ...cur, from: e.target.value }))}
                    />
                  </label>
                  <label className="csd-date-filter-field">
                    <span>To</span>
                    <input
                      type="date"
                      value={dateRange.to}
                      min={dateRange.from || dataMinDay}
                      max={dataMaxDay}
                      onChange={(e) => setDateRange((cur) => ({ ...cur, to: e.target.value }))}
                    />
                  </label>
                  {(dateRange.from || dateRange.to) && (
                    <button type="button" className="csd-date-filter-clear" onClick={clearDateRange}>
                      Reset range
                    </button>
                  )}
                </div>
              )}
              {anySelectedStillLoading && (
                <div className="csd-chart-loading">
                  <Loader2 size={16} strokeWidth={2.25} className="csd-spin" />
                  <span>Loading sales data…</span>
                </div>
              )}
              {chartData.length === 0 && !anySelectedStillLoading && fullChartData.length === 0 && (
                <div className="csd-empty">
                  <p className="csd-empty__sub">No sales recorded yet for the selected categories.</p>
                </div>
              )}
              {chartData.length === 0 && !anySelectedStillLoading && fullChartData.length > 0 && (
                <div className="csd-empty">
                  <p className="csd-empty__sub">No sales in the selected date range.</p>
                  <button type="button" className="csd-retry" onClick={clearDateRange}>
                    Reset range
                  </button>
                </div>
              )}
              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={380}>
                  <AreaChart data={chartData} margin={{ top: 12, right: 24, left: 4, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDEAF4" />
                    <XAxis
                      dataKey="dayLabel"
                      tick={{ fontSize: 11, fill: '#6B667F' }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#6B667F' }} width={metric === 'revenue' ? 60 : 40} />
                    <Tooltip
                      formatter={(value) => formatMetricValue(value)}
                      labelStyle={{ fontWeight: 600, color: '#1C1A24' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #E4E1EE' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    {/* Solid filled areas, like a mountain silhouette down to the
                        baseline — no gradient fade. Order matters here: categories
                        rendered later draw on top, so the smallest series should come
                        last or it'll get buried under a big one (e.g. Footwear). */}
                    {selectedCategories.map((c, i) => (
                      <Area
                        key={c.categorId}
                        type="monotone"
                        dataKey={c.categoryName}
                        stroke={colorForIndex(i)}
                        strokeWidth={2}
                        fill={colorForIndex(i)}
                        fillOpacity={0.55}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
              <p className="csd-chart-caption">
                {metricLabel} by day. Returned sales are excluded, matching how "sold out" is
                tracked on the backend.
              </p>

              {/* Every date plotted above, listed out as a plain table —
                  useful for reading exact daily values instead of hovering
                  each point on the chart. */}
              {chartData.length > 0 && (
                <div className="csd-table-wrap">
                  <table className="csd-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        {selectedCategories.map((c) => (
                          <th key={c.categorId}>{c.categoryName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => (
                        <tr key={row.day}>
                          <td>{row.dayLabel}</td>
                          {selectedCategories.map((c) => (
                            <td key={c.categorId}>{formatMetricValue(row[c.categoryName] ?? 0)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* --- Per-category product breakdown --- */}
          {selectedCategories.length > 0 && (
            <div className="csd-groups">
              {selectedCategories.map((c, i) => {
                const entry = categoryData[c.categorId]
                const isExpanded = expandedCategoryIds.has(c.categorId)
                return (
                  <div key={c.categorId} className="csd-group">
                    <button
                      type="button"
                      className="csd-group-header"
                      onClick={() => toggleExpanded(c.categorId)}
                      aria-expanded={isExpanded}
                    >
                      <span className="csd-group-header-left">
                        <span className="csd-chip-dot" style={{ background: colorForIndex(i) }} />
                        {isExpanded ? (
                          <ChevronDown size={16} strokeWidth={2.25} />
                        ) : (
                          <ChevronRight size={16} strokeWidth={2.25} />
                        )}
                        <span className="csd-group-title">{c.categoryName}</span>
                      </span>
                      <span className="csd-group-count">
                        {entry?.loading
                          ? 'Loading…'
                          : entry?.error
                          ? 'Failed to load'
                          : `${entry?.products?.length ?? 0} products`}
                      </span>
                    </button>

                    {isExpanded && entry && !entry.loading && !entry.error && (
                      <div className="csd-table-wrap">
                        <table className="csd-table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Barcode</th>
                              <th>MRP</th>
                              <th>Sale Price</th>
                              <th>Available Qty</th>
                              <th>Sold Qty</th>
                              <th>Returned Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.products.map((p) => (
                              <tr key={p.id}>
                                <td>{p.productName}</td>
                                <td>{p.barcode}</td>
                                <td>₹{Number(p.mrp).toFixed(2)}</td>
                                <td>₹{Number(p.retailSalePrice).toFixed(2)}</td>
                                <td>{p.availableQuantity}</td>
                                <td>{p.totalSoldQuantity}</td>
                                <td>{p.totalReturnedQuantity}</td>
                              </tr>
                            ))}
                            {entry.products.length === 0 && (
                              <tr>
                                <td colSpan={7} className="csd-table-empty">
                                  No products in this category.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {isExpanded && entry?.error && (
                      <p className="csd-group-error">{entry.error}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      
    </div>
  )
}

export default CategorySalesDashboard