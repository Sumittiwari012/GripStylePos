import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtDate, qty, REASONS, ROLE_LABEL, ROUTE_BASE, session } from "./api";
import "./audit.css";

// ── data loading ──
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fn();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

export function useToast() {
  const [t, setT] = useState(null);
  const show = useCallback((text, kind = "ok") => {
    setT({ text, kind });
    setTimeout(() => setT(null), 3500);
  }, []);
  const node = t ? (
    <div className={`au-toast au-toast-${t.kind}`} role="status">
      {t.text}
    </div>
  ) : null;
  return [node, show];
}

// Run an action that the server may refuse with "use Force = true".
// Asks the person once, then repeats with force.
export async function withForce(run) {
  try {
    return await run(false);
  } catch (e) {
    if (e.status === 409 && /Force/i.test(e.message)) {
      if (window.confirm(`${e.message}\n\nContinue anyway?`)) return await run(true);
      return null;
    }
    throw e;
  }
}

// ── layout ──
export function Shell({ title, subtitle, actions, member, owner, children, back }) {
  const nav = useNavigate();
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    session.clear();
    nav(`${ROUTE_BASE}/${owner ? "owner-login" : "login"}`);
  };
  return (
    <div className="au">
      <header className="au-top">
        <div className="au-brand">Stock audit</div>
        {(member || owner) && (
          <div className="au-who">
            <span>
              {member ? `${member.personName} · ${ROLE_LABEL[member.roleId] || "Member"}` : `${owner.ownerName} · Owner`}
            </span>
            <button className="au-btn au-btn-ghost au-btn-sm" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="au-main">
        {back && (
          <Link className="au-back" to={back.to}>
            ← {back.label}
          </Link>
        )}
        <div className="au-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="au-sub">{subtitle}</p>}
          </div>
          {actions && <div className="au-actions">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Card({ title, right, children, className = "" }) {
  return (
    <section className={`au-card ${className}`}>
      {(title || right) && (
        <div className="au-card-head">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export const Badge = ({ status }) => <span className={`au-badge au-s-${status}`}>{status}</span>;

// state of a subordinate's count: AwaitingReview | Accepted | Rejected
const REVIEW_LABEL = { AwaitingReview: "Awaiting review", Accepted: "Accepted", Rejected: "Rejected" };
export const ReviewBadge = ({ state }) => <span className={`au-badge au-s-${state}`}>{REVIEW_LABEL[state] || state}</span>;

export const Stat = ({ label, value, tone }) => (
  <div className={`au-stat ${tone ? `au-t-${tone}` : ""}`}>
    <div className="au-stat-v">{value}</div>
    <div className="au-stat-l">{label}</div>
  </div>
);

export const Bar = ({ percent }) => (
  <div className="au-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
    <div style={{ width: `${Math.min(percent || 0, 100)}%` }} />
  </div>
);

export const ApprovalTag = ({ info }) =>
  info ? <span className={`au-tag ${info.isApproved ? "au-tag-ok" : "au-tag-wait"}`}>{info.label}</span> : null;

export function Loading({ what = "Loading…" }) {
  return <p className="au-muted">{what}</p>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const d = error.data || {};
  const list = d.products || d.barcodes;
  return (
    <div className="au-error" role="alert">
      <strong>{error.message}</strong>
      {list && (
        <ul>
          {list.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button className="au-btn au-btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="au-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`au-modal ${wide ? "au-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="au-card-head">
          <h2>{title}</h2>
          <button className="au-btn au-btn-ghost au-btn-sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="au-field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

// ── count form: used by the manager (count) and the incharge (correct) ──
export function CountForm({ item, initial, submitLabel = "Save count", onSubmit, busy }) {
  const [physical, setPhysical] = useState(initial?.physicalQty ?? "");
  const [reason, setReason] = useState(initial?.reasonCode ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const given = physical === "" ? null : Number(physical);
  const diff = given === null ? null : Math.round((given - item.systemQty) * 1000) / 1000;
  const differs = diff !== null && diff !== 0;

  const submit = (e) => {
    e.preventDefault();
    if (given === null || Number.isNaN(given)) return;
    onSubmit({ physicalQty: given, reasonCode: differs && reason ? reason : null, note: differs && note.trim() ? note.trim() : null });
  };

  return (
    <form onSubmit={submit} className="au-form">
      <Field label="Counted on the shelf">
        <input
          className="au-input au-input-big"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={physical}
          onChange={(e) => setPhysical(e.target.value)}
          autoFocus
          required
        />
      </Field>
      {diff !== null && (
        <p className={`au-diff ${differs ? (diff < 0 ? "au-diff-short" : "au-diff-excess") : "au-diff-ok"}`}>
          {differs
            ? `${diff < 0 ? "Short" : "Excess"} by ${qty(Math.abs(diff))} against system stock of ${qty(item.systemQty)}`
            : "Matches system stock"}
        </p>
      )}
      {differs && (
        <>
          <Field label="Reason">
            <select className="au-input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Note" hint="A reason or a note is required when the count differs.">
            <textarea className="au-input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      <button className="au-btn au-btn-primary" disabled={busy || given === null || (differs && !reason && !note.trim())}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

// ── purchase / sales records behind a product ──
export function HistoryTables({ history }) {
  if (!history) return null;
  const blocks = [
    { key: "purchases", title: "Purchases", cols: ["Invoice", "Date", "Qty"], row: (r) => [r.invoiceNumber || r.vendorInvoiceNumber, fmtDate(r.purchaseDate), qty(r.quantity)] },
    { key: "purchaseReturns", title: "Returned to supplier", cols: ["Return invoice", "Date", "Qty"], row: (r) => [r.returnInvoiceNumber, fmtDate(r.returnDate), qty(r.quantity)] },
    { key: "sales", title: "Sold to customers", cols: ["Invoice", "Date", "Qty"], row: (r) => [r.invoiceNumber, fmtDate(r.saleDate), qty(r.quantity)] },
    { key: "customerReturns", title: "Returned by customers", cols: ["Return invoice", "Date", "Qty"], row: (r) => [r.returnInvoiceNumber, fmtDate(r.returnDate), qty(r.quantity)] },
  ];
  return (
    <div className="au-history">
      {blocks.map((b) => (
        <div key={b.key}>
          <h3>{b.title}</h3>
          {history[b.key]?.length ? (
            <div className="au-scroll">
              <table className="au-table au-table-tight">
                <thead>
                  <tr>
                    {b.cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history[b.key].map((r, i) => (
                    <tr key={i}>
                      {b.row(r).map((v, j) => (
                        <td key={j} className={j === 2 ? "au-num" : ""}>
                          {v || "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="au-muted">None</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── barcode scanning with the phone / laptop camera ──
// Uses the browser's built-in BarcodeDetector when there is one (Chrome, Edge, Android).
// Otherwise (iPhone Safari, Firefox) it loads @zxing/browser on demand:  npm i @zxing/browser
// Camera access needs https (or localhost).
export function ScanDialog({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let timer = null;
    let controls = null;

    const found = (text) => {
      if (stopped || !text) return;
      stopped = true;
      try { navigator.vibrate?.(60); } catch { /* ignore */ }
      onDetect(String(text).trim());
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("This browser cannot open the camera here. Camera scanning needs a secure (https) page.");
        setStarting(false);
        return;
      }
      const constraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
      try {
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector();
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
          const v = videoRef.current;
          v.srcObject = stream;
          await v.play();
          setStarting(false);
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(v);
              if (codes.length) return found(codes[0].rawValue);
            } catch { /* frame not ready, try again */ }
            timer = setTimeout(tick, 200);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200 });
          controls = await reader.decodeFromConstraints(constraints, videoRef.current, (result) => {
            if (result) found(result.getText());
          });
          if (stopped) controls.stop();
          setStarting(false);
        }
      } catch (e) {
        if (stopped) return;
        setStarting(false);
        setErr(
          e?.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access for this site in your browser settings, then try again."
          : e?.name === "NotFoundError" ? "No camera was found on this device."
          : "Could not start the camera. Close other apps that use it and try again."
        );
      }
    };
    start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Scan barcode" onClose={onClose}>
      {err ? (
        <div className="au-error" role="alert">{err}</div>
      ) : (
        <>
          <div className="au-scanview">
            <video ref={videoRef} muted playsInline />
            <div className="au-scanframe" aria-hidden="true" />
          </div>
          <p className="au-muted">{starting ? "Starting the camera…" : "Hold the barcode inside the frame. It is picked up automatically."}</p>
        </>
      )}
      <button className="au-btn" onClick={onClose}>Cancel</button>
    </Modal>
  );
}

// Text input + "Scan" button. Typing still works. A scan fills the box and calls onChange.
export function BarcodeInput({ value, onChange, placeholder, label = "Filter", ...rest }) {
  const [scanning, setScanning] = useState(false);
  return (
    <>
      <div className="au-scanrow au-scanrow-sm">
        <input className="au-input au-input-sm" style={{ flex: 1, minWidth: 0 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} {...rest} />
        <button type="button" className="au-btn au-btn-sm" onClick={() => setScanning(true)} aria-label="Scan barcode with camera">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ marginRight: 4 }}>
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8" />
          </svg>
          Scan
        </button>
      </div>
      {scanning && <ScanDialog onClose={() => setScanning(false)} onDetect={(code) => { setScanning(false); onChange(code); }} />}
    </>
  );
}

// Button that opens the camera and hands the scanned code to onScan(code).
export function ScanButton({ onScan, children = "Scan to find", className = "au-btn au-btn-sm au-btn-primary" }) {
  const [scanning, setScanning] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setScanning(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ marginRight: 4 }}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8" />
        </svg>
        {children}
      </button>
      {scanning && <ScanDialog onClose={() => setScanning(false)} onDetect={(code) => { setScanning(false); onScan(code); }} />}
    </>
  );
}
