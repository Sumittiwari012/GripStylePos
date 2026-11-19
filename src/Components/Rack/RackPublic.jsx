import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, ErrorBox, FindBar, Loading, ScanButton, ScanDialog, useLoad, useToast } from "../Audit/ui";
import { parseRackId, RACK_BASE, RackApi } from "./rackApi";
import { LocateModal, LocateResult, RackShell, rackPlace, StockTable } from "./rackUi";

// ═════════════ /rack/scan : scan anything ═════════════
// The camera opens at once. One scan does the right thing:
//   rack QR code    -> opens that rack
//   product barcode -> shows its quantity and which rack it is on, then "Scan next"
export function RackScan() {
  const nav = useNavigate();
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState("barcode"); // typed entry: "barcode" | "rack"
  const [typed, setTyped] = useState("");

  const findBarcode = async (code) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await RackApi.locate(code));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const openByCode = async (code) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await RackApi.byCode(code);
      nav(`${RACK_BASE}/${r.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const onDetect = (code) => {
    setScanning(false);
    const rackId = parseRackId(code);
    if (rackId) nav(`${RACK_BASE}/${rackId}`);
    else findBarcode(code);
  };

  const submitTyped = (e) => {
    e.preventDefault();
    const v = typed.trim();
    if (!v) return;
    if (scope === "rack") openByCode(v);
    else findBarcode(v);
  };

  const next = () => {
    setResult(null);
    setError(null);
    setScanning(true);
  };

  return (
    <RackShell title="Scan" subtitle="Scan a product barcode to see where it is, or a rack QR code to see what is on it.">
      {busy && <Loading what="Looking it up…" />}
      <ErrorBox error={error} />
      {result && (
        <Card title={result.product.productName}>
          <LocateResult result={result} rackHref={(r) => `${RACK_BASE}/${r.id}`} />
        </Card>
      )}
      {!scanning && !busy && (
        <div className="au-row">
          <button className="au-btn au-btn-primary" onClick={next}>{result || error ? "Scan next" : "Start scanning"}</button>
        </div>
      )}
      {!scanning && (
        <Card title="Type it instead">
          <div className="au-seg" role="group" aria-label="What to look up">
            <button type="button" className={scope === "barcode" ? "on" : ""} onClick={() => setScope("barcode")}>Product barcode</button>
            <button type="button" className={scope === "rack" ? "on" : ""} onClick={() => setScope("rack")}>Rack code</button>
          </div>
          <form className="au-scanrow" style={{ marginTop: ".6rem" }} onSubmit={submitTyped}>
            <input
              className="au-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={scope === "barcode" ? "Type a barcode" : "Type the rack code, e.g. R-A1"}
              aria-label={scope === "barcode" ? "Barcode" : "Rack code"}
              autoComplete="off"
            />
            <button className="au-btn au-btn-primary" disabled={!typed.trim() || busy}>{scope === "barcode" ? "Find" : "Open"}</button>
          </form>
        </Card>
      )}
      {scanning && <ScanDialog onClose={() => setScanning(false)} onDetect={onDetect} />}
    </RackShell>
  );
}

// No login on these two pages. Anyone with a rack's QR code can see what is on it.

// ═════════════ /rack : scan a rack QR code, or find which rack a barcode is on ═════════════
export function RackFind() {
  const nav = useNavigate();
  const [toast, notify] = useToast();
  const [found, setFound] = useState(null);
  const [typed, setTyped] = useState("");

  const openRack = (text) => {
    const id = parseRackId(text);
    if (!id) return notify("That is not a rack QR code.", "err");
    nav(`${RACK_BASE}/${id}`);
  };

  const openByCode = async (code) => {
    try {
      const r = await RackApi.byCode(code);
      nav(`${RACK_BASE}/${r.id}`);
    } catch (e) {
      notify(e.message, "err");
    }
  };

  const locate = async (code) => {
    try { setFound(await RackApi.locate(code)); } catch (e) { notify(e.message, "err"); }
  };

  return (
    <RackShell title="Check a rack" subtitle="See what is on a rack and how many are left.">
      {toast}

      <Card title="Scan">
        <p className="au-muted">Scan a product barcode to see where it is, or a rack QR code to see what is on it.</p>
        <div className="au-row">
          <Link className="au-btn au-btn-primary" to={`${RACK_BASE}/scan`}>Open scanner</Link>
          <ScanButton onScan={(c) => openRack(c)} className="au-btn">Scan rack QR code only</ScanButton>
        </div>
        <form className="au-scanrow" style={{ marginTop: ".8rem" }} onSubmit={(e) => { e.preventDefault(); openByCode(typed.trim()); }}>
          <input
            className="au-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type the rack code"
            aria-label="Rack code"
          />
          <button className="au-btn" disabled={!typed.trim()}>Open</button>
        </form>
      </Card>

      <Card title="Find a product">
        <p className="au-muted">Type or scan a product barcode to see which rack it is on.</p>
        <FindBar onFind={locate} placeholder="Type or scan a barcode" />
      </Card>

      {found && <LocateModal result={found} rackHref={(r) => `${RACK_BASE}/${r.id}`} onClose={() => setFound(null)} />}
    </RackShell>
  );
}

// ═════════════ /rack/:rackId : one rack, products split into in stock and out of stock ═════════════
export function RackView() {
  const { rackId } = useParams();
  const { data, error, loading, reload } = useLoad(() => RackApi.scan(rackId), [rackId]);
  const back = { to: RACK_BASE, label: "Check another rack" };

  if (loading && !data) return <RackShell title="Rack" back={back}><Loading /></RackShell>;
  if (error) return <RackShell title="Rack" back={back}><ErrorBox error={error} onRetry={reload} /></RackShell>;

  const { rack, items } = data;
  const inCount = items.filter((i) => i.quantity > 0).length;

  return (
    <RackShell
      title={rack.rackName || `Rack ${rack.rackCode}`}
      subtitle={rackPlace(rack) || undefined}
      back={back}
      actions={<button className="au-btn" onClick={reload}>Refresh</button>}
    >
      <div className="au-banner">
        <div>
          <span className="au-codebox">{rack.rackCode}</span>
          <span className="au-chip">{items.length} products</span>
          <span className="au-chip">{inCount} in stock</span>
          <span className="au-chip">{items.length - inCount} out of stock</span>
        </div>
      </div>
      <Card title="Products">
        <StockTable items={items} />
      </Card>
    </RackShell>
  );
}
