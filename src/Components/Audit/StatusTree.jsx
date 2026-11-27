import { useEffect, useState } from "react";
import { api, qty } from "./api";
import { Badge, BarcodeInput, FindBar, CountForm, ProductMeta, Card, ErrorBox, Field, Loading, Modal, Stat, useLoad, useToast } from "./ui";
import { HistoryDialog, LogDialog } from "./Panels";
import { CardBody, ViewToggle, useViewMode } from "./CardView";

// Pending / Completed categories. A category sits in Pending until EVERY barcode in it
// is counted (Matched / Short / Excess) and none is sent back; then it moves to Completed by itself.
// A category's sub categories and barcodes are loaded only when it is opened.
//
//   role         "owner" | "incharge" | "manager"
//   canAct       manager: counting is open / incharge: audit not locked. Owner never counts.
//   canReview    owner only: audit InProgress/Review and report not approved -> may SEND BACK
//   allowSentBack manager only: audit is in Review -> may recount products the incharge sent back
//
// Review (backend: POST /review)
//   incharge : Verify  or  Send back, for a product / sub category / category
//   owner    : the same as the incharge
//   manager  : sees the state + note, recounts what was sent back

const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";
const REVIEW_LABEL = { Verified: "Verified", SentBack: "Sent back" };

export function ReviewTag({ state, note, by }) {
  if (!state || state === "None") return <span className="au-muted">–</span>;
  return (
    <>
      <span className={`au-badge au-s-${state}`}>{REVIEW_LABEL[state] || state}</span>
      {note && <small className="au-block au-muted">{note}</small>}
      {by && <small className="au-block au-muted">by {by}</small>}
    </>
  );
}

// Verify / Send back buttons for one scope (product, sub category or category)
export function ReviewButtons({ perm, counted, verified, sentBack, onVerify, onSendBack, label }) {
  // counted / verified / sentBack are numbers for a group, or booleans-as-numbers (1/0) for a product
  const canV = perm.verify && counted - verified > 0;
  const canB = perm.sendBack && counted - sentBack > 0;
  if (!perm.verify && !perm.sendBack) return null;
  return (
    <>
      {perm.verify && (
        <button className="au-btn au-btn-sm" disabled={!canV} onClick={onVerify} title={canV ? "" : "Nothing left to verify"}>
          Verify{label}
        </button>
      )}
      {perm.sendBack && (
        <button className="au-btn au-btn-sm au-btn-danger" disabled={!canB} onClick={onSendBack} title={canB ? "" : "Nothing counted to send back"}>
          Send back{label}
        </button>
      )}
    </>
  );
}

export function StatusTree({ role, auditId, canAct = false, canReview = false, allowSentBack = false, refreshKey, onChanged }) {
  const who = role === "owner" ? "owner" : "member";
  const summary = useLoad(() => api(`/${auditId}/tree`, { who }), [auditId, who, refreshKey]);
  const [section, setSection] = useState("pending");
  const [ver, setVer] = useState(0); // bumps => open categories reload
  const [dlg, setDlg] = useState(null); // { type: count | reset | log | history | review, item }
  const [toast, notify] = useToast();
  const [focus, setFocus] = useState(null); // product found by scanning: opens its category and highlights the row
  const [view, setView] = useViewMode(); // "table" | "card" (remembered on this device)
  const [doneTick, setDoneTick] = useState(0); // bumps when an action succeeded (card view moves to the next product)

  // incharge and owner can do the same review actions (verify / send back)
  const reviewer = (role === "incharge" && canAct) || (role === "owner" && canReview);
  const perm = { verify: reviewer, sendBack: reviewer };

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setFocus(null), 8000);
    return () => clearTimeout(t);
  }, [focus]);

  // scan -> ask the server where the barcode is -> open that category.
  const locate = async (code) => {
    try {
      const r = await api(`/${auditId}/locate?barcode=${encodeURIComponent(code)}`, { who });
      const fresh = await api(`/${auditId}/tree`, { who });
      const inCompleted = fresh.completed.some((c) => c.categoryId === r.categoryId);
      const inPending = fresh.pending.some((c) => c.categoryId === r.categoryId);

      if (!inCompleted && !inPending) {
        notify(`${r.productName} is in ${r.categoryName}, but that category is not in the list. Press Refresh.`, "err");
        return;
      }

      setSection(inCompleted ? "completed" : "pending");
      setVer((v) => v + 1);
      summary.reload();
      setFocus({ ...r, nonce: Date.now() });
      notify(`${r.productName}: ${r.categoryName} › ${r.subCategoryName}`);
    } catch (e) {
      notify(e.message, "err");
    }
  };

  const data = summary.data;
  const close = () => setDlg(null);
  const done = (msg) => { close(); notify(msg); setDoneTick((n) => n + 1); setVer((v) => v + 1); summary.reload(); onChanged?.(); };
  const list = data?.[section] ?? [];

  // Verify needs no reason: call the API straight away, no dialog.
  // Send back (and every other action) still opens its dialog; Send back requires a note.
  const handleAction = async (type, item) => {
    if (type === "review" && item.action === "Verify") {
      try {
        const r = await api(`/${auditId}/review`, {
          method: "POST",
          body: { scope: item.scope, id: item.id, action: "Verify", note: null },
        });
        done(r.message);
      } catch (e) {
        notify(e.message, "err");
      }
      return;
    }
    setDlg({ type, item });
  };

  return (
    <Card title="Products" right={<div className="au-row" style={{ alignItems: "center" }}><ViewToggle value={view} onChange={setView} /><button className="au-btn au-btn-ghost au-btn-sm" onClick={() => { setVer((v) => v + 1); summary.reload(); }}>Refresh</button></div>}>
      {toast}
      <FindBar onFind={locate} />
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
              ? "A category stays here until every barcode in it is counted (including sold out and negative stock products) and nothing is sent back. Open one to see its sub categories and barcodes."
              : "Every barcode in these categories is counted."}
          </p>
          {list.length === 0 && <p className="au-muted">{section === "pending" ? "Nothing pending. Every category is completed." : "No category is completed yet."}</p>}
          {list.map((c) => (
            <CategoryBlock
              key={`${section}-${c.categoryId}`}
              cat={c} role={role} auditId={auditId} who={who}
              canAct={canAct} allowSentBack={allowSentBack} perm={perm}
              ver={ver} doneTick={doneTick} view={view} focus={focus}
              onAction={handleAction}
            />
          ))}
        </>
      )}

      {dlg?.type === "count" && <CountDialog role={role} auditId={auditId} item={dlg.item} canAct={canAct} onClose={close} onDone={done} />}
      {dlg?.type === "reset" && <ResetDialog auditId={auditId} item={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "review" && <ReviewDialog auditId={auditId} target={dlg.item} onClose={close} onDone={done} />}
      {dlg?.type === "log" && <LogDialog who={who} auditId={auditId} item={dlg.item} onClose={close} />}
      {dlg?.type === "history" && <HistoryDialog who={who} auditId={auditId} item={dlg.item} onClose={close} />}
    </Card>
  );
}

function CategoryBlock({ cat, role, auditId, who, canAct, allowSentBack, perm, ver, doneTick, view, focus, onAction }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (focus && focus.categoryId === cat.categoryId) setOpen(true); }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <details className="au-group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {cat.categoryName}
        <span className="au-chip">{cat.done} of {cat.total} counted</span>
        {cat.pending > 0 && <span className="au-chip">{cat.pending} pending</span>}
        {cat.onHold > 0 && <span className="au-chip">{cat.onHold} on hold</span>}
        {cat.shortItems > 0 && <span className="au-chip">{cat.shortItems} short</span>}
        {cat.excessItems > 0 && <span className="au-chip">{cat.excessItems} excess</span>}
        {cat.soldOut > 0 && <span className="au-chip">{cat.soldOut} sold out</span>}
        {cat.negative > 0 && <span className="au-chip">{cat.negative} negative</span>}
        {cat.verified > 0 && <span className="au-chip au-chip-ok">{cat.verified} verified</span>}
        {cat.sentBack > 0 && <span className="au-chip au-chip-bad">{cat.sentBack} sent back</span>}
      </summary>
      {open && (view === "card"
        ? <CardBody cat={cat} role={role} auditId={auditId} who={who} canAct={canAct} allowSentBack={allowSentBack} perm={perm} ver={ver} doneTick={doneTick} focus={focus} onAction={onAction} />
        : <CategoryBody cat={cat} role={role} auditId={auditId} who={who} canAct={canAct} allowSentBack={allowSentBack} perm={perm} ver={ver} focus={focus} onAction={onAction} />)}
    </details>
  );
}

const FILTERS = [["all", "All"], ["todo", "To do"], ["done", "Counted"], ["back", "Sent back"]];

function CategoryBody({ cat, role, auditId, who, canAct, allowSentBack, perm, ver, focus, onAction }) {
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}/tree/${cat.categoryId}`, { who }), [auditId, who, cat.categoryId, ver]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const mine = !!focus && focus.categoryId === cat.categoryId;

  // a scan shows everything in this category again, then scrolls to the product
  useEffect(() => { if (mine) { setFilter("all"); setQ(""); } }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mine || !data) return;
    document.getElementById(`au-row-${focus.verificationId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [data, focus, filter, q]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const t = q.trim().toLowerCase();
  const pass = (it) =>
    (filter === "all" ||
      (filter === "back" ? it.reviewStatus === "SentBack" : (filter === "done") === isDone(it.status))) &&
    (!t || it.barcode.toLowerCase().includes(t) || it.productName.toLowerCase().includes(t));

  const review = (action, scope, id, label) => onAction("review", { action, scope, id, label });
  const showReviewCol = true;

  return (
    <>
      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <div className="au-seg">
          {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={setQ} />
      </div>

      {/* whole category */}
      {(perm.verify || perm.sendBack) && (
        <div className="au-row au-reviewbar">
          <span className="au-muted">Whole category:</span>
          <ReviewButtons
            perm={perm}
            counted={data.done} verified={data.verified} sentBack={data.sentBack}
            label=" category"
            onVerify={() => review("Verify", "Category", cat.categoryId, data.categoryName)}
            onSendBack={() => review("SendBack", "Category", cat.categoryId, data.categoryName)}
          />
        </div>
      )}

      {data.subCategories.map((sg) => {
        const items = sg.items.filter(pass);
        if (items.length === 0) return null;
        return (
          <div key={sg.subCategoryId} className="au-subgroup">
            <h3>
              {sg.subCategoryName}
              <span className="au-chip">{sg.done} of {sg.total} counted</span>
              {sg.verified > 0 && <span className="au-chip au-chip-ok">{sg.verified} verified</span>}
              {sg.sentBack > 0 && <span className="au-chip au-chip-bad">{sg.sentBack} sent back</span>}
              <span className="au-h3-actions">
                <ReviewButtons
                  perm={perm}
                  counted={sg.done} verified={sg.verified} sentBack={sg.sentBack}
                  label=" all"
                  onVerify={() => review("Verify", "SubCategory", sg.subCategoryId, sg.subCategoryName)}
                  onSendBack={() => review("SendBack", "SubCategory", sg.subCategoryId, sg.subCategoryName)}
                />
              </span>
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
                    {showReviewCol && <th>Review</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const counted = isDone(it.status);
                    const rs = it.reviewStatus;
                    const sentBack = rs === "SentBack";
                    // manager: count while open, or recount what the incharge sent back
                    const managerCan = role === "manager" && (canAct || (allowSentBack && sentBack));
                    return (
                      <tr key={it.verificationId} id={`au-row-${it.verificationId}`} className={focus?.verificationId === it.verificationId ? "au-row-hit" : ""}>
                        <td>
                          <strong>{it.barcode}</strong>
                          {it.stockKind !== "InStock" && <span className="au-chip">{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span>}
                          <small className="au-block au-muted">{it.productName}</small>
                          <ProductMeta mrp={it.mrp} size={it.size} />
                        </td>
                        <td className="au-num">{qty(it.systemQty)}</td>
                        <td className="au-num">{counted ? qty(it.physicalQty) : "–"}</td>
                        <td className={`au-num ${counted && it.varianceQty < 0 ? "au-neg" : counted && it.varianceQty > 0 ? "au-pos" : ""}`}>{counted ? qty(it.varianceQty) : "–"}</td>
                        <td><Badge status={it.status} /></td>
                        <td className="au-note">{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</td>
                        <td>{it.verifiedBy || "–"}</td>
                        {showReviewCol && (
                          <td className="au-note"><ReviewTag state={rs} note={it.reviewNote} by={it.reviewedBy} /></td>
                        )}
                        <td className="au-rowactions au-rowactions-wrap">
                          {managerCan && (
                            <button className="au-btn au-btn-sm au-btn-primary" onClick={() => onAction("count", it)}>
                              {sentBack ? "Recount" : counted ? "Recount" : "Count"}
                            </button>
                          )}
                          {(perm.verify || perm.sendBack) && (
                            <ReviewButtons
                              perm={perm}
                              counted={counted ? 1 : 0}
                              verified={rs === "Verified" ? 1 : 0}
                              sentBack={sentBack ? 1 : 0}
                              label=""
                              onVerify={() => review("Verify", "Product", it.verificationId, it.productName)}
                              onSendBack={() => review("SendBack", "Product", it.verificationId, it.productName)}
                            />
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

// Verify or send back: product / sub category / category
export function ReviewDialog({ auditId, target, onClose, onDone }) {
  const verify = target.action === "Verify";
  const scopeLabel = { Product: "product", SubCategory: "sub category", Category: "category" }[target.scope];
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/${auditId}/review`, {
        method: "POST",
        body: { scope: target.scope, id: target.id, action: target.action, note: note.trim() || null },
      });
      onDone(r.message);
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <Modal title={`${verify ? "Verify" : "Send back"} ${scopeLabel}: ${target.label}`} onClose={onClose}>
      <p>
        {verify
          ? `Every counted product in this ${scopeLabel} is marked Verified. Products that are not counted yet are skipped.`
          : `Every counted product in this ${scopeLabel} goes back to the managers to count again, even if the report is already submitted. Products that are not counted yet are skipped.`}
      </p>
      <Field label={verify ? "Note (optional)" : "Note for the managers (required)"}>
        <textarea className="au-input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
      <ErrorBox error={err} />
      <button
        className={`au-btn ${verify ? "au-btn-primary" : "au-btn-danger"}`}
        disabled={busy || (!verify && !note.trim())}
        onClick={run}
      >
        {busy ? "Working…" : verify ? "Verify" : "Send back"}
      </button>
    </Modal>
  );
}

// Manager: count / hold.  Incharge: correct.
function CountDialog({ role, auditId, item, canAct, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [holdNote, setHoldNote] = useState("");
  const isManager = role === "manager";
  const sentBack = item.reviewStatus === "SentBack";

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
      {isManager && sentBack && (
        <div className="au-error">
          The incharge sent this product back{item.reviewNote ? `: ${item.reviewNote}` : "."}
        </div>
      )}
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
      {/* hold is only allowed while counting is open (not after the report is submitted) */}
      {isManager && canAct && item.status !== "Matched" && (
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