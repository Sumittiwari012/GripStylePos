import React from 'react';

function ReturnBill({ returnData, onClose }) {
  const {
    returnInvoiceNumber,
    originalInvoiceNumber,
    customerName,
    customerMobile,
    items = [],
    totalAmount,
    updatedCustomerBalance,
    completedAt
  } = returnData;

  const handlePrint = () => {
    const printContent = document.getElementById('return-print-area');
    if (!printContent) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Return ${returnInvoiceNumber}</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; color: #222; }
            table { width: 100%; border-collapse: collapse; }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    };
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <div id="return-print-area">
          <div style={styles.header}>
            <h1 style={styles.brand}>GRIP STYLE</h1>
            <h2 style={styles.title}>Return Bill #{returnInvoiceNumber}</h2>
            {originalInvoiceNumber && (
              <p style={styles.subDate}>Against Invoice #{originalInvoiceNumber}</p>
            )}
            <p style={styles.date}>{new Date(completedAt).toLocaleDateString()}</p>
          </div>

          {(customerName || customerMobile) && (
            <div style={styles.customerBlock}>
              <strong>{customerName}</strong>
              <span>{customerMobile}</span>
            </div>
          )}

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Item</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Price</th>
                <th style={styles.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productId}>
                  <td style={styles.td}>{item.productName}</td>
                  <td style={styles.td}>{item.quantity}</td>
                  <td style={styles.td}>₹{Number(item.salePrice).toFixed(2)}</td>
                  <td style={styles.td}>₹{Number(item.lineTotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.summaryBlock}>
            <div style={styles.summaryTotal}>
              <span>Wallet Credited:</span>
              <span>₹{Number(totalAmount).toFixed(2)}</span>
            </div>
            {updatedCustomerBalance != null && (
              <div style={styles.summaryRow}>
                <span>Updated Wallet Balance:</span>
                <span>₹{Number(updatedCustomerBalance).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.printButton} onClick={handlePrint}>Print</button>
          <button style={styles.closeButton} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 2000
  },
  modalWindow: {
    backgroundColor: '#fff', padding: '25px', borderRadius: '8px',
    width: '90%', maxWidth: '450px', maxHeight: '85vh', overflowY: 'auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
  },
  header: { textAlign: 'center', marginBottom: '15px' },
  brand: {
    margin: '0 0 8px 0',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    letterSpacing: '1px',
    color: '#222'
  },
  title: { margin: 0, fontSize: '1.3rem', color: '#dc3545' },
  subDate: { margin: '4px 0 0 0', fontSize: '0.85rem', color: '#555' },
  date: { margin: '4px 0 0 0', fontSize: '0.8rem', color: '#888' },
  customerBlock: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    borderBottom: '1px dashed #ccc', paddingBottom: '10px', marginBottom: '10px', fontSize: '0.9rem'
  },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '0.85rem' },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '6px 4px', color: '#555' },
  td: { padding: '6px 4px', borderBottom: '1px solid #f0f0f0' },
  summaryBlock: { marginBottom: '15px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#555', marginBottom: '4px' },
  summaryTotal: {
    display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem',
    borderTop: '1px dashed #ccc', paddingTop: '6px', marginTop: '6px', marginBottom: '6px'
  },
  actions: { display: 'flex', gap: '10px' },
  printButton: {
    flex: 1, padding: '10px', backgroundColor: '#eee', border: '1px solid #ccc',
    borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
  },
  closeButton: {
    flex: 1, padding: '10px', backgroundColor: '#2C6B4B', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
  }
};

export default ReturnBill;