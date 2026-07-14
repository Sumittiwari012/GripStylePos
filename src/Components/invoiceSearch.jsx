import React, { useState } from 'react';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

function buildInvoiceHtml(invoice) {
  const payable = (invoice.totalAmount - invoice.discount).toFixed(2);

  const itemsRows = invoice.items
    .map(
      (item) => `
        <tr>
          <td>${item.productName}</td>
          <td>${item.barcode}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">₹${item.salePrice.toFixed(2)}</td>
          <td class="num">₹${item.afterTaxation.toFixed(2)}</td>
        </tr>`
    )
    .join('');

  const paymentsRows = (invoice.payments || [])
    .map(
      (p) => `
        <div class="summary-row">
          <span>${p.paymentMethod}${p.bankAccountNumber ? ` (${p.bankAccountNumber})` : ''}</span>
          <span>₹${p.amountPaid.toFixed(2)}</span>
        </div>`
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        background: #F5F0E8;
        color: #1B2A4A;
        margin: 0;
        padding: 30px;
      }
      .sheet {
        max-width: 700px;
        margin: 0 auto;
        background: #fff;
        border-radius: 8px;
        padding: 30px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px dashed #ccc;
        padding-bottom: 14px;
        margin-bottom: 14px;
      }
      .header h1 { margin: 0; font-size: 1.3rem; }
      .header span { font-size: 0.85rem; color: #888; }
      .returned {
        background: #fdecea;
        color: #dc3545;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
        font-weight: bold;
        margin-bottom: 14px;
      }
      .customer {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 16px;
        font-size: 0.9rem;
      }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 0.85rem; }
      th { text-align: left; border-bottom: 2px solid #ddd; padding: 6px 4px; color: #555; }
      td { padding: 6px 4px; border-bottom: 1px solid #f0f0f0; }
      .num { text-align: right; }
      .summary { margin-bottom: 16px; }
      .summary-row {
        display: flex; justify-content: space-between;
        font-size: 0.9rem; color: #555; margin-bottom: 4px;
      }
      .summary-total {
        display: flex; justify-content: space-between;
        font-weight: bold; font-size: 1.1rem;
        border-top: 1px dashed #ccc; padding-top: 6px; margin-top: 6px;
      }
      .sub-title { font-size: 0.95rem; margin: 14px 0 6px 0; color: #333; }
      .print-bar { max-width: 700px; margin: 0 auto 14px; text-align: right; }
      .print-bar button {
        padding: 10px 18px;
        background: #1B2A4A;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 0.9rem;
      }
      @media print {
        body { background: #fff; padding: 0; }
        .sheet { box-shadow: none; border-radius: 0; }
        .print-bar { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="print-bar"><button onclick="window.print()">Print</button></div>
    <div class="sheet">
      <div class="header">
        <h1>Invoice #${invoice.invoiceNumber}</h1>
        <span>${new Date(invoice.purchaseDate).toLocaleString()}</span>
      </div>

      ${invoice.isReturned ? '<div class="returned">This invoice has been returned</div>' : ''}

      ${
        invoice.customer
          ? `<div class="customer">
              <strong>${invoice.customer.customerName}</strong>
              <span>${invoice.customer.mobileNumber}</span>
            </div>`
          : ''
      }

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Barcode</th>
            <th class="num">Qty</th>
            <th class="num">Price</th>
            <th class="num">After Tax</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="summary">
        <div class="summary-row"><span>Total Amount:</span><span>₹${invoice.totalAmount.toFixed(2)}</span></div>
        <div class="summary-row"><span>Discount:</span><span>-₹${invoice.discount.toFixed(2)}</span></div>
        <div class="summary-total"><span>Payable Amount:</span><span>₹${payable}</span></div>
      </div>

      ${
        invoice.payments?.length > 0
          ? `<div>
              <h3 class="sub-title">Payments</h3>
              ${paymentsRows}
            </div>`
          : ''
      }
    </div>
  </body>
  </html>`;
}

function InvoiceSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setError('');
    setInvoice(null);

    try {
      const response = await fetch(`${API_BASE_URL}/getInvoiceByNumber?invoiceNumber=${encodeURIComponent(searchTerm.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Invoice not found.');
      }

      setInvoice(data);
    } catch (err) {
      setError(err.message || 'Could not find invoice.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleOpenInvoiceWindow = () => {
    if (!invoice) return;
    const html = buildInvoiceHtml(invoice);
    const win = window.open('', '_blank', 'width=800,height=900,scrollbars=yes');
    if (!win) {
      // Popup blocked
      setError('Could not open invoice window. Please allow pop-ups for this site.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Invoice Lookup</h1>

        <div style={styles.searchRow}>
          <input
            type="text"
            placeholder="Enter invoice number (e.g. GS140720260001)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.searchInput}
            autoFocus
          />
          <button onClick={handleSearch} style={styles.searchButton} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {error && <p style={styles.errorText}>{error}</p>}

        {invoice && (
          <div style={styles.invoiceCard}>
            <div style={styles.invoiceHeader}>
              <h2 style={styles.invoiceNumber}>Invoice #{invoice.invoiceNumber}</h2>
              <span style={styles.invoiceDate}>
                {new Date(invoice.purchaseDate).toLocaleString()}
              </span>
            </div>

            {invoice.isReturned && (
              <div style={styles.returnedBadge}>This invoice has been returned</div>
            )}

            {invoice.customer && (
              <div style={styles.customerBlock}>
                <strong>{invoice.customer.customerName}</strong>
                <span>{invoice.customer.mobileNumber}</span>
              </div>
            )}

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Item</th>
                  <th style={styles.th}>Barcode</th>
                  <th style={styles.th}>Qty</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>After Tax</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{item.productName}</td>
                    <td style={styles.td}>{item.barcode}</td>
                    <td style={styles.td}>{item.quantity}</td>
                    <td style={styles.td}>₹{item.salePrice.toFixed(2)}</td>
                    <td style={styles.td}>₹{item.afterTaxation.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={styles.summaryBlock}>
              <div style={styles.summaryRow}>
                <span>Total Amount:</span>
                <span>₹{invoice.totalAmount.toFixed(2)}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Discount:</span>
                <span>-₹{invoice.discount.toFixed(2)}</span>
              </div>
              <div style={styles.summaryTotal}>
                <span>Payable Amount:</span>
                <span>₹{(invoice.totalAmount - invoice.discount).toFixed(2)}</span>
              </div>
            </div>

            {invoice.payments?.length > 0 && (
              <div style={styles.paymentsBlock}>
                <h3 style={styles.subTitle}>Payments</h3>
                {invoice.payments.map((p, i) => (
                  <div key={i} style={styles.summaryRow}>
                    <span>{p.paymentMethod}{p.bankAccountNumber ? ` (${p.bankAccountNumber})` : ''}</span>
                    <span>₹{p.amountPaid.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleOpenInvoiceWindow} style={styles.openWindowButton}>
              Open Invoice in New Window
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F5F0E8',
    padding: '40px 20px',
    boxSizing: 'border-box'
  },
  container: {
    maxWidth: '700px',
    margin: '0 auto'
  },
  title: {
    fontSize: '1.6rem',
    color: '#1B2A4A',
    marginBottom: '20px'
  },
  searchRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px'
  },
  searchInput: {
    flex: 1,
    padding: '12px 15px',
    borderRadius: '6px',
    border: '1px solid #C4B99A',
    fontSize: '1rem',
    outline: 'none'
  },
  searchButton: {
    padding: '12px 24px',
    backgroundColor: '#1B2A4A',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  errorText: {
    color: '#dc3545',
    fontSize: '0.9rem'
  },
  invoiceCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '25px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  invoiceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px dashed #ccc',
    paddingBottom: '12px',
    marginBottom: '12px'
  },
  invoiceNumber: { margin: 0, fontSize: '1.2rem', color: '#1B2A4A' },
  invoiceDate: { fontSize: '0.85rem', color: '#888' },
  returnedBadge: {
    backgroundColor: '#fdecea',
    color: '#dc3545',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    marginBottom: '12px'
  },
  customerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginBottom: '15px',
    fontSize: '0.9rem'
  },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '0.85rem' },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '6px 4px', color: '#555' },
  td: { padding: '6px 4px', borderBottom: '1px solid #f0f0f0' },
  summaryBlock: { marginBottom: '15px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#555', marginBottom: '4px' },
  summaryTotal: {
    display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem',
    borderTop: '1px dashed #ccc', paddingTop: '6px', marginTop: '6px'
  },
  subTitle: { fontSize: '0.95rem', margin: '10px 0 6px 0', color: '#333' },
  paymentsBlock: {},
  openWindowButton: {
    marginTop: '20px',
    width: '100%',
    padding: '12px',
    backgroundColor: '#1B2A4A',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.95rem'
  }
};

export default InvoiceSearch;