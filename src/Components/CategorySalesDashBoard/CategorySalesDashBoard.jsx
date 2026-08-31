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

const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'horizontalBar', label: 'Horizontal Bar' },
]

const formatCount = (value) =>
  new Intl.NumberFormat('en-IN').format(value)


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
     FETCH DATA
     ======================================================= */

  useEffect(() => {
    if (
      !dateRange.from ||
      !dateRange.to
    ) {
      setSalesData([])
      setStatus('idle')
      setErrorMessage('')
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

  /*
   * Automatically select a suitable
   * distance between Y-axis ticks.
   *
   * Example:
   *
   * max = 6   -> 1
   * max = 12  -> 2
   * max = 27  -> 5
   * max = 39  -> 5
   * max = 85  -> 10
   * max = 180 -> 20
   */
  const tickInterval =
    getTickInterval(maxCount)


  /*
   * Round the maximum axis value
   * up to the next interval.
   *
   * Example:
   *
   * maxCount = 39
   * interval = 5
   *
   * axisMax = 40
   */
  const axisMax =
    maxCount === 0
      ? 1
      : Math.ceil(
          maxCount /
            tickInterval
        ) * tickInterval


  /*
   * Generate the actual ticks.
   *
   * Example:
   *
   * interval = 5
   * axisMax = 40
   *
   * [0, 5, 10, 15, 20, 25, 30, 35, 40]
   */
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
                    dot={{
                      r: 5,
                    }}
                    activeDot={{
                      r: 7,
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

    </div>
  )
}

export default CategorySalesDashboard