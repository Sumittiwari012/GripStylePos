import React from 'react';
import GripStyleLogo from "../assets/gripstyle-logo.png";
import Barcode from 'react-barcode';  
function InvoiceBill({ invoice, onClose }) {
  const { invoiceNumber, customer, cart, totalAmount, discount, taxAmount, payableAmount, payments, completedAt } = invoice;

  const handlePrint = () => {
    const printContent = document.getElementById('invoice-print-area');
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
          <title>Invoice ${invoiceNumber}</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body {
  font-family: Arial, Helvetica, sans-serif;
  margin: 0;
  padding: 20px;
  color: #000;
  font-weight: 700;
}

table {
  width: 100%;
  border-collapse: collapse;
  color: #000;
}

th, td {
  color: #000 !important;
  font-weight: 700 !important;
}

h1, h2, h3, p, span, div {
  color: #000 !important;
}
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
      // Give the print dialog a moment to open before cleaning up the iframe
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    };
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <div id="invoice-print-area">
          <div style={styles.header}>
  <img
    src={GripStyleLogo}
    alt="Grip Style Logo"
    style={styles.logo}
  />

  <h1 style={styles.companyName}>
    Mohua's Fashion Industries Pvt. Ltd
  </h1>

  <p style={styles.address}>
    55/6 S.B.N.G LANE, BARANAGAR,
    <br />
    KOLKATA - 700036
  </p>

  <h2 style={styles.invoiceTitle}>
    Invoice {invoiceNumber}
  </h2>

  <p style={styles.date}>
    {new Date(completedAt).toLocaleDateString()}
  </p>
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
                <th style={styles.th}>Taxable</th>
                <th style={styles.th}>Tax</th>
                <th style={styles.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => {
                const cgst = Number(item.cgst) || 0;
                const itemTotal = item.price * item.quantity;
                const itemTaxable = itemTotal / (100 + 2 * cgst) * 100;
                const itemTax = itemTaxable * (cgst / 100) * 2;
                return (
                  <tr key={item.id}>
                    <td style={styles.td}>{item.name}</td>
                    <td style={styles.td}>{item.quantity}</td>
                    <td style={styles.td}>₹{item.price.toFixed(2)}</td>
                    <td style={styles.td}>₹{itemTaxable.toFixed(2)}</td>
                    <td style={styles.td}>₹{itemTax.toFixed(2)}</td>
                    <td style={styles.td}>₹{itemTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
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
          <div style={styles.barcodeContainer}>
  <Barcode
    value={invoiceNumber}
    width={1.6}
    height={50}
    fontSize={12}
    displayValue={true}
    margin={0}
  />
</div>
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
  
  header: {
  textAlign: 'center',
  marginBottom: '20px',
  color: '#000'
},

logo: {
  width: '400px',
  height: '180px',
  objectFit: 'contain',
  marginBottom: '-20px',
  marginTop: '-20px'
},
companyName: {
  margin: 0,
  fontSize: '1.6rem',
  fontWeight: '900',
  color: '#000',
  letterSpacing: '1px'
},
barcodeContainer: {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '25px',
  paddingTop: '15px',
  borderTop: '2px solid #000'
},
address: {
  margin: '8px 0 12px 0',
  fontSize: '0.9rem',
  fontWeight: '700',
  color: '#000',
  lineHeight: '1.5'
},

invoiceTitle: {
  margin: 0,
  fontSize: '1.3rem',
  fontWeight: '900',
  color: '#000'
},

date: {
  marginTop: '6px',
  fontSize: '0.9rem',
  fontWeight: '700',
  color: '#000'
},

customerBlock: {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  borderBottom: '2px solid #000',
  paddingBottom: '10px',
  marginBottom: '12px',
  fontSize: '0.95rem',
  fontWeight: '800',
  color: '#000'
},

table: {
  width: '100%',
  borderCollapse: 'collapse',
  marginBottom: '15px',
  fontSize: '0.8rem',
  color: '#000'
},

th: {
  textAlign: 'left',
  borderBottom: '2px solid #000',
  padding: '6px 4px',
  color: '#000',
  fontWeight: '900'
},

td: {
  padding: '6px 4px',
  borderBottom: '1px solid #000',
  color: '#000',
  fontWeight: '700'
},

summaryRow: {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.95rem',
  color: '#000',
  fontWeight: '800',
  marginBottom: '6px'
},

summaryTotal: {
  display: 'flex',
  justifyContent: 'space-between',
  fontWeight: '900',
  fontSize: '1.25rem',
  borderTop: '2px solid #000',
  paddingTop: '8px',
  marginTop: '8px',
  color: '#000'
},

subTitle: {
  fontSize: '1rem',
  margin: '0 0 8px 0',
  color: '#000',
  fontWeight: '900'
},
overlay: {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(0,0,0,0.65)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999
},

modalWindow: {
  backgroundColor: '#fff',
  width: '90%',
  maxWidth: '850px',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '35px',
  borderRadius: '12px',
  boxShadow: '0 8px 35px rgba(0,0,0,0.35)'
},

summaryBlock: {
  marginTop: '20px',
  marginBottom: '20px'
},

paymentsBlock: {
  marginTop: '15px',
  marginBottom: '20px'
},

actions: {
  display: 'flex',
  gap: '12px',
  marginTop: '20px'
},

printButton: {
  flex: 1,
  padding: '12px',
  border: '1px solid #000',
  backgroundColor: '#f5f5f5',
  fontWeight: 'bold',
  fontSize: '1rem',
  cursor: 'pointer',
  borderRadius: '6px'
},

newSaleButton: {
  flex: 1,
  padding: '12px',
  border: 'none',
  backgroundColor: '#000',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '1rem',
  cursor: 'pointer',
  borderRadius: '6px'
}

};

export default InvoiceBill;