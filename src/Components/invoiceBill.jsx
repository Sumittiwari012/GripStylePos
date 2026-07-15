import React from 'react';
import GripStyleLogo from "../assets/gripstyle-logo.png";
import Barcode from 'react-barcode';

function InvoiceBill({ invoice, onClose }) {
  const { invoiceNumber, customer, cart, totalAmount, discount, taxAmount, payableAmount, payments, completedAt } = invoice;

  // ── Group items by their CGST rate ──
  const rateGroups = {};
  cart.forEach((item) => {
    const rate = Number(item.cgst) || 0;
    if (!rateGroups[rate]) rateGroups[rate] = [];
    rateGroups[rate].push(item);
  });
  const sortedRates = Object.keys(rateGroups).map(Number).sort((a, b) => a - b);
  const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  const withItemMath = (item) => {
    const cgst = Number(item.cgst) || 0;
    const itemTotal = item.price * item.quantity;
    const itemTaxable = itemTotal / (100 + 2 * cgst) * 100;
    const itemTax = itemTaxable * (cgst / 100) * 2;
    const hsn = item.hsn ?? item.hsnCode ?? item.HSNCode ?? '-';
    return { ...item, cgst, itemTotal, itemTaxable, itemTax, hsn };
  };

  const taxDetailRows = sortedRates.map((rate, idx) => {
    const items = rateGroups[rate].map(withItemMath);
    const taxableValue = items.reduce((sum, i) => sum + i.itemTaxable, 0);
    const cgstAmt = taxableValue * (rate / 100);
    const sgstAmt = taxableValue * (rate / 100);
    return {
      label: groupLabels[idx] ?? `${idx + 1}`,
      rate,
      taxableValue,
      cgstAmt,
      sgstAmt,
      cessAmt: 0, // Added to match Zudio structure
      totalAmt: taxableValue + cgstAmt + sgstAmt
    };
  });

  const taxDetailTotals = taxDetailRows.reduce(
    (acc, row) => ({
      taxableValue: acc.taxableValue + row.taxableValue,
      cgstAmt: acc.cgstAmt + row.cgstAmt,
      sgstAmt: acc.sgstAmt + row.sgstAmt,
      cessAmt: acc.cessAmt + row.cessAmt,
      totalAmt: acc.totalAmt + row.totalAmt
    }),
    { taxableValue: 0, cgstAmt: 0, sgstAmt: 0, cessAmt: 0, totalAmt: 0 }
  );

  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalReceived = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);
  const changeDue = Math.max(totalReceived - payableAmount, 0);

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
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              margin: 0;
              padding: 20px;
              color: #000;
              font-size: 12px;
            }
            table { width: 100%; border-collapse: collapse; color: #000; }
            th, td { color: #000 !important; }
            h1, h2, h3, p, span, div { color: #000 !important; }
            .text-right { text-align: right !important; }
            .text-left { text-align: left !important; }
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
        <div id="invoice-print-area">

          {/* Header Section */}
          <div style={styles.header}>
            <img src={GripStyleLogo} alt="Grip Style Logo" style={styles.logo} />
            <h1 style={styles.companyName}>Mohua's Fashion Industries Pvt. Ltd</h1>
            <p style={styles.address}>
              Registered Office: 55/6 S.B.N.G LANE, BARANAGAR, KOLKATA - 700036
            </p>
          </div>

          <div style={styles.legalBlock}>
            <p style={styles.legalRow}>Place Of Supply: Baranagar, Kolkata, West Bengal - 700036</p>
            <p style={styles.legalRow}>GSTIN NO: 19AAUCM4631Q1ZH</p>
            <p style={styles.legalRow}>CIN: L24240MH1952PLC008951</p>
          </div>

          <h2 style={styles.taxInvoiceTitle}>TAX INVOICE</h2>

          <div style={styles.metaRow}>
            <span>INVOICE NO.: {invoiceNumber}</span>
            <span>{new Date(completedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>

          <div style={styles.customerBlock}>
            <p style={styles.customerRow}>CUSTOMER ID: {customer?.id ?? 'WALK-IN'}</p>
            <p style={styles.customerRow}>CUSTOMER NAME: {customer?.customerName ?? customer?.name ?? 'WALK-IN'}</p>
            <p style={styles.customerRow}>MOBILE NO: {customer?.mobileNumber ?? customer?.phoneNumber ?? '-'}</p>
          </div>

          {/* Main Items Table */}
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={styles.th}>Item</th>
                <th style={styles.th}>QTY/Unit</th>
                <th style={{...styles.th, textAlign: 'right'}}>Disc.Amt</th>
                <th style={{...styles.th, textAlign: 'right'}}>Net.Amt</th>
              </tr>
              <tr>
                <th style={styles.thSub}>Description</th>
                <th style={styles.thSub}>HSN-SAC</th>
                <th style={{...styles.thSub, textAlign: 'right'}} colSpan={2}>Taxable Amount</th>
              </tr>
            </thead>
            <tbody>
              {sortedRates.map((rate, groupIdx) => (
                <React.Fragment key={rate}>
                  <tr>
                    <td colSpan={4} style={styles.groupHeaderCell}>
                      {groupLabels[groupIdx] ?? groupIdx + 1}) CGST@{rate}% SGST@{rate}%
                    </td>
                  </tr>
                  {rateGroups[rate].map(withItemMath).map((item) => (
                    <React.Fragment key={item.id}>
                      <tr>
                        <td style={styles.td}>{item.barcode ?? item.id}</td>
                        <td style={styles.td}>{item.quantity} PC</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹0.00</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.itemTotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style={styles.tdSub}>{item.name}</td>
                        <td style={styles.tdSub}>{item.hsn}</td>
                        <td style={{...styles.tdSub, textAlign: 'right'}} colSpan={2}>₹{item.itemTaxable.toFixed(2)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Totals Section */}
          <div style={styles.totalsBlock}>
            <div style={styles.summaryRow}><span>Gross Total:</span><span>₹{totalAmount.toFixed(2)}</span></div>
            <div style={styles.summaryRow}><span>Total Discount:</span><span>₹{Number(discount).toFixed(2)}</span></div>
            <div style={styles.summaryTotal}><span>Total Invoice Amount:</span><span>₹{payableAmount.toFixed(2)}</span></div>
          </div>

          <h3 style={styles.subTitle}>Tax Details</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>GST IND</th>
                <th style={{...styles.th, textAlign: 'right'}}>Taxable Value</th>
                <th style={{...styles.th, textAlign: 'right'}}>CGST</th>
                <th style={{...styles.th, textAlign: 'right'}}>SGST</th>
                <th style={{...styles.th, textAlign: 'right'}}>CESS</th>
                <th style={{...styles.th, textAlign: 'right'}}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {taxDetailRows.map((row) => (
                <tr key={row.label}>
                  <td style={styles.td}>{row.label})</td>
                  <td style={{...styles.td, textAlign: 'right'}}>₹{row.taxableValue.toFixed(2)}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>₹{row.cgstAmt.toFixed(2)}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>₹{row.sgstAmt.toFixed(2)}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>₹{row.cessAmt.toFixed(2)}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>₹{row.totalAmt.toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={styles.tdTotal}>Total</td>
                <td style={{...styles.tdTotal, textAlign: 'right'}}>₹{taxDetailTotals.taxableValue.toFixed(2)}</td>
                <td style={{...styles.tdTotal, textAlign: 'right'}}>₹{taxDetailTotals.cgstAmt.toFixed(2)}</td>
                <td style={{...styles.tdTotal, textAlign: 'right'}}>₹{taxDetailTotals.sgstAmt.toFixed(2)}</td>
                <td style={{...styles.tdTotal, textAlign: 'right'}}>₹{taxDetailTotals.cessAmt.toFixed(2)}</td>
                <td style={{...styles.tdTotal, textAlign: 'right'}}>₹{taxDetailTotals.totalAmt.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={styles.subTitle}>Tender Detail</h3>
          <div style={styles.paymentsBlock}>
            {(payments ?? []).map((p, i) => (
              <div key={i} style={styles.summaryRow}>
                <span>{p.method}</span>
                <span>₹{p.amount.toFixed(2)}</span>
              </div>
            ))}
            <div style={styles.summaryRow}>
              <span>TOTAL RECEIVED AMOUNT</span>
              <span>₹{totalReceived.toFixed(2)}</span>
            </div>
            <div style={styles.summaryRow}>
              <span>CHANGE DUE</span>
              <span>₹{changeDue.toFixed(2)}</span>
            </div>
          </div>

          <div style={styles.countsRow}>
            <span>NO OF ITEMS: {cart.length}</span>
            <span>TOTAL QTY: {totalQty}</span>
          </div>

          <ul style={styles.termsList}>
            <li>All offers are subject to applicable T&C.</li>
            <li>Please retain the product label and invoice to be eligible to return/exchange the product within 30 days from the date of invoice.</li>
            <li>All products which need to be exchanged should be in their original condition.</li>
            <li>If you do not have a product label and an invoice, return/exchange will not be accepted.</li>
          </ul>

          <div style={styles.barcodeContainer}>
            <Barcode
              value={invoiceNumber}
              width={1.2}
              height={40}
              fontSize={11}
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
  overlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center',
    alignItems: 'center', zIndex: 9999
  },
  modalWindow: {
    backgroundColor: '#fff', width: '100%', maxWidth: '600px', // Narrows the modal to feel more like a receipt
    maxHeight: '90vh', overflowY: 'auto', padding: '30px',
    borderRadius: '8px', boxShadow: '0 8px 35px rgba(0,0,0,0.2)'
  },
  header: { textAlign: 'center', marginBottom: '15px' },
  logo: { width: '150px', objectFit: 'contain', marginBottom: '5px' }, // Shrunk logo
  companyName: { margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 'bold' },
  address: { margin: 0, fontSize: '0.85rem', color: '#333' },
  legalBlock: { textAlign: 'center', padding: '10px 0', marginBottom: '10px' },
  legalRow: { margin: '2px 0', fontSize: '0.8rem', color: '#333' },
  taxInvoiceTitle: { textAlign: 'center', margin: '0 0 15px 0', fontSize: '1.1rem', fontWeight: 'bold' },
  metaRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '10px' },
  customerBlock: { borderBottom: '1px dashed #000', paddingBottom: '10px', marginBottom: '10px' },
  customerRow: { margin: '2px 0', fontSize: '0.85rem' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '0.85rem' },
  th: { borderBottom: '1px solid #000', padding: '6px 2px', textAlign: 'left', fontWeight: 'bold' },
  thSub: { borderBottom: '1px solid #000', padding: '2px 2px 6px 2px', color: '#555', textAlign: 'left', fontWeight: 'normal', fontSize: '0.75rem' },
  td: { padding: '6px 2px 2px 2px', textAlign: 'left' },
  tdSub: { padding: '0 2px 8px 2px', borderBottom: '1px dashed #ccc', color: '#333', textAlign: 'left', fontSize: '0.8rem' },
  tdTotal: { padding: '8px 2px', borderTop: '1px solid #000', borderBottom: '1px solid #000', fontWeight: 'bold' },
  groupHeaderCell: { padding: '10px 2px 4px 2px', fontWeight: 'bold' },
  totalsBlock: { marginBottom: '15px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' },
  summaryTotal: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '8px', marginBottom: '8px' },
  subTitle: { fontSize: '0.95rem', margin: '0 0 8px 0', fontWeight: 'bold' },
  paymentsBlock: { marginTop: '10px', marginBottom: '15px' },
  countsRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 'bold', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', marginBottom: '15px' },
  termsList: { fontSize: '0.75rem', color: '#333', paddingLeft: '15px', marginBottom: '15px', lineHeight: '1.4' },
  barcodeContainer: { display: 'flex', justifyContent: 'center', marginTop: '10px' },
  actions: { display: 'flex', gap: '12px', marginTop: '20px' },
  printButton: { flex: 1, padding: '10px', border: '1px solid #000', backgroundColor: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  newSaleButton: { flex: 1, padding: '10px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }
};

export default InvoiceBill;