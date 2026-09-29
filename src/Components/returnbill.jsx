import React, { useState } from 'react';
import GripStyleLogo from "../assets/gripstyle-logo.png";
import Barcode from 'react-barcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Same Baileys WhatsApp service used by InvoiceBill.
const WA_SERVICE_URL = 'https://lightsalmon-pigeon-313595.hostingersite.com';

function ReturnBill({ returnData, onClose }) {
  const {
    returnInvoiceNumber,
    originalInvoiceNumber,
    customerId,
    customerName,
    customerMobile,
    items = [],
    totalAmount,
    previousCustomerBalance,
    updatedCustomerBalance,
    completedAt
  } = returnData;

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);

  // ── Per-item math — identical to InvoiceBill's withItemMath, keyed off the
  // return item fields (salePrice / lineTotal / productName) instead of the
  // cart fields (price / name). lineTotal is the after-tax amount, so the
  // taxable value is backed out of it exactly like InvoiceBill does.
  const withItemMath = (item) => {
    const cgst = Number(item.cgst) || 0;
    const quantity = Number(item.quantity) || 0;
    const salePrice = Number(item.salePrice) || 0;
    const itemTotal = Number(item.lineTotal) || salePrice * quantity;
    const itemTaxable = itemTotal / (100 + 2 * cgst) * 100;
    const itemTax = itemTaxable * (cgst / 100) * 2;
    const hsn = item.hsn ?? item.hsnCode ?? item.HSNCode ?? '-';
    // MRP isn't always named consistently, so try the common variants and
    // fall back to the sale price (=> zero discount) if none is supplied.
    const mrp = Number(item.mrp ?? item.MRP ?? item.Mrp ?? item.salePrice) || 0;
    const itemDiscount = Math.max(mrp - salePrice, 0) * quantity;
    return { ...item, cgst, quantity, salePrice, itemTotal, itemTaxable, itemTax, hsn, mrp, itemDiscount };
  };

  const mathItems = items.map(withItemMath);

  // ── Group items by their CGST rate ──
  const rateGroups = {};
  mathItems.forEach((item) => {
    if (!rateGroups[item.cgst]) rateGroups[item.cgst] = [];
    rateGroups[item.cgst].push(item);
  });
  const sortedRates = Object.keys(rateGroups).map(Number).sort((a, b) => a - b);
  const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  const taxDetailRows = sortedRates.map((rate, idx) => {
    const grouped = rateGroups[rate];
    const taxableValue = grouped.reduce((sum, i) => sum + i.itemTaxable, 0);
    const cgstAmt = taxableValue * (rate / 100);
    const sgstAmt = taxableValue * (rate / 100);
    return {
      label: groupLabels[idx] ?? `${idx + 1}`,
      rate,
      taxableValue,
      cgstAmt,
      sgstAmt,
      cessAmt: 0,
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

  const totalQty = mathItems.reduce((sum, item) => sum + item.quantity, 0);
  const grossTotal = mathItems.reduce((sum, item) => sum + item.itemTotal, 0);

  // Refund amount: prefer the value the caller supplied, else the item sum.
  const resolvedTotal = totalAmount != null ? Number(totalAmount) : grossTotal;

  // previousCustomerBalance may not always be supplied (e.g. a historical
  // return fetched from the backend) — derive it, since wallet credits only
  // ever add to the balance.
  const resolvedPreviousBalance =
    previousCustomerBalance != null
      ? Number(previousCustomerBalance)
      : Number(updatedCustomerBalance ?? 0) - resolvedTotal;

  const resolvedUpdatedBalance =
    updatedCustomerBalance != null
      ? Number(updatedCustomerBalance)
      : resolvedPreviousBalance + resolvedTotal;

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
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              margin: 0;
              /* printArea already carries its own left/right padding, so
                 keep this smaller to avoid doubling up the margins. */
              padding: 10px;
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

  // ── Renders the print area to a canvas, then wraps it in a single-page PDF ──
  const generateReturnPdfBlob = async () => {
    const element = document.getElementById('return-print-area');
    if (!element) return null;

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true
    });
    const imgData = canvas.toDataURL('image/png');

    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    return pdf.output('blob');
  };

  // ── Send the customer a WhatsApp text with their digital bill link ──
  // Same flow as InvoiceBill (/send-text with a digital-bill link).
  const DIGITAL_BILL_BASE_URL = 'https://gripstyle.in/user'; // ← needs your real hosted-bill URL pattern

  const handleSendWhatsApp = async () => {
    const phoneNumber = customerMobile;

    if (!phoneNumber) {
      setWhatsappStatus('❌ No phone number on file for this customer.');
      return;
    }

    setIsSendingWhatsApp(true);
    setWhatsappStatus('Sending via WhatsApp...');

    try {
      const billLink = `${DIGITAL_BILL_BASE_URL}`;
      const message =
        `Dear Customer,\n` +
        `Thanks for shopping at GripStyle. As part of our green initiative, your digital bill awaits: ${billLink}\n` +
        `Happy Shopping!.\n\n` +
        `Return Invoice Number: ${returnInvoiceNumber}\n` +
        `Total Refund Amount (credited to wallet): ₹${resolvedTotal.toFixed(2)}`;

      const res = await fetch(`${WA_SERVICE_URL}/send-text`, { // ← confirm this path
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, message }),
      });
      const data = await res.json();

      if (data.success) {
        setWhatsappStatus('✅ Return receipt sent via WhatsApp');
      } else {
        setWhatsappStatus(`❌ ${data.message}`);
      }
    } catch (err) {
      console.error('WhatsApp send error:', err);
      setWhatsappStatus(`⚠️ Failed to send: ${err.message}`);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <div id="return-print-area" style={styles.printArea}>

          {/* Header Section */}
          <div style={styles.header}>
            <img
              src={GripStyleLogo}
              alt="Grip Style Logo"
              style={styles.logo}
              onError={(e) => {
                console.error(
                  `Return bill logo failed to load from resolved URL: ${e.currentTarget.src}. ` +
                  'Check that the asset file still exists at src/assets/gripstyle-logo.png, ' +
                  'that it was committed/deployed, and that its filename casing matches ' +
                  'exactly (case-sensitive on Linux hosts).'
                );
                setLogoFailed(true);
              }}
            />
            {logoFailed && (
              <p style={{ ...styles.address, color: '#dc3545', fontSize: '0.75rem', margin: '4px 0 0 0' }}>
                (Logo image failed to load — check console for details)
              </p>
            )}
            <h1 style={styles.companyName}>Mohua's Fashion Industries Pvt. Ltd</h1>
            <p style={styles.address}>
              Registered Office: 55/6 S.B.N.G LANE, BARANAGAR, KOLKATA - 700036
            </p>
          </div>

          <div style={styles.legalBlock}>
            <p style={styles.legalRow}>Place Of Supply: Baranagar, Kolkata, West Bengal - 700036</p>
            <p style={styles.legalRow}>GSTIN NO: 19AAUCM4631Q1ZH</p>
            <p style={styles.legalRow}>CIN: U47711WB2026PTC286757</p>
          </div>

          <h2 style={styles.taxInvoiceTitle}>RETURN INVOICE</h2>

          <div style={styles.metaRow}>
            <span>RETURN INVOICE NO.: {returnInvoiceNumber}</span>
          </div>
          {originalInvoiceNumber && (
            <div style={styles.metaAgainstRow}>
              <span>AGAINST INVOICE: {originalInvoiceNumber}</span>
            </div>
          )}
          {completedAt && (
            <div style={styles.metaSubRow}>
              <span>{new Date(completedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}

          <div style={styles.customerBlock}>
            {customerId != null && (
              <p style={styles.customerRow}>CUSTOMER ID: {customerId}</p>
            )}
            <p style={styles.customerRow}>CUSTOMER NAME: {customerName ?? 'WALK-IN'}</p>
            <p style={styles.customerRow}>MOBILE NO: {customerMobile ?? '-'}</p>
          </div>

          {/* Main Items Table — same 5-column layout as InvoiceBill, grouped
              by CGST/SGST rate, with a description / HSN / taxable sub-row. */}
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: '35%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={styles.th}>Item</th>
                <th style={styles.th}>QTY/Unit</th>
                <th style={{...styles.th, textAlign: 'right'}}>Price</th>
                <th style={{...styles.th, textAlign: 'right'}}>Disc.Amt</th>
                <th style={{...styles.th, textAlign: 'right'}}>Net.Amt</th>
              </tr>
              <tr>
                <th style={styles.thSub}>Description</th>
                <th style={styles.thSub}>HSN-SAC</th>
                <th style={styles.thSub}></th>
                <th style={{...styles.thSub, textAlign: 'right'}} colSpan={2}>Taxable Amount</th>
              </tr>
            </thead>
            <tbody>
              {sortedRates.map((rate, groupIdx) => (
                <React.Fragment key={rate}>
                  <tr>
                    <td colSpan={5} style={styles.groupHeaderCell}>
                      {groupLabels[groupIdx] ?? groupIdx + 1}) CGST@{rate}% SGST@{rate}%
                    </td>
                  </tr>
                  {rateGroups[rate].map((item, i) => (
                    <React.Fragment key={`${item.productId}-${i}`}>
                      <tr>
                        <td style={styles.td}>{item.barcode ?? item.productId}</td>
                        <td style={styles.td}>{item.quantity} PC</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.mrp.toFixed(2)}</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.itemDiscount.toFixed(2)}</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.itemTotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style={styles.tdSub}>{item.productName ?? item.name}</td>
                        <td style={styles.tdSub}>{item.hsn}</td>
                        <td style={styles.tdSub}></td>
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
            <div style={styles.summaryRow}><span>Gross Total:</span><span>₹{grossTotal.toFixed(2)}</span></div>
            <div style={styles.summaryTotal}><span>Total Return Amount:</span><span>₹{resolvedTotal.toFixed(2)}</span></div>
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

          {/* Wallet Update — takes the place of InvoiceBill's Tender Detail,
              with the same grid rows and a centered stamp overlay. */}
          <div>
            <h3 style={styles.subTitle}>Wallet Update</h3>
            <div style={styles.paymentsWrap}>
              <div style={styles.stampOverlay}>
                <div style={styles.returnStamp}>
                  <div style={styles.stampStars}>★ ★ ★</div>
                  <div style={styles.stampLabel}>RETURNED</div>
                  <div style={styles.stampAmount}>₹{resolvedTotal.toFixed(2)}</div>
                  <div style={styles.stampStars}>★ ★ ★</div>
                </div>
              </div>
              <div style={styles.paymentsBlock}>
                <div style={styles.tenderRow}>
                  <span>PREVIOUS WALLET BALANCE</span>
                  <span></span>
                  <span style={styles.tenderRowAmount}>₹{resolvedPreviousBalance.toFixed(2)}</span>
                </div>
                <div style={styles.tenderRow}>
                  <span>AMOUNT CREDITED (THIS RETURN)</span>
                  <span></span>
                  <span style={styles.tenderRowAmount}>₹{resolvedTotal.toFixed(2)}</span>
                </div>
                <div style={styles.tenderRowTotal}>
                  <span>UPDATED WALLET BALANCE</span>
                  <span></span>
                  <span style={styles.tenderRowAmount}>₹{resolvedUpdatedBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={styles.countsRow}>
            <span>NO OF ITEMS: {items.length}</span>
            <span>TOTAL QTY: {totalQty}</span>
          </div>

          <ul style={styles.termsList}>
            <li>The refunded amount has been credited to the customer's wallet balance and can be redeemed against a future purchase.</li>
            <li>Please retain this return receipt along with the original invoice for your records.</li>
          </ul>

          <div style={styles.barcodeContainer}>
            <Barcode
              value={returnInvoiceNumber}
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
          <button
            style={styles.whatsappButton}
            onClick={handleSendWhatsApp}
            disabled={isSendingWhatsApp}
          >
            {isSendingWhatsApp ? 'Sending...' : 'Send via WhatsApp'}
          </button>
          <button style={styles.closeButton} onClick={onClose}>Close</button>
        </div>

        {whatsappStatus && (
          <div style={styles.whatsappStatus}>{whatsappStatus}</div>
        )}
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
    backgroundColor: '#fff', width: '100%', maxWidth: '600px',
    maxHeight: '90vh', overflowY: 'auto', padding: '30px',
    borderRadius: '8px', boxShadow: '0 8px 35px rgba(0,0,0,0.2)'
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: '15px'
  },
  logo: { width: '250px', objectFit: 'contain', marginBottom: '5px' },
  companyName: { margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 'bold' },
  address: { margin: 0, fontSize: '0.85rem', color: '#333' },
  legalBlock: { textAlign: 'center', padding: '10px 0', marginBottom: '10px' },
  legalRow: { margin: '2px 0', fontSize: '0.8rem', color: '#333' },
  taxInvoiceTitle: { textAlign: 'center', margin: '0 0 15px 0', fontSize: '1.1rem', fontWeight: 'bold' },
  metaRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '2px' },
  metaAgainstRow: { fontSize: '0.85rem', marginBottom: '2px' },
  metaSubRow: { display: 'flex', justifyContent: 'flex-end', fontSize: '0.78rem', color: '#666', marginBottom: '10px' },
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
  paymentsBlock: { marginTop: '10px', marginBottom: '15px', position: 'relative', zIndex: 1 },
  // Grid layout (label | reserved gap | amount) so the stamp overlay never
  // collides with either column — same trick InvoiceBill uses.
  tenderRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 104px 1fr',
    fontSize: '0.9rem',
    marginBottom: '4px'
  },
  tenderRowTotal: {
    display: 'grid',
    gridTemplateColumns: '1fr 104px 1fr',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    borderTop: '1px dashed #000',
    paddingTop: '8px',
    marginTop: '4px'
  },
  tenderRowAmount: { textAlign: 'right' },
  paymentsWrap: { position: 'relative' },
  stampOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2,
    pointerEvents: 'none'
  },
  returnStamp: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    border: '2px double #2C6B4B',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'rotate(-15deg)',
    color: '#2C6B4B',
    textAlign: 'center',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    opacity: 0.85
  },
  stampStars: { fontSize: '0.45rem', letterSpacing: '1.5px', lineHeight: 1 },
  stampLabel: { fontSize: '0.58rem', fontWeight: 'bold', letterSpacing: '0.8px', margin: '3px 0' },
  stampAmount: { fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.3px' },
  countsRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 'bold', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', marginBottom: '15px' },
  termsList: { fontSize: '0.75rem', color: '#333', paddingLeft: '15px', marginBottom: '15px', lineHeight: '1.4' },
  barcodeContainer: { display: 'flex', justifyContent: 'center', marginTop: '10px' },
  printArea: { padding: '8px 28px 24px 28px' },
  actions: { display: 'flex', gap: '12px', marginTop: '20px' },
  printButton: { flex: 1, padding: '10px', border: '1px solid #000', backgroundColor: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  whatsappButton: { flex: 1, padding: '10px', border: 'none', backgroundColor: '#25D366', color: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  closeButton: { flex: 1, padding: '10px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  whatsappStatus: { marginTop: '10px', fontSize: '0.85rem', textAlign: 'center', color: '#333' }
};

export default ReturnBill;