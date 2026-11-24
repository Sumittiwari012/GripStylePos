import { useState } from "react";
import { api, session } from "./api";
import { Bar, Card, ErrorBox, Field, Modal, Shell, Stat, useLoad, useToast, withForce } from "./ui";
import { StatusTree } from "./StatusTree";
import { SubordinatesPanel } from "./ManagerSubordinates";

export default function ManagerPage() {
  const s = session.get();
  const auditId = s.audit.id;
  const progress = useLoad(() => api(`/${auditId}/progress`), [auditId]);
  const [toast, notify] = useToast();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState("count"); // count | subs

  // my subordinates (also used for the "awaiting review" number on the tab)
  const subs = useLoad(() => api(`/${auditId}/subordinates`), [auditId, tick]);
  const awaiting = (subs.data || []).reduce((n, x) => n + x.awaitingReview, 0);

  const status = progress.data?.status;
  const counting = status === "InProgress";
  // After the report is submitted (Review) the manager can still recount products the incharge sent back
  const inReview = status === "Review";
  const o = progress.data?.overall;
  const mine = progress.data?.mine;

  const refresh = () => { progress.reload(); setTick((t) => t + 1); };

  return (
    <Shell title={s.audit.auditName} subtitle="Open a category, pick a barcode, count it. Review what your subordinates send." member={s.member}>
      {toast}

      {status && !counting && (
        <div className="au-banner au-banner-warn">
          {status === "Review"
            ? "The report has been submitted to the incharge, so normal counting is closed. Products the incharge sent back can still be recounted (look for the \"Sent back\" filter inside a category)."
            : `This audit is ${status}. Counting is not open.`}
        </div>
      )}

      {o && (
        <Card title="Progress" right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={refresh}>Refresh</button>}>
          <div className="au-big">{o.percentSettled}% <span>{o.settled} of {o.total} settled · {o.toDo} to do</span></div>
          <Bar percent={o.percentSettled} />
          {mine && (
            <div className="au-stats">
              <Stat label="Your settled" value={mine.settled} />
              <Stat label="Matched" value={mine.matched} tone="ok" />
              <Stat label="Short" value={mine.short} tone="short" />
              <Stat label="Excess" value={mine.excess} tone="excess" />
              <Stat label="On hold" value={mine.onHold} tone="hold" />
            </div>
          )}
        </Card>
      )}

      <nav className="au-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "count"} className={tab === "count" ? "on" : ""} onClick={() => setTab("count")}>Counting</button>
        <button role="tab" aria-selected={tab === "subs"} className={tab === "subs" ? "on" : ""} onClick={() => setTab("subs")}>
          Subordinates{awaiting > 0 && <span className="au-chip">{awaiting} to review</span>}
        </button>
      </nav>

      {/* both tabs stay mounted so opened categories are not lost when you switch */}
      <div style={{ display: tab === "count" ? "block" : "none" }}>
        <StatusTree role="manager" auditId={auditId} canAct={counting} allowSentBack={inReview} refreshKey={tick} onChanged={() => progress.reload()} />

        {counting && (
          <Card title="Finished counting?">
            <p className="au-muted">Submitting closes counting and sends the report to the incharge for approval.</p>
            <button className="au-btn au-btn-primary" onClick={() => setSubmitOpen(true)}>Submit report to incharge</button>
          </Card>
        )}
      </div>

      <div style={{ display: tab === "subs" ? "block" : "none" }}>
        <SubordinatesPanel auditId={auditId} subs={subs} canAct={counting} refreshKey={tick} onChanged={refresh} />
      </div>

      {submitOpen && <SubmitDialog auditId={auditId} onClose={() => setSubmitOpen(false)} onDone={(msg) => { setSubmitOpen(false); notify(msg); refresh(); }} />}
    </Shell>
  );
}

function SubmitDialog({ auditId, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await withForce((force) => api(`/${auditId}/submit-report`, { method: "POST", body: { force, note: note.trim() || null } }));
      if (r) onDone(r.message);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Submit report" onClose={onClose}>
      <p>You will not be able to count after this unless the incharge sends the report back.</p>
      <Field label="Note for the incharge (optional)">
        <textarea className="au-input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorBox error={err} />
      <button className="au-btn au-btn-primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit report"}</button>
    </Modal>
  );
}