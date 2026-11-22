import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtDate, qty, ROUTE_BASE, session } from "./api";
import { ApprovalTag, Badge, Card, ErrorBox, Loading, Shell, Stat, useLoad } from "./ui";

// Owner route:    /audit/owner/:auditId/report
// Incharge route: /audit/incharge/report  (audit comes from the login session)
//
// One list, grouped by category > sub category. For every product:
//   Current stock         = opening stock + purchase - sales + customer return
//   Physically counted    = what the manager counted
//   Sales after verified  = sales made after the product was counted
//   Return after verified = customer returns made after the product was counted
//   Remarks / Status      = reason + note, and the count status

const isCounted = (l) => !!l.status && l.status !== "Pending" && l.status !== "OnHold";
const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);

// The server sends sold out / negative / audited separately. Put them into ONE list.
function mergeGroups(...lists) {
  const cats = new Map();
  for (const g of lists.flat()) {
    if (!cats.has(g.categoryName)) cats.set(g.categoryName, new Map());
    const subs = cats.get(g.categoryName);
    for (const sg of g.subCategories) {
      if (!subs.has(sg.subCategoryName)) subs.set(sg.subCategoryName, []);
      subs.get(sg.subCategoryName).push(...sg.items);
    }
  }
  return [...cats.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([categoryName, subs]) => ({
      categoryName,
      subCategories: [...subs.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([subCategoryName, items]) => ({
          subCategoryName,
          items: items.sort((a, b) => a.productName.localeCompare(b.productName)),
        })),
    }));
}

export default function ReportPage({ who }) {
  const params = useParams();
  const s = session.get();
  const auditId = who === "owner" ? params.auditId : s.audit.id;
  const back =
    who === "owner"
      ? { to: `${ROUTE_BASE}/owner/${auditId}`, label: "Audit" }
      : { to: `${ROUTE_BASE}/incharge`, label: "Audit" };

  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all"); // all | counted | notCounted
  const [expand, setExpand] = useState({ open: false, n: 0 });

  const { data: r, error, loading, reload } = useLoad(
    () => api(`/${auditId}/report?includeHistory=false`, { who }),
    [auditId, who]
  );

  const groups = useMemo(
    () => (r ? mergeGroups(r.audited, r.negativeStock, r.soldOut) : []),
    [r]
  );

  const all = useMemo(() => groups.flatMap((g) => g.subCategories.flatMap((sg) => sg.items)), [groups]);

  const totals = useMemo(() => {
    const counted = all.filter(isCounted);
    return {
      products: all.length,
      counted: counted.length,
      notCounted: all.length - counted.length,
      current: sum(all, (l) => l.systemQty),
      physical: sum(counted, (l) => l.physicalQty),
      soldAfter: sum(counted, (l) => l.soldAfterCountQty),
      returnAfter: sum(counted, (l) => l.returnAfterCountQty),
    };
  }, [all]);

  const term = q.trim().toLowerCase();
  const view = useMemo(() => {
    const keep = (l) =>
      (only === "all" || (only === "counted") === isCounted(l)) &&
      (!term || l.productName.toLowerCase().includes(term) || (l.barcode || "").toLowerCase().includes(term));
    return groups
      .map((g) => ({
        ...g,
        subCategories: g.subCategories
          .map((sg) => ({ ...sg, items: sg.items.filter(keep) }))
          .filter((sg) => sg.items.length > 0),
      }))
      .filter((g) => g.subCategories.length > 0);
  }, [groups, term, only]);

  const shown = view.reduce((n, g) => n + g.subCategories.reduce((m, sg) => m + sg.items.length, 0), 0);

  return (
    <Shell
      title={r ? `Report: ${r.auditName}` : "Report"}
      subtitle={r ? `Code ${r.auditCode} · generated ${fmtDate(r.generatedAt)}` : undefined}
      member={s?.member}
      owner={s?.owner}
      back={back}
      actions={
        <>
          <button className="au-btn" onClick={reload}>Refresh</button>
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

          <Card title="Summary">
            <div className="au-stats">
              <Stat label="Products" value={totals.products} />
              <Stat label="Counted" value={totals.counted} tone="ok" />
              <Stat label="Not counted" value={totals.notCounted} tone="hold" />
              <Stat label="Current stock" value={qty(totals.current)} />
              <Stat label="Physically counted" value={qty(totals.physical)} />
              <Stat label="Sales after verified" value={qty(totals.soldAfter)} />
              <Stat label="Return after verified" value={qty(totals.returnAfter)} />
            </div>
          </Card>

          <Card title="Products">
            <div className="au-row" style={{ margin: "0 0 .8rem", alignItems: "center" }}>
              <input
                className="au-input au-input-sm"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Search product or barcode"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search product or barcode"
              />
              <div className="au-seg">
                {[["all", "All"], ["counted", "Counted"], ["notCounted", "Not counted"]].map(([k, l]) => (
                  <button key={k} className={only === k ? "on" : ""} onClick={() => setOnly(k)}>{l}</button>
                ))}
              </div>
              <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setExpand((e) => ({ open: true, n: e.n + 1 }))}>Expand all</button>
              <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setExpand((e) => ({ open: false, n: e.n + 1 }))}>Collapse all</button>
            </div>

            {shown === 0 && <p className="au-muted">{term || only !== "all" ? "No product matches." : "No products."}</p>}
            {view.map((g) => (
              <CategoryGroup key={`${g.categoryName}-${expand.n}`} g={g} open={expand.open || !!term} />
            ))}
          </Card>
        </>
      )}
    </Shell>
  );
}

function CategoryGroup({ g, open }) {
  const items = g.subCategories.flatMap((sg) => sg.items);
  return (
    <details className="au-group" open={open}>
      <summary>
        {g.categoryName}
        <span className="au-chip">{items.length} products</span>
      </summary>
      {g.subCategories.map((sg) => (
        <div key={sg.subCategoryName} className="au-subgroup">
          <h3>{sg.subCategoryName} <span className="au-muted">({sg.items.length})</span></h3>
          <div className="au-scroll">
            <table className="au-table au-table-tight">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="au-num">Current stock</th>
                  <th className="au-num">Physically counted</th>
                  <th className="au-num">Sales after verified</th>
                  <th className="au-num">Return after verified</th>
                  <th>Remarks</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sg.items.map((l) => <Line key={`${l.productId}-${l.barcode}`} l={l} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </details>
  );
}

function Line({ l }) {
  const counted = isCounted(l);
  return (
    <tr>
      <td>
        {l.productName}
        <small className="au-block au-muted">{l.barcode}</small>
      </td>
      <td className="au-num">{qty(l.systemQty)}</td>
      <td className="au-num">{counted ? qty(l.physicalQty) : "–"}</td>
      <td className="au-num">{counted && l.soldAfterCountQty != null ? qty(l.soldAfterCountQty) : "–"}</td>
      <td className="au-num">{counted && l.returnAfterCountQty != null ? qty(l.returnAfterCountQty) : "–"}</td>
      <td className="au-note">{[l.reasonCode, l.note].filter(Boolean).join(" · ") || "–"}</td>
      <td><Badge status={l.status || "Pending"} /></td>
    </tr>
  );
}