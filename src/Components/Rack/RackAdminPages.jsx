import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, ErrorBox, Field, FindBar, Loading, ScanButton, useLoad, useToast } from "../Audit/ui";
import { RACK_BASE, RackApi } from "./rackApi";
import { LocateModal, RackPrintSheet, RackQr, RackShell, rackPlace, StockTable } from "./rackUi";

const ALL_RACKS = { to: `${RACK_BASE}/manage`, label: "All racks" };

// ═════════════ Manager home: find a barcode, create + list racks ═════════════
export function RackHome() {
  const { data, error, loading, reload } = useLoad(() => RackApi.getRacks());
  const [toast, notify] = useToast();
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ rackCode: "", rackName: "", godown: "", section: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [found, setFound] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);

  const toggleRack = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allPicked = !!data?.length && data.every((r) => picked.has(r.id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(data.map((r) => r.id)));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await RackApi.createRack(form);
      nav(`${RACK_BASE}/manage/${r.rackId}`); // open it: the QR code is ready to download
    } catch (x) { setErr(x); setBusy(false); }
  };

  const locate = async (code) => {
    try { setFound(await RackApi.locate(code)); } catch (e) { notify(e.message, "err"); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <RackShell
      admin
      title="Racks"
      subtitle="Create racks, put products on them and print their QR codes."
      actions={<button className="au-btn au-btn-primary" onClick={() => setShow(!show)}>{show ? "Cancel" : "New rack"}</button>}
    >
      {toast}
      <FindBar onFind={locate} placeholder="Type or scan a barcode to see which rack it is on" />

      {show && (
        <Card title="New rack">
          <form className="au-form au-grid" onSubmit={create}>
            <Field label="Rack code" hint="Short code painted or printed on the shelf, e.g. R-A1.">
              <input className="au-input au-code" value={form.rackCode} maxLength={50} onChange={set("rackCode")} required autoFocus />
            </Field>
            <Field label="Name"><input className="au-input" value={form.rackName} maxLength={100} onChange={set("rackName")} placeholder="Men's T-shirts" /></Field>
            <Field label="Godown"><input className="au-input" value={form.godown} onChange={set("godown")} /></Field>
            <Field label="Section"><input className="au-input" value={form.section} onChange={set("section")} placeholder="Aisle 2, shelf 3" /></Field>
            <div className="au-grid-full">
              <Field label="Notes (optional)"><textarea className="au-input" rows={2} value={form.description} onChange={set("description")} /></Field>
              <ErrorBox error={err} />
              <button className="au-btn au-btn-primary" disabled={busy}>{busy ? "Creating…" : "Create rack"}</button>
            </div>
          </form>
        </Card>
      )}

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length === 0 ? (
        <Card><p>You have no racks yet. Create one, then add products to it by barcode.</p></Card>
      ) : (
        <>
          <div className="au-selbar">
            <label>
              <input type="checkbox" checked={allPicked} onChange={toggleAll} /> Select all
            </label>
            <button className="au-btn au-btn-primary au-btn-sm" disabled={picked.size === 0} onClick={() => setPrinting(true)}>
              Print QR codes ({picked.size})
            </button>
          </div>
          <div className="au-list">
            {data?.map((r) => (
              <div key={r.id} className="au-selrow">
                <input
                  type="checkbox"
                  aria-label={`Select rack ${r.rackCode}`}
                  checked={picked.has(r.id)}
                  onChange={() => toggleRack(r.id)}
                />
                <Link to={`${RACK_BASE}/manage/${r.id}`} className="au-listitem">
                  <div>
                    <span className="au-codebox">{r.rackCode}</span> <strong>{r.rackName || "Unnamed rack"}</strong>
                    <div className="au-muted">{[r.godown, r.section].filter(Boolean).join(", ") || "No location details"}</div>
                  </div>
                  <div className="au-listitem-r">
                    <span className="au-chip">{r.productCount} {r.productCount === 1 ? "product" : "products"}</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {found && <LocateModal result={found} rackHref={(r) => `${RACK_BASE}/manage/${r.id}`} onClose={() => setFound(null)} />}
      {printing && (
        <RackPrintSheet
          racks={data.filter((r) => picked.has(r.id))}
          onDone={() => setPrinting(false)}
        />
      )}
    </RackShell>
  );
}

// ═════════════ Manager: one rack ═════════════
export function RackDetail() {
  const { rackId } = useParams();
  const id = Number(rackId);
  const nav = useNavigate();
  const [tick, setTick] = useState(0);
  const view = useLoad(() => RackApi.scan(id), [id, tick]); // { rack, items }
  const racks = useLoad(() => RackApi.getRacks(), [tick]);
  const [toast, notify] = useToast();
  const [busy, setBusy] = useState("");
  const [actErr, setActErr] = useState(null);
  const [barcode, setBarcode] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [moveTo, setMoveTo] = useState("");

  const refresh = () => { setPicked(new Set()); setTick((t) => t + 1); };

  const toggle = (pid) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  const toggleMany = (ids, on) =>
    setPicked((prev) => {
      const next = new Set(prev);
      ids.forEach((x) => (on ? next.add(x) : next.delete(x)));
      return next;
    });

  // Add a product to this rack by barcode (typed, USB scanner, or camera).
  const addBarcode = async (raw) => {
    const code = String(raw).trim();
    if (!code) return;
    setBusy("add"); setActErr(null);
    try {
      const p = await RackApi.findByBarcode(code);
      if (p.rack === id) { notify(`${p.productName} is already on this rack.`, "err"); return; }
      if (p.rack && p.rack !== 0) {
        const from = racks.data?.find((r) => r.id === p.rack)?.rackCode ?? `#${p.rack}`;
        if (!window.confirm(`${p.productName} is on rack ${from}. Move it to this rack?`)) return;
      }
      await RackApi.assignProducts(id, [p.id]);
      notify(`${p.productName} added`);
      setBarcode("");
      refresh();
    } catch (e) { setActErr(e); } finally { setBusy(""); }
  };

  const moveSelected = async () => {
    setBusy("move"); setActErr(null);
    try {
      await RackApi.assignProducts(Number(moveTo), [...picked]);
      notify(`${picked.size} product(s) moved`);
      refresh();
    } catch (e) { setActErr(e); } finally { setBusy(""); }
  };

  const moveEverything = async () => {
    const to = racks.data?.find((r) => r.id === Number(moveTo))?.rackCode;
    if (!window.confirm(`Move every product on this rack to ${to}?`)) return;
    setBusy("move"); setActErr(null);
    try {
      const r = await RackApi.moveAll(id, Number(moveTo));
      notify(`${r.count} product(s) moved`);
      refresh();
    } catch (e) { setActErr(e); } finally { setBusy(""); }
  };

  const removeRack = async () => {
    if (!window.confirm(`Delete rack ${view.data.rack.rackCode}? Its products stay in the system but are left without a rack.`)) return;
    setBusy("delete"); setActErr(null);
    try {
      await RackApi.deleteRack(id);
      nav(ALL_RACKS.to);
    } catch (e) { setActErr(e); setBusy(""); }
  };

  if (view.loading && !view.data) return <RackShell admin title="Rack" back={ALL_RACKS}><Loading /></RackShell>;
  if (view.error) return <RackShell admin title="Rack" back={ALL_RACKS}><ErrorBox error={view.error} onRetry={view.reload} /></RackShell>;

  const { rack, items } = view.data;
  const inCount = items.filter((i) => i.quantity > 0).length;
  const otherRacks = (racks.data || []).filter((r) => r.id !== id);

  return (
    <RackShell
      admin
      title={rack.rackName || `Rack ${rack.rackCode}`}
      subtitle={rackPlace(rack) || undefined}
      back={ALL_RACKS}
      actions={<button className="au-btn au-btn-danger" disabled={busy === "delete"} onClick={removeRack}>Delete rack</button>}
    >
      {toast}
      <ErrorBox error={actErr} />

      <div className="au-banner">
        <div>
          <span className="au-codebox">{rack.rackCode}</span>
          <span className="au-chip">{items.length} products</span>
          <span className="au-chip">{inCount} in stock</span>
          <span className="au-chip">{items.length - inCount} out of stock</span>
        </div>
        <div className="au-muted">Anyone with the QR code can view this rack. No login is needed.</div>
      </div>

      <Card title="QR code"><RackQr rack={rack} /></Card>

      <Card title="Add a product">
        <form className="au-scanrow" onSubmit={(e) => { e.preventDefault(); addBarcode(barcode); }}>
          <input
            className="au-input"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Type or scan a barcode"
            aria-label="Barcode to add"
            autoComplete="off"
          />
          <button className="au-btn au-btn-primary" disabled={!barcode.trim() || busy === "add"}>{busy === "add" ? "Adding…" : "Add"}</button>
          <ScanButton onScan={addBarcode} className="au-btn">Scan</ScanButton>
        </form>
        <p className="au-muted">If the product is on another rack, you are asked before it moves here.</p>
      </Card>

      <Card title="Products" right={<button className="au-btn au-btn-ghost au-btn-sm" onClick={refresh}>Refresh</button>}>
        <div className="au-moverow">
          <select className="au-input au-input-sm" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Destination rack">
            <option value="">Move to rack…</option>
            {otherRacks.map((r) => <option key={r.id} value={r.id}>{r.rackCode}{r.rackName ? ` (${r.rackName})` : ""}</option>)}
          </select>
          <button className="au-btn au-btn-primary au-btn-sm" disabled={!moveTo || picked.size === 0 || busy === "move"} onClick={moveSelected}>
            Move selected ({picked.size})
          </button>
          <button className="au-btn au-btn-sm" disabled={!moveTo || items.length === 0 || busy === "move"} onClick={moveEverything}>Move all</button>
        </div>
        <StockTable items={items} selectable selected={picked} onToggle={toggle} onToggleMany={toggleMany} />
      </Card>
    </RackShell>
  );
}