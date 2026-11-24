import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getJson } from "./storeApi";
import "./printBill.css";

// Printable dispatch bill (delivery note) for one transfer, opened from DispatchSection.jsx.
//
// Uses one endpoint of StoreController:
//   GET api/Store/GetTransferBill?storeId=&transferId=
// Shown in a full-screen overlay. "Print" prints only the bill (see printBill.css); "Close" goes back.
// The bill lists goods and quantities only, because transfers carry no prices.

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "–";

const fmtQty = (n) => (n == null ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 }));

function Party({ label, party }) {
  return (
    <div className="pb-party">
      <div className="pb-label">{label}</div>
      <div className="pb-party-name">{party.name || `${party.type} #${party.id}`}</div>
      <div className="pb-party-type">{party.type}</div>
      {party.address ? <div className="pb-party-address">{party.address}</div> : null}
    </div>
  );
}

export default function PrintBill({ session, transferId, onClose }) {
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);

  const load = async (signal) => {
    setError("");
    setBill(null);
    try {
      setBill(await getJson(`/api/Store/GetTransferBill?storeId=${session.storeId}&transferId=${transferId}`, signal));
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferId]);

  // Escape closes, focus moves into the dialog, and the page behind does not scroll
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const showReceived = bill?.items.some((i) => i.receivedQty != null);

  return createPortal(
    <div className="pb-portal">
      <div className="pb-overlay" role="dialog" aria-modal="true" aria-label="Dispatch bill" tabIndex={-1} ref={dialogRef}>
        <div className="pb-toolbar">
          <button type="button" className="pb-btn pb-btn-primary" disabled={!bill} onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="pb-btn" onClick={onClose}>Close</button>
        </div>

        {error && (
          <div className="pb-message" role="alert">
            <p>{error}</p>
            <button type="button" className="pb-btn" onClick={() => load()}>Try again</button>
          </div>
        )}

        {!bill && !error && <p className="pb-message" aria-busy="true">Preparing the bill…</p>}

        {bill && (
          <article className="pb-sheet">
            <header className="pb-head">
              <div>
                <h1 className="pb-title">Dispatch Note</h1>
                <div className="pb-sub">Goods dispatch bill</div>
              </div>
              <dl className="pb-meta">
                <div><dt>Bill no.</dt><dd>{bill.transferNo || `#${bill.transferId}`}</dd></div>
                <div><dt>Date</dt><dd>{fmtDateTime(bill.dispatchedAt)}</dd></div>
                <div><dt>Status</dt><dd>{bill.status}</dd></div>
              </dl>
            </header>

            <section className="pb-parties">
              <Party label="From" party={bill.from} />
              <Party label="To" party={bill.to} />
            </section>

            <table className="pb-table">
              <thead>
                <tr>
                  <th scope="col" className="pb-sno">#</th>
                  <th scope="col">Product</th>
                  <th scope="col">Barcode</th>
                  <th scope="col" className="pb-num">Qty sent</th>
                  {showReceived && <th scope="col" className="pb-num">Qty received</th>}
                </tr>
              </thead>
              <tbody>
                {bill.items.map((i, n) => (
                  <tr key={i.itemId}>
                    <td className="pb-sno">{n + 1}</td>
                    <td>Product {i.productId}</td>
                    <td>{i.barcode || "–"}</td>
                    <td className="pb-num">{fmtQty(i.dispatchedQty)}</td>
                    {showReceived && <td className="pb-num">{fmtQty(i.receivedQty)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    Total ({bill.productCount} {bill.productCount === 1 ? "product" : "products"})
                  </td>
                  <td className="pb-num">{fmtQty(bill.totalDispatchedQty)}</td>
                  {showReceived && <td />}
                </tr>
              </tfoot>
            </table>

            {bill.remarks ? (
              <section className="pb-remarks">
                <div className="pb-label">Note</div>
                <p>{bill.remarks}</p>
              </section>
            ) : null}

            <footer className="pb-signs">
              <div className="pb-sign">
                <div className="pb-sign-line" />
                Dispatched by{bill.dispatchedBy ? `: ${bill.dispatchedBy}` : ""}
              </div>
              <div className="pb-sign">
                <div className="pb-sign-line" />
                Received by{bill.receivedBy ? `: ${bill.receivedBy}` : " (name and signature)"}
              </div>
            </footer>
          </article>
        )}
      </div>
    </div>,
    document.body
  );
}
