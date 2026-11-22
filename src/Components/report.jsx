import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtDate, qty, ROUTE_BASE, session } from "./api";
import { ApprovalTag, Badge, Card, ErrorBox, HistoryTables, Loading, Shell, Stat, useLoad } from "./ui";

// Owner route:    /audit/owner/:auditId/report
// Incharge route: /audit/incharge/report  (audit comes from the login session)
//
// Every product shows only three figures:
//   Current stock        = opening stock + purchase - sold + return
//   Physically counted   = what the manager counted
//   Sold after counting  = sales made after the product was counted

const TABS = [
  ["audited", "Audited products", "audited"],
  ["negative", "Negative stock", "negativeStock"],
  ["soldOut", "Sold out in system", "soldOut"],
];

const TAB_NOTE = {
  audited: "Products that have stock in the system.",
  negative: "Current stock is below zero. Check the purchase and sales records.",
  soldOut: "Current stock is zero. If a manager found the product in the shop, the counted quantity is shown.",
};

const isCounted = (l) => !!l.status && l.status !== "Pending" && l.status !== "OnHold";
const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);
const flat = (groups) => groups.flatMap((g) => g.subCategories.flatMap((sg) => sg.items));

export default function ReportPage({ who }) {
  const params = useParams();
  const s = session.get();
  const auditId = who === "owner" ? params.auditId : s.audit.id;
  const back =
    who === "owner"
      ? { to: `${ROUTE_BASE}/owner/${auditId}`, label: "Audit" }
      : { to: `${ROUTE_BASE}/incharge`, label: "Audit" };

  const [history, setHistory] = useState(true);
  const [tab, setTab] = useState("audited");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all"); // all | counted | notCounted
  const [expand, setExpand] = useState({ open: false, n: 0 });

  const { data: r, error, loading, reload } = useLoad(
    () => api(`/${auditId}/report?includeHistory=${history}`, { who }),
    [auditId, who, history]
  );

  const totals = useMemo(() => {
    if (!r) return null;
    const all = [...flat(r.audited), ...flat(r.negativeStock), ...flat(r.soldOut)];
    const counted = all.filter(isCounted);
    return {
      products: all.length,
      counted: counted.length,
      notCounted: all.length - counted.length,
      current: sum(all, (l) => l.systemQty),
      physical: sum(counted, (l) => l.physicalQty),
      soldAfter: sum(counted, (l) => l.soldAfterCountQty),
    };
  }, [r]);

  const tabInfo = TABS.find((t) => t[0] === tab);
  const groups = r ? r[tabInfo[2]] : [];
  const term = q.trim().toLowerCase();

  // apply search + counted filter, drop empty sub categories / categories
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

  const shown = sum(view, (g) => g.subCategories.reduce((n, sg) => n + sg.items.length, 0));

  return (
    <Shell
      title={r ? `Report: ${r.auditName}` : "Report"}
      subtitle={r ? `Code ${r.auditCode} · generated ${fmtDate(r.generatedAt)}` : undefined}
      member={s?.member}
      owner={s?.owner}
      back={back}
      actions={
        <>
          <label className="au-check">
            <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Include purchase and sales records
          </label>
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

          {totals && (
            <Card title="Summary">
              <div className="au-stats">
                <Stat label="Products" value={totals.products} />
                <Stat label="Counted" value={totals.counted} tone="ok" />
                <Stat label="Not counted" value={totals.notCounted} tone="hold" />
                <Stat label="Current stock" value={qty(totals.current)} />
                <Stat label="Physically counted" value={qty(totals.physical)} />
                <Stat label="Sold after counting" value={qty(totals.soldAfter)} />
              </div>
              <p className="au-muted">
                Current stock = opening stock + purchase − sold + return. Sold after counting = sales made after each
                product was counted. Physically counted and sold after counting add up over counted products only.
              </p>
            </Card>
          )}

          <Card title="Products">
            <nav className="au-tabs" role="tablist">
              {TABS.map(([k, label, key]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {label}<span className="au-chip">{sum(r[key], (g) => g.itemCount)}</span>
                </button>
              ))}
            </nav>
            <p className="au-muted">{TAB_NOTE[tab]}</p>

            <div className="au-row" style={{ margin: ".5rem 0 .8rem", alignItems: "center" }}>
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

            {shown === 0 && <p className="au-muted">{term || only !== "all" ? "No product matches." : "None."}</p>}
            {view.map((g) => (
              <CategoryGroup key={`${tab}-${g.categoryName}-${expand.n}`} g={g} open={expand.open || !!term} />
            ))}
          </Card>
        </>
      )}
    </Shell>
  );
}

function CategoryGroup({ g, open }) {
  const items = g.subCategories.flatMap((sg) => sg.items);
  const counted = items.filter(isCounted);
  return (
    <details className="au-group" open={open}>
      <summary>
        {g.categoryName}
        <span className="au-chip">{items.length} products</span>
        <span className="au-chip">stock {qty(sum(items, (l) => l.systemQty))}</span>
        <span className="au-chip">counted {qty(sum(counted, (l) => l.physicalQty))}</span>
        <span className="au-chip">sold after {qty(sum(counted, (l) => l.soldAfterCountQty))}</span>
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
                  <th className="au-num">Sold after counting</th>
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
  const [openRec, setOpenRec] = useState(false);
  const counted = isCounted(l);
  return (
    <>
      <tr>
        <td>
          {l.productName}
          <small className="au-block au-muted">{l.barcode}</small>
          {l.history && (
            <button className="au-link" onClick={() => setOpenRec(!openRec)}>
              {openRec ? "Hide records" : "Show records"}
            </button>
          )}
        </td>
        <td className="au-num">{qty(l.systemQty)}</td>
        <td className="au-num">{counted ? qty(l.physicalQty) : "–"}</td>
        <td className="au-num">{counted && l.soldAfterCountQty != null ? qty(l.soldAfterCountQty) : "–"}</td>
      </tr>
      {openRec && (
        <tr>
          <td colSpan={4}><HistoryTables history={l.history} /></td>
        </tr>
      )}
    </>
  );
}