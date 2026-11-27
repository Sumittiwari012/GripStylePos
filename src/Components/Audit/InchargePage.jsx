import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ROUTE_BASE, session } from "./api";
import { ApprovalTag, Badge, Card, ErrorBox, Loading, Modal, Field, Shell, useLoad, useToast, withForce } from "./ui";
import { MonitoringPanel, TeamPanel } from "./Panels";
import { StatusTree } from "./StatusTree";
import { ReviewQueue } from "./ReviewQueue";

export default function InchargePage() {
  const s = session.get();
  const auditId = s.audit.id;
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}`), [auditId]);
  const [tab, setTab] = useState("verify");
  const [toVerify, setToVerify] = useState(null);
  const [toast, notify] = useToast();
  const [busy, setBusy] = useState("");
  const [actErr, setActErr] = useState(null);
  const [tick, setTick] = useState(0);
  const [dlg, setDlg] = useState(null); // "approve" | "reopen"
  const [note, setNote] = useState("");

  const refresh = () => { reload(); setTick((t) => t + 1); };

  const approve = async () => {
    setBusy("approve"); setActErr(null);
    try {
      const r = await withForce((force) => api(`/${auditId}/approve-report`, { method: "POST", body: { note: note.trim() || null, force } }));
      if (r) { notify(r.message); setDlg(null); setNote(""); refresh(); }
    } catch (e) { setActErr(e); } finally { setBusy(""); }
  };

  const reopen = async () => {
    setBusy("reopen"); setActErr(null);
    try {
      const r = await api(`/${auditId}/reopen`, { method: "POST", body: { note: note.trim() || null } });
      notify(r.message); setDlg(null); setNote(""); refresh();
    } catch (e) { setActErr(e); } finally { setBusy(""); }
  };

  if (loading && !data) return <Shell title="Audit" member={s.member}><Loading /></Shell>;
  if (error) return <Shell title="Audit" member={s.member}><ErrorBox error={error} onRetry={reload} /></Shell>;

  const a = data.audit;
  const inReview = a.status === "Review" && !a.reportApproved;
  const editable = (a.status === "InProgress" || a.status === "Review") && !a.reportApproved;
  const label = a.reportApproved ? "Report approved. The audit is locked." : a.reportSubmitted ? "Report not yet approved by incharge" : "Report not yet submitted by manager (counting in progress)";

  return (
    <Shell
      title={a.auditName}
      subtitle={`${a.auditType} audit · code ${a.auditCode}`}
      member={s.member}
      actions={
        <>
          <Link className="au-btn" to={`${ROUTE_BASE}/incharge/report`}>View report</Link>
          {inReview && <button className="au-btn" onClick={() => { setNote(""); setDlg("reopen"); }}>Send back to managers</button>}
          {inReview && <button className="au-btn au-btn-primary" onClick={() => { setNote(""); setDlg("approve"); }}>Approve report</button>}
        </>
      }
    >
      {toast}
      <ErrorBox error={actErr} />
      <div className="au-banner">
        <div><Badge status={a.status} /> <ApprovalTag info={{ isApproved: a.reportApproved, label }} /></div>
        <div className="au-muted">
          {a.status === "InProgress" && "Managers are counting. Fix mistakes in Products while they work."}
          {a.status === "Review" && !a.reportApproved && "A manager submitted the report. Check it, fix mistakes, then approve or send it back."}
          {a.reportApproved && "The owner can now close the audit."}
        </div>
      </div>

      <nav className="au-tabs" role="tablist">
        {[["verify", "To verify"], ["overview", "Progress"], ["items", "Products"], ["team", "Team"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}{k === "verify" && toVerify > 0 && <span className="au-chip">{toVerify}</span>}
          </button>
        ))}
      </nav>

      {/* stays mounted so the count on the tab is always up to date */}
      <div style={{ display: tab === "verify" ? "block" : "none" }}>
        <ReviewQueue auditId={auditId} canAct={editable} refreshKey={tick} onChanged={refresh} onCount={setToVerify} />
      </div>
      {tab === "overview" && <MonitoringPanel who="member" auditId={auditId} refreshKey={tick} />}
      {tab === "items" && <StatusTree role="incharge" auditId={auditId} canAct={editable} refreshKey={tick} onChanged={refresh} />}
      {tab === "team" && <TeamPanel who="member" auditId={auditId} auditStatus={a.status} isOwner={false} />}

      {dlg && (
        <Modal title={dlg === "approve" ? "Approve report" : "Send back to managers"} onClose={() => setDlg(null)}>
          <p>
            {dlg === "approve"
              ? "After approval the audit is locked: no more counting or corrections. The owner can then close it."
              : "Managers can count again and submit the report once more. Tell them what to check."}
          </p>
          <Field label="Note (optional)">
            <textarea className="au-input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button className="au-btn au-btn-primary" disabled={!!busy} onClick={dlg === "approve" ? approve : reopen}>
            {busy ? "Working…" : dlg === "approve" ? "Approve report" : "Send back"}
          </button>
        </Modal>
      )}
    </Shell>
  );
}
