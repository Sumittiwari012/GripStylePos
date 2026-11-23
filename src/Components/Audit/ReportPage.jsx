import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtDate, qty, ROUTE_BASE, session } from "./api";
import { ApprovalTag, Badge, Card, ErrorBox, Loading, Shell, Stat, useLoad, useToast } from "./ui";
import { ReviewButtons, ReviewDialog, ReviewTag } from "./StatusTree";

// Owner route:    /audit/owner/:auditId/report
// Incharge route: /audit/incharge/report  (audit comes from the login session)
//
// The report has two sections shown side by side:
//
//   MANAGER section  (what the manager saw when he counted)
//     Stock at verification | Physical count at verification | Balance
//     Balance = Physical count - Stock at verification
//
//   INCHARGE section (what happened after the count)
//     Sales after verification | Return after verification | Live stock | Balance | Total
//     Total = Live stock + Balance      (Balance is negative for a shortage)

const isCounted = (l) => !!l.status && l.status !== "Pending" && l.status !== "OnHold";
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);

// ── the three numbers behind both sections, for one line ──
// stockAtVerification comes from the server (qtyAtVerification)
function figures(l) {
  if (!isCounted(l)) return { stockAt: null, physical: null, balance: null, live: num(l.systemQty), total: null };
  const stockAt = num(l.qtyAtVerification);
  const physical = num(l.physicalQty);
  const balance = stockAt === null || physical === null ? null : physical - stockAt;
  const live = num(l.systemQty);
  const total = balance === null || live === null ? null : live + balance;
  return { stockAt, physical, balance, live, total };
}

const show = (v) => (v === null ? "–" : qty(v));
const signed = (v) => (v === null ? "–" : `${v > 0 ? "+" : ""}${qty(v)}`);
const tone = (v) => (v === null || v === 0 ? "" : v < 0 ? "au-neg" : "au-pos");

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

  // verify / send back (incharge: both, owner: send back only; not after approval)
  const [toast, notify] = useToast();
  const [dlg, setDlg] = useState(null); // { action, scope, id, label }
  const editable = !!r && (r.status === "InProgress" || r.status === "Review") && !r.approval?.isApproved;
  const perm = { verify: who === "member" && editable, sendBack: editable };
  const review = (action, scope, id, label) => setDlg({ action, scope, id, label });

  const groups = useMemo(
    () => (r ? mergeGroups(r.audited, r.negativeStock, r.soldOut) : []),
    [r]
  );

  const all = useMemo(() => groups.flatMap((g) => g.subCategories.flatMap((sg) => sg.items)), [groups]);

  const totals = useMemo(() => {
    const counted = all.filter(isCounted);
    const f = counted.map(figures);
    const ok = (k) => f.reduce((n, x) => n + (x[k] || 0), 0);
    return {
      products: all.length,
      counted: counted.length,
      notCounted: all.length - counted.length,
      // manager section
      stockAt: ok("stockAt"),
      physical: ok("physical"),
      balance: ok("balance"),
      // incharge section
      soldAfter: sum(counted, (l) => l.soldAfterCountQty),
      returnAfter: sum(counted, (l) => l.returnAfterCountQty),
      live: ok("live"),
      total: ok("total"),
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
      {toast}
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

          <div className="au-stats" style={{ marginTop: 0 }}>
            <Stat label="Products" value={totals.products} />
            <Stat label="Counted" value={totals.counted} tone="ok" />
            <Stat label="Not counted" value={totals.notCounted} tone="hold" />
          </div>

          {/* ───── the two sections, side by side ───── */}
          <div className="au-split">
            <section className="au-sec au-sec-mgr" aria-label="Manager section">
              <header className="au-sec-head">
                <h2>Manager section</h2>
                <p className="au-eq">Balance = Physical count − Stock at verification</p>
              </header>
              <div className="au-stats">
                <Stat label="Stock at verification" value={qty(totals.stockAt)} />
                <Stat label="Physical count at verification" value={qty(totals.physical)} />
                <Stat label="Balance" value={signed(totals.balance)} tone={totals.balance < 0 ? "short" : totals.balance > 0 ? "excess" : "ok"} />
              </div>
              <p className="au-eq au-eq-sum">
                {qty(totals.physical)} − {qty(totals.stockAt)} = <strong>{signed(totals.balance)}</strong>
              </p>
            </section>

            <section className="au-sec au-sec-inc" aria-label="Incharge section">
              <header className="au-sec-head">
                <h2>Incharge section</h2>
                <p className="au-eq">Total = Live stock + Balance <span className="au-muted">(balance is negative for a shortage)</span></p>
              </header>
              <div className="au-stats">
                <Stat label="Sales after verification" value={qty(totals.soldAfter)} />
                <Stat label="Return after verification" value={qty(totals.returnAfter)} />
                <Stat label="Live stock" value={qty(totals.live)} />
                <Stat label="Balance" value={signed(totals.balance)} tone={totals.balance < 0 ? "short" : totals.balance > 0 ? "excess" : "ok"} />
                <Stat label="Total" value={qty(totals.total)} tone="ok" />
              </div>
              <p className="au-eq au-eq-sum">
                {qty(totals.live)} {totals.balance < 0 ? "−" : "+"} {qty(Math.abs(totals.balance))} = <strong>{qty(totals.total)}</strong>
              </p>
            </section>
          </div>

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
              <CategoryGroup key={`${g.categoryName}-${expand.n}`} g={g} open={expand.open || !!term} perm={perm} review={review} />
            ))}
          </Card>

          {dlg && (
            <ReviewDialog
              auditId={auditId}
              target={dlg}
              onClose={() => setDlg(null)}
              onDone={(msg) => { setDlg(null); notify(msg); reload(); }}
            />
          )}
        </>
      )}
    </Shell>
  );
}

const tally = (items) => ({
  counted: items.filter(isCounted).length,
  verified: items.filter((l) => l.reviewStatus === "Verified").length,
  sentBack: items.filter((l) => l.reviewStatus === "SentBack").length,
});

function CategoryGroup({ g, open, perm, review }) {
  const items = g.subCategories.flatMap((sg) => sg.items);
  const showReview = perm.verify || perm.sendBack;
  const catId = items[0]?.categoryId;
  const ct = tally(items);
  return (
    <details className="au-group" open={open}>
      <summary>
        {g.categoryName}
        <span className="au-chip">{items.length} products</span>
        {ct.verified > 0 && <span className="au-chip au-chip-ok">{ct.verified} verified</span>}
        {ct.sentBack > 0 && <span className="au-chip au-chip-bad">{ct.sentBack} sent back</span>}
      </summary>

      {/* 3. whole category */}
      {showReview && catId > 0 && (
        <div className="au-row au-reviewbar">
          <span className="au-muted">Whole category:</span>
          <ReviewButtons
            perm={perm} counted={ct.counted} verified={ct.verified} sentBack={ct.sentBack} label=" category"
            onVerify={() => review("Verify", "Category", catId, g.categoryName)}
            onSendBack={() => review("SendBack", "Category", catId, g.categoryName)}
          />
        </div>
      )}

      {g.subCategories.map((sg) => {
        const st = tally(sg.items);
        const subId = sg.items[0]?.subCategoryId;
        return (
        <div key={sg.subCategoryName} className="au-subgroup">
          {/* 2. sub category */}
          <h3>
            {sg.subCategoryName} <span className="au-muted">({sg.items.length})</span>
            {st.verified > 0 && <span className="au-chip au-chip-ok">{st.verified} verified</span>}
            {st.sentBack > 0 && <span className="au-chip au-chip-bad">{st.sentBack} sent back</span>}
            {showReview && subId > 0 && (
              <span className="au-h3-actions">
                <ReviewButtons
                  perm={perm} counted={st.counted} verified={st.verified} sentBack={st.sentBack} label=" all"
                  onVerify={() => review("Verify", "SubCategory", subId, sg.subCategoryName)}
                  onSendBack={() => review("SendBack", "SubCategory", subId, sg.subCategoryName)}
                />
              </span>
            )}
          </h3>
          <div className="au-scroll">
            <table className="au-table au-table-tight au-report">
              <thead>
                <tr className="au-grouprow">
                  <th rowSpan={2}>Product</th>
                  <th colSpan={3} className="au-gh au-gh-mgr">
                    Manager
                    <small>Balance = Physical − Stock at verification</small>
                  </th>
                  <th colSpan={5} className="au-gh au-gh-inc">
                    Incharge
                    <small>Total = Live stock + Balance</small>
                  </th>
                  <th rowSpan={2}>Remarks</th>
                  <th rowSpan={2}>Status</th>
                  <th rowSpan={2}>Review</th>
                </tr>
                <tr>
                  <th className="au-num au-c-mgr au-sep">Stock at verification</th>
                  <th className="au-num au-c-mgr">Physical count</th>
                  <th className="au-num au-c-mgr">Balance</th>
                  <th className="au-num au-c-inc au-sep">Sales after verification</th>
                  <th className="au-num au-c-inc">Return after verification</th>
                  <th className="au-num au-c-inc">Live stock</th>
                  <th className="au-num au-c-inc">Balance</th>
                  <th className="au-num au-c-inc">Total</th>
                </tr>
              </thead>
              <tbody>
                {sg.items.map((l) => <Line key={`${l.productId}-${l.barcode}`} l={l} perm={perm} review={review} />)}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}
    </details>
  );
}

function Line({ l, perm, review }) {
  const counted = isCounted(l);
  const f = figures(l);
  return (
    <tr>
      <td>
        {l.productName}
        <small className="au-block au-muted">{l.barcode}</small>
      </td>

      {/* manager */}
      <td className="au-num au-c-mgr au-sep">{show(f.stockAt)}</td>
      <td className="au-num au-c-mgr">{show(f.physical)}</td>
      <td className={`au-num au-c-mgr ${tone(f.balance)}`}>{signed(f.balance)}</td>

      {/* incharge */}
      <td className="au-num au-c-inc au-sep">{counted && l.soldAfterCountQty != null ? qty(l.soldAfterCountQty) : "–"}</td>
      <td className="au-num au-c-inc">{counted && l.returnAfterCountQty != null ? qty(l.returnAfterCountQty) : "–"}</td>
      <td className="au-num au-c-inc">{show(f.live)}</td>
      <td className={`au-num au-c-inc ${tone(f.balance)}`}>{signed(f.balance)}</td>
      <td className="au-num au-c-inc"><strong>{show(f.total)}</strong></td>

      <td className="au-note">{[l.reasonCode, l.note].filter(Boolean).join(" · ") || "–"}</td>
      <td><Badge status={l.status || "Pending"} /></td>

      {/* 1. product */}
      <td className="au-note">
        <ReviewTag state={l.reviewStatus} note={l.reviewNote} by={l.reviewedBy} />
        {l.verificationId && (perm.verify || perm.sendBack) && (
          <div className="au-rowactions-wrap">
            <ReviewButtons
              perm={perm}
              counted={counted ? 1 : 0}
              verified={l.reviewStatus === "Verified" ? 1 : 0}
              sentBack={l.reviewStatus === "SentBack" ? 1 : 0}
              label=""
              onVerify={() => review("Verify", "Product", l.verificationId, l.productName)}
              onSendBack={() => review("SendBack", "Product", l.verificationId, l.productName)}
            />
          </div>
        )}
      </td>
    </tr>
  );
}