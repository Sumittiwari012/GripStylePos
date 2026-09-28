import './CategorySalesDashBoard.css'
import './CategorySalesDashBoard.css'
import React, { useEffect, useState } from 'react'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const API_URL =
  'https://gripstyleapi.runasp.net/api/Sales/getInvoiceTrendByCategories'

// Per-category product breakdown endpoint
const PRODUCT_API_URL =
  'https://gripstyleapi.runasp.net/api/Sales/getCategoryPdtSoldAndUnsoldQuantities'

const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'horizontalBar', label: 'Horizontal Bar' },
]

const METRICS = [
  { id: 'count', label: 'Count' },
  { id: 'sales', label: 'Sales' },
]

const MOBILE_QUERY = '(max-width: 640px)'

const formatCount = (value) =>
  new Intl.NumberFormat('en-IN').format(value)

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value ?? 0)

const formatCompactCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value ?? 0)


/* =========================================================
   MOBILE DETECTION
   ========================================================= */

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(MOBILE_QUERY).matches
      : false
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)

    setIsMobile(mql.matches)

    // Safari < 14 only supports addListener
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else mql.addListener(onChange)

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
    }
  }, [])

  return isMobile
}


/* =========================================================
   FIND A GOOD AXIS INTERVAL
   ========================================================= */

const getTickInterval = (max) => {
  if (max <= 7) return 1
  if (max <= 15) return 2
  if (max <= 30) return 5
  if (max <= 60) return 5
  if (max <= 100) return 10
  if (max <= 200) return 20
  if (max <= 500) return 50
  if (max <= 1000) return 100

  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))

  return magnitude
}


/* Nice 1/2/5 x 10^n step so the sales axis has ~5-8 ticks */
const getNiceStep = (max) => {
  if (max <= 0) return 1
  const rough = max / 6
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const n = rough / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * pow
}


/* =========================================================
   CUSTOM CLICKABLE DOT (for the line chart)
   ========================================================= */

const ClickableDot = (props) => {
  const { cx, cy, payload, onDotClick, color = '#4338ca', r = 5 } = props

  if (cx == null || cy == null) return null

  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      stroke="#fff"
      strokeWidth={1}
      style={{ cursor: 'pointer' }}
      onClick={() => onDotClick?.(payload)}
    />
  )
}


/* =========================================================
   COMPONENT
   ========================================================= */

function CategorySalesDashboard({ onRangeChange }) {
  const isMobile = useIsMobile()

  const [dateRange, setDateRange] = useState({
    from: '',
    to: '',
  })

  const [salesData, setSalesData] = useState([])

  const [status, setStatus] = useState('idle')

  const [errorMessage, setErrorMessage] = useState('')

  const [chartType, setChartType] = useState('line')

  const [metric, setMetric] = useState('count') // 'count' | 'sales'

  // ── Selected category (from clicking the chart) ──
  const [selectedCategory, setSelectedCategory] = useState(null) // { categoryId, categoryName }

  const [productData, setProductData] = useState([])

  const [productStatus, setProductStatus] = useState('idle') // idle | loading | done | error

  const [productError, setProductError] = useState('')


  /* =======================================================
     DATE RANGE
     ======================================================= */

  const updateRange = (nextRange) => {
    setDateRange(nextRange)

    onRangeChange?.(nextRange)
  }

  const clearDateRange = () => {
    updateRange({
      from: '',
      to: '',
    })
  }


  /* =======================================================
     FETCH DATA (category totals + sales for the chart)
     ======================================================= */

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) {
      setSalesData([])
      setStatus('idle')
      setErrorMessage('')
      // Clear any selected-category drilldown too — it no longer applies.
      setSelectedCategory(null)
      setProductData([])
      setProductStatus('idle')
      setProductError('')
      return
    }

    const controller = new AbortController()

    const fetchSales = async () => {
      setStatus('loading')
      setErrorMessage('')

      try {
        const params = new URLSearchParams({
          StartDate: dateRange.from,
          EndDate: dateRange.to,
        })

        const response = await fetch(`${API_URL}?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)

          throw new Error(
            body?.message || `Request failed (${response.status})`
          )
        }

        const data = await response.json()

        let formattedData = Array.isArray(data)
          ? data
              .map((item) => {
                // Use a sales field from the API if it exists
                const rawSales =
                  item.totalSales ??
                  item.TotalSales ??
                  item.totalAmount ??
                  item.TotalAmount ??
                  item.sales ??
                  item.Sales ??
                  null

                return {
                  categoryId: item.categoryId ?? item.CategoryId,
                  categoryName: item.categoryName ?? item.CategoryName,
                  count: Number(item.count ?? item.Count ?? 0),
                  sales: rawSales == null ? null : Number(rawSales),
                }
              })
              .filter((item) => item.categoryName && item.count >= 0)
          : []

        // If the API didn't return sales, compute it per category
        // from the product endpoint (MRP × quantity sold).
        if (formattedData.some((item) => item.sales == null)) {
          formattedData = await Promise.all(
            formattedData.map(async (cat) => {
              if (cat.sales != null) return cat

              try {
                const p = new URLSearchParams({
                  CategoryId: cat.categoryId,
                  StartDate: dateRange.from,
                  EndDate: dateRange.to,
                })

                const res = await fetch(`${PRODUCT_API_URL}?${p.toString()}`, {
                  signal: controller.signal,
                })

                if (!res.ok) throw new Error('product fetch failed')

                const rows = await res.json()

                const sales = Array.isArray(rows)
                  ? rows.reduce(
                      (sum, r) =>
                        sum +
                        // use r.price ?? r.Price for the actual selling price
                        Number(r.mrp ?? r.MRP ?? 0) *
                          Number(r.quantitySold ?? r.QuantitySold ?? 0),
                      0
                    )
                  : 0

                return { ...cat, sales }
              } catch (e) {
                if (e.name === 'AbortError') throw e
                return { ...cat, sales: 0 }
              }
            })
          )
        }

        /*
         * Highest count first.
         */
        formattedData.sort((a, b) => b.count - a.count)

        setSalesData(formattedData)

        setStatus('done')
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setErrorMessage(
          error.message ||
            'Something went wrong while loading category sales.'
        )

        setStatus('error')
      }
    }

    fetchSales()

    return () => {
      controller.abort()
    }
  }, [dateRange.from, dateRange.to])


  /* =======================================================
     FETCH DATA (products for the selected category)
     Fires whenever selectedCategory or the date range changes.
     ======================================================= */

  useEffect(() => {
    if (!selectedCategory || !dateRange.from || !dateRange.to) {
      return
    }

    const controller = new AbortController()

    const fetchProducts = async () => {
      setProductStatus('loading')
      setProductError('')

      try {
        const params = new URLSearchParams({
          CategoryId: selectedCategory.categoryId,
          StartDate: dateRange.from,
          EndDate: dateRange.to,
        })

        const response = await fetch(
          `${PRODUCT_API_URL}?${params.toString()}`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          const body = await response.json().catch(() => null)

          throw new Error(
            body?.message || `Request failed (${response.status})`
          )
        }

        const data = await response.json()

        const formatted = Array.isArray(data)
          ? data.map((item) => ({
              productId: item.productId ?? item.ProductId,
              productName: item.productName ?? item.ProductName,
              barcode: item.barcode ?? item.Barcode,
              price: Number(item.price ?? item.Price ?? 0),
              mrp: Number(item.mrp ?? item.MRP ?? 0),
              quantitySold: Number(
                item.quantitySold ?? item.QuantitySold ?? 0
              ),
              quantityAvailable: Number(
                item.quantityAvailable ?? item.QuantityAvailable ?? 0
              ),
            }))
          : []

        setProductData(formatted)
        setProductStatus('done')
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setProductError(
          error.message ||
            'Something went wrong while loading product details.'
        )
        setProductStatus('error')
      }
    }

    fetchProducts()

    return () => {
      controller.abort()
    }
  }, [selectedCategory, dateRange.from, dateRange.to])


  /* =======================================================
     CATEGORY CLICK HANDLER
     Works for both the Bar chart's onClick payload shape
     ({ categoryId, categoryName, ... }) and the Line chart's
     custom dot, which passes the raw data point directly.
     ======================================================= */

  const handleCategorySelect = (entry) => {
    if (!entry) return

    const categoryId = entry.categoryId ?? entry.payload?.categoryId
    const categoryName = entry.categoryName ?? entry.payload?.categoryName

    if (categoryId == null) return

    setSelectedCategory({
      categoryId,
      categoryName,
    })
  }


  /* =======================================================
     TOTALS
     ======================================================= */

  const grandTotal = salesData.reduce((total, item) => total + item.count, 0)

  const grandTotalSales = salesData.reduce(
    (total, item) => total + (item.sales ?? 0),
    0
  )


  /* =======================================================
     Y AXIS CALCULATIONS
     ======================================================= */

  const isSales = metric === 'sales'
  const metricKey = isSales ? 'sales' : 'count'
  const metricLabel = isSales ? 'Sales' : 'Count'
  const barColor = isSales ? '#f59e0b' : '#4338ca'

  const formatTick = isSales ? formatCompactCurrency : formatCount
  const formatTip = isSales ? formatCurrency : formatCount

  // Sort by the selected metric (highest first)
  const chartData = [...salesData].sort(
    (x, y) => (y[metricKey] ?? 0) - (x[metricKey] ?? 0)
  )

  const maxValue = Math.max(...chartData.map((item) => item[metricKey] ?? 0), 0)

  const tickInterval = isSales ? getNiceStep(maxValue) : getTickInterval(maxValue)

  const axisMax =
    maxValue === 0 ? 1 : Math.ceil(maxValue / tickInterval) * tickInterval

  // Always starts at 0, so the minimum is visible on the axis
  const axisTicks = Array.from(
    { length: Math.round(axisMax / tickInterval) + 1 },
    (_, index) => index * tickInterval
  )

  /* Totals for the clicked category's product table */
  const productTotals = productData.reduce(
    (t, item) => ({
      quantitySold: t.quantitySold + item.quantitySold,
      quantityAvailable: t.quantityAvailable + item.quantityAvailable,
      bill: t.bill + item.mrp * item.quantitySold,
    }),
    { quantitySold: 0, quantityAvailable: 0, bill: 0 }
  )


  /* =======================================================
     RESPONSIVE CHART SETTINGS
     ======================================================= */

  const tickStyle = { fontSize: isMobile ? 11 : 12 }
  const chartHeight = isMobile ? 340 : 450
  const xAxisHeight = isMobile ? 80 : 120
  const xAxisAngle = isMobile ? -45 : -35
  const yAxisWidth = isMobile ? (isSales ? 62 : 40) : isSales ? 80 : 60

  const verticalMargin = isMobile
    ? { top: 10, right: 12, left: 0, bottom: 10 }
    : { top: 20, right: 30, left: 30, bottom: 100 }

  const horizontalHeight = Math.max(
    chartHeight,
    chartData.length * (isMobile ? 32 : 35)
  )

  // On phones, give each category ~64px so labels never overlap;
  // the chart scrolls sideways when there are many categories.
  const verticalChartWidth = isMobile
    ? `${Math.max(chartData.length * 64, 0)}px`
    : '100%'

  const yAxisLabel = isMobile
    ? undefined
    : {
        value: isSales ? 'Sales (₹)' : 'Count',
        angle: -90,
        position: 'insideLeft',
      }


  return (
    <div className="csd-wrap">

      {/* =================================================
          DATE FILTER
      ================================================= */}

      <div className="csd-date-filter">

        <label className="csd-date-filter-field">
          <span>From</span>

          <input
            type="date"
            value={dateRange.from}
            max={dateRange.to || undefined}
            onChange={(event) => {
              updateRange({
                ...dateRange,
                from: event.target.value,
              })
            }}
          />
        </label>

        <label className="csd-date-filter-field">
          <span>To</span>

          <input
            type="date"
            value={dateRange.to}
            min={dateRange.from || undefined}
            onChange={(event) => {
              updateRange({
                ...dateRange,
                to: event.target.value,
              })
            }}
          />
        </label>

        {(dateRange.from || dateRange.to) && (
          <button
            type="button"
            className="csd-date-filter-clear"
            onClick={clearDateRange}
          >
            Reset range
          </button>
        )}

      </div>


      {/* =================================================
          CHART TABS
      ================================================= */}

      {status === 'done' && salesData.length > 0 && (
        <div className="csd-chart-tabs" role="tablist" aria-label="Metric">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={metric === m.id}
              className={`csd-chart-tab ${
                metric === m.id ? 'csd-chart-tab-active' : ''
              }`}
              onClick={() => setMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {status === 'done' && salesData.length > 0 && (
        <div className="csd-chart-tabs" role="tablist" aria-label="Chart type">
          {CHART_TYPES.map((chart) => (
            <button
              key={chart.id}
              type="button"
              role="tab"
              aria-selected={chartType === chart.id}
              className={`csd-chart-tab ${
                chartType === chart.id ? 'csd-chart-tab-active' : ''
              }`}
              onClick={() => setChartType(chart.id)}
            >
              {chart.label}
            </button>
          ))}
        </div>
      )}

      {status === 'done' && salesData.length > 0 && (
        <p className="csd-hint csd-click-hint">
          {isMobile ? 'Tap' : 'Click'} a category in the chart to see its
          product-level breakdown.
        </p>
      )}


      {/* =================================================
          CHART AREA
      ================================================= */}

      <div className="csd-chart-area">

        {status === 'idle' && (
          <p className="csd-hint">
            Pick a from and to date to see sales by category.
          </p>
        )}

        {status === 'loading' && (
          <p className="csd-hint">Loading category sales…</p>
        )}

        {status === 'error' && (
          <p className="csd-error" role="alert">
            {errorMessage}
          </p>
        )}

        {status === 'done' && salesData.length === 0 && (
          <p className="csd-hint">No sales found for that range.</p>
        )}


        {status === 'done' && salesData.length > 0 && chartType === 'line' && (
          <div className="csd-rechart csd-chart-scroll">
            <div style={{ width: verticalChartWidth, minWidth: '100%' }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart data={chartData} margin={verticalMargin}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="categoryName"
                    angle={xAxisAngle}
                    textAnchor="end"
                    interval={0}
                    height={xAxisHeight}
                    tick={tickStyle}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, axisMax]}
                    ticks={axisTicks}
                    interval={0}
                    tickFormatter={formatTick}
                    tick={tickStyle}
                    width={yAxisWidth}
                    label={yAxisLabel}
                  />
                  <Tooltip
                    formatter={(value) => [formatTip(value), metricLabel]}
                  />
                  {!isMobile && <Legend />}
                  <Line
                    type="monotone"
                    dataKey={metricKey}
                    name={metricLabel}
                    stroke={barColor}
                    strokeWidth={isMobile ? 2 : 3}
                    dot={
                      <ClickableDot
                        color={barColor}
                        r={isMobile ? 7 : 5}
                        onDotClick={handleCategorySelect}
                      />
                    }
                    activeDot={{
                      r: isMobile ? 9 : 7,
                      style: { cursor: 'pointer' },
                      onClick: (_, payloadEvent) =>
                        handleCategorySelect(payloadEvent?.payload),
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}


        {status === 'done' && salesData.length > 0 && chartType === 'bar' && (
          <div className="csd-rechart csd-chart-scroll">
            <div style={{ width: verticalChartWidth, minWidth: '100%' }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={chartData} margin={verticalMargin}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="categoryName"
                    angle={xAxisAngle}
                    textAnchor="end"
                    interval={0}
                    height={xAxisHeight}
                    tick={tickStyle}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, axisMax]}
                    ticks={axisTicks}
                    interval={0}
                    tickFormatter={formatTick}
                    tick={tickStyle}
                    width={yAxisWidth}
                    label={yAxisLabel}
                  />
                  <Tooltip
                    formatter={(value) => [formatTip(value), metricLabel]}
                  />
                  {!isMobile && <Legend />}
                  <Bar
                    dataKey={metricKey}
                    name={metricLabel}
                    fill={barColor}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={handleCategorySelect}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}


        {status === 'done' &&
          salesData.length > 0 &&
          chartType === 'horizontalBar' && (
            <div className="csd-rechart">
              <ResponsiveContainer width="100%" height={horizontalHeight}>
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={
                    isMobile
                      ? { top: 10, right: 16, left: 0, bottom: 30 }
                      : { top: 20, right: 30, left: 120, bottom: 50 }
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    domain={[0, axisMax]}
                    ticks={axisTicks}
                    interval={0}
                    tickFormatter={formatTick}
                    tick={tickStyle}
                    label={
                      isMobile
                        ? undefined
                        : {
                            value: isSales ? 'Sales (₹)' : 'Count',
                            position: 'insideBottom',
                            offset: -10,
                          }
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="categoryName"
                    width={isMobile ? 90 : 110}
                    tick={tickStyle}
                  />
                  <Tooltip
                    formatter={(value) => [formatTip(value), metricLabel]}
                  />
                  {!isMobile && <Legend />}
                  <Bar
                    dataKey={metricKey}
                    name={metricLabel}
                    fill={barColor}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={handleCategorySelect}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}


        {/* =================================================
            TOTALS
        ================================================= */}

        {status === 'done' && salesData.length > 0 && (
          <div className="csd-total">
            Total units sold: <strong>{formatCount(grandTotal)}</strong>
            {' · '}
            Total sales: <strong>{formatCurrency(grandTotalSales)}</strong>
          </div>
        )}

      </div>


      {/* =================================================
          PRODUCT DRILLDOWN (selected category)
      ================================================= */}

      {selectedCategory && (
        <div className="csd-product-panel">

          <div className="csd-product-panel-header">
            <h3>
              {selectedCategory.categoryName}
              {' — '}Product Breakdown
            </h3>
            <button
              type="button"
              className="csd-date-filter-clear"
              onClick={() => setSelectedCategory(null)}
            >
              Close
            </button>
          </div>

          {productStatus === 'loading' && (
            <p className="csd-hint">Loading products…</p>
          )}

          {productStatus === 'error' && (
            <p className="csd-error" role="alert">
              {productError}
            </p>
          )}

          {productStatus === 'done' && productData.length === 0 && (
            <p className="csd-hint">
              No products sold in this category for that range.
            </p>
          )}

          {productStatus === 'done' && productData.length > 0 && (
            <>
              {/* On phones the CSS turns each row into a stacked card
                  (labels come from the data-label attributes). */}
              <div className="csd-product-table-wrap">
                <table className="csd-product-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Barcode</th>
                      <th>Price</th>
                      <th>MRP</th>
                      <th>Qty Sold</th>
                      <th>Qty Available</th>
                      <th>Bill (MRP × Qty)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productData.map((item) => (
                      <tr
                        key={item.productId}
                        data-low-stock={item.quantityAvailable <= 5}
                      >
                        <td data-label="Product">{item.productName}</td>
                        <td data-label="Barcode">{item.barcode}</td>
                        <td data-label="Price">{formatCurrency(item.price)}</td>
                        <td data-label="MRP">{formatCurrency(item.mrp)}</td>
                        <td data-label="Qty Sold">
                          {formatCount(item.quantitySold)}
                        </td>
                        <td data-label="Qty Available">
                          {formatCount(item.quantityAvailable)}
                        </td>
                        <td data-label="Bill (MRP × Qty)">
                          {formatCurrency(item.mrp * item.quantitySold)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        fontWeight: 600,
                        borderTop: '2px solid #d1d5db',
                      }}
                    >
                      <td colSpan={4}>Total</td>
                      <td>{formatCount(productTotals.quantitySold)}</td>
                      <td>{formatCount(productTotals.quantityAvailable)}</td>
                      <td>{formatCurrency(productTotals.bill)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="csd-product-summary">
                <div>
                  Total count sold:{' '}
                  <strong>{formatCount(productTotals.quantitySold)}</strong>
                </div>
                <div>
                  Total bill (MRP × qty):{' '}
                  <strong>{formatCurrency(productTotals.bill)}</strong>
                </div>
              </div>
            </>
          )}

        </div>
      )}

    </div>
  )
}

export default CategorySalesDashboard