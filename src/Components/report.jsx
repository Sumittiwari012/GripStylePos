import React, { useState, useMemo } from 'react';
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
  Legend
} from 'recharts';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

const METHOD_META = {
  Cash: { key: 'cash', color: '#28a745' },
  Card: { key: 'card', color: '#007bff' },
  UPI: { key: 'upi', color: '#ffc107' },
  Wallet: { key: 'wallet', color: '#6f42c1' }
};

const formatDateForApi = (date) => {
  // yyyy-MM-dd — sent as a plain date, backend treats it as date-only
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const todayStr = () => formatDateForApi(new Date());

function Report() {
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'line'

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      setError('Please select both a start and end date.');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date cannot be after end date.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const url = `${API_BASE_URL}/DateRangeReport?startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error('Failed to load report:', err);
      setError(err.message || 'Failed to load report. Please try again.');
      setReportData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Build one combined dataset: date -> { Cash, Card, UPI, Wallet }
  const chartData = useMemo(() => {
    if (!reportData) return [];

    const byDate = {};

    Object.entries(METHOD_META).forEach(([label, meta]) => {
      const section = reportData[meta.key];
      if (!section?.invoices) return;

      section.invoices.forEach((inv) => {
        const dateKey = (inv.paymentDate || '').slice(0, 10); // yyyy-MM-dd
        if (!byDate[dateKey]) {
          byDate[dateKey] = { date: dateKey, Cash: 0, Card: 0, UPI: 0, Wallet: 0 };
        }
        byDate[dateKey][label] += inv.amountPaid;
      });
    });

    return Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [reportData]);

  const ChartComponent = chartType === 'line' ? LineChart : BarChart;

  // Wallet payments are drawn from a balance that was already counted as
  // revenue when the wallet was originally topped up, so including it again
  // here would double-count that money. Subtract it from the raw API total.
  const walletAmount = Number(reportData?.wallet?.totalAmount ?? 0);
  const netTotalCollected = Number(reportData?.totalCollected ?? 0) - walletAmount;

  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>Payments Report</h2>

      {/* ── Date range controls ── */}
      <div style={styles.filterBar}>
        <div style={styles.filterField}>
          <label style={styles.label}>From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.dateInput}
          />
        </div>
        <div style={styles.filterField}>
          <label style={styles.label}>To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.dateInput}
          />
        </div>
        <button
          style={styles.primaryButton}
          onClick={fetchReport}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Get Report'}
        </button>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {reportData && (
        <>
          {/* ── 4 payment method cards ── */}
          <div style={styles.summaryGrid}>
            {Object.entries(METHOD_META).map(([label, meta]) => {
              const section = reportData[meta.key];
              return (
                <div key={label} style={styles.summaryCard}>
                  <div style={{ ...styles.summaryCardBar, backgroundColor: meta.color }} />
                  <div style={styles.summaryCardBody}>
                    <span style={styles.summaryCardLabel}>{label}</span>
                    <span style={styles.summaryCardAmount}>
                      ₹{Number(section?.totalAmount ?? 0).toFixed(2)}
                    </span>
                    <span style={styles.summaryCardCount}>
                      {section?.transactionCount ?? 0} transaction{(section?.transactionCount ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.totalRow}>
            <span>Total Collected</span>
            <span style={styles.totalAmount}>₹{netTotalCollected.toFixed(2)}</span>
          </div>
          <p style={styles.totalNote}>
            Excludes ₹{walletAmount.toFixed(2)} in wallet payments (already counted when the wallet was funded).
          </p>

          {/* ── Invoice-level breakdown per method ── */}
          <div style={styles.detailGrid}>
            {Object.entries(METHOD_META).map(([label, meta]) => {
              const section = reportData[meta.key];
              const invoices = section?.invoices ?? [];
              return (
                <div key={label} style={styles.detailCard}>
                  <h3 style={{ ...styles.detailTitle, color: meta.color }}>{label}</h3>
                  {invoices.length === 0 && <p style={styles.emptyText}>No transactions.</p>}
                  {invoices.length > 0 && (
                    <div style={styles.invoiceList}>
                      {invoices.map((inv, idx) => (
                        <div key={`${inv.invoiceNumber}-${idx}`} style={styles.invoiceRow}>
                          <span style={styles.invoiceNumber}>{inv.invoiceNumber}</span>
                          <span style={styles.invoiceDate}>
                            {(inv.paymentDate || '').slice(0, 10)}
                          </span>
                          <span style={styles.invoiceAmount}>₹{Number(inv.amountPaid).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Graph toggle + single combined chart ── */}
          <div style={styles.chartSection}>
            <div style={styles.chartHeader}>
              <h3 style={styles.sectionTitle}>Trend</h3>
              <div style={styles.toggleGroup}>
                <button
                  style={{
                    ...styles.toggleButton,
                    ...(chartType === 'bar' ? styles.toggleButtonActive : {})
                  }}
                  onClick={() => setChartType('bar')}
                >
                  Bar
                </button>
                <button
                  style={{
                    ...styles.toggleButton,
                    ...(chartType === 'line' ? styles.toggleButtonActive : {})
                  }}
                  onClick={() => setChartType('line')}
                >
                  Line
                </button>
              </div>
            </div>

            {chartData.length === 0 ? (
              <p style={styles.emptyText}>No data to chart for this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <ChartComponent data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
                  <Legend />
                  {Object.entries(METHOD_META).map(([label, meta]) =>
                    chartType === 'line' ? (
                      <Line
                        key={label}
                        type="monotone"
                        dataKey={label}
                        stroke={meta.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ) : (
                      <Bar key={label} dataKey={label} fill={meta.color} radius={[4, 4, 0, 0]} />
                    )
                  )}
                </ChartComponent>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
    fontFamily: 'inherit'
  },
  pageTitle: {
    margin: '0 0 20px 0',
    fontSize: '1.5rem'
  },
  filterBar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '15px',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '15px',
    marginBottom: '15px',
    flexWrap: 'wrap'
  },
  filterField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '0.8rem',
    color: '#555',
    fontWeight: 'bold'
  },
  dateInput: {
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '0.9rem'
  },
  primaryButton: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.95rem'
  },
  errorText: {
    color: '#dc3545',
    fontSize: '0.9rem',
    marginBottom: '15px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '15px',
    marginBottom: '15px'
  },
  summaryCard: {
    display: 'flex',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    overflow: 'hidden'
  },
  summaryCardBar: {
    width: '6px'
  },
  summaryCardBody: {
    display: 'flex',
    flexDirection: 'column',
    padding: '14px 16px',
    gap: '4px'
  },
  summaryCardLabel: {
    fontSize: '0.85rem',
    color: '#666',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  },
  summaryCardAmount: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    color: '#222'
  },
  summaryCardCount: {
    fontSize: '0.8rem',
    color: '#888'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '14px 18px',
    marginBottom: '20px',
    fontSize: '1.1rem',
    fontWeight: 'bold'
  },
  totalAmount: {
    color: '#28a745'
  },
  totalNote: {
    fontSize: '0.78rem',
    color: '#888',
    margin: '-14px 0 20px 0'
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '15px',
    marginBottom: '25px'
  },
  detailCard: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '14px',
    maxHeight: '280px',
    display: 'flex',
    flexDirection: 'column'
  },
  detailTitle: {
    margin: '0 0 10px 0',
    fontSize: '1rem',
    borderBottom: '1px solid #eee',
    paddingBottom: '8px'
  },
  invoiceList: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  invoiceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '0.8rem',
    color: '#444',
    padding: '4px 0',
    borderBottom: '1px dashed #f0f0f0'
  },
  invoiceNumber: {
    flex: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  invoiceDate: {
    flex: 1,
    color: '#999',
    textAlign: 'center'
  },
  invoiceAmount: {
    flex: 1,
    textAlign: 'right',
    fontWeight: 'bold'
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    fontSize: '0.85rem'
  },
  chartSection: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '18px'
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.1rem'
  },
  toggleGroup: {
    display: 'flex',
    border: '1px solid #ccc',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  toggleButton: {
    padding: '6px 16px',
    border: 'none',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    color: '#555'
  },
  toggleButtonActive: {
    backgroundColor: '#007bff',
    color: '#fff'
  }
};

export default Report;