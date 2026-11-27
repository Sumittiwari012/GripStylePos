import { useState } from "react";
import { api, qty } from "./api";
import { Badge, BarcodeInput, Card, ErrorBox, Loading, ProductMeta, useLoad } from "./ui";
import { HistoryDialog } from "./Panels";
import { ReviewTag } from "./StatusTree";

// Incharge "To verify" tab: the products the managers HAVE counted but you have not verified yet,
// shown the same way as the Pending tab: categories > sub categories > barcodes.
//
// No backend change. It reads GET /tree (category list) and, when a category is opened,
// GET /tree/{categoryId} (same two calls StatusTree and PendingPanel use).
//
//   To verify = counted (Matched / Short / Excess) and not yet verified or sent back.
//   A category is listed while it has at least one product to verify.
//   This tab is read only. Verify / Send back stay in Products.

const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";
const rsOf = (it) => (it.reviewStatus && it.reviewStatus !== "None" ? it.reviewStatus : "None");
const isToVerify = (it) => isDone(it.status) && rsOf(it) === "None";
// counted - verified - sent back (sent back products are counted products too)
const toVerifyOf = (x) => Math.max((x.done || 0) - (x.verified || 0) - (x.sentBack || 0), 0);

export function VerifyPendingPanel({ auditId, refreshKey }) {
  const [ver, setVer] = useState(0);
  const summary = useLoad(() => api(`/${auditId}/tree`), [auditId, refreshKey, ver]);
  const data = summary.data;
  const list = [...(data?.pending ?? []), ...(data?.completed ?? [])]
    .filter((c) => toVerifyOf(c) > 0)
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  const total = list.reduce((n, c) => n + toVerifyOf(c), 0);

  return (
    <Card
      title="Waiting for verification"
      right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={() => setVer((v) => v + 1)}>Refresh</button>}
    >
      <ErrorBox error={summary.error} onRetry={summary.reload} />
      {summary.loading && !data ? <Loading /> : data && (
        <>
          <p className="au-muted">
            Products the managers have counted that you have not verified yet. Open a category to see its sub categories and barcodes.
            {list.length > 0 && ` ${total} product(s) to verify in ${list.length} categor${list.length === 1 ? "y" : "ies"}.`}
          </p>
          {list.length === 0 && <p className="au-muted">Nothing waiting for verification.</p>}
          {list.map((c) => (
            <VerifyCategory key={c.categoryId} cat={c} auditId={auditId} ver={ver} />
          ))}
        </>
      )}
    </Card>
  );
}

function VerifyCategory({ cat, auditId, ver }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="au-group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {cat.categoryName}
        <span className="au-chip">{toVerifyOf(cat)} to verify of {cat.total}</span>
        {cat.verified > 0 && <span className="au-chip au-chip-ok">{cat.verified} verified</span>}
        {cat.sentBack > 0 && <span className="au-chip au-chip-bad">{cat.sentBack} sent back</span>}
      </summary>
      {open && <VerifyBody cat={cat} auditId={auditId} ver={ver} />}
    </details>
  );
}

function VerifyBody({ cat, auditId, ver }) {
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}/tree/${cat.categoryId}`), [auditId, cat.categoryId, ver]);
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const t = q.trim().toLowerCase();
  const pass = (it) => isToVerify(it) && (!t || it.barcode.toLowerCase().includes(t) || it.productName.toLowerCase().includes(t));

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
              <span className="au-chip">{sg.items.filter(isToVerify).length} to verify of {sg.total}</span>
            </h3>
            <div className="au-scroll">
              <table className="au-table au-table-tight">
                <thead>
                  <tr>
                    <th>Barcode / product</th>
                    <th className="au-num">System</th>
                    <th className="au-num">Counted</th>
                    <th className="au-num">Variance</th>
                    <th>Status</th>
                    <th>Reason / note</th>
                    <th>Counted by</th>
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
                      <td className="au-num">{qty(it.physicalQty)}</td>
                      <td className={`au-num ${it.varianceQty < 0 ? "au-neg" : it.varianceQty > 0 ? "au-pos" : ""}`}>{qty(it.varianceQty)}</td>
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
        <p className="au-muted">{t ? "No product matches." : "Nothing to verify in this category."}</p>
      )}

      {dlg && <HistoryDialog who="member" auditId={auditId} item={dlg} onClose={() => setDlg(null)} />}
    </>
  );
}
