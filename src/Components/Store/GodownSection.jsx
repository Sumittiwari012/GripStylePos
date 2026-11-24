import { useCallback, useEffect, useState } from "react";
import "./godownSection.css";

// "Check godown" section of the store panel (used by StorePanel.jsx, no route of its own).
//
// Uses two endpoints of StoreController:
//   GET api/Store/GetStoreGodown?storeId=   godown linked to the store + stock summary (the row)
//   GET api/Store/GetGodownStock?storeId=   products in that godown (loaded when the row is expanded)
//
// Backend address. Set VITE_API_URL to override it (e.g. for local testing);
// otherwise it uses the deployed API. It must be the full address, not a relative path,
// or the request goes to the Netlify site instead of the API.
const API_BASE = (import.meta.env.VITE_API_URL || "https://gripstyleapi.runasp.net").replace(/\/$/, "");

async function getJson(path, signal) {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}

export default function GodownSection({ session }) {
  const storeId = session.storeId;

  const [godown, setGodown] = useState(null);
  const [message, setMessage] = useState(""); // e.g. "No godown is linked to this store."
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState(null); // null = not loaded yet
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");

  const loadGodown = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const data = await getJson(`/api/Store/GetStoreGodown?storeId=${storeId}`, signal);
        setGodown(data.godown ?? null);
        setMessage(data.message || "");
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [storeId]
  );

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    setStockError("");
    try {
      const data = await getJson(`/api/Store/GetGodownStock?storeId=${storeId}`);
      setProducts(data.products || []);
    } catch (e) {
      setStockError(e.message);
    } finally {
      setStockLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadGodown(ctrl.signal);
    return () => ctrl.abort();
  }, [loadGodown]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && products === null && !stockLoading) loadStock();
  };

  const refresh = () => {
    setProducts(null);
    setOpen(false);
    loadGodown();
  };

  if (loading) {
    return (
      <section className="sp-card" aria-busy="true">
        <h2 className="sp-card-title">Check godown</h2>
        <p>Loading godown…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sp-card">
        <h2 className="sp-card-title">Check godown</h2>
        <p className="gs-error" role="alert">{error}</p>
        <button type="button" className="gs-btn" onClick={refresh}>Try again</button>
      </section>
    );
  }

  if (!godown) {
    return (
      <section className="sp-card sp-empty">
        <h2 className="sp-card-title">Check godown</h2>
        <p>{message || "No godown is linked to this store."}</p>
      </section>
    );
  }

  const panelId = "gs-stock-panel";

  return (
    <section className="sp-card gs-card" aria-labelledby="gs-title">
      <div className="gs-head">
        <h2 id="gs-title" className="sp-card-title">Check godown</h2>
        <button type="button" className="gs-btn" onClick={refresh}>Refresh</button>
      </div>

      <button
        type="button"
        className="gs-row"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="gs-row-main">
          <span className="gs-name">{godown.godownName}</span>
          {godown.address ? <span className="gs-address">{godown.address}</span> : null}
        </span>
        <span className="gs-row-stats">
          <span>{godown.productCount} {godown.productCount === 1 ? "product" : "products"}</span>
          <span>{godown.totalQuantity} in stock</span>
        </span>
        <span className="gs-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div id={panelId} className="gs-stock">
          {stockLoading && <p>Loading products…</p>}

          {stockError && (
            <>
              <p className="gs-error" role="alert">{stockError}</p>
              <button type="button" className="gs-btn" onClick={loadStock}>Try again</button>
            </>
          )}

          {!stockLoading && !stockError && products && products.length === 0 && (
            <p>This godown has no stock yet.</p>
          )}

          {!stockLoading && !stockError && products && products.length > 0 && (
            <div className="gs-table-wrap">
              <table className="gs-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="gs-num">Quantity</th>
                    <th scope="col">Barcodes</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.productId ?? `none-${i}`}>
                      <td>{p.productId != null ? `Product ${p.productId}` : "No product assigned"}</td>
                      <td className="gs-num">{p.totalQuantity}</td>
                      <td>
                        <ul className="gs-barcodes">
                          {p.barcodes.map((b, j) => (
                            <li key={`${b.barcode}-${j}`}>
                              {b.barcode || "–"} <span className="gs-qty">× {b.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}