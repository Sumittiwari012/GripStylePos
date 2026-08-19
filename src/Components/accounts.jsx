import React, { useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import * as XLSX from "xlsx";

const API_BASE_URL = "https://gripstyleapi.runasp.net";

const TABS = [
  { id: "invoices", label: "Invoices" },
  { id: "returns", label: "Returns" },
  { id: "wallet", label: "Wallet" }
];

const formatCurrency = (value) =>
  typeof value === "number"
    ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

// Profit is shown as-is — real sign, no forcing everything positive.
// toLocaleString already prefixes negatives with "-", so this is just
// formatCurrency without the Math.abs() a signed value needs.
const formatSigned = (value) =>
  typeof value === "number" ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

// Red for a loss (negative), green for a gain (positive/zero). Used in the Invoices tab.
const profitColor = (value) => (typeof value === "number" && value < 0 ? "#c62828" : "#2e7d32");

// Returns-only profit formatter — trailing minus sign (accounting style,
// e.g. "1,234.56-") since that profit is being reversed/given back.
const formatProfit = (value) => {
  if (typeof value !== "number") return "—";
  return `${formatCurrency(Math.abs(value))}-`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

export default function Accounts() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeTab, setActiveTab] = useState("invoices");

  // ── Invoices ──
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState(null); // invoiceNumber currently expanded

  // ── Returns ──
  const [returns, setReturns] = useState([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsError, setReturnsError] = useState("");
  const [expandedReturn, setExpandedReturn] = useState(null); // returnInvoiceNumber currently expanded

  // ── Wallet ──
  const [wallet, setWallet] = useState(null); // { totalCredit, totalDebit, netChange, credits: [], debits: [] }
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");

  const canSearch = fromDate && toDate;

  const fetchInvoices = async () => {
    if (!canSearch) {
      setInvoicesError("Select both a from and to date.");
      return;
    }

    setInvoicesLoading(true);
    setInvoicesError("");
    setExpandedInvoice(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/Accounts/InvoiceAndInvoiceDetails?StartDate=${encodeURIComponent(fromDate)}&EndDate=${encodeURIComponent(toDate)}`
      );
      const data = await res.json().catch(() => ([]));

      if (!res.ok) {
        throw new Error(data.message || "Could not load invoices.");
      }

      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch invoices error:", err);
      setInvoicesError(err.message || "Could not load invoices. Please try again.");
    } finally {
      setInvoicesLoading(false);
    }
  };

  const fetchReturns = async () => {
    if (!canSearch) {
      setReturnsError("Select both a from and to date.");
      return;
    }

    setReturnsLoading(true);
    setReturnsError("");
    setExpandedReturn(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/Accounts/ReturnAndReturnDetails?StartDate=${encodeURIComponent(fromDate)}&EndDate=${encodeURIComponent(toDate)}`
      );
      const data = await res.json().catch(() => ([]));

      if (!res.ok) {
        throw new Error(data.message || "Could not load returns.");
      }

      setReturns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch returns error:", err);
      setReturnsError(err.message || "Could not load returns. Please try again.");
    } finally {
      setReturnsLoading(false);
    }
  };

  const fetchWallet = async () => {
    if (!canSearch) {
      setWalletError("Select both a from and to date.");
      return;
    }

    setWalletLoading(true);
    setWalletError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/Accounts/WalletTransactions?StartDate=${encodeURIComponent(fromDate)}&EndDate=${encodeURIComponent(toDate)}`
      );
      const data = await res.json().catch(() => (null));

      if (!res.ok) {
        throw new Error((data && data.message) || "Could not load wallet transactions.");
      }

      setWallet(data);
    } catch (err) {
      console.error("Fetch wallet error:", err);
      setWalletError(err.message || "Could not load wallet transactions. Please try again.");
    } finally {
      setWalletLoading(false);
    }
  };

  // One Search click fetches all three tabs with the same date range,
  // so switching tabs afterward doesn't require searching again.
  const handleSearch = () => {
    fetchInvoices();
    fetchReturns();
    fetchWallet();
  };

  // ── Rolled-up totals across all invoices/returns currently loaded ──
  const invoiceTotals = invoices.reduce(
    (acc, inv) => ({
      taxable: acc.taxable + (inv.totalTaxable || 0),
      tax: acc.tax + (inv.totalTax || 0),
      discount: acc.discount + (inv.discount || 0),
      total: acc.total + (inv.totalInclusive || 0),
      profit: acc.profit + (inv.totalProfit || 0)
    }),
    { taxable: 0, tax: 0, discount: 0, total: 0, profit: 0 }
  );

  const returnTotals = returns.reduce(
    (acc, r) => ({
      taxable: acc.taxable + (r.totalTaxable || 0),
      tax: acc.tax + (r.totalTax || 0),
      total: acc.total + (r.totalInclusive || 0),
      profit: acc.profit + (r.totalProfit || 0)
    }),
    { taxable: 0, tax: 0, total: 0, profit: 0 }
  );

  // ── Build a two-sheet workbook from the invoices already in state.
  //     Sheet 1: one row per invoice (overview totals).
  //     Sheet 2: one row per line item, flattened out of each
  //     invoice's `details` array, with invoice no./date repeated
  //     on each row so it's still identifiable once flattened. ──
  const handleDownloadExcel = () => {
    if (!invoices.length) return;

    const overviewRows = invoices.map((inv) => ({
      "Invoice No.": inv.invoiceNumber,
      "Date": formatDate(inv.invoiceDate),
      "Mobile": inv.customerMobileNumber || "",
      "Taxable": inv.totalTaxable,
      "CGST": inv.totalCgst,
      "SGST": inv.totalSgst,
      "Tax": inv.totalTax,
      "Discount": inv.discount,
      "Total (Incl. GST)": inv.totalInclusive,
      "Profit": inv.totalProfit
    }));

    const detailRows = invoices.flatMap((inv) =>
      (inv.details || []).map((d) => ({
        "Invoice No.": inv.invoiceNumber,
        "Date": formatDate(inv.invoiceDate),
        "Product": d.productName,
        "HSN Code": d.hsnCode || "",
        "Qty": d.quantity,
        "Price/Unit": d.salePricePerUnit,
        "Taxable": d.taxableAmount,
        "CGST %": d.cgstPercent,
        "CGST ₹": d.cgstValue,
        "SGST %": d.sgstPercent,
        "SGST ₹": d.sgstValue,
        "Total": d.inclusiveTotal,
        "Profit": d.profit
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Invoices");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Invoice Details");

    const fileName = `Invoices_${fromDate || "start"}_to_${toDate || "end"}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // ── Same two-sheet pattern as invoices, but for returns ──
  const handleDownloadReturnsExcel = () => {
    if (!returns.length) return;

    const overviewRows = returns.map((r) => ({
      "Invoice No.": r.invoiceNumber,
      "Return Invoice No.": r.returnInvoiceNumber,
      "Date": formatDate(r.returnDate),
      "Mobile": r.customerMobileNumber || "",
      "Taxable": r.totalTaxable,
      "CGST": r.totalCgst,
      "SGST": r.totalSgst,
      "Tax": r.totalTax,
      "Total (Incl. GST)": r.totalInclusive,
      "Profit Reversed": r.totalProfit
    }));

    const detailRows = returns.flatMap((r) =>
      (r.details || []).map((d) => ({
        "Invoice No.": r.invoiceNumber,
        "Return Invoice No.": r.returnInvoiceNumber,
        "Date": formatDate(r.returnDate),
        "Product": d.productName,
        "HSN Code": d.hsnCode || "",
        "Qty": d.quantity,
        "Price/Unit": d.salePricePerUnit,
        "Taxable": d.taxableAmount,
        "CGST %": d.cgstPercent,
        "CGST ₹": d.cgstValue,
        "SGST %": d.sgstPercent,
        "SGST ₹": d.sgstValue,
        "Total": d.inclusiveTotal,
        "Profit Reversed": d.profit
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Returns");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Return Details");

    const fileName = `Returns_${fromDate || "start"}_to_${toDate || "end"}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // ── Wallet: credits + debits, each on their own sheet ──
  const handleDownloadWalletExcel = () => {
    if (!wallet) return;

    const creditRows = (wallet.credits || []).map((c) => ({
      "Invoice No.": c.invoiceNumber,
      "Return Invoice No.": c.returnInvoiceNumber,
      "Customer": c.customerName,
      "Mobile": c.customerMobileNumber,
      "Date": formatDate(c.date),
      "Amount": c.amount
    }));

    const debitRows = (wallet.debits || []).map((d) => ({
      "Invoice No.": d.invoiceNumber,
      "Customer": d.customerName,
      "Mobile": d.customerMobileNumber,
      "Date": formatDate(d.date),
      "Amount": d.amount
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(creditRows), "Wallet Credits");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(debitRows), "Wallet Debits");

    const fileName = `Wallet_${fromDate || "start"}_to_${toDate || "end"}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div
      style={{
        padding: "24px",
        background: "#f5f5f5",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <h2 style={{ marginBottom: "20px" }}>Accounts</h2>

      {/* Date Range — applies across all three tabs */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          alignItems: "end",
          marginBottom: "16px",
          background: "#fff",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
        }}
      >
        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>
            From Date
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "4px"
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>
            To Date
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "4px"
            }}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={
            !canSearch ||
            invoicesLoading ||
            returnsLoading ||
            walletLoading
          }
          style={{
            padding: "10px 20px",
            background:
              !canSearch || invoicesLoading || returnsLoading || walletLoading
                ? "#90b8e0"
                : "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor:
              !canSearch || invoicesLoading || returnsLoading || walletLoading
                ? "not-allowed"
                : "pointer"
          }}
        >
          {invoicesLoading || returnsLoading || walletLoading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Tab buttons */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: activeTab === tab.id ? "1px solid #1976d2" : "1px solid #ccc",
              background: activeTab === tab.id ? "#1976d2" : "#fff",
              color: activeTab === tab.id ? "#fff" : "#333",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 400
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          padding: "16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
        }}
      >
        {activeTab === "invoices" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Invoices</h3>
              {invoices.length > 0 && (
                <button
                  onClick={handleDownloadExcel}
                  style={downloadBtnStyle}
                >
                  <Download size={16} />
                  Download Excel
                </button>
              )}
            </div>

            {!canSearch ? (
              <p style={{ color: "#777" }}>Select a date range and tap Search.</p>
            ) : invoicesLoading ? (
              <p style={{ color: "#777" }}>Loading invoices...</p>
            ) : invoicesError ? (
              <div>
                <p style={{ color: "#c62828" }}>{invoicesError}</p>
                <button onClick={fetchInvoices} style={retryBtnStyle}>
                  Retry
                </button>
              </div>
            ) : invoices.length === 0 ? (
              <p style={{ color: "#777" }}>No invoices found for this date range.</p>
            ) : (
              <>
                {/* Summary strip: Taxable, Tax, Discount, Total, Profit — rolled up across all invoices in range */}
                <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Taxable</div>
                    <div style={summaryValueStyle}>{formatCurrency(invoiceTotals.taxable)}</div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Tax</div>
                    <div style={summaryValueStyle}>{formatCurrency(invoiceTotals.tax)}</div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Discount</div>
                    <div style={{ ...summaryValueStyle, color: "#c62828" }}>
                      {formatCurrency(invoiceTotals.discount)}
                    </div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total (Incl. GST)</div>
                    <div style={{ ...summaryValueStyle, color: "#1976d2" }}>
                      {formatCurrency(invoiceTotals.total)}
                    </div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Profit</div>
                    <div style={{ ...summaryValueStyle, color: profitColor(invoiceTotals.profit) }}>
                      {formatSigned(invoiceTotals.profit)}
                    </div>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}></th>
                      <th style={thStyle}>Invoice No.</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Mobile</th>
                      <th style={thStyle}>Taxable</th>
                      <th style={thStyle}>Tax</th>
                      <th style={thStyle}>Discount</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const isExpanded = expandedInvoice === inv.invoiceNumber;
                      return (
                        <React.Fragment key={inv.invoiceNumber}>
                          <tr
                            onClick={() =>
                              setExpandedInvoice(isExpanded ? null : inv.invoiceNumber)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <td style={{ ...tdStyle, width: "28px" }}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </td>
                            <td style={tdStyle}>{inv.invoiceNumber}</td>
                            <td style={tdStyle}>{formatDate(inv.invoiceDate)}</td>
                            <td style={tdStyle}>{inv.customerMobileNumber || "—"}</td>
                            <td style={tdStyle}>{formatCurrency(inv.totalTaxable)}</td>
                            <td style={tdStyle}>{formatCurrency(inv.totalTax)}</td>
                            <td style={tdStyle}>{formatCurrency(inv.discount)}</td>
                            <td style={tdStyle}>{formatCurrency(inv.totalInclusive)}</td>
                            <td style={{ ...tdStyle, color: profitColor(inv.totalProfit) }}>{formatSigned(inv.totalProfit)}</td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td style={{ ...tdStyle, background: "#fafafa" }} colSpan={9}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr>
                                      <th style={thStyleSmall}>Product</th>
                                      <th style={thStyleSmall}>HSN Code</th>
                                      <th style={thStyleSmall}>Qty</th>
                                      <th style={thStyleSmall}>Price/Unit</th>
                                      <th style={thStyleSmall}>Taxable</th>
                                      <th style={thStyleSmall}>CGST %</th>
                                      <th style={thStyleSmall}>CGST ₹</th>
                                      <th style={thStyleSmall}>SGST %</th>
                                      <th style={thStyleSmall}>SGST ₹</th>
                                      <th style={thStyleSmall}>Total</th>
                                      <th style={thStyleSmall}>Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {inv.details.map((d) => (
                                      <tr key={d.detailId}>
                                        <td style={tdStyleSmall}>{d.productName}</td>
                                        <td style={tdStyleSmall}>{d.hsnCode || "—"}</td>
                                        <td style={tdStyleSmall}>{d.quantity}</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.salePricePerUnit)}</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.taxableAmount)}</td>
                                        <td style={tdStyleSmall}>{d.cgstPercent}%</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.cgstValue)}</td>
                                        <td style={tdStyleSmall}>{d.sgstPercent}%</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.sgstValue)}</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.inclusiveTotal)}</td>
                                        <td style={{ ...tdStyleSmall, color: profitColor(d.profit) }}>{formatSigned(d.profit)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {activeTab === "returns" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Returns</h3>
              {returns.length > 0 && (
                <button
                  onClick={handleDownloadReturnsExcel}
                  style={downloadBtnStyle}
                >
                  <Download size={16} />
                  Download Excel
                </button>
              )}
            </div>

            {!canSearch ? (
              <p style={{ color: "#777" }}>Select a date range and tap Search.</p>
            ) : returnsLoading ? (
              <p style={{ color: "#777" }}>Loading returns...</p>
            ) : returnsError ? (
              <div>
                <p style={{ color: "#c62828" }}>{returnsError}</p>
                <button onClick={fetchReturns} style={retryBtnStyle}>
                  Retry
                </button>
              </div>
            ) : returns.length === 0 ? (
              <p style={{ color: "#777" }}>No returns found for this date range.</p>
            ) : (
              <>
                {/* Summary strip: Taxable, Tax, Total, Profit — no discount, returns don't carry one. */}
                <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Taxable</div>
                    <div style={summaryValueStyle}>{formatCurrency(returnTotals.taxable)}</div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Tax</div>
                    <div style={summaryValueStyle}>{formatCurrency(returnTotals.tax)}</div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total (Incl. GST)</div>
                    <div style={{ ...summaryValueStyle, color: "#1976d2" }}>
                      {formatCurrency(returnTotals.total)}
                    </div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Profit</div>
                    <div style={{ ...summaryValueStyle, color: "#c62828" }}>
                      {formatProfit(returnTotals.profit)}
                    </div>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}></th>
                      <th style={thStyle}>Invoice No.</th>
                      <th style={thStyle}>Return Invoice No.</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Mobile</th>
                      <th style={thStyle}>Taxable</th>
                      <th style={thStyle}>Tax</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((r) => {
                      const isExpanded = expandedReturn === r.returnInvoiceNumber;
                      return (
                        <React.Fragment key={r.returnInvoiceNumber}>
                          <tr
                            onClick={() =>
                              setExpandedReturn(isExpanded ? null : r.returnInvoiceNumber)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <td style={{ ...tdStyle, width: "28px" }}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </td>
                            <td style={tdStyle}>{r.invoiceNumber}</td>
                            <td style={tdStyle}>{r.returnInvoiceNumber}</td>
                            <td style={tdStyle}>{formatDate(r.returnDate)}</td>
                            <td style={tdStyle}>{r.customerMobileNumber || "—"}</td>
                            <td style={tdStyle}>{formatCurrency(r.totalTaxable)}</td>
                            <td style={tdStyle}>{formatCurrency(r.totalTax)}</td>
                            <td style={tdStyle}>{formatCurrency(r.totalInclusive)}</td>
                            <td style={{ ...tdStyle, color: "#c62828" }}>{formatProfit(r.totalProfit)}</td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td style={{ ...tdStyle, background: "#fafafa" }} colSpan={9}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr>
                                      <th style={thStyleSmall}>Product</th>
                                      <th style={thStyleSmall}>HSN Code</th>
                                      <th style={thStyleSmall}>Qty</th>
                                      <th style={thStyleSmall}>Price/Unit</th>
                                      <th style={thStyleSmall}>Taxable</th>
                                      <th style={thStyleSmall}>CGST %</th>
                                      <th style={thStyleSmall}>CGST ₹</th>
                                      <th style={thStyleSmall}>SGST %</th>
                                      <th style={thStyleSmall}>SGST ₹</th>
                                      <th style={thStyleSmall}>Total</th>
                                      <th style={thStyleSmall}>Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.details.map((d) => (
                                      <tr key={d.detailId}>
                                        <td style={tdStyleSmall}>{d.productName}</td>
                                        <td style={tdStyleSmall}>{d.hsnCode || "—"}</td>
                                        <td style={tdStyleSmall}>{d.quantity}</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.salePricePerUnit)}</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.taxableAmount)}</td>
                                        <td style={tdStyleSmall}>{d.cgstPercent}%</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.cgstValue)}</td>
                                        <td style={tdStyleSmall}>{d.sgstPercent}%</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.sgstValue)}</td>
                                        <td style={tdStyleSmall}>{formatCurrency(d.inclusiveTotal)}</td>
                                        <td style={{ ...tdStyleSmall, color: "#c62828" }}>{formatProfit(d.profit)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {activeTab === "wallet" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Wallet</h3>
              {wallet && (wallet.credits?.length > 0 || wallet.debits?.length > 0) && (
                <button
                  onClick={handleDownloadWalletExcel}
                  style={downloadBtnStyle}
                >
                  <Download size={16} />
                  Download Excel
                </button>
              )}
            </div>

            {!canSearch ? (
              <p style={{ color: "#777" }}>Select a date range and tap Search.</p>
            ) : walletLoading ? (
              <p style={{ color: "#777" }}>Loading wallet transactions...</p>
            ) : walletError ? (
              <div>
                <p style={{ color: "#c62828" }}>{walletError}</p>
                <button onClick={fetchWallet} style={retryBtnStyle}>
                  Retry
                </button>
              </div>
            ) : !wallet || (wallet.credits.length === 0 && wallet.debits.length === 0) ? (
              <p style={{ color: "#777" }}>No wallet transactions found for this date range.</p>
            ) : (
              <>
                {/* Summary strip */}
                <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Credit</div>
                    <div style={{ ...summaryValueStyle, color: "#2e7d32" }}>
                      {formatCurrency(wallet.totalCredit)}
                    </div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Debit</div>
                    <div style={{ ...summaryValueStyle, color: "#c62828" }}>
                      {formatCurrency(wallet.totalDebit)}
                    </div>
                  </div>
                  <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Balance</div>
                    <div
                      style={{
                        ...summaryValueStyle,
                        color: wallet.netChange >= 0 ? "#2e7d32" : "#c62828"
                      }}
                    >
                      {formatCurrency(wallet.netChange)}
                    </div>
                  </div>
                </div>

                {/* Credits */}
                <h4 style={{ marginBottom: "8px" }}>Credits (Returns)</h4>
                {wallet.credits.length === 0 ? (
                  <p style={{ color: "#777", marginTop: 0 }}>No credits in this range.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Invoice No.</th>
                        <th style={thStyle}>Return Invoice No.</th>
                        <th style={thStyle}>Customer</th>
                        <th style={thStyle}>Mobile</th>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wallet.credits.map((c, i) => (
                        <tr key={`${c.returnInvoiceNumber}-${i}`}>
                          <td style={tdStyle}>{c.invoiceNumber}</td>
                          <td style={tdStyle}>{c.returnInvoiceNumber}</td>
                          <td style={tdStyle}>{c.customerName || "—"}</td>
                          <td style={tdStyle}>{c.customerMobileNumber || "—"}</td>
                          <td style={tdStyle}>{formatDate(c.date)}</td>
                          <td style={{ ...tdStyle, color: "#2e7d32" }}>+{formatCurrency(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Debits */}
                <h4 style={{ marginBottom: "8px" }}>Debits (Wallet Payments)</h4>
                {wallet.debits.length === 0 ? (
                  <p style={{ color: "#777", marginTop: 0 }}>No debits in this range.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Invoice No.</th>
                        <th style={thStyle}>Customer</th>
                        <th style={thStyle}>Mobile</th>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wallet.debits.map((d, i) => (
                        <tr key={`${d.invoiceNumber}-${i}`}>
                          <td style={tdStyle}>{d.invoiceNumber}</td>
                          <td style={tdStyle}>{d.customerName || "—"}</td>
                          <td style={tdStyle}>{d.customerMobileNumber || "—"}</td>
                          <td style={tdStyle}>{formatDate(d.date)}</td>
                          <td style={{ ...tdStyle, color: "#c62828" }}>-{formatCurrency(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const thStyle = {
  border: "1px solid #ddd",
  padding: "10px",
  background: "#f0f0f0",
  textAlign: "left"
};

const tdStyle = {
  border: "1px solid #ddd",
  padding: "10px"
};

const thStyleSmall = {
  border: "1px solid #eee",
  padding: "6px 8px",
  background: "#f5f5f5",
  textAlign: "left",
  fontSize: "0.85em"
};

const tdStyleSmall = {
  border: "1px solid #eee",
  padding: "6px 8px",
  fontSize: "0.85em"
};

const downloadBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 16px",
  background: "#2e7d32",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "0.9em"
};

const retryBtnStyle = {
  color: "#1976d2",
  background: "none",
  border: "none",
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0
};

const summaryCardStyle = {
  flex: 1,
  background: "#f5f5f5",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center"
};

const summaryLabelStyle = {
  fontSize: "0.85em",
  color: "#777",
  marginBottom: "6px"
};

const summaryValueStyle = {
  fontSize: "1.3em",
  fontWeight: 600
};