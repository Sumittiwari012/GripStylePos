import { useEffect, useState } from "react";
import { api, qty, session } from "./api";
import { Badge, BarcodeInput, ScanButton, Card, CountForm, ErrorBox, Loading, Modal, ReviewBadge, Shell, Stat, useLoad, useToast } from "./ui";

const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";

// Home of an audit subordinate.
// The manager gives you categories. You count the barcodes in them and send the count to
// your manager. Your counts are not part of the report until the manager accepts them.
export default function SubordinatePage() {
  const s = session.get();
  const auditId = s.audit.id;

  // fresh audit status (the one saved at login can be old)
  const me = useLoad(() => api("/auth/me"), [auditId]);
  const cats = useLoad(() => api(`/${auditId}/sub/categories`), [auditId]);
  const [section, setSection] = useState("pending");
  const [ver, setVer] = useState(0); // bumps => opened categories reload
  const [dlg, setDlg] = useState(null); // { item }
  const [toast, notify] = useToast();
  const [focus, setFocus] = useState(null); // product found by scanning

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setFocus(null), 8000);
    return () => clearTimeout(t);
  }, [focus]);

  // The server only finds barcodes in the categories assigned to this subordinate.
  const locate = async (code) => {
    try {
      const r = await api(`/${auditId}/locate?barcode=${encodeURIComponent(code)}`);
      setSection(r.categoryComplete ? "completed" : "pending");
      setFocus({ ...r, nonce: Date.now() });
      notify(`${r.productName}: ${r.categoryName} › ${r.subCategoryName}`);
    } catch (e) {
      notify(e.message, "err");
    }
  };

  const status = me.data?.audit?.status;
  const counting = status === "InProgress";
  const data = cats.data;
  const list = data?.[section] ?? [];

  const refresh = () => { setVer((v) => v + 1); cats.reload(); me.reload(); };
  const done = (msg) => { setDlg(null); notify(msg); setVer((v) => v + 1); cats.reload(); };

  return (
    <Shell
      title={s.audit.auditName}
      subtitle="Count the categories your manager gave you. Your manager reviews every count you send."
      member={s.member}
    >
      {toast}

      {status && !counting && (
        <div className="au-banner au-banner-warn">
          {status === "Review"
            ? "The report has been submitted, so counting is closed."
            : `This audit is ${status}. Counting is not open.`}
        </div>
      )}

      <Card title="Your categories" right={
        <div className="au-row">
          <ScanButton onScan={locate} />
          <button className="au-btn au-btn-ghost au-btn-sm" onClick={refresh}>Refresh</button>
        </div>
      }>
        <ErrorBox error={cats.error} onRetry={cats.reload} />
        {cats.loading && !data ? <Loading /> : data && (
          data.assignedCount === 0 ? (
            <p>Your manager has not given you a category yet. Ask them to assign one, then press Refresh.</p>
          ) : (
            <>
              <nav className="au-tabs" role="tablist">
                <button role="tab" className={section === "pending" ? "on" : ""} onClick={() => setSection("pending")}>
                  Pending ({data.pending.length})
                </button>
                <button role="tab" className={section === "completed" ? "on" : ""} onClick={() => setSection("completed")}>
                  Completed ({data.completed.length})
                </button>
              </nav>
              <p className="au-muted">
                {section === "pending"
                  ? "A category is pending until your manager has settled every barcode in it. Open one to count."
                  : "Your manager has settled every barcode in these categories."}
              </p>
              {list.length === 0 && <p className="au-muted">{section === "pending" ? "Nothing pending." : "No category is completed yet."}</p>}
              {list.map((c) => (
                <CategoryBlock key={`${section}-${c.categoryId}`} cat={c} auditId={auditId} ver={ver} canAct={counting} focus={focus} onCount={(item) => setDlg({ item })} />
              ))}
            </>
          )
        )}
      </Card>

      {dlg && <CountDialog auditId={auditId} item={dlg.item} onClose={() => setDlg(null)} onDone={done} />}
    </Shell>
  );
}

function CategoryBlock({ cat, auditId, ver, canAct, focus, onCount }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (focus && focus.categoryId === cat.categoryId) setOpen(true); }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <details className="au-group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {cat.categoryName}
        <span className="au-chip">{cat.settled} of {cat.total} settled</span>
        {cat.sentByMe > 0 && <span className="au-chip">{cat.sentByMe} sent by you</span>}
        {cat.rejectedForMe > 0 && <span className="au-chip">{cat.rejectedForMe} rejected</span>}
      </summary>
      {open && <CategoryBody cat={cat} auditId={auditId} ver={ver} canAct={canAct} focus={focus} onCount={onCount} />}
    </details>
  );
}

const FILTERS = [["all", "All"], ["todo", "To do"], ["done", "Settled"]];

function CategoryBody({ cat, auditId, ver, canAct, focus, onCount }) {
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}/sub/categories/${cat.categoryId}`), [auditId, cat.categoryId, ver]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const mine = !!focus && focus.categoryId === cat.categoryId;

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
    (filter === "all" || (filter === "done") === it.settled) &&
    (!t || it.barcode.toLowerCase().includes(t) || it.productName.toLowerCase().includes(t));

  return (
    <>
      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <div className="au-seg">
          {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={setQ} />
      </div>

      {data.subCategories.map((sg) => {
        const items = sg.items.filter(pass);
        if (items.length === 0) return null;
        return (
          <div key={sg.subCategoryId} className="au-subgroup">
            <h3>
              {sg.subCategoryName}
              <span className="au-chip">{sg.settled} of {sg.total} settled</span>
            </h3>
            <div className="au-scroll">
              <table className="au-table au-table-tight">
                <thead>
                  <tr>
                    <th>Barcode / product</th>
                    <th className="au-num">System</th>
                    <th>Manager status</th>
                    <th className="au-num">Your count</th>
                    <th>Your count status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const c = it.myCount;
                    return (
                      <tr key={it.verificationId} id={`au-row-${it.verificationId}`} className={focus?.verificationId === it.verificationId ? "au-row-hit" : ""}>
                        <td>
                          <strong>{it.barcode}</strong>
                          {it.stockKind !== "InStock" && <span className="au-chip">{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span>}
                          <small className="au-block au-muted">{it.productName}</small>
                        </td>
                        <td className="au-num">{qty(it.systemQty)}</td>
                        <td>{it.settled ? <Badge status={it.status} /> : <Badge status="Pending" />}</td>
                        <td className={`au-num ${c && c.varianceQty < 0 ? "au-neg" : c && c.varianceQty > 0 ? "au-pos" : ""}`}>
                          {c ? qty(c.physicalQty) : "–"}
                          {c && c.varianceQty !== 0 && <small className="au-block">{c.varianceQty > 0 ? "+" : ""}{qty(c.varianceQty)}</small>}
                        </td>
                        <td>
                          {c ? <ReviewBadge state={c.reviewState} /> : <span className="au-muted">Not counted</span>}
                          {c?.reviewComment && <small className="au-block au-muted">Manager: {c.reviewComment}</small>}
                          {c && (c.reasonCode || c.note) && <small className="au-block au-muted">{[c.reasonCode, c.note].filter(Boolean).join(" · ")}</small>}
                        </td>
                        <td className="au-rowactions">
                          {it.settled
                            ? <span className="au-muted">Settled by manager</span>
                            : canAct && <button className="au-btn au-btn-sm au-btn-primary" onClick={() => onCount(it)}>{c ? "Recount" : "Count"}</button>}
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

function CountDialog({ auditId, item, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const c = item.myCount;

  const send = async (body) => {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/${auditId}/sub/count`, { method: "POST", body: { barcode: item.barcode, ...body } });
      onDone(r.message || "Count sent to your manager");
    } catch (e) { setErr(e); setBusy(false); }
  };

  return (
    <Modal title={`Count: ${item.productName}`} onClose={onClose}>
      <p className="au-muted">{item.barcode}</p>
      {item.stockKind !== "InStock" && (
        <p className="au-muted">
          {item.stockKind === "SoldOut"
            ? "The system shows this product as sold out. Enter 0 if none is on the shelf, or the quantity you found and a note."
            : `The system shows negative stock (${qty(item.systemQty)}). Enter what is physically there and a note if it differs.`}
        </p>
      )}
      <div className="au-stats">
        <Stat label="System stock" value={qty(item.systemQty)} tone="ok" />
        {c && <Stat label="Your last count" value={qty(c.physicalQty)} />}
      </div>
      {c?.reviewState === "Rejected" && (
        <div className="au-error">Your manager rejected the last count{c.reviewComment ? `: ${c.reviewComment}` : "."}</div>
      )}
      {c?.reviewState === "AwaitingReview" && (
        <p className="au-muted">Your last count is still waiting for your manager. Sending a new one replaces it.</p>
      )}
      <ErrorBox error={err} />
      <CountForm
        key={`${item.verificationId}-${c?.sentAt || ""}`}
        item={item}
        initial={c && c.reviewState !== "Accepted" ? c : null}
        submitLabel="Send to manager"
        busy={busy}
        onSubmit={send}
      />
    </Modal>
  );
}
