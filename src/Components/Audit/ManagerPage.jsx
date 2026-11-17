import { useRef, useState } from "react";
import { api, qty, session } from "./api";
import { Badge, Bar, Card, CountForm, ErrorBox, Field, Loading, Modal, Shell, Stat, useLoad, useToast, withForce } from "./ui";

export default function ManagerPage() {
  const s = session.get();
  const auditId = s.audit.id;
  const progress = useLoad(() => api(`/${auditId}/progress`), [auditId]);
  const [toast, notify] = useToast();

  const [barcode, setBarcode] = useState("");
  const [item, setItem] = useState(null);
  const [scanErr, setScanErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [holdNote, setHoldNote] = useState("");
  const [listTab, setListTab] = useState("OnHold");
  const [submitOpen, setSubmitOpen] = useState(false);
  const inputRef = useRef(null);

  // Sold out in the system but physically present in the shop
  const [scannedCode, setScannedCode] = useState("");
  const [foundQty, setFoundQty] = useState("");
  const [foundNote, setFoundNote] = useState("");
  const [foundErr, setFoundErr] = useState(null);

  const lists = useLoad(() => api(`/${auditId}/items?status=${listTab}&pageSize=100`), [auditId, listTab]);

  const status = progress.data?.status;
  const counting = status === "InProgress";
  const o = progress.data?.overall;
  const mine = progress.data?.mine;

  const refresh = () => { progress.reload(); lists.reload(); };
  const next = () => {
    setItem(null); setBarcode(""); setHoldNote("");
    setScanErr(null); setFoundQty(""); setFoundNote(""); setFoundErr(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const scan = async (code) => {
    const c = (code ?? barcode).trim();
    if (!c) return;
    setBusy(true); setScanErr(null); setItem(null); setFoundErr(null);
    setScannedCode(c);
    try {
      setItem(await api(`/${auditId}/scan/${encodeURIComponent(c)}`));
    } catch (e) {
      setScanErr(e);
    } finally { setBusy(false); }
  };

  const count = async (body) => {
    setBusy(true); setScanErr(null);
    try {
      const r = await api(`/${auditId}/count`, { method: "POST", body: { barcode: item.barcode, ...body } });
      notify(`${r.productName}: ${r.status}`);
      next(); refresh();
    } catch (e) { setScanErr(e); } finally { setBusy(false); }
  };

  const hold = async () => {
    setBusy(true); setScanErr(null);
    try {
      await api(`/${auditId}/hold`, { method: "POST", body: { barcode: item.barcode, note: holdNote.trim() || null } });
      notify("Put on hold");
      next(); refresh();
    } catch (e) { setScanErr(e); } finally { setBusy(false); }
  };

  const recordFound = async () => {
    setBusy(true); setFoundErr(null);
    try {
      const r = await api(`/${auditId}/sold-out-found`, {
        method: "POST",
        body: { barcode: scannedCode, physicalQty: Number(foundQty), note: foundNote.trim() || null },
      });
      notify(`${r.productName}: found ${qty(r.physicalQty)} in shop`);
      next(); refresh();
    } catch (e) { setFoundErr(e); } finally { setBusy(false); }
  };

  return (
    <Shell title={s.audit.auditName} subtitle="Scan a barcode, count the shelf, save." member={s.member}>
      {toast}

      {status && !counting && (
        <div className="au-banner au-banner-warn">
          {status === "Review"
            ? "The report has been submitted to the incharge, so counting is closed. Ask the incharge to send it back if something must change."
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

      {counting && (
        <Card title="Scan">
          <form className="au-scanrow" onSubmit={(e) => { e.preventDefault(); scan(); }}>
            <input
              ref={inputRef}
              className="au-input au-input-big"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type a barcode"
              inputMode="text"
              autoFocus
              aria-label="Barcode"
            />
            <button className="au-btn au-btn-primary" disabled={busy || !barcode.trim()}>Find</button>
          </form>
          <ErrorBox error={scanErr} />
          {scanErr?.data?.productName && (
            <p className="au-muted">
              {scanErr.data.productName}: purchased {qty(scanErr.data.purchasedQty)}, returned to supplier {qty(scanErr.data.purchaseReturnedQty)}, sold {qty(scanErr.data.soldQty)}, remaining {qty(scanErr.data.remainingQty)}.
            </p>
          )}

          {scanErr?.data?.canRecordFoundStock && (
            <div className="au-product">
              <h3>Product is physically in the shop?</h3>
              <p className="au-muted">
                The system shows {scanErr.data.remainingQty < 0 ? `negative stock (${qty(scanErr.data.remainingQty)})` : "it as sold out"}. Record what you found and say why.
              </p>
              <Field label="Quantity found">
                <input
                  className="au-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={foundQty}
                  onChange={(e) => setFoundQty(e.target.value)}
                />
              </Field>
              <Field label="Note (required)">
                <textarea
                  className="au-input"
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Found on back shelf, purchase not entered"
                  value={foundNote}
                  onChange={(e) => setFoundNote(e.target.value)}
                />
              </Field>
              <ErrorBox error={foundErr} />
              <button
                className="au-btn au-btn-primary"
                disabled={busy || !(Number(foundQty) > 0) || !foundNote.trim()}
                onClick={recordFound}
              >
                Save as found
              </button>
            </div>
          )}

          {item && (
            <div className="au-product">
              <div className="au-product-head">
                <div>
                  <h3>{item.productName}</h3>
                  <div className="au-muted">{[item.categoryName, item.subCategoryName].filter(Boolean).join(" › ")} · {item.barcode}</div>
                </div>
                <Badge status={item.status} />
              </div>
              <div className="au-stats">
                <Stat label="Purchased" value={qty(item.purchasedQty)} />
                <Stat label="Returned to supplier" value={qty(item.purchaseReturnedQty)} />
                <Stat label="Net sold" value={qty(item.soldQty)} />
                <Stat label="System stock" value={qty(item.systemQty)} tone="ok" />
              </div>
              {item.status !== "Pending" && (
                <p className="au-muted">
                  Last entry: counted {qty(item.physicalQty)}{item.reasonCode ? ` · ${item.reasonCode}` : ""}{item.note ? ` · ${item.note}` : ""}. Saving a new count replaces it.
                </p>
              )}
              <CountForm key={`${item.verificationId}-${item.status}`} item={item} initial={item.status === "Pending" || item.status === "OnHold" ? null : item} busy={busy} onSubmit={count} />
              {item.status !== "Matched" && (
                <div className="au-hold">
                  <Field label="Can't count it now? Put it on hold">
                    <input className="au-input" placeholder="Note (optional)" maxLength={500} value={holdNote} onChange={(e) => setHoldNote(e.target.value)} />
                  </Field>
                  <button className="au-btn" disabled={busy} onClick={hold}>Put on hold</button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card
        title="Products to revisit"
        right={
          <div className="au-seg">
            {["OnHold", "Pending"].map((t) => (
              <button key={t} className={listTab === t ? "on" : ""} onClick={() => setListTab(t)}>{t === "OnHold" ? "On hold" : "Pending"}</button>
            ))}
          </div>
        }
      >
        {lists.loading && !lists.data ? <Loading /> : lists.data?.items.length === 0 ? (
          <p className="au-muted">{listTab === "OnHold" ? "Nothing on hold." : "Nothing pending. Every product has an entry."}</p>
        ) : (
          <ul className="au-picklist">
            {lists.data?.items.map((it) => (
              <li key={it.verificationId}>
                <button disabled={!counting} onClick={() => { setBarcode(it.barcode); scan(it.barcode); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <span>{it.productName}<small className="au-block au-muted">{it.barcode}{it.note ? ` · ${it.note}` : ""}</small></span>
                  <span className="au-num">{qty(it.systemQty)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {lists.data && lists.data.total > lists.data.items.length && <p className="au-muted">Showing the first {lists.data.items.length} of {lists.data.total}.</p>}
      </Card>

      {counting && (
        <Card title="Finished counting?">
          <p className="au-muted">Submitting closes counting and sends the report to the incharge for approval.</p>
          <button className="au-btn au-btn-primary" onClick={() => setSubmitOpen(true)}>Submit report to incharge</button>
        </Card>
      )}

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