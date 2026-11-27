import { useMemo, useState } from "react";
import { api, qty } from "./api";
import { Badge, BarcodeInput, Card, ErrorBox, Loading, ProductMeta, useLoad, useToast } from "./ui";
import { Deck, ViewToggle, useViewMode } from "./CardView";
import { HistoryDialog, LogDialog } from "./Panels";
import { ReviewDialog, ReviewTag } from "./StatusTree";

// Incharge: every product the managers counted that is still waiting for YOUR verification,
// in one flat list. No need to open category > sub category > product.
//
// No backend change: it reads GET /tree and then GET /tree/{categoryId} for each category
// (in parallel) and puts the products together.
//
//   To verify : counted (Matched / Short / Excess) and not yet verified or sent back
//   Sent back : you sent it back, waiting for the manager to recount
//   Verified  : already verified by you
//
// Actions are the same as in Products: Verify (no dialog), Send back (note required), Records, Changes.

const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";
const rsOf = (it) => (it.reviewStatus && it.reviewStatus !== "None" ? it.reviewStatus : "None");

const FILTERS = [
  ["verify", "To verify"],
  ["back", "Sent back"],
  ["verified", "Verified"],
];

const inFilter = (it, f) => {
  if (!isDone(it.status) && f !== "back") return false; // not counted yet: nothing to verify
  const rs = rsOf(it);
  if (f === "verify") return rs === "None";
  if (f === "back") return rs === "SentBack";
  return rs === "Verified";
};

async function loadAll(auditId) {
  const tree = await api(`/${auditId}/tree`);
  const cats = [...tree.pending, ...tree.completed];
  const details = await Promise.all(cats.map((c) => api(`/${auditId}/tree/${c.categoryId}`)));
  return details
    .flatMap((d) =>
      d.subCategories.flatMap((sg) =>
        sg.items.map((it) => ({ ...it, categoryId: d.categoryId, categoryName: d.categoryName, subCategoryName: sg.subCategoryName }))
      )
    )
    .sort(
      (a, b) =>
        a.categoryName.localeCompare(b.categoryName) ||
        a.subCategoryName.localeCompare(b.subCategoryName) ||
        a.productName.localeCompare(b.productName)
    );
}

export function ToVerifyPanel({ auditId, canAct, refreshKey, onChanged }) {
  const { data, error, loading, reload } = useLoad(() => loadAll(auditId), [auditId, refreshKey]);
  const [filter, setFilter] = useState("verify");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [dlg, setDlg] = useState(null); // { type: "review" | "log" | "history", item }
  const [busyId, setBusyId] = useState(null);
  const [toast, notify] = useToast();
  const [view, setView] = useViewMode();

  const all = data || [];
  const counts = useMemo(() => ({
    verify: all.filter((i) => inFilter(i, "verify")).length,
    back: all.filter((i) => inFilter(i, "back")).length,
    verified: all.filter((i) => inFilter(i, "verified")).length,
  }), [all]);

  const inState = all.filter((i) => inFilter(i, filter));
  const cats = useMemo(() => {
    const m = new Map();
    inState.forEach((i) => m.set(i.categoryId, { name: i.categoryName, n: (m.get(i.categoryId)?.n || 0) + 1 }));
    return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [inState]);

  const t = q.trim().toLowerCase();
  const items = inState.filter(
    (i) => (!cat || String(i.categoryId) === cat) && (!t || i.barcode.toLowerCase().includes(t) || i.productName.toLowerCase().includes(t))
  );

  const verify = async (it) => {
    setBusyId(it.verificationId);
    try {
      const r = await api(`/${auditId}/review`, {
        method: "POST",
        body: { scope: "Product", id: it.verificationId, action: "Verify", note: null },
      });
      notify(r.message);
      onChanged?.();
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setBusyId(null);
    }
  };

  const sendBack = (it) => setDlg({ type: "review", item: { action: "SendBack", scope: "Product", id: it.verificationId, label: it.productName } });
  const close = () => setDlg(null);
  const done = (msg) => { close(); notify(msg); onChanged?.(); };

  const canVerify = (it) => canAct && isDone(it.status) && rsOf(it) !== "Verified";
  const canBack = (it) => canAct && isDone(it.status) && rsOf(it) !== "SentBack";

  const variance = (it) => (
    <span className={it.varianceQty < 0 ? "au-neg" : it.varianceQty > 0 ? "au-pos" : ""}>{qty(it.varianceQty)}</span>
  );

  return (
    <Card
      title="Products to verify"
      right={
        <div className="au-row" style={{ alignItems: "center" }}>
          <ViewToggle value={view} onChange={setView} />
          <button className="au-btn au-btn-ghost au-btn-sm" onClick={reload}>Refresh</button>
        </div>
      }
    >
      {toast}
      <p className="au-muted">Every product the managers have counted that is waiting for your verification, from all categories.</p>

      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <div className="au-seg au-seg-scroll">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => { setFilter(k); setCat(""); setIdx(0); }}>
              {l} ({counts[k]})
            </button>
          ))}
        </div>
        <select className="au-input au-input-sm" value={cat} onChange={(e) => { setCat(e.target.value); setIdx(0); }} aria-label="Category">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
        </select>
        <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={(v) => { setQ(v); setIdx(0); }} />
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : items.length === 0 ? (
        <p className="au-muted">
          {filter === "verify"
            ? (all.length && !t && !cat ? "Nothing waiting for verification." : "No product matches.")
            : "Nothing here."}
        </p>
      ) : view === "card" ? (
        <Deck
          items={items}
          idx={idx}
          setIdx={setIdx}
          getKey={(i) => i.verificationId}
          render={(it) => (
            <>
              <div className="au-pc-top">
                <div>
                  <div className="au-pc-barcode">{it.barcode}</div>
                  <div className="au-pc-name">{it.productName}</div>
                  <small className="au-block au-muted">{it.categoryName} › {it.subCategoryName}</small>
                  <ProductMeta mrp={it.mrp} size={it.size} />
                </div>
                <Badge status={it.status} />
              </div>
              {it.stockKind !== "InStock" && <div><span className="au-chip" style={{ marginLeft: 0 }}>{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span></div>}
              <div className="au-pc-stats">
                <div className="au-stat"><div className="au-stat-v">{qty(it.systemQty)}</div><div className="au-stat-l">System</div></div>
                <div className="au-stat"><div className="au-stat-v">{isDone(it.status) ? qty(it.physicalQty) : "–"}</div><div className="au-stat-l">Counted</div></div>
                <div className={`au-stat ${isDone(it.status) && it.varianceQty < 0 ? "au-t-short" : isDone(it.status) && it.varianceQty > 0 ? "au-t-excess" : ""}`}>
                  <div className="au-stat-v">{isDone(it.status) ? qty(it.varianceQty) : "–"}</div><div className="au-stat-l">Variance</div>
                </div>
              </div>
              <dl className="au-pc-facts">
                <div><dt>Reason / note</dt><dd>{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</dd></div>
                <div><dt>Counted by</dt><dd>{it.verifiedBy || "–"}</dd></div>
                <div><dt>Review</dt><dd><ReviewTag state={it.reviewStatus} note={it.reviewNote} by={it.reviewedBy} /></dd></div>
              </dl>
              {canAct && (
                <div className="au-pc-decide">
                  <button className="au-btn au-btn-primary" disabled={!canVerify(it) || busyId === it.verificationId} onClick={() => verify(it)}>Verify</button>
                  <button className="au-btn au-btn-danger" disabled={!canBack(it)} onClick={() => sendBack(it)}>Send back</button>
                </div>
              )}
              <div className="au-pc-more">
                <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "history", item: it })}>Records</button>
                <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "log", item: it })}>Changes</button>
              </div>
            </>
          )}
        />
      ) : (
        <div className="au-scroll">
          <table className="au-table au-table-tight">
            <thead>
              <tr>
                <th>Barcode / product</th>
                <th>Category</th>
                <th className="au-num">System</th>
                <th className="au-num">Counted</th>
                <th className="au-num">Variance</th>
                <th>Status</th>
                <th>Reason / note</th>
                <th>By</th>
                <th>Review</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.verificationId}>
                  <td>
                    <strong>{it.barcode}</strong>
                    {it.stockKind !== "InStock" && <span className="au-chip">{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span>}
                    <small className="au-block au-muted">{it.productName}</small>
                    <ProductMeta mrp={it.mrp} size={it.size} />
                  </td>
                  <td>{it.categoryName}<small className="au-block au-muted">{it.subCategoryName}</small></td>
                  <td className="au-num">{qty(it.systemQty)}</td>
                  <td className="au-num">{isDone(it.status) ? qty(it.physicalQty) : "–"}</td>
                  <td className="au-num">{isDone(it.status) ? variance(it) : "–"}</td>
                  <td><Badge status={it.status} /></td>
                  <td className="au-note">{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</td>
                  <td>{it.verifiedBy || "–"}</td>
                  <td className="au-note"><ReviewTag state={it.reviewStatus} note={it.reviewNote} by={it.reviewedBy} /></td>
                  <td className="au-rowactions au-rowactions-wrap">
                    {canAct && (
                      <>
                        <button className="au-btn au-btn-sm" disabled={!canVerify(it) || busyId === it.verificationId} onClick={() => verify(it)}>Verify</button>
                        <button className="au-btn au-btn-sm au-btn-danger" disabled={!canBack(it)} onClick={() => sendBack(it)}>Send back</button>
                      </>
                    )}
                    <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "history", item: it })}>Records</button>
                    <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "log", item: it })}>Changes</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dlg?.type === "review" && <ReviewDialog auditId={auditId} target={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "log" && <LogDialog who="member" auditId={auditId} item={dlg.item} onClose={close} />}
      {dlg?.type === "history" && <HistoryDialog who="member" auditId={auditId} item={dlg.item} onClose={close} />}
    </Card>
  );
}
