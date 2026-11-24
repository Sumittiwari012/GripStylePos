import { useState } from "react";
import { postJson } from "./storeApi";

// Actions on one transfer, used by DispatchSection.jsx.
//   ReceiveForm  incoming transfer (dispatched to the godown): confirm what arrived -> status Received
//   CancelForm   outgoing transfer (from the godown): the only change allowed -> status Cancelled
// Which one shows is decided by the server (transfer.canReceive / transfer.canCancel).

export function ReceiveForm({ transfer, session, onDone }) {
  const [qty, setQty] = useState(() =>
    Object.fromEntries(transfer.items.map((i) => [i.itemId, String(i.dispatchedQty)]))
  );
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const items = [];
    for (const i of transfer.items) {
      const n = Number(qty[i.itemId]);
      if (qty[i.itemId] === "" || Number.isNaN(n) || n < 0 || n > i.dispatchedQty || !Number.isInteger(n)) {
        setError(`Received quantity for ${i.barcode || `product ${i.productId}`} must be a whole number between 0 and ${i.dispatchedQty}.`);
        return;
      }
      items.push({ itemId: i.itemId, receivedQty: n });
    }
    setBusy(true);
    try {
      const res = await postJson("/api/Store/ReceiveTransfer", {
        storeId: session.storeId,
        userId: session.userId,
        transferId: transfer.transferId,
        remarks,
        items,
      });
      onDone(res.message || "Transfer marked as received.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ds-action">
      <h4 className="ds-action-title">Confirm receipt</h4>
      <p className="ds-action-help">Enter the quantity that actually arrived for each product. It is added to your godown's stock.</p>

      <ul className="ds-qty-list">
        {transfer.items.map((i) => (
          <li key={i.itemId}>
            <label htmlFor={`ds-qty-${i.itemId}`}>
              {i.productName || `Product ${i.productId}`} {i.barcode ? `(${i.barcode})` : ""}
              <span className="ds-qty-sent"> sent {i.dispatchedQty}</span>
            </label>
            <input
              id={`ds-qty-${i.itemId}`}
              className="ds-input"
              type="number"
              inputMode="numeric"
              min="0"
              max={i.dispatchedQty}
              step="1"
              value={qty[i.itemId]}
              onChange={(e) => setQty((q) => ({ ...q, [i.itemId]: e.target.value }))}
            />
          </li>
        ))}
      </ul>

      <label htmlFor={`ds-note-${transfer.transferId}`} className="ds-action-help">
        Note (optional), e.g. short or damaged goods
      </label>
      <textarea
        id={`ds-note-${transfer.transferId}`}
        className="ds-input ds-textarea"
        rows={2}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />

      {error ? <p className="ds-error" role="alert">{error}</p> : null}

      <button type="button" className="ds-btn ds-btn-primary" disabled={busy} onClick={submit}>
        {busy ? "Saving…" : "Mark as received"}
      </button>
    </div>
  );
}

export function CancelForm({ transfer, session, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await postJson("/api/Store/CancelTransfer", {
        storeId: session.storeId,
        userId: session.userId,
        transferId: transfer.transferId,
        reason,
      });
      onDone(res.message || "Transfer cancelled.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <div className="ds-action">
        <button type="button" className="ds-btn ds-btn-danger" onClick={() => setConfirming(true)}>
          Cancel dispatch
        </button>
      </div>
    );
  }

  return (
    <div className="ds-action">
      <h4 className="ds-action-title">Cancel this dispatch?</h4>
      <p className="ds-action-help">This cannot be undone. Cancelling is the only change allowed on goods leaving the godown.</p>

      <label htmlFor={`ds-reason-${transfer.transferId}`} className="ds-action-help">Reason (optional)</label>
      <textarea
        id={`ds-reason-${transfer.transferId}`}
        className="ds-input ds-textarea"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error ? <p className="ds-error" role="alert">{error}</p> : null}

      <div className="ds-action-buttons">
        <button type="button" className="ds-btn ds-btn-danger" disabled={busy} onClick={submit}>
          {busy ? "Cancelling…" : "Yes, cancel dispatch"}
        </button>
        <button type="button" className="ds-btn" disabled={busy} onClick={() => setConfirming(false)}>
          Keep it
        </button>
      </div>
    </div>
  );
}
