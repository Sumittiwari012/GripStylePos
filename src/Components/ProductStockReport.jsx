import { useCallback, useEffect, useState } from "react";

// Set VITE_API_URL in .env (e.g. VITE_API_URL=https://localhost:7001).
// For Create React App use process.env.REACT_APP_API_URL instead.
const API_BASE = import.meta.env?.VITE_API_URL ?? "https://gripstyleapi.runasp.net";

const EMPTY_FILTERS = { categoryId: "", subCategoryId: "", barcode: "", search: "" };
const fmtQty = (n) => Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function ProductStockReport() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState({ busy: false, result: null, error: "" });
  const [allowNegative, setAllowNegative] = useState(false);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page, pageSize });
        Object.entries(applied).forEach(([k, v]) => v.trim() && params.set(k, v.trim()));

        const res = await fetch(`${API_BASE}/api/ProductStockReport?${params}`, { signal });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        setData(await res.json());
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(`Could not load the stock report. ${e.message}. Check that the API is running and allows requests from this site (CORS).`);
        }
      } finally {
        setLoading(false);
      }
    },
    [applied, page, pageSize]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    fetch(`${API_BASE}/api/ProductStockReport/categories`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!filters.categoryId) {
      setSubCategories([]);
      return;
    }
    fetch(`${API_BASE}/api/ProductStockReport/subcategories?categoryId=${filters.categoryId}`)
      .then((r) => r.json())
      .then(setSubCategories)
      .catch(() => setSubCategories([]));
  }, [filters.categoryId]);

  const pickCategory = (e) => {
    const next = { ...filters, categoryId: e.target.value, subCategoryId: "" };
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  const pickSubCategory = (e) => {
    const next = { ...filters, subCategoryId: e.target.value };
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  const setField = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const applyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setApplied(filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const catName = categories.find((c) => String(c.id) === applied.categoryId)?.name;
  const subName = subCategories.find((c) => String(c.id) === applied.subCategoryId)?.name;
  const scopeLabel =
    [catName, subName, applied.barcode.trim() && `barcode ${applied.barcode.trim()}`].filter(Boolean).join(" › ") ||
    "all products";

  // Calls POST /api/ProductStockReport/apply-opening-stock. dryRun=true previews, false saves.
  // all=true ignores the filters and applies to every category and sub-category.
  const runOpening = async (dryRun, all = false) => {
    const scope = all ? "ALL products (every category and sub-category)" : scopeLabel;
    if (!dryRun && !window.confirm(`Save the calculated opening stock to: ${scope}?\nThis updates your product data.`)) return;

    setOpening((o) => ({ ...o, busy: true, error: "" }));
    try {
      const body = { dryRun, allowNegative };
      if (!all) {
        if (applied.categoryId) body.categoryId = Number(applied.categoryId);
        if (applied.subCategoryId) body.subCategoryId = Number(applied.subCategoryId);
        if (applied.barcode.trim()) body.barcode = applied.barcode.trim();
      }

      const res = await fetch(`${API_BASE}/api/ProductStockReport/apply-opening-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const result = await res.json();
      setOpening({ busy: false, result, error: "" });
      if (!dryRun) load();
    } catch (e) {
      setOpening({ busy: false, result: null, error: `Could not run the opening stock update. ${e.message}.` });
    }
  };

  const items = data?.items ?? [];
  const totals = data?.totals;

  return (
    <div className="psr">
      <style>{css}</style>

      <header className="psr-head">
        <h1>Stock report</h1>
        <p>Purchases, sales, returns and what is on hand for each product.</p>
      </header>

      <form className="psr-filters" onSubmit={applyFilters}>
        <label>
          Category
          <select value={filters.categoryId} onChange={pickCategory}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Sub-category
          <select value={filters.subCategoryId} onChange={pickSubCategory} disabled={!filters.categoryId}>
            <option value="">{filters.categoryId ? "All sub-categories" : "Pick a category first"}</option>
            {subCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Barcode
          <input value={filters.barcode} onChange={setField("barcode")} placeholder="Scan or type" autoFocus />
        </label>
        <label className="grow">
          Product name or code
          <input value={filters.search} onChange={setField("search")} />
        </label>
        <div className="psr-actions">
          <button type="submit" className="primary">Show stock</button>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      </form>

      {totals && (
        <dl className="psr-totals" aria-label="Totals for this page">
          <div><dt>Purchased</dt><dd>{fmtQty(totals.purchaseQty)}</dd></div>
          <div><dt>Sold</dt><dd>{fmtQty(totals.salesQty)}</dd></div>
          <div><dt>Returned</dt><dd>{fmtQty(totals.returnQty)}</dd></div>
        </dl>
      )}

      <section className="psr-opening">
        <div className="psr-opening-head">
          <div>
            <strong>Opening stock</strong>
            <span className="sub">
              For products with no purchase entry: opening = in stock table + sold − returned. Applies to: {scopeLabel}.
            </span>
          </div>
          <div className="psr-actions">
            <button type="button" onClick={() => runOpening(true)} disabled={opening.busy}>
              {opening.busy ? "Working…" : "Preview opening stock"}
            </button>
            <button type="button" className="primary" onClick={() => runOpening(false, true)} disabled={opening.busy}>
              Apply to all products
            </button>
          </div>
        </div>
        <label className="psr-check">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Also save results that are negative
        </label>

        {opening.error && <div className="psr-error" role="alert">{opening.error}</div>}

        {opening.result && (
          <div className="psr-opening-result">
            <p>
              {opening.result.dryRun
                ? <>Preview only, nothing saved yet. <strong>{opening.result.updated}</strong> of {opening.result.productsWithNoPurchases} products with no purchases would change.</>
                : <>Saved. <strong>{opening.result.updated}</strong> products updated.</>}
              {" "}{opening.result.alreadyCorrect} already correct
              {opening.result.skippedNegative > 0 && <>, {opening.result.skippedNegative} skipped because the result was negative</>}.
            </p>

            {opening.result.productsWithNoPurchases === 0 && (
              <p className="sub">
                No products matched. Every product in this scope has a purchase entry, and this update only applies to products with no purchase entry at all.
              </p>
            )}
            {opening.result.updated === 0 && opening.result.skippedNegative > 0 && (
              <p className="sub">
                The skipped products came out negative, which usually means their stock, sales or returns don't add up. Tick "Also save results that are negative" to save them anyway.
              </p>
            )}

            {opening.result.changes?.length > 0 && (
              <div className="psr-tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="n">Old opening</th>
                      <th className="n">In stock table</th>
                      <th className="n">Sold</th>
                      <th className="n">Returned</th>
                      <th className="n">New opening</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opening.result.changes.slice(0, 10).map((c) => (
                      <tr key={c.productId}>
                        <td><strong>{c.productName}</strong><span className="sub">{c.barcode}</span></td>
                        <td className="n">{fmtQty(c.oldOpening)}</td>
                        <td className="n">{fmtQty(c.storedQty)}</td>
                        <td className="n">{fmtQty(c.soldQty)}</td>
                        <td className="n">{fmtQty(c.returnedQty)}</td>
                        <td className="n"><strong>{fmtQty(c.newOpening)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {opening.result.changes?.length > 10 && (
              <span className="sub">Showing the first 10 changes.</span>
            )}

            <div className="psr-actions">
              {opening.result.dryRun && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => runOpening(false)}
                  disabled={opening.busy || opening.result.updated === 0}
                >
                  Save to products
                </button>
              )}
              <button type="button" onClick={() => setOpening({ busy: false, result: null, error: "" })}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </section>

      {error && <div className="psr-error" role="alert">{error}</div>}

      <div className="psr-tablewrap" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th className="n">Opening</th>
              <th className="n">Purchased</th>
              <th className="n">Sold</th>
              <th className="n">Returned</th>
              <th className="n">In stock table</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              return (
                <tr key={p.productId}>
                  <td>
                    <strong>{p.productName}</strong>
                    <span className="sub">{p.barcode}{p.productCode ? ` (${p.productCode})` : ""}</span>
                  </td>
                  <td>
                    {p.categoryName ?? p.categoryId}
                    <span className="sub">{p.subCategoryName ?? p.subCategoryId}</span>
                  </td>
                  <td className="n">
                    {fmtQty(p.openingStock)}
                  </td>
                  <td className="n">{fmtQty(p.purchaseQty)}</td>
                  <td className="n">{fmtQty(p.salesQty)}</td>
                  <td className="n">{fmtQty(p.returnQty)}</td>
                  <td className="n">{fmtQty(p.storedQty)}</td>
                </tr>
              );
            })}
            {!loading && !error && items.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No products match these filters. Clear a filter or check the barcode.
                </td>
              </tr>
            )}
            {loading && items.length === 0 && (
              <tr><td colSpan={7} className="empty">Loading stock…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <footer className="psr-pager">
          <span>
            {data.totalCount} products · page {data.page} of {Math.max(data.totalPages, 1)}
          </span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
          <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button disabled={page >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
        </footer>
      )}
    </div>
  );
}

const css = `
.psr { --ink:#1b2a2f; --muted:#5d6b70; --line:#d9e0e2; --bg:#f6f8f8; --card:#fff; --accent:#0f6b63; --bad:#b3261e; --warn:#8a5a00;
  font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); background: var(--bg); min-height: 100vh; padding: 24px; box-sizing: border-box; }
.psr * { box-sizing: border-box; }
.psr-head h1 { margin: 0; font-size: 26px; letter-spacing: -0.01em; }
.psr-head p { margin: 4px 0 20px; color: var(--muted); }
.psr-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
.psr-filters label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); width: 190px; }
.psr-filters label.grow { flex: 1; min-width: 200px; width: auto; }
.psr input, .psr select { height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; font-size: 14px; color: var(--ink); background: #fff; }
.psr input:focus-visible, .psr select:focus-visible, .psr button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.psr button { height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); font-size: 14px; cursor: pointer; }
.psr button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.psr button:disabled { opacity: .45; cursor: not-allowed; }
.psr-actions { display: flex; gap: 8px; }
.psr-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
.psr-totals div { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; }
.psr-totals dt { font-size: 13px; color: var(--muted); }
.psr-totals dd { margin: 2px 0 0; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.psr-opening { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin: 16px 0; }
.psr-opening-head { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.psr-opening-result { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.psr-opening-result p { margin: 0; }
.psr-opening .psr-tablewrap { margin-top: 0; }
.psr-check { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--muted); }
.psr-check input { height: auto; }
.psr-error { margin: 12px 0; padding: 12px 16px; border: 1px solid var(--bad); color: var(--bad); background: #fdf0ef; border-radius: 8px; }
.psr-tablewrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-top: 16px; }
.psr-tablewrap[aria-busy="true"] { opacity: .6; }
.psr table { width: 100%; border-collapse: collapse; font-size: 14px; }
.psr th, .psr td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.psr th { background: #eef2f2; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
.psr .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.psr .sub { display: block; font-size: 12px; color: var(--muted); }
.psr .empty { text-align: center; color: var(--muted); padding: 32px; }
.psr-pager { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 14px; color: var(--muted); font-size: 14px; }
.psr-pager span { margin-right: auto; }
@media (max-width: 700px) { .psr { padding: 14px; } .psr-filters label { width: 100%; } }
`;