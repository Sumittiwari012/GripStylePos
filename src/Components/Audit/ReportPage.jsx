import { useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtDate, qty, ROUTE_BASE, session } from "./api";
import { ApprovalTag, Badge, Card, ErrorBox, HistoryTables, Loading, Shell } from "./ui";
import { useLoad } from "./ui";

// Owner route:   /audit/owner/:auditId/report
// Incharge route: /audit/incharge/report  (audit comes from the login session)
export default function ReportPage({ who }) {
  const params = useParams();
  const s = who === "member" ? session.get() : null;
  const auditId = who === "owner" ? params.auditId : s.audit.id;
  const back = who === "owner" ? { to: `${ROUTE_BASE}/owner/${auditId}`, label: "Audit" } : { to: `${ROUTE_BASE}/incharge`, label: "Audit" };

  const [history, setHistory] = useState(true);
  const { data: r, error, loading, reload } = useLoad(() => api(`/${auditId}/report?includeHistory=${history}`, { who }), [auditId, who, history]);

  return (
    <Shell
      title={r ? `Report: ${r.auditName}` : "Report"}
      subtitle={r ? `Code ${r.auditCode} · generated ${fmtDate(r.generatedAt)}` : undefined}
      member={s?.member}
      back={back}
      actions={
        <>
          <label className="au-check">
            <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Include purchase and sales records
          </label>
          <button className="au-btn" onClick={() => window.print()}>Print</button>
        </>
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading && !r && <Loading what="Building the report…" />}
      {r && (
        <>
          <div className="au-banner">
            <div><Badge status={r.status} /> <ApprovalTag info={r.approval} /></div>
            <div className="au-muted">
              {r.approval.submittedAt && <>Submitted {fmtDate(r.approval.submittedAt)} by {r.approval.submittedBy || "a manager"}. </>}
              {r.approval.approvedAt && <>Approved {fmtDate(r.approval.approvedAt)}. </>}
              {r.approval.returnNote && <>Sent back with note: {r.approval.returnNote}</>}
            </div>
            {r.approval.submitNote && <div className="au-muted">Manager's note: {r.approval.submitNote}</div>}
            {r.approval.approvalNote && <div className="au-muted">Incharge's note: {r.approval.approvalNote}</div>}
          </div>

          <Card title="Discrepancy by category">
            <div className="au-scroll">
              <table className="au-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="au-num">Audited</th>
                    <th className="au-num">Matched</th>
                    <th className="au-num">Short</th>
                    <th className="au-num">Short qty</th>
                    <th className="au-num">Excess</th>
                    <th className="au-num">Excess qty</th>
                    <th className="au-num">On hold</th>
                    <th className="au-num">Not counted</th>
                    <th className="au-num">Sold out</th>
                    <th className="au-num">Negative</th>
                    <th className="au-num">Total discrepancy</th>
                  </tr>
                </thead>
                <tbody>
                  {r.categorySummary.map((c) => (
                    <tr key={c.categoryName}>
                      <td>{c.categoryName}</td>
                      <td className="au-num">{c.auditedItems}</td>
                      <td className="au-num">{c.matched}</td>
                      <td className="au-num">{c.short}</td>
                      <td className="au-num au-neg">{qty(c.shortQty)}</td>
                      <td className="au-num">{c.excess}</td>
                      <td className="au-num au-pos">{qty(c.excessQty)}</td>
                      <td className="au-num">{c.onHold}</td>
                      <td className="au-num">{c.notCounted}</td>
                      <td className="au-num">{c.soldOutItems}</td>
                      <td className="au-num">{c.negativeStockItems}</td>
                      <td className="au-num"><strong>{qty(c.totalDiscrepancyQty)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Section title="Audited products" groups={r.audited} audited />
          <Section title="Negative stock (sold more than purchased)" note="These are data problems. Check the purchase and sales records." groups={r.negativeStock} />
          <Section title="Sold out (not audited)" groups={r.soldOut} />
        </>
      )}
    </Shell>
  );
}

function Section({ title, note, groups, audited }) {
  const total = groups.reduce((n, g) => n + g.itemCount, 0);
  return (
    <Card title={`${title} · ${total}`}>
      {note && <p className="au-muted">{note}</p>}
      {total === 0 && <p className="au-muted">None.</p>}
      {groups.map((g) => (
        <details key={g.categoryName} className="au-group">
          <summary>{g.categoryName} <span className="au-muted">({g.itemCount})</span></summary>
          {g.subCategories.map((sg) => (
            <div key={sg.subCategoryName} className="au-subgroup">
              <h3>{sg.subCategoryName} <span className="au-muted">({sg.itemCount})</span></h3>
              <div className="au-scroll">
                <table className="au-table au-table-tight">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="au-num">Purchased</th>
                      <th className="au-num">Returned</th>
                      <th className="au-num">Sold</th>
                      <th className="au-num">System</th>
                      {audited && <><th className="au-num">Counted</th><th className="au-num">Variance</th><th>Status</th><th>Reason / note</th><th>By</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {sg.items.map((l) => <Line key={`${l.productId}-${l.barcode}`} l={l} audited={audited} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </details>
      ))}
    </Card>
  );
}

function Line({ l, audited }) {
  const [open, setOpen] = useState(false);
  const cols = audited ? 10 : 5;
  return (
    <>
      <tr>
        <td>
          {l.productName}
          <small className="au-block au-muted">{l.barcode}</small>
          {l.history && <button className="au-link" onClick={() => setOpen(!open)}>{open ? "Hide records" : "Show records"}</button>}
        </td>
        <td className="au-num">{qty(l.purchasedQty)}</td>
        <td className="au-num">{qty(l.purchaseReturnedQty)}</td>
        <td className="au-num">{qty(l.soldQty)}</td>
        <td className="au-num">{qty(l.systemQty)}</td>
        {audited && (
          <>
            <td className="au-num">{l.status === "Pending" ? "–" : qty(l.physicalQty)}</td>
            <td className={`au-num ${l.varianceQty < 0 && l.status !== "Pending" ? "au-neg" : l.varianceQty > 0 && l.status !== "Pending" ? "au-pos" : ""}`}>{l.status === "Pending" ? "–" : qty(l.varianceQty)}</td>
            <td><Badge status={l.status} /></td>
            <td className="au-note">{[l.reasonCode, l.note].filter(Boolean).join(" · ") || "–"}</td>
            <td>{l.verifiedBy || "–"}</td>
          </>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols}><HistoryTables history={l.history} /></td>
        </tr>
      )}
    </>
  );
}
