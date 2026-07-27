import React, { useState, useEffect } from 'react';

/**
 * Generic table that fetches a list and renders the given `columns`.
 *
 * Pass either:
 *   - `endpoint` (string): static URL, fetched once, no date controls shown.
 *   - `buildEndpoint` (fn): (fromDate, toDate) => url string, where fromDate/toDate
 *     are 'YYYY-MM-DD'. When provided, date-range inputs are rendered above the
 *     table (defaulting to today) and re-fetch on change.
 *
 * columns: [{ key: 'invoiceNumber', label: 'Invoice #', render?: (row) => ReactNode }]
 */

const toDateParam = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function DataTable({ endpoint, buildEndpoint, columns, title, emptyMessage }) {
  const today = toDateParam(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const resolvedEndpoint = buildEndpoint ? buildEndpoint(fromDate, toDate) : endpoint;

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(resolvedEndpoint);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [resolvedEndpoint]);

  return (
    <div style={styles.wrapper}>
      {title && <h2 style={styles.title}>{title}</h2>}

      {buildEndpoint && (
        <div style={styles.filterBar}>
          <label style={styles.filterLabel}>
            From
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <label style={styles.filterLabel}>
            To
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={today}
              onChange={(e) => setToDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <button
            type="button"
            onClick={() => { setFromDate(today); setToDate(today); }}
            style={styles.todayButton}
          >
            Today
          </button>
        </div>
      )}

      {loading && <p>Loading...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && (
        rows.length > 0 ? (
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} style={styles.th}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id ?? i}>
                    {columns.map((col) => (
                      <td key={col.key} style={styles.td}>
                        {col.render ? col.render(row) : String(row[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{emptyMessage || 'No records found.'}</p>
        )
      )}
    </div>
  );
}

const styles = {
  wrapper: { marginTop: '10px' },
  title: { fontSize: '1.3rem', color: '#1B2A4A', marginBottom: '16px' },
  error: { color: '#dc3545', fontSize: '0.9rem' },
  filterBar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  filterLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '0.8rem',
    color: '#555',
    fontWeight: 'bold',
    gap: '4px'
  },
  dateInput: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '0.85rem'
  },
  todayButton: {
    padding: '7px 14px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    color: '#333'
  },
  tableScroll: {
    overflowX: 'auto',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: {
    textAlign: 'left',
    borderBottom: '2px solid #ddd',
    padding: '10px 12px',
    color: '#555',
    whiteSpace: 'nowrap'
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    whiteSpace: 'nowrap'
  }
};

export default DataTable;