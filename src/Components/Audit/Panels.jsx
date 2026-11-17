import { useState } from "react";
import { api, fmtDate, qty, ROLE } from "./api";
import { Badge, Bar, Card, CountForm, ErrorBox, Field, HistoryTables, Loading, Modal, Stat, useLoad, useToast } from "./ui";

// ═════════════ Monitoring (owner + incharge) ═════════════
export function MonitoringPanel({ who, auditId, refreshKey }) {
  const { data: m, error, loading, reload } = useLoad(() => api(`/${auditId}/monitoring`, { who }), [auditId, who, refreshKey]);
  if (loading && !m) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const o = m.overall;

  return (
    <>
      <Card
        title="Progress"
        right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={reload}>Refresh</button>}
      >
        <div className="au-big">
          {o.percentSettled}% <span>of {o.total} products settled</span>
        </div>
        <Bar percent={o.percentSettled} />
        <div className="au-stats">
          <Stat label="Matched" value={o.matched} tone="ok" />
          <Stat label="Short" value={o.short_} tone="short" />
          <Stat label="Excess" value={o.excess} tone="excess" />
          <Stat label="On hold" value={o.onHold} tone="hold" />
          <Stat label="Pending" value={o.pending} />
          <Stat label="Units left" value={qty(o.unitsLeft)} />
        </div>
        <p className="au-muted">
          {o.itemsPerHour
            ? `Pace: ${o.itemsPerHour} products an hour. About ${o.estimatedHoursLeft} hours left for ${o.toDo} remaining products.`
            : "Pace appears after the first products are settled."}{" "}
          Updated {fmtDate(m.asOf)}.
        </p>
        {m.correctedByIncharge > 0 && <p className="au-muted">{m.correctedByIncharge} product(s) were last entered by an incharge.</p>}
      </Card>

      <Card title="By category">
        <div className="au-scroll">
          <table className="au-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="au-num">Settled</th>
                <th className="au-num">To do</th>
                <th className="au-num">Short</th>
                <th className="au-num">Excess</th>
                <th className="au-num">On hold</th>
                <th style={{ width: 120 }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {m.byCategory.map((c) => (
                <tr key={c.categoryName}>
                  <td>{c.categoryName}</td>
                  <td className="au-num">{c.settled}/{c.total}</td>
                  <td className="au-num">{c.toDo}</td>
                  <td className="au-num">{c.short_}</td>
                  <td className="au-num">{c.excess}</td>
                  <td className="au-num">{c.onHold}</td>
                  <td><Bar percent={c.percentSettled} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="By manager">
        {m.byManager.length === 0 ? (
          <p className="au-muted">No managers yet.</p>
        ) : (
          <div className="au-scroll">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th className="au-num">Settled</th>
                  <th className="au-num">Matched</th>
                  <th className="au-num">Short</th>
                  <th className="au-num">Excess</th>
                  <th className="au-num">On hold</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {m.byManager.map((p) => (
                  <tr key={p.auditRoleId}>
                    <td>{p.personName}</td>
                    <td className="au-num">{p.settled}</td>
                    <td className="au-num">{p.matched}</td>
                    <td className="au-num">{p.short_}</td>
                    <td className="au-num">{p.excess}</td>
                    <td className="au-num">{p.onHold}</td>
                    <td>{fmtDate(p.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ═════════════ Items (owner read-only, incharge can fix) ═════════════
const STATUSES = ["", "Pending", "OnHold", "Matched", "Short", "Excess"];

export function ItemsPanel({ who, auditId, canEdit, onChanged }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data, error, loading, reload } = useLoad(
    () => api(`/${auditId}/items?page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ""}`, { who }),
    [auditId, who, status, page]
  );
  const [dlg, setDlg] = useState(null); // { type, item }
  const [toast, notify] = useToast();
  const [busy, setBusy] = useState(false);
  const [dlgError, setDlgError] = useState(null);

  const close = () => { setDlg(null); setDlgError(null); };
  const done = (msg) => { close(); notify(msg); reload(); onChanged?.(); };

  const correct = async (item, body) => {
    setBusy(true); setDlgError(null);
    try {
      await api(`/${auditId}/items/${item.verificationId}/correct`, { method: "POST", who, body });
      done("Count corrected");
    } catch (e) { setDlgError(e); } finally { setBusy(false); }
  };
  const reset = async (item, comment) => {
    setBusy(true); setDlgError(null);
    try {
      await api(`/${auditId}/items/${item.verificationId}/reset`, { method: "POST", who, body: { comment: comment || null } });
      done("Item reset to Pending");
    } catch (e) { setDlgError(e); } finally { setBusy(false); }
  };

  const pages = data ? Math.max(Math.ceil(data.total / pageSize), 1) : 1;

  return (
    <Card
      title="Products"
      right={
        <select className="au-input au-input-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
      }
    >
      {toast}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="au-scroll">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="au-num">System</th>
                  <th className="au-num">Counted</th>
                  <th className="au-num">Variance</th>
                  <th>Status</th>
                  <th>Reason / note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && <tr><td colSpan={7} className="au-muted">No products here.</td></tr>}
                {data.items.map((it) => {
                  const counted = it.status !== "Pending";
                  return (
                    <tr key={it.verificationId}>
                      <td>
                        {it.productName}
                        <small className="au-block au-muted">{it.barcode}</small>
                      </td>
                      <td className="au-num">{qty(it.systemQty)}</td>
                      <td className="au-num">{counted ? qty(it.physicalQty) : "–"}</td>
                      <td className={`au-num ${it.varianceQty < 0 && counted ? "au-neg" : it.varianceQty > 0 && counted ? "au-pos" : ""}`}>{counted ? qty(it.varianceQty) : "–"}</td>
                      <td><Badge status={it.status} /></td>
                      <td className="au-note">{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</td>
                      <td className="au-rowactions">
                        <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "history", item: it })}>Records</button>
                        <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "log", item: it })}>Changes</button>
                        {canEdit && <button className="au-btn au-btn-sm" onClick={() => setDlg({ type: "correct", item: it })}>Correct</button>}
                        {canEdit && counted && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg({ type: "reset", item: it })}>Reset</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="au-pager">
            <button className="au-btn au-btn-ghost au-btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="au-muted">Page {page} of {pages} · {data.total} products</span>
            <button className="au-btn au-btn-ghost au-btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}

      {dlg?.type === "correct" && (
        <Modal title={`Correct count: ${dlg.item.productName}`} onClose={close}>
          <ErrorBox error={dlgError} />
          <CountForm item={dlg.item} initial={dlg.item.status === "Pending" ? null : dlg.item} submitLabel="Save correction" busy={busy} onSubmit={(b) => correct(dlg.item, b)} />
        </Modal>
      )}
      {dlg?.type === "reset" && <ResetDialog item={dlg.item} busy={busy} error={dlgError} onClose={close} onReset={(c) => reset(dlg.item, c)} />}
      {dlg?.type === "log" && <LogDialog who={who} auditId={auditId} item={dlg.item} onClose={close} />}
      {dlg?.type === "history" && <HistoryDialog who={who} auditId={auditId} item={dlg.item} onClose={close} />}
    </Card>
  );
}

function ResetDialog({ item, busy, error, onClose, onReset }) {
  const [comment, setComment] = useState("");
  return (
    <Modal title={`Reset: ${item.productName}`} onClose={onClose}>
      <p>This clears the manager's entry and puts the product back to Pending so it can be counted again. The change stays in the log.</p>
      <ErrorBox error={error} />
      <Field label="Comment (optional)">
        <textarea className="au-input" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <button className="au-btn au-btn-primary" disabled={busy} onClick={() => onReset(comment)}>{busy ? "Resetting…" : "Reset to Pending"}</button>
    </Modal>
  );
}

export function LogDialog({ who, auditId, item, onClose }) {
  const { data, error, loading } = useLoad(() => api(`/${auditId}/items/${item.verificationId}/log`, { who }), [auditId, item.verificationId, who]);
  return (
    <Modal title={`Changes: ${item.productName}`} onClose={onClose} wide>
      <ErrorBox error={error} />
      {loading ? <Loading /> : data?.length === 0 ? <p className="au-muted">No changes recorded yet.</p> : (
        <ol className="au-log">
          {data?.map((l, i) => (
            <li key={i}>
              <div><strong>{l.action}</strong> by {l.byName} <span className="au-muted">{fmtDate(l.at)}</span></div>
              <div>
                {l.oldStatus || "–"} → <Badge status={l.newStatus} /> · counted {qty(l.oldPhysicalQty)} → {qty(l.newPhysicalQty)}
              </div>
              {(l.newReasonCode || l.newNote || l.comment) && (
                <div className="au-muted">{[l.newReasonCode, l.newNote, l.comment].filter(Boolean).join(" · ")}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export function HistoryDialog({ who, auditId, item, onClose }) {
  const { data, error, loading } = useLoad(() => api(`/${auditId}/items/${item.verificationId}/history`, { who }), [auditId, item.verificationId, who]);
  return (
    <Modal title={`Purchase and sales records: ${item.productName}`} onClose={onClose} wide>
      <ErrorBox error={error} />
      {loading ? <Loading /> : <HistoryTables history={data?.history} />}
    </Modal>
  );
}

// ═════════════ Team ═════════════
export function TeamPanel({ who, auditId, auditStatus, isOwner }) {
  const { data: members, error, loading, reload } = useLoad(() => api(`/${auditId}/members`, { who }), [auditId, who]);
  const [form, setForm] = useState({ personName: "", phoneNumber: "", roleId: isOwner ? ROLE.INCHARGE : ROLE.MANAGER, reportsTo: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, notify] = useToast();
  const canAdd = auditStatus === "Draft" || auditStatus === "InProgress";
  const incharges = (members || []).filter((m) => m.roleId === ROLE.INCHARGE);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(`/${auditId}/members`, {
        method: "POST", who,
        body: {
          personName: form.personName,
          phoneNumber: form.phoneNumber,
          roleId: Number(form.roleId),
          reportsToAuditRoleId: Number(form.roleId) === ROLE.MANAGER && form.reportsTo ? Number(form.reportsTo) : null,
        },
      });
      setForm({ ...form, personName: "", phoneNumber: "" });
      notify("Member added");
      reload();
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  };

  return (
    <>
      {toast}
      <Card title="Team">
        <ErrorBox error={error} onRetry={reload} />
        {loading && !members ? <Loading /> : (
          <div className="au-scroll">
            <table className="au-table">
              <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Reports to</th></tr></thead>
              <tbody>
                {members?.length === 0 && <tr><td colSpan={4} className="au-muted">Nobody added yet.</td></tr>}
                {members?.map((m) => (
                  <tr key={m.id}>
                    <td>{m.personName}</td>
                    <td>{m.role}</td>
                    <td>{m.phoneNumber}</td>
                    <td>{members.find((x) => x.id === m.reportsToAuditRoleId)?.personName || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canAdd && (
        <Card title={isOwner ? "Add a member" : "Add a manager"}>
          <form className="au-form au-grid" onSubmit={add}>
            <Field label="Name">
              <input className="au-input" value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} maxLength={100} required />
            </Field>
            <Field label="Phone number" hint="They log in with this number.">
              <input className="au-input" type="tel" inputMode="numeric" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} required />
            </Field>
            {isOwner && (
              <Field label="Role">
                <select className="au-input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                  <option value={ROLE.INCHARGE}>Audit incharge</option>
                  <option value={ROLE.MANAGER}>Audit manager</option>
                </select>
              </Field>
            )}
            {isOwner && Number(form.roleId) === ROLE.MANAGER && incharges.length > 1 && (
              <Field label="Reports to">
                <select className="au-input" value={form.reportsTo} onChange={(e) => setForm({ ...form, reportsTo: e.target.value })} required>
                  <option value="">Choose an incharge</option>
                  {incharges.map((i) => <option key={i.id} value={i.id}>{i.personName}</option>)}
                </select>
              </Field>
            )}
            <div className="au-grid-full">
              <ErrorBox error={err} />
              <button className="au-btn au-btn-primary" disabled={busy}>{busy ? "Adding…" : "Add member"}</button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
