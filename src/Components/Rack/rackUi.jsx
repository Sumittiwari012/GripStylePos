import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react"; // npm i qrcode.react
import { qty } from "../audit/api";
import { BarcodeInput, Modal, Stat } from "../audit/ui";
import { RACK_BASE, rackSession } from "./rackApi";
import "../audit/audit.css";
import "./rack.css";

// Same markup and classes as Shell in ui.jsx. A separate component because
// Shell says "Stock audit" and logs out through the audit API.
// admin = true shows the "Rack manager" bar with a Log out button.
export function RackShell({ title, subtitle, actions, back, admin, children }) {
  const nav = useNavigate();
  const logout = () => {
    rackSession.clear();
    nav(`${RACK_BASE}/login`);
  };
  return (
    <div className="au">
      <header className="au-top">
        <div className="au-brand">Racks</div>
        {admin && (
          <div className="au-who">
            <span>Rack manager</span>
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

export const rackPlace = (r) => [r.godown, r.section, r.description].filter(Boolean).join(", ");

// Products on a rack, split by quantity:  In stock (above zero)  |  Out of stock (zero).
// selectable = tick boxes for moving products (manager only).
export function StockTable({ items, selectable = false, selected, onToggle, onToggleMany }) {
  const [section, setSection] = useState("in");
  const [q, setQ] = useState("");

  const inStock = items.filter((i) => i.quantity > 0);
  const out = items.filter((i) => i.quantity <= 0);
  const t = q.trim().toLowerCase();
  const list = (section === "in" ? inStock : out).filter(
    (i) =>
      !t ||
      i.barcode?.toLowerCase().includes(t) ||
      i.productName?.toLowerCase().includes(t) ||
      i.productCode?.toLowerCase().includes(t)
  );
  const allPicked = selectable && list.length > 0 && list.every((i) => selected.has(i.productId));

  return (
    <>
      <nav className="au-tabs" role="tablist">
        <button role="tab" aria-selected={section === "in"} className={section === "in" ? "on" : ""} onClick={() => setSection("in")}>
          In stock ({inStock.length})
        </button>
        <button role="tab" aria-selected={section === "out"} className={section === "out" ? "on" : ""} onClick={() => setSection("out")}>
          Out of stock ({out.length})
        </button>
      </nav>

      <div className="au-row" style={{ margin: ".5rem 0" }}>
        <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={setQ} />
      </div>

      {items.length === 0 ? (
        <p className="au-muted">No products on this rack yet.</p>
      ) : list.length === 0 ? (
        <p className="au-muted">
          {t ? "No product matches the filter." : section === "in" ? "Nothing in stock on this rack." : "Nothing is out of stock on this rack."}
        </p>
      ) : (
        <div className="au-scroll">
          <table className="au-table au-table-tight">
            <thead>
              <tr>
                {selectable && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={allPicked}
                      onChange={() => onToggleMany(list.map((i) => i.productId), !allPicked)}
                    />
                  </th>
                )}
                <th>Barcode / product</th>
                <th>Size</th>
                <th>Colour</th>
                <th className="au-num">MRP</th>
                <th className="au-num">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.productId}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${i.productName}`}
                        checked={selected.has(i.productId)}
                        onChange={() => onToggle(i.productId)}
                      />
                    </td>
                  )}
                  <td>
                    <strong>{i.barcode}</strong>
                    <small className="au-block au-muted">{i.productName}</small>
                  </td>
                  <td>{i.size || "–"}</td>
                  <td>{i.colour || "–"}</td>
                  <td className="au-num">{Number(i.mrp).toFixed(2)}</td>
                  <td className={`au-num ${i.quantity <= 0 ? "au-neg" : ""}`}>{qty(i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// QR code for a rack. It holds the public page address, so any phone camera
// opens that rack's stock list. Download gives a PNG with the rack code under it.
export function RackQr({ rack }) {
  const wrap = useRef(null);
  const url = `${window.location.origin}${RACK_BASE}/${rack.id}`;

  const download = () => {
    const src = wrap.current.querySelector("canvas");
    const pad = 24;
    const out = document.createElement("canvas");
    out.width = src.width + pad * 2;
    out.height = src.height + pad * 2 + 40;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    ctx.fillStyle = "#16233b";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(rack.rackCode, out.width / 2, src.height + pad + 32);

    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `rack-${rack.rackCode}.png`;
    a.click();
  };

  return (
    <div className="au-qr">
      <div ref={wrap}>
        <QRCodeCanvas value={url} size={200} level="M" />
      </div>
      <div className="au-qr-side">
        <p className="au-muted" style={{ margin: 0 }}>
          Print this and stick it on the rack. Anyone who scans it sees what is on the rack and how many are left.
        </p>
        <small className="au-muted" style={{ wordBreak: "break-all" }}>{url}</small>
        <button className="au-btn" onClick={download}>Download QR code</button>
      </div>
    </div>
  );
}

// Result of "which rack is this barcode on?"  (GET /api/Rack/Locate)
// rackHref(rack) gives the page to open: manager page or public page.
export function LocateModal({ result, rackHref, onClose }) {
  return (
    <Modal title={result.product.productName} onClose={onClose}>
      <LocateResult result={result} rackHref={rackHref} />
    </Modal>
  );
}

// The same result without the dialog, for pages that show it inline.
export function LocateResult({ result, rackHref }) {
  const { product: p, quantity, rack } = result;
  return (
    <>
      <p className="au-muted">
        {[p.barcode, p.size && `Size ${p.size}`, p.colour].filter(Boolean).join(" · ")}
      </p>
      <div className="au-stats">
        <Stat label="In stock" value={qty(quantity)} tone={quantity > 0 ? "ok" : "short"} />
        <Stat label="MRP" value={Number(p.mrp).toFixed(2)} />
      </div>
      {rack ? (
        <div className="au-banner">
          <div>
            <span className="au-codebox">{rack.rackCode}</span> <strong>{rack.rackName}</strong>
            <small className="au-muted au-block">{[rack.godown, rack.section].filter(Boolean).join(", ") || "No location details"}</small>
          </div>
          <Link className="au-btn au-btn-primary" to={rackHref(rack)}>Open rack</Link>
        </div>
      ) : (
        <div className="au-banner au-banner-warn">This product has not been placed on a rack yet.</div>
      )}
    </>
  );
}
