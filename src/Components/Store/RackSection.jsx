import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "./storeApi";
import "./rackSection.css";

// "Assign rack" section of the store panel (used by StorePanel.jsx, no route of its own).
//
// Uses two endpoints of StoreController:
//   GET  api/Store/GetRackOverview?storeId=   the store's racks + their contents, and the godown barcodes waiting for a rack
//   POST api/Store/AssignRack                 puts quantities on racks and takes them out of the godown stock
//
// Goods received from a dispatch land in the godown stock. Here each product is given one or more racks and a
// quantity per rack. Picking a rack that already holds the product refills it. The server re-checks everything.

const fmt = (n) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

const productLabel = (p) =>
  p.productName || (p.productId != null ? `Product ${p.productId}` : "No product assigned");

// the rack is identified by its code (MRack.RackCode); the name / section is only extra help
const rackHelp = (r) => [r.rackName, r.section].filter(Boolean).join(" · ");
const sameCode = (a, b) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();

const emptyRow = () => ({ rackCode: "", qty: "" });

export default function RackSection({ session }) {
  const storeId = session.storeId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rows, setRows] = useState({}); // barcode -> [{ rackId, qty }]
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(
    async (signal, initial = false) => {
      if (initial) setLoading(true);
      setError("");
      try {
        setData(await getJson(`/api/Store/GetRackOverview?storeId=${storeId}`, signal));
        setRows({});
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal, true);
    return () => ctrl.abort();
  }, [load]);

  const rowsFor = (barcode) => rows[barcode] ?? [emptyRow()];

  const setRowsFor = (barcode, update) =>
    setRows((r) => ({ ...r, [barcode]: update(r[barcode] ?? [emptyRow()]) }));

  const changeRow = (barcode, idx, patch) =>
    setRowsFor(barcode, (list) => list.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const addRow = (barcode) => setRowsFor(barcode, (list) => [...list, emptyRow()]);

  const removeRow = (barcode, idx) =>
    setRowsFor(barcode, (list) => {
      const next = list.filter((_, i) => i !== idx);
      return next.length ? next : [emptyRow()];
    });

  const racks = data?.racks ?? [];

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    setNotice("");

    const items = [];
    for (const p of data.products) {
      let total = 0;
      for (const r of rowsFor(p.barcode)) {
        if (r.rackCode.trim() === "" && r.qty === "") continue;
        const n = Number(r.qty);
        if (r.rackCode.trim() === "") return setFormError(`Enter a rack code for ${productLabel(p)} (${p.barcode}).`);
        if (!racks.some((rk) => sameCode(rk.rackCode, r.rackCode)))
          return setFormError(`Rack code "${r.rackCode.trim()}" does not exist in this store. Pick one from the list.`);
        if (r.qty === "" || !Number.isInteger(n) || n <= 0)
          return setFormError(`Enter a whole number quantity for ${productLabel(p)} (${p.barcode}).`);
        total += n;
        items.push({ barcode: p.barcode, rackCode: r.rackCode.trim(), qty: n });
      }
      if (total > p.availableQty)
        return setFormError(`Only ${fmt(p.availableQty)} of ${productLabel(p)} (${p.barcode}) is left to assign.`);
    }
    if (items.length === 0) return setFormError("Choose a rack and a quantity for at least one product.");

    setBusy(true);
    try {
      const res = await postJson("/api/Store/AssignRack", {
        storeId: session.storeId,
        userId: session.userId,
        items,
      });
      setNotice(res.message || "Racks assigned.");
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="sp-card" aria-busy="true">
        <h2 className="sp-card-title">Assign rack</h2>
        <p>Loading racks…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sp-card">
        <h2 className="sp-card-title">Assign rack</h2>
        <p className="rk-error" role="alert">{error}</p>
        <button type="button" className="rk-btn" onClick={() => load(undefined, true)}>Try again</button>
      </section>
    );
  }

  if (data?.godownId == null) {
    return (
      <section className="sp-card sp-empty">
        <h2 className="sp-card-title">Assign rack</h2>
        <p>{data?.message || "No godown is linked to this store."}</p>
      </section>
    );
  }

  const products = data.products;

  return (
    <section className="sp-card" aria-labelledby="rk-title">
      <div className="rk-head">
        <h2 id="rk-title" className="sp-card-title">Assign rack</h2>
        <button type="button" className="rk-btn" onClick={() => { setNotice(""); setFormError(""); load(); }}>
          Refresh
        </button>
      </div>

      {notice ? <p className="rk-notice" role="status">{notice}</p> : null}

      {/* ───── goods waiting in the godown ───── */}
      <div className="rk-group">
        <h3 className="rk-group-title">
          Waiting in the godown <span className="rk-count">{products.length}</span>
        </h3>

        {racks.length === 0 ? (
          <p className="rk-empty">No racks have been set up for this store yet, so nothing can be assigned.</p>
        ) : products.length === 0 ? (
          <p className="rk-empty">Nothing is waiting in the godown. Received goods show up here.</p>
        ) : (
          <form onSubmit={submit}>
            <p className="rk-help">
              Type or pick the rack code (as on the rack label) and how many pieces go on it. Use a rack code that
              already holds the product to refill it, or add more racks for the same product. The pieces are taken out
              of the godown stock.
            </p>

            <datalist id="rk-codes">
              {racks.map((rk) => (
                <option key={rk.rackId} value={rk.rackCode}>{rackHelp(rk)}</option>
              ))}
            </datalist>

            <ul className="rk-list">
              {products.map((p) => {
                const list = rowsFor(p.barcode);
                const planned = list.reduce((s, r) => s + (Number(r.qty) > 0 ? Number(r.qty) : 0), 0);
                return (
                  <li key={p.barcode} className="rk-product">
                    <div className="rk-product-head">
                      <span className="rk-product-name">{productLabel(p)}</span>
                      <span className="rk-muted">{p.barcode}</span>
                      <span className="rk-left">{fmt(p.availableQty)} in godown</span>
                    </div>

                    {p.racks.length > 0 && (
                      <p className="rk-muted rk-already">
                        Already on: {p.racks.map((r) => `${r.rackCode} (${fmt(r.quantity)})`).join(", ")}
                      </p>
                    )}

                    {list.map((r, idx) => {
                      const match = racks.find((rk) => r.rackCode.trim() !== "" && sameCode(rk.rackCode, r.rackCode));
                      const has = match && p.racks.find((x) => x.rackId === match.rackId);
                      return (
                      <div key={idx} className="rk-assign-row">
                        <input
                          className="rk-input rk-code"
                          list="rk-codes"
                          aria-label={`Rack code for ${productLabel(p)} ${p.barcode}`}
                          placeholder="Rack code"
                          autoComplete="off"
                          value={r.rackCode}
                          onChange={(e) => changeRow(p.barcode, idx, { rackCode: e.target.value })}
                        />
                        <input
                          className="rk-input rk-qty"
                          aria-label={`Quantity for ${productLabel(p)} ${p.barcode}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={p.availableQty}
                          step="1"
                          placeholder="Qty"
                          value={r.qty}
                          onChange={(e) => changeRow(p.barcode, idx, { qty: e.target.value })}
                        />
                        {list.length > 1 && (
                          <button
                            type="button"
                            className="rk-btn rk-btn-small"
                            aria-label="Remove this rack"
                            onClick={() => removeRow(p.barcode, idx)}
                          >
                            ✕
                          </button>
                        )}
                        {r.rackCode.trim() !== "" && (
                          <span className={match ? "rk-muted rk-hint" : "rk-error rk-hint"}>
                            {match
                              ? `${rackHelp(match) || "Rack found"}${has ? ` · has ${fmt(has.quantity)} (refill)` : ""}`
                              : "No such rack code"}
                          </span>
                        )}
                      </div>
                      );
                    })}

                    <div className="rk-product-foot">
                      <button type="button" className="rk-btn rk-btn-small" onClick={() => addRow(p.barcode)}>
                        + Another rack
                      </button>
                      {planned > 0 && (
                        <span className={planned > p.availableQty ? "rk-error" : "rk-muted"}>
                          {fmt(planned)} of {fmt(p.availableQty)} assigned
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {formError ? <p className="rk-error" role="alert">{formError}</p> : null}

            <button type="submit" className="rk-btn rk-btn-primary" disabled={busy}>
              {busy ? "Assigning…" : "Assign to racks"}
            </button>
          </form>
        )}
      </div>

      {/* ───── what is on the racks ───── */}
      <div className="rk-group">
        <h3 className="rk-group-title">
          Racks <span className="rk-count">{racks.length}</span>
        </h3>

        {racks.length === 0 ? (
          <p className="rk-empty">No racks yet.</p>
        ) : (
          <ul className="rk-list">
            {racks.map((r) => (
              <li key={r.rackId}>
                <details className="rk-rack">
                  <summary>
                    <span className="rk-rack-main">
                      <span className="rk-product-name">{r.rackCode}</span>
                      {rackHelp(r) ? <span className="rk-muted">{rackHelp(r)}</span> : null}
                    </span>
                    <span className="rk-rack-stats">
                      {fmt(r.usedQty)}
                      {r.capacity != null ? ` / ${fmt(r.capacity)}` : ""} pcs
                    </span>
                  </summary>
                  {r.items.length === 0 ? (
                    <p className="rk-empty">This rack is empty.</p>
                  ) : (
                    <div className="rk-table-wrap">
                      <table className="rk-table">
                        <thead>
                          <tr>
                            <th scope="col">Product</th>
                            <th scope="col">Barcode</th>
                            <th scope="col" className="rk-num">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map((i) => (
                            <tr key={i.barcode}>
                              <td>{productLabel(i)}</td>
                              <td>{i.barcode}</td>
                              <td className="rk-num">{fmt(i.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
