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
  // Same "don't let a broken logo silently vanish" guard as InvoiceBill.
  const [logoFailed, setLogoFailed] = useState(false);

  const totalQty = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);

  // previousCustomerBalance may not always be supplied by the caller (e.g. a
  // historical return fetched from the backend that doesn't send it) — in
  // that case derive it, since wallet credits only add to the balance.
  const resolvedPreviousBalance =
    previousCustomerBalance != null
      ? Number(previousCustomerBalance)
      : Number(updatedCustomerBalance ?? 0) - Number(totalAmount ?? 0);

  // ── Tax Details — same grouping/derivation InvoiceBill uses for its cart,
  // just keyed off the return items instead. Each return item's lineTotal
  // already represents the after-tax amount, so the taxable value is backed
  // out of it the same way InvoiceBill backs it out of itemTotal.
  const rateGroups = {};
  items.forEach((item) => {
    const rate = Number(item.cgst) || 0;
    if (!rateGroups[rate]) rateGroups[rate] = [];
    rateGroups[rate].push(item);
  });
  const sortedRates = Object.keys(rateGroups).map(Number).sort((a, b) => a - b);
  const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  const withItemMath = (item) => {
    const cgst = Number(item.cgst) || 0;
    const itemTotal = Number(item.lineTotal) || (Number(item.salePrice) || 0) * (Number(item.quantity) || 0);
    const itemTaxable = itemTotal / (100 + 2 * cgst) * 100;
    const itemTax = itemTaxable * (cgst / 100) * 2;
    return { ...item, cgst, itemTotal, itemTaxable, itemTax };
  };

  const taxDetailRows = sortedRates.map((rate, idx) => {
    const grouped = rateGroups[rate].map(withItemMath);
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
  // Same approach as InvoiceBill.generateInvoicePdfBlob.
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

  // ── Generate the PDF client-side and upload it to the WhatsApp service ──
  // NOTE: this reuses the same /send-invoice endpoint InvoiceBill posts to,
  // assuming the backend treats it as "send this PDF to this number" rather
  // than something invoice-specific. A `documentType: 'return'` field is
  // included so the backend can branch on it (e.g. a different message
  // template) if needed — confirm with the backend whether that's honored,
  // or whether a dedicated endpoint (e.g. /send-return) should be used instead.
  const handleSendWhatsApp = async () => {
    const phoneNumber = customerMobile;

    if (!phoneNumber) {
      setWhatsappStatus('❌ No phone number on file for this customer.');
      return;
    }

    setIsSendingWhatsApp(true);
    setWhatsappStatus('Generating PDF...');

    try {
      const pdfBlob = await generateReturnPdfBlob();
      if (!pdfBlob) throw new Error('Could not generate return PDF.');

      setWhatsappStatus('Sending via WhatsApp...');

      const formData = new FormData();
      formData.append('phoneNumber', phoneNumber);
      formData.append('invoiceNumber', returnInvoiceNumber);
      formData.append('customerName', customerName ?? '');
      formData.append('documentType', 'return');
      formData.append('invoicePdf', pdfBlob, `Return_${returnInvoiceNumber}.pdf`);

      const res = await fetch(`${WA_SERVICE_URL}/send-invoice`, {
        method: 'POST',
        body: formData
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

          {/* Header Section — mirrors InvoiceBill's header exactly */}
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

          <h2 style={styles.returnInvoiceTitle}>RETURN INVOICE</h2>

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
            <p style={styles.customerRow}>CUSTOMER NAME: {customerName ?? 'WALK-IN'}</p>
            <p style={styles.customerRow}>MOBILE NO: {customerMobile ?? '-'}</p>
          </div>

          {/* Returned Items Table — same visual pattern as InvoiceBill's
              main items table (a "code" row + a description sub-row per
              item), just without CGST grouping or MRP/discount columns
              since a return doesn't carry that breakdown. */}
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
                <th style={styles.th}>QTY</th>
                <th style={{...styles.th, textAlign: 'right'}}>Price</th>
                <th style={{...styles.th, textAlign: 'right'}}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <React.Fragment key={item.productId}>
                  <tr>
                    <td style={styles.td}>{item.barcode ?? item.productId}</td>
                    <td style={styles.td}>{item.quantity} PC</td>
                    <td style={{...styles.td, textAlign: 'right'}}>₹{Number(item.salePrice).toFixed(2)}</td>
                    <td style={{...styles.td, textAlign: 'right'}}>₹{Number(item.lineTotal).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={styles.tdSub} colSpan={4}>{item.productName}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>

          <div style={styles.countsRow}>
            <span>NO OF ITEMS: {items.length}</span>
            <span>TOTAL QTY: {totalQty}</span>
          </div>

          {/* ── Tax Details — same table structure/columns as InvoiceBill,
              placed here (above the payment/wallet area) to mirror where
              InvoiceBill places it relative to its own Tender Detail. */}
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

          {/* ── Wallet Update — replaces InvoiceBill's Tender Detail
              section. Shows the customer's wallet balance moving from its
              pre-return value up to the post-credit value, with a stamp
              overlay in the same spot InvoiceBill uses for its
              "YOU SAVED" stamp. */}
          <h3 style={styles.subTitle}>Wallet Update</h3>
          <div style={styles.walletWrap}>
            <div style={styles.walletCreditedStampOverlay}>
              <div style={styles.walletCreditedStamp}>
                <div style={styles.walletStampStars}>★ ★ ★</div>
                <div style={styles.walletStampLabel}>RETURNED</div>
                <div style={styles.walletStampStars}>★ ★ ★</div>
              </div>
            </div>
            <div style={styles.walletBlock}>
              <div style={styles.walletRow}>
                <span>PREVIOUS WALLET BALANCE</span>
                <span></span>
                <span style={styles.walletRowAmount}>₹{resolvedPreviousBalance.toFixed(2)}</span>
              </div>
              <div style={styles.walletRow}>
                <span>AMOUNT CREDITED (THIS RETURN)</span>
                <span></span>
                <span style={styles.walletRowAmount}>₹{Number(totalAmount).toFixed(2)}</span>
              </div>
              <div style={styles.walletRowTotal}>
                <span>UPDATED WALLET BALANCE</span>
                <span></span>
                <span style={styles.walletRowAmount}>₹{Number(updatedCustomerBalance ?? resolvedPreviousBalance + Number(totalAmount)).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <ul style={styles.termsList}>
            <li>The refunded amount has been credited to the customer's wallet balance and can be redeemed against a future purchase.</li>
            <li>Please retain this return receipt for your records.</li>
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
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    marginBottom: '15px'
  },
  logo: { width: '250px', objectFit: 'contain', marginBottom: '5px' },
  companyName: { margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 'bold' },
  address: { margin: 0, fontSize: '0.85rem', color: '#333' },
  legalBlock: { textAlign: 'center', padding: '10px 0', marginBottom: '10px' },
  legalRow: { margin: '2px 0', fontSize: '0.8rem', color: '#333' },
  returnInvoiceTitle: { textAlign: 'center', margin: '0 0 15px 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#dc3545' },
  metaRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '2px' },
  metaAgainstRow: { fontSize: '0.85rem', marginBottom: '2px' },
  metaSubRow: { display: 'flex', justifyContent: 'flex-end', fontSize: '0.78rem', color: '#666', marginBottom: '10px' },
  customerBlock: { borderBottom: '1px dashed #000', paddingBottom: '10px', marginBottom: '10px' },
  customerRow: { margin: '2px 0', fontSize: '0.85rem' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '0.85rem' },
  th: { borderBottom: '1px solid #000', padding: '6px 2px', textAlign: 'left', fontWeight: 'bold' },
  td: { padding: '6px 2px 2px 2px', textAlign: 'left' },
  tdSub: { padding: '0 2px 8px 2px', borderBottom: '1px dashed #ccc', color: '#333', textAlign: 'left', fontSize: '0.8rem' },
  // Matches InvoiceBill's tdTotal — used for the Tax Details "Total" row.
  tdTotal: { padding: '8px 2px', borderTop: '1px solid #000', borderBottom: '1px solid #000', fontWeight: 'bold' },
  countsRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 'bold', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', marginBottom: '15px' },
  subTitle: { fontSize: '0.95rem', margin: '0 0 8px 0', fontWeight: 'bold' },
  // Grid layout (label | reserved gap | amount), same trick InvoiceBill uses
  // for its tender rows, so the stamp overlay never collides with text.
  walletRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 104px 1fr',
    fontSize: '0.9rem',
    marginBottom: '4px',
    color: '#333'
  },
  walletRowTotal: {
    display: 'grid',
    gridTemplateColumns: '1fr 104px 1fr',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    borderTop: '1px dashed #000',
    paddingTop: '8px',
    marginTop: '4px'
  },
  walletRowAmount: { textAlign: 'right' },
  walletWrap: { position: 'relative' },
  walletBlock: { marginTop: '10px', marginBottom: '15px', position: 'relative', zIndex: 1 },
  walletCreditedStampOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2,
    pointerEvents: 'none'
  },
  walletCreditedStamp: {
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
  walletStampStars: { fontSize: '0.45rem', letterSpacing: '1.5px', lineHeight: 1 },
  walletStampLabel: { fontSize: '0.58rem', fontWeight: 'bold', letterSpacing: '0.8px', margin: '3px 0' },
  walletStampAmount: { fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.3px' },
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