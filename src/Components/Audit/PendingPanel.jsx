import { useState } from "react";
import { api, qty } from "./api";
import { Badge, BarcodeInput, Card, ErrorBox, Loading, ProductMeta, useLoad } from "./ui";
import { HistoryDialog } from "./Panels";

// Incharge "Pending" tab: the work the managers have NOT done yet, shown the same way the
// manager sees it: Pending categories > sub categories > barcodes still to do.
//
// No backend change. It reads GET /tree (category list) and, when a category is opened,
// GET /tree/{categoryId} (same two calls StatusTree uses).
//
//   To do = Pending + OnHold (not counted yet). Counted products are not shown here.
//   A category is listed while it has at least one product to do.
//   This tab is read only. Counting / correcting / verifying stay in Products.

const isTodo = (s) => s === "Pending" || s === "OnHold";

export function PendingPanel({ auditId, refreshKey }) {
  const [ver, setVer] = useState(0);
  const summary = useLoad(() => api(`/${auditId}/tree`), [auditId, refreshKey, ver]);
  const data = summary.data;
  const list = (data?.pending ?? []).filter((c) => c.pending + c.onHold > 0);
  const toDoTotal = list.reduce((n, c) => n + c.pending + c.onHold, 0);

  return (
    <Card
      title="Pending work"
      right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setVer((v) => v + 1)}>Refresh</button>}
    >
      <ErrorBox error={summary.error} onRetry={summary.reload} />
      {summary.loading && !data ? <Loading /> : data && (
        <>
          <p className="au-muted">
            Products the managers have not counted yet (including sold out and negative stock products). Open a category to see its sub categories and barcodes.
            {list.length > 0 && ` ${toDoTotal} product(s) to do in ${list.length} categor${list.length === 1 ? "y" : "ies"}.`}
          </p>
          {list.length === 0 && <p className="au-muted">Nothing pending. Every product is counted.</p>}
          {list.map((c) => (
            <PendingCategory key={c.categoryId} cat={c} auditId={auditId} ver={ver} />
          ))}
        </>
      )}
    </Card>
  );
}

function PendingCategory({ cat, auditId, ver }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="au-group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {cat.categoryName}
        <span className="au-chip">{cat.pending + cat.onHold} to do of {cat.total}</span>
        {cat.pending > 0 && <span className="au-chip">{cat.pending} pending</span>}
        {cat.onHold > 0 && <span className="au-chip">{cat.onHold} on hold</span>}
        {cat.soldOut > 0 && <span className="au-chip">{cat.soldOut} sold out</span>}
        {cat.negative > 0 && <span className="au-chip">{cat.negative} negative</span>}
      </summary>
      {open && <PendingBody cat={cat} auditId={auditId} ver={ver} />}
    </details>
  );
}

function PendingBody({ cat, auditId, ver }) {
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}/tree/${cat.categoryId}`), [auditId, cat.categoryId, ver]);
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const t = q.trim().toLowerCase();
  const pass = (it) => isTodo(it.status) && (!t || it.barcode.toLowerCase().includes(t) || it.productName.toLowerCase().includes(t));

  return (
    <>
      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={setQ} />
      </div>

      {data.subCategories.map((sg) => {
        const items = sg.items.filter(pass);
        if (items.length === 0) return null;
        return (
          <div key={sg.subCategoryId} className="au-subgroup">
            <h3>
              {sg.subCategoryName}
              <span className="au-chip">{sg.total - sg.done} to do of {sg.total}</span>
            </h3>
            <div className="au-scroll">
              <table className="au-table au-table-tight">
                <thead>
                  <tr>
                    <th>Barcode / product</th>
                    <th className="au-num">System</th>
                    <th>Status</th>
                    <th>Note</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.verificationId}>
                      <td>
                        <strong>{it.barcode}</strong>
                        {it.stockKind !== "InStock" && <span className="au-chip">{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span>}
                        <small className="au-block au-muted">{it.productName}</small>
                        <ProductMeta mrp={it.mrp} size={it.size} />
                      </td>
                      <td className="au-num">{qty(it.systemQty)}</td>
                      <td><Badge status={it.status} /></td>
                      <td className="au-note">{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</td>
                      <td>{it.verifiedBy || "–"}</td>
                      <td className="au-rowactions au-rowactions-wrap">
                        <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setDlg(it)}>Records</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {data.subCategories.every((sg) => sg.items.filter(pass).length === 0) && (
        <p className="au-muted">{t ? "No product matches." : "Nothing pending in this category."}</p>
      )}

      {dlg && <HistoryDialog who="member" auditId={auditId} item={dlg} onClose={() => setDlg(null)} />}
    </>
  );
}
