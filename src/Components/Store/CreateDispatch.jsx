import { useEffect, useState } from "react";
import { getJson, postJson } from "./storeApi";

// "Create dispatch" form, opened from DispatchSection.jsx.
//
// Uses two endpoints of StoreController:
//   GET  api/Store/GetDispatchOptions?storeId=   where goods can go + what can be sent from this store's godown
//   POST api/Store/CreateDispatch                creates the dispatch (status Dispatched)
// The goods always leave the godown linked to the store. The server re-checks every quantity.

const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function CreateDispatch({ session, onCreated, onClose }) {
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [toType, setToType] = useState("Store");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState({}); // barcode -> text typed in the box
  const [remarks, setRemarks] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadOptions = async (signal) => {
    setLoadError("");
    try {
      setOptions(await getJson(`/api/Store/GetDispatchOptions?storeId=${session.storeId}`, signal));
    } catch (e) {
      if (e.name !== "AbortError") setLoadError(e.message);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    loadOptions(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    return (
      <div className="ds-create">
        <p className="ds-error" role="alert">{loadError}</p>
        <div className="ds-action-buttons">
          <button type="button" className="ds-btn" onClick={() => loadOptions()}>Try again</button>
          <button type="button" className="ds-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (!options) {
    return (
      <div className="ds-create" aria-busy="true">
        <p>Loading…</p>
      </div>
    );
  }

  const destinations = toType === "Store" ? options.stores : options.godowns;
  const picked = options.products.filter((p) => Number(qty[p.barcode]) > 0);
  const totalQty = picked.reduce((sum, p) => sum + Number(qty[p.barcode]), 0);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!toId) {
      setError("Choose where the goods are going.");
      return;
    }
    if (picked.length === 0) {
      setError("Enter a quantity for at least one product.");
      return;
    }
    for (const p of options.products) {
      const text = qty[p.barcode];
      if (text === undefined || text === "") continue;
      const n = Number(text);
      if (Number.isNaN(n) || n < 0 || n > p.availableQty) {
        setError(`Quantity for ${p.barcode} must be between 0 and ${fmt(p.availableQty)}.`);
        return;
      }
    }

    setBusy(true);
    try {
      const res = await postJson("/api/Store/CreateDispatch", {
        storeId: session.storeId,
        userId: session.userId,
        toType,
        toId: Number(toId),
        remarks,
        items: picked.map((p) => ({ barcode: p.barcode, qty: Number(qty[p.barcode]) })),
      });
      onCreated(res.message || "Dispatch created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ds-create" onSubmit={submit} aria-labelledby="ds-create-title">
      <h3 id="ds-create-title" className="ds-action-title">New dispatch</h3>
      <p className="ds-action-help">Goods are sent from your godown. Pick where they go and how much of each product.</p>

      <fieldset className="ds-fieldset">
        <legend>Send to</legend>
        <div className="ds-radios">
          {["Store", "Godown"].map((t) => (
            <label key={t}>
              <input
                type="radio"
                name="ds-to-type"
                value={t}
                checked={toType === t}
                onChange={() => {
                  setToType(t);
                  setToId("");
                }}
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="ds-field">
        <label htmlFor="ds-to-id">{toType === "Store" ? "Store" : "Godown"}</label>
        <select id="ds-to-id" className="ds-input" value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">{destinations.length ? `Select a ${toType.toLowerCase()}` : `No ${toType.toLowerCase()}s available`}</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <fieldset className="ds-fieldset">
        <legend>Products</legend>
        {options.products.length === 0 ? (
          <p className="ds-empty">There is no stock available to dispatch from this godown.</p>
        ) : (
          <ul className="ds-stock-list">
            {options.products.map((p) => (
              <li key={p.barcode} className="ds-stock-item">
                <label htmlFor={`ds-new-${p.barcode}`}>
                  Product {p.productId ?? "–"} ({p.barcode})
                  <span className="ds-qty-sent"> · {fmt(p.availableQty)} available</span>
                </label>
                <input
                  id={`ds-new-${p.barcode}`}
                  className="ds-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={p.availableQty}
                  step="any"
                  placeholder="0"
                  value={qty[p.barcode] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [p.barcode]: e.target.value }))}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="ds-field">
        <label htmlFor="ds-new-note">Note (optional)</label>
        <textarea
          id="ds-new-note"
          className="ds-input ds-textarea"
          rows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      {picked.length > 0 && (
        <p className="ds-summary">
          {picked.length} {picked.length === 1 ? "product" : "products"}, {fmt(totalQty)} in total
        </p>
      )}

      {error ? <p className="ds-error" role="alert">{error}</p> : null}

      <div className="ds-action-buttons">
        <button type="submit" className="ds-btn ds-btn-primary ds-btn-inline" disabled={busy || options.products.length === 0}>
          {busy ? "Creating…" : "Create dispatch"}
        </button>
        <button type="button" className="ds-btn" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
