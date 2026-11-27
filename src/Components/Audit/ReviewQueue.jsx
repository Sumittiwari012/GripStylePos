import { useEffect, useState } from "react";
import { api, qty } from "./api";
import { Badge, BarcodeInput, Card, ErrorBox, Loading, ProductMeta, useLoad, useToast } from "./ui";
import { HistoryDialog, LogDialog } from "./Panels";
import { CountDialog, ResetDialog, ReviewDialog, ReviewTag, ReviewButtons } from "./StatusTree";

// ─────────────────────────────────────────────────────────────
// Incharge "To verify" list: every counted product that is waiting for the incharge,
// in ONE flat list. No need to open categories and sub categories.
//   To verify  = counted by a manager, not verified yet
//   Sent back  = sent back to the managers, waiting for a recount
//   Verified   = already verified
// Backend: GET /{auditId}/review-queue?state=toverify|sentback|verified
// ─────────────────────────────────────────────────────────────
const STATES = [["toverify", "To verify"], ["sentback", "Sent back"], ["verified", "Verified"]];

export function ReviewQueue({ auditId, canAct, refreshKey, onChanged, onCount }) {
  const [state, setState] = useState("toverify");
  const [catId, setCatId] = useState("all");
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);
  const [toast, notify] = useToast();
  const [ver, setVer] = useState(0);

  const { data, error, loading, reload } = useLoad(
    () => api(`/${auditId}/review-queue?state=${state}`),
    [auditId, state, refreshKey, ver]
  );

  useEffect(() => { if (data) onCount?.(data.counts.toVerify); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setDlg(null);
  const done = (msg) => { close(); notify(msg); setVer((v) => v + 1); onChanged?.(); };

  const act = async (type, item) => {
    // Verify needs no dialog
    if (type === "review" && item.action === "Verify") {
      try {
        const r = await api(`/${auditId}/review`, { method: "POST", body: { scope: item.scope, id: item.id, action: "Verify", note: null } });
        done(r.message);
      } catch (e) { notify(e.message, "err"); }
      return;
    }
    setDlg({ type, item });
  };
  const review = (action, it) => act("review", { action, scope: "Product", id: it.verificationId, label: it.productName });

  const items = data?.items ?? [];
  const cats = [...new Map(items.map((i) => [i.categoryId, i.categoryName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const t = q.trim().toLowerCase();
  const shown = items.filter((i) =>
    (catId === "all" || String(i.categoryId) === catId) &&
    (!t || i.barcode.toLowerCase().includes(t) || i.productName.toLowerCase().includes(t))
  );

  // group by category > sub category
  const groups = [];
  for (const it of shown) {
    let g = groups.find((x) => x.id === it.categoryId);
    if (!g) groups.push((g = { id: it.categoryId, name: it.categoryName, subs: [] }));
    let s = g.subs.find((x) => x.name === it.subCategoryName);
    if (!s) g.subs.push((s = { name: it.subCategoryName, items: [] }));
    s.items.push(it);
  }

  const perm = { verify: canAct, sendBack: canAct };
  const c = data?.counts;

  return (
    <Card title="Products to verify" right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setVer((v) => v + 1)}>Refresh</button>}>
      {toast}
      <div className="au-row" style={{ margin: ".25rem 0 .75rem" }}>
        <div className="au-seg">
          {STATES.map(([k, l]) => (
            <button key={k} className={state === k ? "on" : ""} onClick={() => { setState(k); setCatId("all"); }}>
              {l}{c ? ` (${k === "toverify" ? c.toVerify : k === "sentback" ? c.sentBack : c.verified})` : ""}
            </button>
          ))}
        </div>
        <select className="au-input" style={{ maxWidth: 220 }} value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="all">All categories</option>
          {cats.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
        </select>
        <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={setQ} />
      </div>

      <p className="au-muted">
        {state === "toverify" && "Counted by the managers and waiting for you. Verify it, correct it, or send it back."}
        {state === "sentback" && "Sent back to the managers. They will recount, and it comes back to To verify."}
        {state === "verified" && "Already verified. You can still send one back while the report is not approved."}
        {c && c.notCounted > 0 && ` ${c.notCounted} product(s) are not counted yet.`}
      </p>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && groups.length === 0 && (
        <p className="au-muted">{items.length === 0 ? (state === "toverify" ? "Nothing waiting for verification." : "Nothing here.") : "No product matches the filter."}</p>
      )}

      {groups.map((g) => (
        <details key={g.id} className="au-group" open>
          <summary>{g.name}<span className="au-chip">{g.subs.reduce((n, s) => n + s.items.length, 0)} product(s)</span></summary>
          {g.subs.map((s) => (
            <div key={s.name} className="au-subgroup">
              <h3>{s.name}<span className="au-chip">{s.items.length}</span></h3>
              <div className="au-scroll">
                <table className="au-table au-table-tight">
                  <thead>
                    <tr>
                      <th>Barcode / product</th>
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
                    {s.items.map((it) => (
                      <tr key={it.verificationId}>
                        <td>
                          <strong>{it.barcode}</strong>
                          {it.stockKind !== "InStock" && <span className="au-chip">{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span>}
                          <small className="au-block au-muted">{it.productName}</small>
                          <ProductMeta mrp={it.mrp} size={it.size} />
                        </td>
                        <td className="au-num">{qty(it.systemQty)}</td>
                        <td className="au-num">{qty(it.physicalQty)}</td>
                        <td className={`au-num ${it.varianceQty < 0 ? "au-neg" : it.varianceQty > 0 ? "au-pos" : ""}`}>{qty(it.varianceQty)}</td>
                        <td><Badge status={it.status} /></td>
                        <td className="au-note">{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</td>
                        <td>{it.verifiedBy || "–"}</td>
                        <td className="au-note"><ReviewTag state={it.reviewStatus} note={it.reviewNote} by={it.reviewedBy} /></td>
                        <td className="au-rowactions au-rowactions-wrap">
                          <ReviewButtons
                            perm={perm} counted={1}
                            verified={it.reviewStatus === "Verified" ? 1 : 0}
                            sentBack={it.reviewStatus === "SentBack" ? 1 : 0}
                            label=""
                            onVerify={() => review("Verify", it)}
                            onSendBack={() => review("SendBack", it)}
                          />
                          {canAct && (
                            <>
                              <button className="au-btn au-btn-sm" onClick={() => act("count", it)}>Correct</button>
                              <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => act("reset", it)}>Reset</button>
                            </>
                          )}
                          <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => act("history", it)}>Records</button>
                          <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => act("log", it)}>Changes</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </details>
      ))}

      {dlg?.type === "count" && <CountDialog role="incharge" auditId={auditId} item={dlg.item} canAct={canAct} onClose={close} onDone={done} />}
      {dlg?.type === "reset" && <ResetDialog auditId={auditId} item={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "review" && <ReviewDialog auditId={auditId} target={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "log" && <LogDialog who="member" auditId={auditId} item={dlg.item} onClose={close} />}
      {dlg?.type === "history" && <HistoryDialog who="member" auditId={auditId} item={dlg.item} onClose={close} />}
    </Card>
  );
}
