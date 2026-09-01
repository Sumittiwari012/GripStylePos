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

// New: per-category product breakdown endpoint
const PRODUCT_API_URL =
  'https://gripstyleapi.runasp.net/api/Sales/getCategoryPdtSoldAndUnsoldQuantities'

const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'horizontalBar', label: 'Horizontal Bar' },
]

const formatCount = (value) =>
  new Intl.NumberFormat('en-IN').format(value)

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value ?? 0)


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

  const magnitude = Math.pow(
    10,
    Math.floor(Math.log10(max))
  )

  return magnitude
}


/* =========================================================
   CUSTOM CLICKABLE DOT (for the line chart)
   ========================================================= */

const ClickableDot = (props) => {
  const { cx, cy, payload, onDotClick } = props

  if (cx == null || cy == null) return null

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#4338ca"
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

function CategorySalesDashboard({
  onRangeChange,
}) {
  const [dateRange, setDateRange] = useState({
    from: '',
    to: '',
  })

  const [salesData, setSalesData] =
    useState([])

  const [status, setStatus] =
    useState('idle')

  const [errorMessage, setErrorMessage] =
    useState('')

  const [chartType, setChartType] =
    useState('line')

  // ── Selected category (from clicking the chart) ──
  const [selectedCategory, setSelectedCategory] =
    useState(null) // { categoryId, categoryName }

  const [productData, setProductData] =
    useState([])

  const [productStatus, setProductStatus] =
    useState('idle') // idle | loading | done | error

  const [productError, setProductError] =
    useState('')


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
     FETCH DATA (category totals for the chart)
     ======================================================= */

  useEffect(() => {
    if (
      !dateRange.from ||
      !dateRange.to
    ) {
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

    const controller =
      new AbortController()

    const fetchSales = async () => {
      setStatus('loading')
      setErrorMessage('')

      try {
        const params =
          new URLSearchParams({
            StartDate: dateRange.from,
            EndDate: dateRange.to,
          })

        const response =
          await fetch(
            `${API_URL}?${params.toString()}`,
            {
              signal:
                controller.signal,
            }
          )

        if (!response.ok) {
          const body =
            await response
              .json()
              .catch(() => null)

          throw new Error(
            body?.message ||
              `Request failed (${response.status})`
          )
        }

        const data =
          await response.json()

        const formattedData =
          Array.isArray(data)
            ? data
                .map((item) => ({
                  categoryId:
                    item.categoryId ??
                    item.CategoryId,

                  categoryName:
                    item.categoryName ??
                    item.CategoryName,

                  count: Number(
                    item.count ??
                      item.Count ??
                      0
                  ),
                }))
                .filter(
                  (item) =>
                    item.categoryName &&
                    item.count >= 0
                )
            : []

        /*
         * Highest count first.
         */
        formattedData.sort(
          (a, b) =>
            b.count - a.count
        )

        setSalesData(
          formattedData
        )

        setStatus('done')
      } catch (error) {
        if (
          error.name ===
          'AbortError'
        ) {
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
  }, [
    dateRange.from,
    dateRange.to,
  ])


  /* =======================================================
     FETCH DATA (products for the selected category)
     Fires whenever selectedCategory or the date range changes.
     ======================================================= */

  useEffect(() => {
    if (
      !selectedCategory ||
      !dateRange.from ||
      !dateRange.to
    ) {
      return
    }

    const controller =
      new AbortController()

    const fetchProducts = async () => {
      setProductStatus('loading')
      setProductError('')

      try {
        const params =
          new URLSearchParams({
            CategoryId:
              selectedCategory.categoryId,
            StartDate: dateRange.from,
            EndDate: dateRange.to,
          })

        const response =
          await fetch(
            `${PRODUCT_API_URL}?${params.toString()}`,
            {
              signal:
                controller.signal,
            }
          )

        if (!response.ok) {
          const body =
            await response
              .json()
              .catch(() => null)

          throw new Error(
            body?.message ||
              `Request failed (${response.status})`
          )
        }

        const data =
          await response.json()

        const formatted =
          Array.isArray(data)
            ? data.map((item) => ({
                productId:
                  item.productId ??
                  item.ProductId,
                productName:
                  item.productName ??
                  item.ProductName,
                barcode:
                  item.barcode ??
                  item.Barcode,
                price: Number(
                  item.price ??
                    item.Price ??
                    0
                ),
                mrp: Number(
                  item.mrp ??
                    item.MRP ??
                    0
                ),
                quantitySold: Number(
                  item.quantitySold ??
                    item.QuantitySold ??
                    0
                ),
                quantityAvailable: Number(
                  item.quantityAvailable ??
                    item.QuantityAvailable ??
                    0
                ),
              }))
            : []

        setProductData(formatted)
        setProductStatus('done')
      } catch (error) {
        if (
          error.name ===
          'AbortError'
        ) {
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
  }, [
    selectedCategory,
    dateRange.from,
    dateRange.to,
  ])


  /* =======================================================
     CATEGORY CLICK HANDLER
     Works for both the Bar chart's onClick payload shape
     ({ categoryId, categoryName, ... }) and the Line chart's
     custom dot, which passes the raw data point directly.
     ======================================================= */

  const handleCategorySelect = (entry) => {
    if (!entry) return

    const categoryId =
      entry.categoryId ??
      entry.payload?.categoryId
    const categoryName =
      entry.categoryName ??
      entry.payload?.categoryName

    if (categoryId == null) return

    setSelectedCategory({
      categoryId,
      categoryName,
    })
  }


  /* =======================================================
     TOTAL
     ======================================================= */

  const grandTotal =
    salesData.reduce(
      (total, item) =>
        total + item.count,
      0
    )


  /* =======================================================
     Y AXIS CALCULATIONS
     ======================================================= */

  const maxCount = Math.max(
    ...salesData.map(
      (item) => item.count
    ),
    0
  )

  const tickInterval =
    getTickInterval(maxCount)

  const axisMax =
    maxCount === 0
      ? 1
      : Math.ceil(
          maxCount /
            tickInterval
        ) * tickInterval

  const countTicks =
    Array.from(
      {
        length:
          Math.floor(
            axisMax /
              tickInterval
          ) + 1,
      },
      (_, index) =>
        index * tickInterval
    )


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
            max={
              dateRange.to ||
              undefined
            }
            onChange={(event) => {
              updateRange({
                ...dateRange,
                from:
                  event.target.value,
              })
            }}
          />
        </label>


        <label className="csd-date-filter-field">
          <span>To</span>

          <input
            type="date"
            value={dateRange.to}
            min={
              dateRange.from ||
              undefined
            }
            onChange={(event) => {
              updateRange({
                ...dateRange,
                to:
                  event.target.value,
              })
            }}
          />
        </label>


        {(dateRange.from ||
          dateRange.to) && (
          <button
            type="button"
            className="csd-date-filter-clear"
            onClick={
              clearDateRange
            }
          >
            Reset range
          </button>
        )}

      </div>


      {/* =================================================
          CHART TABS
      ================================================= */}

      {status === 'done' &&
        salesData.length > 0 && (
          <div
            className="csd-chart-tabs"
            role="tablist"
          >

            {CHART_TYPES.map(
              (chart) => (
                <button
                  key={chart.id}
                  type="button"
                  role="tab"
                  aria-selected={
                    chartType ===
                    chart.id
                  }
                  className={`csd-chart-tab ${
                    chartType ===
                    chart.id
                      ? 'csd-chart-tab-active'
                      : ''
                  }`}
                  onClick={() =>
                    setChartType(
                      chart.id
                    )
                  }
                >
                  {chart.label}
                </button>
              )
            )}

          </div>
        )}

      {status === 'done' &&
        salesData.length > 0 && (
          <p className="csd-hint csd-click-hint">
            Click a category in the chart to see its product-level breakdown.
          </p>
        )}


      {/* =================================================
          CHART AREA
      ================================================= */}

      <div className="csd-chart-area">

        {status === 'idle' && (
          <p className="csd-hint">
            Pick a from and to date
            to see sales by category.
          </p>
        )}


        {status === 'loading' && (
          <p className="csd-hint">
            Loading category sales…
          </p>
        )}


        {status === 'error' && (
          <p
            className="csd-error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}


        {status === 'done' &&
          salesData.length === 0 && (
            <p className="csd-hint">
              No sales found for
              that range.
            </p>
          )}


        {/* =================================================
            LINE CHART
        ================================================= */}

        {status === 'done' &&
          salesData.length > 0 &&
          chartType === 'line' && (

            <div className="csd-rechart">

              <ResponsiveContainer
                width="100%"
                height={450}
              >

                <LineChart
                  data={salesData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 30,
                    bottom: 100,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="categoryName"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={120}
                  />

                  <YAxis
                    allowDecimals={false}
                    domain={[
                      0,
                      axisMax,
                    ]}
                    ticks={
                      countTicks
                    }
                    interval={0}
                    tickFormatter={
                      formatCount
                    }
                    label={{
                      value: 'Count',
                      angle: -90,
                      position:
                        'insideLeft',
                    }}
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) => [
                      formatCount(
                        value
                      ),
                      'Count',
                    ]}
                  />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Count"
                    stroke="#4338ca"
                    strokeWidth={3}
                    dot={
                      <ClickableDot
                        onDotClick={
                          handleCategorySelect
                        }
                      />
                    }
                    activeDot={{
                      r: 7,
                      style: { cursor: 'pointer' },
                      onClick: (_, payloadEvent) =>
                        handleCategorySelect(
                          payloadEvent?.payload
                        ),
                    }}
                  />

                </LineChart>

              </ResponsiveContainer>

            </div>
          )}


        {/* =================================================
            BAR CHART
        ================================================= */}

        {status === 'done' &&
          salesData.length > 0 &&
          chartType === 'bar' && (

            <div className="csd-rechart">

              <ResponsiveContainer
                width="100%"
                height={450}
              >

                <BarChart
                  data={salesData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 30,
                    bottom: 100,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="categoryName"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={120}
                  />

                  <YAxis
                    allowDecimals={false}
                    domain={[
                      0,
                      axisMax,
                    ]}
                    ticks={
                      countTicks
                    }
                    interval={0}
                    tickFormatter={
                      formatCount
                    }
                    label={{
                      value: 'Count',
                      angle: -90,
                      position:
                        'insideLeft',
                    }}
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) => [
                      formatCount(
                        value
                      ),
                      'Count',
                    ]}
                  />

                  <Legend />

                  <Bar
                    dataKey="count"
                    name="Count"
                    fill="#4338ca"
                    radius={[
                      4,
                      4,
                      0,
                      0,
                    ]}
                    cursor="pointer"
                    onClick={handleCategorySelect}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>
          )}


        {/* =================================================
            HORIZONTAL BAR
        ================================================= */}

        {status === 'done' &&
          salesData.length > 0 &&
          chartType ===
            'horizontalBar' && (

            <div className="csd-rechart">

              <ResponsiveContainer
                width="100%"
                height={Math.max(
                  450,
                  salesData.length *
                    35
                )}
              >

                <BarChart
                  layout="vertical"
                  data={salesData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 120,
                    bottom: 50,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                    domain={[
                      0,
                      axisMax,
                    ]}
                    ticks={
                      countTicks
                    }
                    interval={0}
                    tickFormatter={
                      formatCount
                    }
                    label={{
                      value: 'Count',
                      position:
                        'insideBottom',
                      offset: -10,
                    }}
                  />

                  <YAxis
                    type="category"
                    dataKey="categoryName"
                    width={110}
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) => [
                      formatCount(
                        value
                      ),
                      'Count',
                    ]}
                  />

                  <Legend />

                  <Bar
                    dataKey="count"
                    name="Count"
                    fill="#4338ca"
                    radius={[
                      0,
                      4,
                      4,
                      0,
                    ]}
                    cursor="pointer"
                    onClick={handleCategorySelect}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>
          )}


        {/* =================================================
            TOTAL
        ================================================= */}

        {status === 'done' &&
          salesData.length > 0 && (

            <div className="csd-total">
              Total units sold:{' '}
              <strong>
                {formatCount(
                  grandTotal
                )}
              </strong>
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
              onClick={() =>
                setSelectedCategory(null)
              }
            >
              Close
            </button>
          </div>

          {productStatus === 'loading' && (
            <p className="csd-hint">
              Loading products…
            </p>
          )}

          {productStatus === 'error' && (
            <p className="csd-error" role="alert">
              {productError}
            </p>
          )}

          {productStatus === 'done' &&
            productData.length === 0 && (
              <p className="csd-hint">
                No products sold in this category for that range.
              </p>
            )}

          {productStatus === 'done' &&
            productData.length > 0 && (
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
                    </tr>
                  </thead>
                  <tbody>
                    {productData.map((item) => (
  <tr
    key={item.productId}
    data-low-stock={item.quantityAvailable <= 5}
  >
    <td>{item.productName}</td>
    <td>{item.barcode}</td>
    <td>{formatCurrency(item.price)}</td>
    <td>{formatCurrency(item.mrp)}</td>
    <td>{formatCount(item.quantitySold)}</td>
    <td>{formatCount(item.quantityAvailable)}</td>
  </tr>
))}
                  </tbody>
                </table>
              </div>
            )}

        </div>
      )}

    </div>
  )
}

export default CategorySalesDashboard