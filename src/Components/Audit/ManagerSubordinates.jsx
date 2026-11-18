import { useState } from "react";
import { api, fmtDate, qty, ROLE } from "./api";
import { Badge, Card, CountForm, ErrorBox, Field, Loading, Modal, ReviewBadge, Stat, useLoad, useToast } from "./ui";

const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";

// Manager's "Subordinates" tab:
//   1. review what subordinates counted (accept = goes into YOUR report, reject = they count again)
//   2. my subordinates + their categories
//   3. add a subordinate
export function SubordinatesPanel({ auditId, subs, canAct, onChanged, refreshKey }) {
  const [toast, notify] = useToast();
  const [dlg, setDlg] = useState(null); // { sub }
  const list = subs.data || [];

  return (
    <>
      {toast}
      <ReviewCard auditId={auditId} subs={list} canAct={canAct} notify={notify} onChanged={onChanged} refreshKey={refreshKey} />

      <Card title="My subordinates" right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={subs.reload}>Refresh</button>}>
        <ErrorBox error={subs.error} onRetry={subs.reload} />
        {subs.loading && !subs.data ? <Loading /> : list.length === 0 ? (
          <p className="au-muted">You have not added a subordinate yet. Add one below, then give them categories to count.</p>
        ) : (
          <div className="au-scroll">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Categories</th>
                  <th className="au-num">Sent</th>
                  <th className="au-num">To review</th>
                  <th className="au-num">Accepted</th>
                  <th className="au-num">Rejected</th>
                  <th>Last activity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.auditRoleId}>
                    <td>{x.personName}<small className="au-block au-muted">{x.phoneNumber}</small></td>
                    <td>
                      {x.assignedCategories.length === 0
                        ? <span className="au-muted">None yet</span>
                        : x.assignedCategories.map((c) => <span key={c.categoryId} className="au-chip" style={{ marginLeft: 0, marginRight: ".3rem" }}>{c.categoryName}</span>)}
                    </td>
                    <td className="au-num">{x.submitted}</td>
                    <td className="au-num">{x.awaitingReview}</td>
                    <td className="au-num">{x.accepted}</td>
                    <td className="au-num">{x.rejected}</td>
                    <td>{fmtDate(x.lastActivityAt)}</td>
                    <td className="au-rowactions">
                      {canAct && <button className="au-btn au-btn-sm" onClick={() => setDlg({ sub: x })}>Categories</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canAct && <AddSubordinate auditId={auditId} onAdded={() => { notify("Subordinate added"); subs.reload(); }} />}

      {dlg && (
        <CategoriesDialog
          auditId={auditId}
          sub={dlg.sub}
          onClose={() => setDlg(null)}
          onDone={(msg) => { setDlg(null); notify(msg); subs.reload(); }}
        />
      )}
    </>
  );
}

// ───────────── add a subordinate ─────────────
function AddSubordinate({ auditId, onAdded }) {
  const [form, setForm] = useState({ personName: "", phoneNumber: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(`/${auditId}/members`, {
        method: "POST",
        body: { personName: form.personName, phoneNumber: form.phoneNumber, roleId: ROLE.SUBORDINATE, reportsToAuditRoleId: null },
      });
      setForm({ personName: "", phoneNumber: "" });
      onAdded();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };

  return (
    <Card title="Add a subordinate">
      <form className="au-form au-grid" onSubmit={add}>
        <Field label="Name">
          <input className="au-input" value={form.personName} maxLength={100} onChange={(e) => setForm({ ...form, personName: e.target.value })} required />
        </Field>
        <Field label="Phone number" hint="They log in with the audit code and this number.">
          <input className="au-input" type="tel" inputMode="numeric" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} required />
        </Field>
        <div className="au-grid-full">
          <ErrorBox error={err} />
          <button className="au-btn au-btn-primary" disabled={busy}>{busy ? "Adding…" : "Add subordinate"}</button>
        </div>
      </form>
    </Card>
  );
}

// ───────────── give a subordinate his categories ─────────────
function CategoriesDialog({ auditId, sub, onClose, onDone }) {
  const tree = useLoad(() => api(`/${auditId}/tree`), [auditId]);
  const [picked, setPicked] = useState(() => new Set(sub.assignedCategories.map((c) => c.categoryId)));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const all = tree.data
    ? [...tree.data.pending, ...tree.data.completed].sort((a, b) => a.categoryName.localeCompare(b.categoryName))
    : [];
  const t = q.trim().toLowerCase();
  const shown = all.filter((c) => !t || c.categoryName.toLowerCase().includes(t));

  const toggle = (id) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/${auditId}/subordinates/${sub.auditRoleId}/categories`, { method: "POST", body: { categoryIds: [...picked] } });
      onDone(`Categories saved for ${sub.personName}`);
    } catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <Modal title={`Categories for ${sub.personName}`} onClose={onClose}>
      <p className="au-muted">Tick every category this person should count. The same category can be given to more than one subordinate.</p>
      <ErrorBox error={tree.error} onRetry={tree.reload} />
      {tree.loading && !tree.data ? <Loading /> : (
        <>
          <div className="au-row" style={{ marginBottom: ".5rem" }}>
            <input className="au-input au-input-sm" style={{ flex: 1, minWidth: 160 }} placeholder="Filter categories" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter categories" />
            <button type="button" className="au-btn au-btn-ghost au-btn-sm" onClick={() => setPicked(new Set(all.map((c) => c.categoryId)))}>Select all</button>
            <button type="button" className="au-btn au-btn-ghost au-btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          <div className="au-checklist">
            {shown.length === 0 && <p className="au-muted">No category found.</p>}
            {shown.map((c) => (
              <label key={c.categoryId} className="au-check">
                <input type="checkbox" checked={picked.has(c.categoryId)} onChange={() => toggle(c.categoryId)} />
                <span>{c.categoryName}</span>
                <span className="au-chip">{c.done} of {c.total} counted</span>
              </label>
            ))}
          </div>
        </>
      )}
      <ErrorBox error={err} />
      <button className="au-btn au-btn-primary" disabled={busy || tree.loading} onClick={save}>
        {busy ? "Saving…" : `Save (${picked.size} selected)`}
      </button>
    </Modal>
  );
}

// ───────────── review what subordinates counted ─────────────
const STATES = [["pending", "To review"], ["accepted", "Accepted"], ["rejected", "Rejected"], ["all", "All"]];

function ReviewCard({ auditId, subs, canAct, notify, onChanged, refreshKey }) {
  const [state, setState] = useState("pending");
  const [subId, setSubId] = useState("");
  const [dlg, setDlg] = useState(null); // { type: "accept" | "reject", e }

  const { data, error, loading, reload } = useLoad(() => {
    const p = new URLSearchParams({ state });
    if (subId) p.set("subordinateId", subId);
    return api(`/${auditId}/subordinates/entries?${p}`);
  }, [auditId, state, subId, refreshKey]);

  const done = (msg) => { setDlg(null); notify(msg); reload(); onChanged?.(); };
  const items = data?.items || [];

  return (
    <Card
      title="Counts sent by your subordinates"
      right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={reload}>Refresh</button>}
    >
      <p className="au-muted">These counts are only shown to you. Nothing goes into the report until you accept it.</p>
      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <div className="au-seg">
          {STATES.map(([k, l]) => <button key={k} className={state === k ? "on" : ""} onClick={() => setState(k)}>{l}</button>)}
        </div>
        <select className="au-input au-input-sm" value={subId} onChange={(e) => setSubId(e.target.value)} aria-label="Subordinate">
          <option value="">All subordinates</option>
          {subs.map((x) => <option key={x.auditRoleId} value={x.auditRoleId}>{x.personName}</option>)}
        </select>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : items.length === 0 ? (
        <p className="au-muted">{state === "pending" ? "Nothing waiting for your review." : "Nothing here."}</p>
      ) : (
        <div className="au-scroll">
          <table className="au-table au-table-tight">
            <thead>
              <tr>
                <th>Barcode / product</th>
                <th>Sent by</th>
                <th className="au-num">System</th>
                <th className="au-num">Their count</th>
                <th className="au-num">Variance</th>
                <th>Your status</th>
                <th>Reason / note</th>
                <th>Review</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.entryId}>
                  <td>
                    <strong>{e.barcode}</strong>
                    <small className="au-block au-muted">{e.productName} · {e.categoryName}</small>
                  </td>
                  <td>{e.subordinateName}<small className="au-block au-muted">{fmtDate(e.submittedAt)}</small></td>
                  <td className="au-num">{qty(e.systemQty)}</td>
                  <td className="au-num">{qty(e.subPhysicalQty)}</td>
                  <td className={`au-num ${e.subVarianceQty < 0 ? "au-neg" : e.subVarianceQty > 0 ? "au-pos" : ""}`}>{qty(e.subVarianceQty)}</td>
                  <td><Badge status={e.mainStatus} /></td>
                  <td className="au-note">{[e.reasonCode, e.note].filter(Boolean).join(" · ") || "–"}</td>
                  <td>
                    <ReviewBadge state={e.reviewState} />
                    {e.reviewComment && <small className="au-block au-muted">{e.reviewComment}</small>}
                  </td>
                  <td className="au-rowactions">
                    {e.reviewState === "AwaitingReview" && canAct && (
                      <>
                        <button className="au-btn au-btn-sm au-btn-primary" onClick={() => setDlg({ type: "accept", e })}>Accept</button>
                        <button className="au-btn au-btn-sm au-btn-danger" onClick={() => setDlg({ type: "reject", e })}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dlg?.type === "accept" && <AcceptDialog auditId={auditId} e={dlg.e} onClose={() => setDlg(null)} onDone={done} />}
      {dlg?.type === "reject" && <RejectDialog auditId={auditId} e={dlg.e} onClose={() => setDlg(null)} onDone={done} />}
    </Card>
  );
}

function AcceptDialog({ auditId, e, onClose, onDone }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const accept = async (body) => {
    setBusy(true); setErr(null);
    try {
      await api(`/${auditId}/subordinates/entries/${e.entryId}/accept`, {
        method: "POST",
        body: { ...body, comment: comment.trim() || null },
      });
      onDone("Count accepted and saved to your report");
    } catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <Modal title={`Accept: ${e.productName}`} onClose={onClose}>
      <p className="au-muted">{e.barcode} · sent by {e.subordinateName}</p>
      <div className="au-stats">
        <Stat label="System stock" value={qty(e.systemQty)} tone="ok" />
        <Stat label={`${e.subordinateName} counted`} value={qty(e.subPhysicalQty)} />
      </div>
      {isDone(e.mainStatus) && (
        <div className="au-error">You already settled this barcode as {e.mainStatus} ({qty(e.mainPhysicalQty)}). Accepting replaces your count.</div>
      )}
      <p className="au-muted">You can change the quantity before saving. It is saved to the report in your name.</p>
      <Field label="Comment for your subordinate (optional)">
        <input className="au-input" maxLength={500} value={comment} onChange={(x) => setComment(x.target.value)} />
      </Field>
      <ErrorBox error={err} />
      <CountForm
        key={e.entryId}
        item={e}
        initial={{ physicalQty: e.subPhysicalQty, reasonCode: e.reasonCode, note: e.note }}
        submitLabel="Accept and save to report"
        busy={busy}
        onSubmit={accept}
      />
    </Modal>
  );
}

function RejectDialog({ auditId, e, onClose, onDone }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const reject = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/${auditId}/subordinates/entries/${e.entryId}/reject`, { method: "POST", body: { comment: comment.trim() } });
      onDone("Count rejected. Your subordinate can count it again.");
    } catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <Modal title={`Reject: ${e.productName}`} onClose={onClose}>
      <p className="au-muted">{e.barcode} · {e.subordinateName} counted {qty(e.subPhysicalQty)} against system stock {qty(e.systemQty)}.</p>
      <p>The item stays as it is in your report. Tell your subordinate what to check.</p>
      <Field label="Comment (required)">
        <textarea className="au-input" rows={3} maxLength={500} value={comment} onChange={(x) => setComment(x.target.value)} autoFocus />
      </Field>
      <ErrorBox error={err} />
      <button className="au-btn au-btn-danger" disabled={busy || !comment.trim()} onClick={reject}>{busy ? "Rejecting…" : "Reject count"}</button>
    </Modal>
  );
}
