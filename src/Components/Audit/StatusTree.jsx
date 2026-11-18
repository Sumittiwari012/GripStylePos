import { useState } from "react";
import { api, qty } from "./api";
import { Badge, CountForm, Card, ErrorBox, Field, Loading, Modal, Stat, useLoad, useToast } from "./ui";
import { HistoryDialog, LogDialog } from "./Panels";

// Pending / Completed categories. A category sits in Pending until EVERY barcode in it
// is counted (Matched / Short / Excess); then it moves to Completed by itself.
// A category's sub categories and barcodes are loaded only when it is opened.
//   role    "owner" | "incharge" | "manager"
//   canAct  manager: counting is open / incharge: audit not locked. Owner never acts.
export function StatusTree({ role, auditId, canAct = false, refreshKey, onChanged }) {
  const who = role === "owner" ? "owner" : "member";
  const summary = useLoad(() => api(`/${auditId}/tree`, { who }), [auditId, who, refreshKey]);
  const [section, setSection] = useState("pending");
  const [ver, setVer] = useState(0); // bumps => open categories reload
  const [dlg, setDlg] = useState(null); // { type: count | reset | log | history, item }
  const [toast, notify] = useToast();

  const data = summary.data;
  const close = () => setDlg(null);
  const done = (msg) => { close(); notify(msg); setVer((v) => v + 1); summary.reload(); onChanged?.(); };
  const list = data?.[section] ?? [];

  return (
    <Card title="Products" right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={() => { setVer((v) => v + 1); summary.reload(); }}>Refresh</button>}>
      {toast}
      <ErrorBox error={summary.error} onRetry={summary.reload} />
      {summary.loading && !data ? <Loading /> : data && (
        <>
          <nav className="au-tabs" role="tablist">
            <button role="tab" className={section === "pending" ? "on" : ""} onClick={() => setSection("pending")}>
              Pending categories ({data.counts.pending})
            </button>
            <button role="tab" className={section === "completed" ? "on" : ""} onClick={() => setSection("completed")}>
              Completed categories ({data.counts.completed})
            </button>
          </nav>
          <p className="au-muted">
            {section === "pending"
              ? "A category stays here until every barcode in it is counted, including sold out and negative stock products. Open one to see its sub categories and barcodes."
              : "Every barcode in these categories is counted."}
          </p>
          {list.length === 0 && <p className="au-muted">{section === "pending" ? "Nothing pending. Every category is completed." : "No category is completed yet."}</p>}
          {list.map((c) => (
            <CategoryBlock key={`${section}-${c.categoryId}`} cat={c} role={role} auditId={auditId} who={who} canAct={canAct} ver={ver} onAction={(type, item) => setDlg({ type, item })} />
          ))}
        </>
      )}

      {dlg?.type === "count" && <CountDialog role={role} auditId={auditId} item={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "reset" && <ResetDialog auditId={auditId} item={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "log" && <LogDialog who={who} auditId={auditId} item={dlg.item} onClose={close} />}
      {dlg?.type === "history" && <HistoryDialog who={who} auditId={auditId} item={dlg.item} onClose={close} />}
    </Card>
  );
}

function CategoryBlock({ cat, role, auditId, who, canAct, ver, onAction }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="au-group" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {cat.categoryName}
        <span className="au-chip">{cat.done} of {cat.total} counted</span>
        {cat.pending > 0 && <span className="au-chip">{cat.pending} pending</span>}
        {cat.onHold > 0 && <span className="au-chip">{cat.onHold} on hold</span>}
        {cat.shortItems > 0 && <span className="au-chip">{cat.shortItems} short</span>}
        {cat.excessItems > 0 && <span className="au-chip">{cat.excessItems} excess</span>}
        {cat.soldOut > 0 && <span className="au-chip">{cat.soldOut} sold out</span>}
        {cat.negative > 0 && <span className="au-chip">{cat.negative} negative</span>}
      </summary>
      {open && <CategoryBody cat={cat} role={role} auditId={auditId} who={who} canAct={canAct} ver={ver} onAction={onAction} />}
    </details>
  );
}

const FILTERS = [["all", "All"], ["todo", "To do"], ["done", "Counted"]];
const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";

function CategoryBody({ cat, role, auditId, who, canAct, ver, onAction }) {
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}/tree/${cat.categoryId}`, { who }), [auditId, who, cat.categoryId, ver]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const t = q.trim().toLowerCase();
  const pass = (it) =>
    (filter === "all" || (filter === "done") === isDone(it.status)) &&
    (!t || it.barcode.toLowerCase().includes(t) || it.productName.toLowerCase().includes(t));

  return (
    <>
      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <div className="au-seg">
          {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <input className="au-input au-input-sm" style={{ flex: 1, minWidth: 160 }} placeholder="Filter by product or barcode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
      </div>

      {data.subCategories.map((sg) => {
        const items = sg.items.filter(pass);
        if (items.length === 0) return null;
        return (
          <div key={sg.subCategoryId} className="au-subgroup">
            <h3>
              {sg.subCategoryName}
              <span className="au-chip">{sg.done} of {sg.total} counted</span>
            </h3>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const counted = isDone(it.status);
                    return (
                      <tr key={it.verificationId}>
                        <td>
                          <strong>{it.barcode}</strong>
                          {it.stockKind !== "InStock" && <span className="au-chip">{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span>}
                          <small className="au-block au-muted">{it.productName}</small>
                        </td>
                        <td className="au-num">{qty(it.systemQty)}</td>
                        <td className="au-num">{counted ? qty(it.physicalQty) : "–"}</td>
                        <td className={`au-num ${counted && it.varianceQty < 0 ? "au-neg" : counted && it.varianceQty > 0 ? "au-pos" : ""}`}>{counted ? qty(it.varianceQty) : "–"}</td>
                        <td><Badge status={it.status} /></td>
                        <td className="au-note">{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</td>
                        <td>{it.verifiedBy || "–"}</td>
                        <td className="au-rowactions">
                          {role === "manager" && canAct && (
                            <button className="au-btn au-btn-sm au-btn-primary" onClick={() => onAction("count", it)}>{counted ? "Recount" : "Count"}</button>
                          )}
                          {role === "incharge" && canAct && (
                            <>
                              <button className="au-btn au-btn-sm" onClick={() => onAction("count", it)}>Correct</button>
                              {it.status !== "Pending" && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => onAction("reset", it)}>Reset</button>}
                            </>
                          )}
                          <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => onAction("history", it)}>Records</button>
                          {role !== "manager" && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => onAction("log", it)}>Changes</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Manager: count / hold.  Incharge: correct.
function CountDialog({ role, auditId, item, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [holdNote, setHoldNote] = useState("");
  const isManager = role === "manager";

  const run = async (fn, msg) => {
    setBusy(true); setErr(null);
    try { await fn(); onDone(msg); } catch (e) { setErr(e); setBusy(false); }
  };

  const save = (body) =>
    run(
      () =>
        isManager
          ? api(`/${auditId}/count`, { method: "POST", body: { barcode: item.barcode, ...body } })
          : api(`/${auditId}/items/${item.verificationId}/correct`, { method: "POST", body }),
      isManager ? "Count saved" : "Count corrected"
    );

  const hold = () =>
    run(() => api(`/${auditId}/hold`, { method: "POST", body: { barcode: item.barcode, note: holdNote.trim() || null } }), "Put on hold");

  return (
    <Modal title={`${isManager ? "Count" : "Correct"}: ${item.productName}`} onClose={onClose}>
      <p className="au-muted">{item.barcode}</p>
      {item.stockKind !== "InStock" && (
        <p className="au-muted">
          {item.stockKind === "SoldOut"
            ? "The system shows this product as sold out. Enter 0 if none is on the shelf, or the quantity you found and a note."
            : `The system shows negative stock (${qty(item.systemQty)}). Enter what is physically there and a note if it differs.`}
        </p>
      )}
      <div className="au-stats">
        <Stat label="Purchased" value={qty(item.purchasedQty)} />
        <Stat label="Returned to supplier" value={qty(item.purchaseReturnedQty)} />
        <Stat label="Net sold" value={qty(item.soldQty)} />
        <Stat label="System stock" value={qty(item.systemQty)} tone="ok" />
      </div>
      <ErrorBox error={err} />
      <CountForm
        key={`${item.verificationId}-${item.status}`}
        item={item}
        initial={item.status === "Pending" || item.status === "OnHold" ? null : item}
        submitLabel={isManager ? "Save count" : "Save correction"}
        busy={busy}
        onSubmit={save}
      />
      {isManager && item.status !== "Matched" && (
        <div className="au-hold">
          <Field label="Can't count it now? Put it on hold">
            <input className="au-input" placeholder="Note (optional)" maxLength={500} value={holdNote} onChange={(e) => setHoldNote(e.target.value)} />
          </Field>
          <button className="au-btn" disabled={busy} onClick={hold}>Put on hold</button>
        </div>
      )}
    </Modal>
  );
}

function ResetDialog({ auditId, item, onClose, onDone }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const reset = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/${auditId}/items/${item.verificationId}/reset`, { method: "POST", body: { comment: comment.trim() || null } });
      onDone("Item reset to Pending");
    } catch (e) { setErr(e); setBusy(false); }
  };
  return (
    <Modal title={`Reset: ${item.productName}`} onClose={onClose}>
      <p>This clears the manager's entry and puts the product back to Pending. The change stays in the log.</p>
      <ErrorBox error={err} />
      <Field label="Comment (optional)">
        <textarea className="au-input" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <button className="au-btn au-btn-primary" disabled={busy} onClick={reset}>{busy ? "Resetting…" : "Reset to Pending"}</button>
    </Modal>
  );
}
