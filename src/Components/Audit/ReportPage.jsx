import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtDate, qty, ROUTE_BASE, session } from "./api";
import { Deck, ViewToggle, useViewMode } from "./CardView";
import { ApprovalTag, Bar, Badge, Card, ErrorBox, Field, FindBar, Loading, Modal, ProductMeta, Shell, Stat, useLoad, useToast } from "./ui";
import { ReviewButtons, ReviewDialog, ReviewTag } from "./StatusTree";
import { downloadToVerifyPdf } from "./toVerifyPdf";

// Owner route:    /audit/owner/:auditId/report
// Incharge route: /audit/incharge/report  (audit comes from the login session)
//
// Owner and incharge see the same report and can do the same review actions
// (verify, send back, write a note that overrides the manager's note).
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
// counted by a manager and not yet verified / sent back by the incharge or owner
const isToVerify = (l) => isCounted(l) && (!l.reviewStatus || l.reviewStatus === "None");
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);

// ── the three numbers behind both sections, for one line ──
// stockAtVerification comes from the server (qtyAtVerification)
function figures(l) {
  if (!isCounted(l)) return { stockAt: null, physical: null, balance: null, live: num(l.systemQty), total: null };
  // Stock at verification = opening stock + purchase - sales before verification + return before verification
  let stockAt = num(l.qtyAtVerification);
  if (stockAt === null && l.openingStock != null && l.purchaseBeforeQty != null) {
    stockAt = num(l.openingStock) + num(l.purchaseBeforeQty) - (num(l.soldBeforeQty) || 0) + (num(l.returnBeforeQty) || 0);
  }
  const physical = num(l.physicalQty);
  const balance = stockAt === null || physical === null ? null : physical - stockAt;
  const live = num(l.systemQty);
  const total = balance === null || live === null ? null : live + balance;
  return { stockAt, physical, balance, live, total };
}

const lineKey = (l) => l.verificationId ?? `${l.productId}-${l.barcode}`;
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
  const [only, setOnly] = useState("all"); // all | counted | notCounted | toVerify
  const [expand, setExpand] = useState({ open: false, n: 0 });
  const [layout, setLayout] = useViewMode(); // table | card
  const [doneTick, setDoneTick] = useState(0); // a verify / send back went through
  const [pdfBusy, setPdfBusy] = useState(false);
  const [focus, setFocus] = useState(null); // product found by barcode: { key, categoryName, subCategoryName, nonce }

  const { data: r, error, loading, reload } = useLoad(
    () => api(`/${auditId}/report?includeHistory=false`, { who }),
    [auditId, who]
  );

  // verify / send back / note: incharge AND owner; not after approval
  const [toast, notify] = useToast();
  const [dlg, setDlg] = useState(null); // { action, scope, id, label }
  const editable = !!r && (r.status === "InProgress" || r.status === "Review") && !r.approval?.isApproved;
  const perm = { verify: editable, sendBack: editable, note: editable };
  const review = (action, scope, id, label) => setDlg({ kind: "review", action, scope, id, label });
  const editNote = (line) => setDlg({ kind: "note", line });

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
      toVerify: all.filter(isToVerify).length,
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

  // who did what: counting (managers) and review (incharge / owner)
  const team = useMemo(() => {
    const counting = new Map();
    const reviewing = new Map();
    for (const l of all) {
      if (isCounted(l) && l.verifiedBy) {
        const c = counting.get(l.verifiedBy) || { name: l.verifiedBy, counted: 0, matched: 0, short: 0, excess: 0 };
        c.counted++;
        if (l.status === "Matched") c.matched++;
        if (l.status === "Short") c.short++;
        if (l.status === "Excess") c.excess++;
        counting.set(l.verifiedBy, c);
      }
      if (l.reviewedBy && l.reviewStatus && l.reviewStatus !== "None") {
        const v = reviewing.get(l.reviewedBy) || { name: l.reviewedBy, verified: 0, sentBack: 0 };
        if (l.reviewStatus === "Verified") v.verified++;
        if (l.reviewStatus === "SentBack") v.sentBack++;
        reviewing.set(l.reviewedBy, v);
      }
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    return { counting: [...counting.values()].sort(byName), reviewing: [...reviewing.values()].sort(byName) };
  }, [all]);

  // the found row stays highlighted for a few seconds
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setFocus(null), 8000);
    return () => clearTimeout(t);
  }, [focus]);

  // Type or scan a barcode -> open its category and sub category and land on the product.
  const locate = (code) => {
    const c = code.trim().toLowerCase();
    if (!c) return;
    const find = (test) => {
      const hits = [];
      for (const g of groups) for (const sg of g.subCategories) for (const l of sg.items) if (test(l)) hits.push({ l, g, sg });
      return hits;
    };
    let hits = find((l) => (l.barcode || "").toLowerCase() === c);
    if (hits.length === 0) hits = find((l) => (l.barcode || "").toLowerCase().includes(c) || l.productName.toLowerCase().includes(c));
    if (hits.length === 0) { notify("No product with this barcode is in the report.", "err"); return; }
    if (hits.length > 1) {
      setQ(code.trim());
      notify(`${hits.length} products match. Narrow it down in the list below, or enter the full barcode.`, "err");
      return;
    }
    const { l, g, sg } = hits[0];
    setQ(""); setOnly("all");
    setFocus({ key: lineKey(l), categoryName: g.categoryName, subCategoryName: sg.subCategoryName, nonce: Date.now() });
    notify(`${l.productName}: ${g.categoryName} › ${sg.subCategoryName}`);
  };

  // PDF of every product still waiting for verification (ignores the search box), category > sub category
  const downloadPdf = async () => {
    const pdfGroups = groups
      .map((g) => ({ ...g, subCategories: g.subCategories.map((sg) => ({ ...sg, items: sg.items.filter(isToVerify) })).filter((sg) => sg.items.length > 0) }))
      .filter((g) => g.subCategories.length > 0);
    if (pdfGroups.length === 0) { notify("Nothing waiting for verification.", "err"); return; }
    setPdfBusy(true);
    try {
      await downloadToVerifyPdf({ auditName: r.auditName, auditCode: r.auditCode, groups: pdfGroups, figures, fmtQty: qty, fmtDate });
    } catch (e) {
      notify("Could not create the PDF. Make sure jspdf and jspdf-autotable are installed.", "err");
    } finally { setPdfBusy(false); }
  };

  const term = q.trim().toLowerCase();
  const view = useMemo(() => {
    const keep = (l) =>
      (only === "all" || (only === "toVerify" ? isToVerify(l) : (only === "counted") === isCounted(l))) &&
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
                <p className="au-eq">Stock at verification = Opening stock + Purchase − Sales before verification + Return before verification</p>
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

          <div className="au-split">
            <section className="au-sec au-sec-mgr" aria-label="Counting work">
              <header className="au-sec-head"><h2>Counting work</h2><p className="au-muted">Who counted the products (managers)</p></header>
              {team.counting.length === 0 ? <p className="au-muted">Nothing counted yet.</p> : (
                <div className="au-scroll">
                  <table className="au-table au-table-tight">
                    <thead><tr><th>Name</th><th className="au-num">Counted</th><th className="au-num">Matched</th><th className="au-num">Short</th><th className="au-num">Excess</th></tr></thead>
                    <tbody>
                      {team.counting.map((c) => (
                        <tr key={c.name}><td>{c.name}</td><td className="au-num">{c.counted}</td><td className="au-num">{c.matched}</td><td className="au-num">{c.short}</td><td className="au-num">{c.excess}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="au-sec au-sec-inc" aria-label="Review work">
              <header className="au-sec-head"><h2>Review work</h2><p className="au-muted">What the incharge and owner verified or sent back</p></header>
              {team.reviewing.length === 0 ? <p className="au-muted">Nothing reviewed yet.</p> : (
                <div className="au-scroll">
                  <table className="au-table au-table-tight">
                    <thead><tr><th>Name</th><th className="au-num">Verified</th><th className="au-num">Sent back</th></tr></thead>
                    <tbody>
                      {team.reviewing.map((v) => (
                        <tr key={v.name}><td>{v.name}</td><td className="au-num">{v.verified}</td><td className="au-num">{v.sentBack}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <Card title="Products" right={<ViewToggle value={layout} onChange={setLayout} />}>
            <FindBar onFind={locate} />
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
                {[["all", "All"], ["counted", "Counted"], ["notCounted", "Not counted"], ["toVerify", `To verify (${totals.toVerify})`]].map(([k, l]) => (
                  <button key={k} className={only === k ? "on" : ""} onClick={() => setOnly(k)}>{l}</button>
                ))}
              </div>
              {only === "toVerify" && totals.toVerify > 0 && <button className="au-btn au-btn-sm" disabled={pdfBusy} onClick={downloadPdf}>{pdfBusy ? "Creating PDF…" : "Download PDF"}</button>}
              {layout !== "card" && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setExpand((e) => ({ open: true, n: e.n + 1 }))}>Expand all</button>}
              {layout !== "card" && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setExpand((e) => ({ open: false, n: e.n + 1 }))}>Collapse all</button>}
            </div>

            {shown === 0 && <p className="au-muted">{only === "toVerify" && !term ? "Nothing waiting for verification." : term || only !== "all" ? "No product matches." : "No products."}</p>}
            {layout === "card"
              ? <ReportCards groups={view} perm={perm} review={review} editNote={editNote} doneTick={doneTick} focus={focus} />
              : view.map((g) => (
                <CategoryGroup key={`${g.categoryName}-${expand.n}`} g={g} open={expand.open || !!term || only === "toVerify"} subOpen={expand.n === 0 || expand.open || !!term} perm={perm} review={review} editNote={editNote} focus={focus} />
              ))}
          </Card>

          {dlg?.kind === "review" && (
            <ReviewDialog
              auditId={auditId}
              target={dlg}
              onClose={() => setDlg(null)}
              onDone={(msg) => { setDlg(null); notify(msg); setDoneTick((n) => n + 1); reload(); }}
            />
          )}
          {dlg?.kind === "note" && (
            <NoteDialog
              auditId={auditId}
              line={dlg.line}
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

function CategoryGroup({ g, open, subOpen, perm, review, editNote, focus }) {
  const [isOpen, setIsOpen] = useState(open);
  const mine = !!focus && focus.categoryName === g.categoryName;
  useEffect(() => { setIsOpen(open); }, [open]);
  useEffect(() => { if (mine) setIsOpen(true); }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = g.subCategories.flatMap((sg) => sg.items);
  const showReview = perm.verify || perm.sendBack;
  const catId = items[0]?.categoryId;
  const ct = tally(items);
  return (
    <details className="au-group" open={isOpen} onToggle={(e) => setIsOpen(e.currentTarget.open)}>
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
        <SubGroup key={sg.subCategoryName} initialOpen={subOpen} focus={mine && focus.subCategoryName === sg.subCategoryName ? focus : null} title={sg.subCategoryName} count={sg.items.length} st={st}
          actions={showReview && subId > 0 && (
            <ReviewButtons
              perm={perm} counted={st.counted} verified={st.verified} sentBack={st.sentBack} label=" all"
              onVerify={() => review("Verify", "SubCategory", subId, sg.subCategoryName)}
              onSendBack={() => review("SendBack", "SubCategory", subId, sg.subCategoryName)}
            />
          )}
        >
          <div className="au-scroll">
            <table className="au-table au-table-tight au-report">
              <thead>
                <tr className="au-grouprow">
                  <th rowSpan={2}>Product</th>
                  <th colSpan={3} className="au-gh au-gh-mgr">
                    Manager
                    <small>Stock at verification = Opening + Purchase − Sales before + Return before<br />Balance = Physical − Stock at verification</small>
                  </th>
                  <th colSpan={5} className="au-gh au-gh-inc">
                    Incharge
                    <small>Total = Live stock + Balance</small>
                  </th>
                  <th rowSpan={2}>Remarks</th>
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
                {sg.items.map((l) => <Line key={`${l.productId}-${l.barcode}`} l={l} hit={focus?.key === lineKey(l)} perm={perm} review={review} editNote={editNote} />)}
              </tbody>
            </table>
          </div>
        </SubGroup>
        );
      })}
    </details>
  );
}

// One sub category: opens and closes on its own. Review buttons sit in the heading.
function SubGroup({ initialOpen, focus, title, count, st, actions, children }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => { if (focus) setOpen(true); }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <details className="au-subgroup au-subdetails" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="au-subtitle">{title} <span className="au-muted">({count})</span></span>
        {st.verified > 0 && <span className="au-chip au-chip-ok">{st.verified} verified</span>}
        {st.sentBack > 0 && <span className="au-chip au-chip-bad">{st.sentBack} sent back</span>}
        {actions && (
          // clicking a button must not open / close the sub category
          <span className="au-h3-actions" onClick={(e) => e.preventDefault()}>{actions}</span>
        )}
      </summary>
      {open && children}
    </details>
  );
}

function Line({ l, hit, perm, review, editNote }) {
  const ref = useRef(null);
  useEffect(() => { if (hit) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [hit]);
  const counted = isCounted(l);
  const f = figures(l);
  const mgrNote = [l.reasonCode, l.note].filter(Boolean).join(" · ");
  return (
    <tr ref={ref} id={`au-row-${lineKey(l)}`} className={hit ? "au-row-hit" : ""}>
      <td>
        {l.productName}
        <small className="au-block au-muted">{l.barcode}</small>
        <ProductMeta mrp={l.mrp} size={l.size} />
        {counted && l.verifiedBy && (
          <small className="au-block au-muted">Counted by {l.verifiedBy}{l.verifiedAt ? ` · ${fmtDate(l.verifiedAt)}` : ""}</small>
        )}
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

      {/* remarks: the incharge / owner note overrides the manager's note */}
      <td className="au-note">
        {l.reviewNote ? (
          <>
            <div><strong>Incharge:</strong> {l.reviewNote}{l.reviewedBy && <small className="au-muted"> ({l.reviewedBy})</small>}</div>
            {mgrNote && <small className="au-block au-muted au-overridden" title="Manager's note (overridden)">Manager: {mgrNote}</small>}
          </>
        ) : (mgrNote || "–")}
        {perm.note && l.verificationId && (
          <div>
            <button className="au-link" onClick={() => editNote(l)}>{l.reviewNote ? "Edit note" : "Add note"}</button>
          </div>
        )}
      </td>

      {/* 1. product */}
      <td className="au-note">
        <ReviewTag state={l.reviewStatus} by={l.reviewedBy} />
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

// Incharge / owner note on one product. It is shown instead of the manager's note
// (the manager's note stays visible, struck through). Leave it empty to remove it.
function NoteDialog({ auditId, line, onClose, onDone }) {
  const [note, setNote] = useState(line.reviewNote || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const mgrNote = [line.reasonCode, line.note].filter(Boolean).join(" · ");

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/${auditId}/items/${line.verificationId}/note`, { method: "POST", body: { note: note.trim() || null } });
      onDone(r.message);
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <Modal title={`Note: ${line.productName}`} onClose={onClose}>
      <p className="au-muted">{line.barcode}</p>
      <p><strong>Manager's note:</strong> {mgrNote || <span className="au-muted">none</span>}</p>
      <Field label="Your note (replaces the manager's note in the report)">
        <textarea className="au-input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
      <ErrorBox error={err} />
      <button className="au-btn au-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : note.trim() ? "Save note" : "Remove note"}</button>
    </Modal>
  );
}

// ───────────── card view: category -> sub category -> swipe through products ─────────────
function ReportCards({ groups, perm, review, editNote, doneTick, focus }) {
  const [catName, setCatName] = useState(null);
  const [subName, setSubName] = useState(null);
  const [idx, setIdx] = useState(0);
  const tap = useRef(null);
  const advance = useRef(null);
  const showReview = perm.verify || perm.sendBack;

  const g = catName !== null ? groups.find((x) => x.categoryName === catName) : null;
  const sg = g && subName !== null ? g.subCategories.find((x) => x.subCategoryName === subName) : null;

  // verify / send back went through -> go to the next product once the new report is in
  useEffect(() => { if (tap.current) { advance.current = tap.current; tap.current = null; } }, [doneTick]);
  useEffect(() => {
    const a = advance.current;
    if (!a) return;
    advance.current = null;
    const ss = groups.find((x) => x.categoryName === a.cat)?.subCategories.find((x) => x.subCategoryName === a.sub);
    if (!ss) return;
    const pos = ss.items.findIndex((x) => x.verificationId === a.id);
    setIdx(Math.max(0, Math.min(pos >= 0 ? pos + 1 : a.idx, ss.items.length - 1)));
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // a barcode was found: open its category, sub category and product
  useEffect(() => {
    if (!focus) return;
    const gi = groups.find((x) => x.categoryName === focus.categoryName);
    const si = gi?.subCategories.find((x) => x.subCategoryName === focus.subCategoryName);
    const pos = si ? si.items.findIndex((x) => lineKey(x) === focus.key) : -1;
    if (pos < 0) return;
    setCatName(gi.categoryName); setSubName(si.subCategoryName); setIdx(pos);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = (t) => (
    <span className="au-subcard-chips">
      {t.verified > 0 && <span className="au-chip au-chip-ok">{t.verified} verified</span>}
      {t.sentBack > 0 && <span className="au-chip au-chip-bad">{t.sentBack} sent back</span>}
    </span>
  );

  // ── 1. categories ──
  if (!g) {
    return (
      <div className="au-subcards">
        {groups.map((c) => {
          const items = c.subCategories.flatMap((x) => x.items);
          const t = tally(items);
          return (
            <button key={c.categoryName} className="au-subcard" onClick={() => { setCatName(c.categoryName); setSubName(null); setIdx(0); }}>
              <span className="au-subcard-top"><strong>{c.categoryName}</strong><span className="au-subcard-go" aria-hidden="true">›</span></span>
              <span className="au-muted">{items.length} products · {t.counted} counted</span>
              <Bar percent={items.length ? Math.round((t.counted / items.length) * 100) : 0} />
              {chips(t)}
            </button>
          );
        })}
      </div>
    );
  }

  // ── 2. sub categories of one category ──
  if (!sg) {
    const items = g.subCategories.flatMap((x) => x.items);
    const ct = tally(items);
    const catId = items[0]?.categoryId;
    return (
      <>
        <div className="au-cardhead">
          <button className="au-btn au-btn-sm" onClick={() => setCatName(null)}>← Categories</button>
          <strong className="au-cardhead-t">{g.categoryName}</strong>
        </div>
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
        <div className="au-subcards">
          {g.subCategories.map((x) => {
            const t = tally(x.items);
            return (
              <button key={x.subCategoryName} className="au-subcard" onClick={() => { setSubName(x.subCategoryName); setIdx(0); }}>
                <span className="au-subcard-top"><strong>{x.subCategoryName}</strong><span className="au-subcard-go" aria-hidden="true">›</span></span>
                <span className="au-muted">{x.items.length} products · {t.counted} counted</span>
                <Bar percent={x.items.length ? Math.round((t.counted / x.items.length) * 100) : 0} />
                {chips(t)}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ── 3. products of one sub category, one card at a time ──
  const st = tally(sg.items);
  const subId = sg.items[0]?.subCategoryId;
  const cur = Math.min(idx, Math.max(sg.items.length - 1, 0));
  return (
    <>
      <div className="au-cardhead">
        <button className="au-btn au-btn-sm" onClick={() => setSubName(null)}>← Sub categories</button>
        <strong className="au-cardhead-t">{sg.subCategoryName}</strong>
      </div>
      <div className="au-row au-muted" style={{ alignItems: "center", fontSize: ".85rem", marginBottom: ".4rem" }}>
        <span>{g.categoryName} · {sg.items.length} products</span>
        {chips(st)}
      </div>
      {showReview && subId > 0 && (
        <div className="au-row au-reviewbar">
          <span className="au-muted">Whole sub category:</span>
          <ReviewButtons
            perm={perm} counted={st.counted} verified={st.verified} sentBack={st.sentBack} label=" all"
            onVerify={() => review("Verify", "SubCategory", subId, sg.subCategoryName)}
            onSendBack={() => review("SendBack", "SubCategory", subId, sg.subCategoryName)}
          />
        </div>
      )}
      <Deck
        items={sg.items}
        idx={idx}
        setIdx={setIdx}
        getKey={lineKey}
        hitKey={focus?.key}
        render={(l) => {
          const counted = isCounted(l);
          const f = figures(l);
          const rs = l.reviewStatus;
          const mgrNote = [l.reasonCode, l.note].filter(Boolean).join(" · ");
          const canV = perm.verify && counted && rs !== "Verified" && !!l.verificationId;
          const canB = perm.sendBack && counted && rs !== "SentBack" && !!l.verificationId;
          const decide = (action) => {
            tap.current = { cat: g.categoryName, sub: sg.subCategoryName, id: l.verificationId, idx: cur };
            review(action, "Product", l.verificationId, l.productName);
          };
          return (
            <>
              <div className="au-pc-top">
                <div>
                  <div className="au-pc-barcode">{l.productName}</div>
                  <div className="au-pc-name">{l.barcode}</div>
                  <ProductMeta mrp={l.mrp} size={l.size} />
                  {counted && l.verifiedBy && <small className="au-block au-muted">Counted by {l.verifiedBy}{l.verifiedAt ? ` · ${fmtDate(l.verifiedAt)}` : ""}</small>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge status={l.status || "Pending"} />
                  <div style={{ marginTop: ".3rem" }}><ReviewTag state={rs} /></div>
                </div>
              </div>

              <div className="au-pc-sec au-pc-sec-mgr">
                <h4>Manager</h4>
                <div className="au-pc-stats">
                  <div className="au-stat"><div className="au-stat-v">{show(f.stockAt)}</div><div className="au-stat-l">Stock at verification</div></div>
                  <div className="au-stat"><div className="au-stat-v">{show(f.physical)}</div><div className="au-stat-l">Physical count</div></div>
                  <div className={`au-stat ${f.balance < 0 ? "au-t-short" : f.balance > 0 ? "au-t-excess" : ""}`}><div className="au-stat-v">{signed(f.balance)}</div><div className="au-stat-l">Balance</div></div>
                </div>
              </div>

              <div className="au-pc-sec au-pc-sec-inc">
                <h4>Incharge</h4>
                <div className="au-pc-stats au-pc-stats-5">
                  <div className="au-stat"><div className="au-stat-v">{counted && l.soldAfterCountQty != null ? qty(l.soldAfterCountQty) : "–"}</div><div className="au-stat-l">Sales after</div></div>
                  <div className="au-stat"><div className="au-stat-v">{counted && l.returnAfterCountQty != null ? qty(l.returnAfterCountQty) : "–"}</div><div className="au-stat-l">Return after</div></div>
                  <div className="au-stat"><div className="au-stat-v">{show(f.live)}</div><div className="au-stat-l">Live stock</div></div>
                  <div className={`au-stat ${f.balance < 0 ? "au-t-short" : f.balance > 0 ? "au-t-excess" : ""}`}><div className="au-stat-v">{signed(f.balance)}</div><div className="au-stat-l">Balance</div></div>
                  <div className="au-stat au-t-ok"><div className="au-stat-v">{show(f.total)}</div><div className="au-stat-l">Total</div></div>
                </div>
              </div>

              <dl className="au-pc-facts">
                <div>
                  <dt>Remarks</dt>
                  <dd>
                    {l.reviewNote ? (
                      <>
                        <div><strong>Incharge:</strong> {l.reviewNote}{l.reviewedBy && <small className="au-muted"> ({l.reviewedBy})</small>}</div>
                        {mgrNote && <small className="au-block au-muted au-overridden">Manager: {mgrNote}</small>}
                      </>
                    ) : (mgrNote || "–")}
                  </dd>
                </div>
              </dl>

              {showReview && l.verificationId && (
                <div className="au-pc-decide">
                  {perm.verify && <button className="au-btn au-btn-primary" disabled={!canV} onClick={() => decide("Verify")}>Verify</button>}
                  {perm.sendBack && <button className="au-btn au-btn-danger" disabled={!canB} onClick={() => decide("SendBack")}>Send back</button>}
                </div>
              )}
              {perm.note && l.verificationId && (
                <button className="au-btn au-btn-sm" onClick={() => editNote(l)}>{l.reviewNote ? "Edit note" : "Add note"}</button>
              )}
            </>
          );
        }}
      />
    </>
  );
}