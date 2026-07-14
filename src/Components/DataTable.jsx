import React, { useState, useEffect } from 'react';

/**
 * Generic table that fetches a list from `endpoint` and renders the given `columns`.
 *
 * columns: [{ key: 'invoiceNumber', label: 'Invoice #', render?: (row) => ReactNode }]
 */
function DataTable({ endpoint, columns, title, emptyMessage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(endpoint);
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
  }, [endpoint]);

  return (
    <div style={styles.wrapper}>
      {title && <h2 style={styles.title}>{title}</h2>}

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