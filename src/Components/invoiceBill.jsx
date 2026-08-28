import React, { useState } from 'react';
import GripStyleLogo from "../assets/gripstyle-logo.png";
import Barcode from 'react-barcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Same Baileys WhatsApp service used elsewhere in the app.
const WA_SERVICE_URL = 'https://lightsalmon-pigeon-313595.hostingersite.com';

function InvoiceBill({ invoice, onClose }) {
  const { invoiceNumber, customer, cart, totalAmount, discount, taxAmount, payableAmount, payments, completedAt } = invoice;

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState('');
  // Tracks whether the logo image actually loaded. Bundlers resolve the
  // `import` above at build time, so the file existing there doesn't
  // guarantee the built/deployed asset URL actually resolves at runtime
  // (moved/renamed file, case-sensitivity mismatch between a Windows/Mac
  // dev machine and a Linux host, or the file never got committed/deployed
  // in the first place). Rather than silently leaving blank space when
  // that happens, surface it clearly so it's obvious what to fix.
  const [logoFailed, setLogoFailed] = useState(false);

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
    // MRP isn't always named consistently coming off the cart item, so try
    // the common variants before falling back to the selling price.
    const mrp = Number(item.mrp ?? item.MRP ?? item.Mrp ?? item.price) || 0;
    // Per-item discount is the gap between MRP and the actual sale price,
    // scaled by quantity — this was previously hardcoded to ₹0.00 below.
    const itemDiscount = Math.max(mrp - item.price, 0) * item.quantity;
    return { ...item, cgst, itemTotal, itemTaxable, itemTax, hsn, mrp, itemDiscount };
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

  // The invoice-level `discount` field isn't always populated correctly
  // upstream (it can come through as ₹0.00 even when individual items were
  // sold below MRP), so derive the real total discount from the cart items
  // themselves — same math already used for each row's "Disc.Amt" column —
  // and use whichever is larger as the source of truth.
  const computedDiscount = cart.reduce(
    (sum, item) => sum + withItemMath(item).itemDiscount,
    0
  );
  const discountValue = Math.max(computedDiscount, Number(discount) || 0);
  const hasDiscount = discountValue > 0;

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
              /* printArea already carries its own left/right padding now,
                 so keep this smaller to avoid doubling up the margins. */
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

  // ── Renders the invoice area to a canvas, then wraps it in a single-page PDF ──
  const generateInvoicePdfBlob = async () => {
    const element = document.getElementById('invoice-print-area');
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

  // ── Generate the PDF client-side and upload it to the WhatsApp service ──
  const handleSendWhatsApp = async () => {
    const phoneNumber = customer?.mobileNumber ?? customer?.phoneNumber;

    if (!phoneNumber) {
      setWhatsappStatus('❌ No phone number on file for this customer.');
      return;
    }

    setIsSendingWhatsApp(true);
    setWhatsappStatus('Generating PDF...');

    try {
      const pdfBlob = await generateInvoicePdfBlob();
      if (!pdfBlob) throw new Error('Could not generate invoice PDF.');

      setWhatsappStatus('Sending via WhatsApp...');

      const formData = new FormData();
      formData.append('phoneNumber', phoneNumber);
      formData.append('invoiceNumber', invoiceNumber);
      formData.append('customerName', customer?.customerName ?? customer?.name ?? '');
      formData.append('invoicePdf', pdfBlob, `Invoice_${invoiceNumber}.pdf`);

      const res = await fetch(`${WA_SERVICE_URL}/send-invoice`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        setWhatsappStatus('✅ Invoice sent via WhatsApp');
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
        <div id="invoice-print-area" style={styles.printArea}>

          {/* Header Section */}
          <div style={styles.header}>
            <img
              src={GripStyleLogo}
              alt="Grip Style Logo"
              style={styles.logo}
              onError={(e) => {
                // Don't let a broken image just vanish into blank space —
                // log it loudly (visible in the browser console / any
                // error-reporting tool wired up) so a missing/renamed/
                // case-mismatched asset on deploy is obvious immediately
                // instead of showing up later as "the logo is just gone".
                console.error(
                  `Invoice logo failed to load from resolved URL: ${e.currentTarget.src}. ` +
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

          <h2 style={styles.taxInvoiceTitle}>TAX INVOICE</h2>

          <div style={styles.metaRow}>
            <span>INVOICE NO.: {invoiceNumber}</span>
            {/* <span>{new Date(completedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> */}
          </div>

          <div style={styles.customerBlock}>
            <p style={styles.customerRow}>CUSTOMER ID: {customer?.id ?? 'WALK-IN'}</p>
            <p style={styles.customerRow}>CUSTOMER NAME: {customer?.customerName ?? customer?.name ?? 'WALK-IN'}</p>
            <p style={styles.customerRow}>MOBILE NO: {customer?.mobileNumber ?? customer?.phoneNumber ?? '-'}</p>
          </div>

          {/* Main Items Table */}
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
                  {rateGroups[rate].map(withItemMath).map((item) => (
                    <React.Fragment key={item.id}>
                      <tr>
                        <td style={styles.td}>{item.barcode ?? item.id}</td>
                        <td style={styles.td}>{item.quantity} PC</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.mrp.toFixed(2)}</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.itemDiscount.toFixed(2)}</td>
                        <td style={{...styles.td, textAlign: 'right'}}>₹{item.itemTotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style={styles.tdSub}>{item.name}</td>
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

          {/* Totals Section
              Note: "Total Discount" line intentionally removed here — the
              discount is now only surfaced as the "YOU SAVED" stamp near the
              bottom, which sums each item's individual MRP-vs-sale-price
              discount rather than relying on the (unreliable) invoice-level
              discount field. */}
          <div style={styles.totalsBlock}>
            <div style={styles.summaryRow}><span>Gross Total:</span><span>₹{totalAmount.toFixed(2)}</span></div>
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

          {/* Tender Detail — the "YOU SAVED" stamp overlays the payments
              block specifically (not the heading), centered. The payment
              rows get a light background + higher z-index than the stamp so
              the amounts stay fully legible while the stamp still shows
              through the surrounding gaps, like a rubber stamp under glass. */}
          <div>
            <h3 style={styles.subTitle}>Tender Detail</h3>
            <div style={styles.paymentsWrap}>
              {hasDiscount && (
                <div style={styles.savingsStampOverlay}>
                  <div style={styles.savingsStamp}>
                    <div style={styles.savingsStampStars}>★ ★ ★</div>
                    <div style={styles.savingsStampLabel}>YOU SAVED</div>
                    <div style={styles.savingsStampAmount}>₹{discountValue.toFixed(2)}</div>
                    <div style={styles.savingsStampStars}>★ ★ ★</div>
                  </div>
                </div>
              )}
              <div style={styles.paymentsBlock}>
                {(payments ?? []).map((p, i) => (
                  <div key={i} style={styles.tenderRow}>
                    <span>{p.method}</span>
                    <span></span>
                    <span style={styles.tenderRowAmount}>₹{p.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div style={styles.tenderRow}>
                  <span>TOTAL RECEIVED AMOUNT</span>
                  <span></span>
                  <span style={styles.tenderRowAmount}>₹{totalReceived.toFixed(2)}</span>
                </div>
                <div style={styles.tenderRow}>
                  <span>CHANGE DUE</span>
                  <span></span>
                  <span style={styles.tenderRowAmount}>₹{changeDue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={styles.countsRow}>
            <span>NO OF ITEMS: {cart.length}</span>
            <span>TOTAL QTY: {totalQty}</span>
          </div>

          <ul style={styles.termsList}>
            <li>All offers are subject to applicable T&C.</li>
            <li>Please retain the product label and invoice to be eligible to return/exchange the product within 7 days from the date of invoice.</li>
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
          <button
            style={styles.whatsappButton}
            onClick={handleSendWhatsApp}
            disabled={isSendingWhatsApp}
          >
            {isSendingWhatsApp ? 'Sending...' : 'Send via WhatsApp'}
          </button>
          <button style={styles.newSaleButton} onClick={onClose}>New Sale</button>
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
    backgroundColor: '#fff', width: '100%', maxWidth: '600px', // Narrows the modal to feel more like a receipt
    maxHeight: '90vh', overflowY: 'auto', padding: '30px',
    borderRadius: '8px', boxShadow: '0 8px 35px rgba(0,0,0,0.2)'
  },
  header: {display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center", marginBottom: '15px' },
  logo: { width: '250px', objectFit: 'contain', marginBottom: '5px' }, // Shrunk logo
  companyName: { margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 'bold' },
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
  paymentsBlock: { marginTop: '10px', marginBottom: '15px', position: 'relative', zIndex: 1 },
  // Grid layout (label | reserved gap | amount) instead of flex
  // space-between, so the middle column stays a fixed width no matter how
  // long the label or amount text is — guaranteeing the stamp overlay never
  // collides with either regardless of content.
  tenderRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 104px 1fr',
    fontSize: '0.9rem',
    marginBottom: '4px'
  },
  tenderRowAmount: { textAlign: 'right' },
  // Wraps just the payments rows (not the "Tender Detail" heading) so the
  // stamp overlay below centers on this block specifically.
  paymentsWrap: { position: 'relative' },
  // Sized and centered to sit in the blank gap between the left-aligned
  // labels (Cash, TOTAL RECEIVED AMOUNT, CHANGE DUE) and the right-aligned
  // amounts — small enough not to overlap either column.
  savingsStampOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2,
    pointerEvents: 'none'
  },
  countsRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 'bold', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', marginBottom: '15px' },
  termsList: { fontSize: '0.75rem', color: '#333', paddingLeft: '15px', marginBottom: '15px', lineHeight: '1.4' },
  barcodeContainer: { display: 'flex', justifyContent: 'center', marginTop: '10px' },
  // Padding lives on the print area itself (not just the on-screen modal)
  // so both the print iframe and the html2canvas/PDF capture — which grab
  // this element's innerHTML/DOM directly — get proper side margins instead
  // of content running flush to the page edges.
  printArea: { padding: '8px 28px 24px 28px' },
  // "You Saved" stamp styles — sized to fit the blank gap between the
  // payment labels and their amounts, not overlapping either.
  savingsStamp: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    border: '2px double #d9232d',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'rotate(-15deg)',
    color: '#d9232d',
    textAlign: 'center',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    opacity: 0.85
  },
  savingsStampStars: {
    fontSize: '0.45rem',
    letterSpacing: '1.5px',
    lineHeight: 1
  },
  savingsStampLabel: {
    fontSize: '0.58rem',
    fontWeight: 'bold',
    letterSpacing: '0.8px',
    margin: '3px 0'
  },
  savingsStampAmount: {
    fontSize: '0.82rem',
    fontWeight: 900,
    letterSpacing: '0.3px'
  },
  actions: { display: 'flex', gap: '12px', marginTop: '20px' },
  printButton: { flex: 1, padding: '10px', border: '1px solid #000', backgroundColor: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  whatsappButton: { flex: 1, padding: '10px', border: 'none', backgroundColor: '#25D366', color: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  newSaleButton: { flex: 1, padding: '10px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' },
  whatsappStatus: { marginTop: '10px', fontSize: '0.85rem', textAlign: 'center', color: '#333' }
};

export default InvoiceBill;