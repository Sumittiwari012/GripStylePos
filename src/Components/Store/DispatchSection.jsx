import { useCallback, useEffect, useState } from "react";
import { getJson } from "./storeApi";
import { ReceiveForm, CancelForm } from "./TransferActions";
import "./dispatchSection.css";

// "Dispatch" view of the store panel (used inside the Dispatch & receive tab, no route of its own).
//
// Uses one endpoint of StoreController:
//   GET api/Store/GetGodownDispatches?storeId=
//     outgoing  products coming OUT of the godown linked to this store
//     incoming  products dispatched TO that godown
// Each transfer comes with its products, so expanding a row needs no extra request.
// The server says what may be done with each transfer (canReceive / canCancel):
//   incoming: confirm receipt -> Received      outgoing: cancel is the only change allowed

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

const party = (type, name, id) => `${type} ${name || `#${id}`}`;

function TransferList({ title, emptyText, transfers, direction, session, onChanged }) {
  const [openId, setOpenId] = useState(null);

  return (
    <div className="ds-group">
      <h3 className="ds-group-title">
        {title} <span className="ds-count">{transfers.length}</span>
      </h3>

      {transfers.length === 0 ? (
        <p className="ds-empty">{emptyText}</p>
      ) : (
        <ul className="ds-list">
          {transfers.map((t) => {
            const open = openId === t.transferId;
            const panelId = `ds-items-${direction}-${t.transferId}`;
            const other =
              direction === "out"
                ? `To ${party(t.toType, t.toName, t.toId)}`
                : `From ${party(t.fromType, t.fromName, t.fromId)}`;
            return (
              <li key={t.transferId}>
                <button
                  type="button"
                  className="ds-row"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : t.transferId)}
                >
                  <span className="ds-row-main">
                    <span className="ds-no">
                      {t.transferNo || `Transfer ${t.transferId}`}
                      <span className={`ds-status ds-status-${String(t.status || "").toLowerCase()}`}>{t.status}</span>
                    </span>
                    <span className="ds-other">{other}</span>
                    <span className="ds-date">
                      {t.dispatchedAt ? `Dispatched ${fmtDateTime(t.dispatchedAt)}` : "Not dispatched yet"}
                    </span>
                  </span>
                  <span className="ds-row-stats">
                    <span>{t.productCount} {t.productCount === 1 ? "product" : "products"}</span>
                    <span>{fmtQty(t.totalDispatchedQty)} qty</span>
                  </span>
                  <span className="ds-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
                </button>

                {open && (
                  <div id={panelId} className="ds-items">
                    {t.remarks ? <p className="ds-remarks">Note: {t.remarks}</p> : null}
                    {t.items.length === 0 ? (
                      <p className="ds-empty">No products on this transfer.</p>
                    ) : (
                      <div className="ds-table-wrap">
                        <table className="ds-table">
                          <thead>
                            <tr>
                              <th scope="col">Product</th>
                              <th scope="col">Barcode</th>
                              <th scope="col" className="ds-num">Dispatched</th>
                              <th scope="col" className="ds-num">Received</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.items.map((i) => (
                              <tr key={i.itemId}>
                                <td>
                                  Product {i.productId}
                                  {i.remarks ? <div className="ds-item-note">{i.remarks}</div> : null}
                                </td>
                                <td>{i.barcode || "–"}</td>
                                <td className="ds-num">{fmtQty(i.dispatchedQty)}</td>
                                <td className="ds-num">{fmtQty(i.receivedQty)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {t.receivedAt ? (
                      <p className="ds-date">
                        Received {fmtDateTime(t.receivedAt)}
                        {t.receivedBy ? ` by ${t.receivedBy}` : ""}
                      </p>
                    ) : null}
                    {t.canReceive && <ReceiveForm transfer={t} session={session} onDone={onChanged} />}
                    {t.canCancel && <CancelForm transfer={t} session={session} onDone={onChanged} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function DispatchSection({ session }) {
  const storeId = session.storeId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  // initial = first load (shows the loading card); later loads keep the list on screen while refreshing
  const load = useCallback(
    async (signal, initial = false) => {
      if (initial) setLoading(true);
      setError("");
      try {
        setData(await getJson(`/api/Store/GetGodownDispatches?storeId=${storeId}`, signal));
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

  const changed = (message) => {
    setNotice(message);
    load();
  };

  if (loading) {
    return (
      <section className="sp-card" aria-busy="true">
        <h2 className="sp-card-title">Dispatch</h2>
        <p>Loading dispatches…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sp-card">
        <h2 className="sp-card-title">Dispatch</h2>
        <p className="ds-error" role="alert">{error}</p>
        <button type="button" className="ds-btn" onClick={() => load(undefined, true)}>Try again</button>
      </section>
    );
  }

  if (data?.godownId == null) {
    return (
      <section className="sp-card sp-empty">
        <h2 className="sp-card-title">Dispatch</h2>
        <p>{data?.message || "No godown is linked to this store."}</p>
      </section>
    );
  }

  return (
    <section className="sp-card" aria-labelledby="ds-title">
      <div className="ds-head">
        <h2 id="ds-title" className="sp-card-title">Dispatch</h2>
        <button type="button" className="ds-btn" onClick={() => { setNotice(""); load(); }}>Refresh</button>
      </div>

      {notice ? <p className="ds-notice" role="status">{notice}</p> : null}

      <TransferList
        title="Coming out of the godown"
        emptyText="Nothing has been dispatched out of this godown."
        transfers={data.outgoing}
        direction="out"
        session={session}
        onChanged={changed}
      />
      <TransferList
        title="Dispatched to the godown"
        emptyText="Nothing has been dispatched to this godown."
        transfers={data.incoming}
        direction="in"
        session={session}
        onChanged={changed}
      />
    </section>
  );
}
