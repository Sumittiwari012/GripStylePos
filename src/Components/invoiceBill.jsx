import React from 'react';

function InvoiceBill({ invoice, onClose }) {
  const { invoiceNumber, customer, cart, totalAmount, discount, taxAmount, payableAmount, payments, completedAt } = invoice;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <div style={styles.header}>
          <h2 style={styles.title}>Invoice #{invoiceNumber}</h2>
          <p style={styles.date}>{new Date(completedAt).toLocaleString()}</p>
        </div>

        {customer && (
          <div style={styles.customerBlock}>
            <strong>{customer.customerName ?? customer.name}</strong>
            <span>{customer.mobileNumber ?? customer.phoneNumber}</span>
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
            {cart.map((item) => (
              <tr key={item.id}>
                <td style={styles.td}>{item.name}</td>
                <td style={styles.td}>{item.quantity}</td>
                <td style={styles.td}>₹{item.price.toFixed(2)}</td>
                <td style={styles.td}>₹{(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={styles.summaryBlock}>
          <div style={styles.summaryRow}><span>Subtotal:</span><span>₹{totalAmount.toFixed(2)}</span></div>
          <div style={styles.summaryRow}><span>Discount:</span><span>-₹{Number(discount).toFixed(2)}</span></div>
          <div style={styles.summaryRow}><span>Tax:</span><span>₹{taxAmount.toFixed(2)}</span></div>
          <div style={styles.summaryTotal}><span>Total Paid:</span><span>₹{payableAmount.toFixed(2)}</span></div>
        </div>

        <div style={styles.paymentsBlock}>
          <h3 style={styles.subTitle}>Payments</h3>
          {payments.map((p, i) => (
            <div key={i} style={styles.summaryRow}>
              <span>{p.method}</span>
              <span>₹{p.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div style={styles.actions}>
          <button style={styles.printButton} onClick={handlePrint}>Print</button>
          <button style={styles.newSaleButton} onClick={onClose}>New Sale</button>
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
  title: { margin: 0, fontSize: '1.3rem', color: '#28a745' },
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
    borderTop: '1px dashed #ccc', paddingTop: '6px', marginTop: '6px'
  },
  subTitle: { fontSize: '0.95rem', margin: '0 0 6px 0', color: '#333' },
  paymentsBlock: { marginBottom: '15px' },
  actions: { display: 'flex', gap: '10px' },
  printButton: {
    flex: 1, padding: '10px', backgroundColor: '#eee', border: '1px solid #ccc',
    borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
  },
  newSaleButton: {
    flex: 1, padding: '10px', backgroundColor: '#007bff', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
  }
};

export default InvoiceBill;