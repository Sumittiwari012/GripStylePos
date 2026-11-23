import { useEffect, useRef, useState } from "react";
import { api, qty } from "./api";
import { Bar, Badge, BarcodeInput, ErrorBox, Loading, useLoad } from "./ui";

// ─────────────────────────────────────────────────────────────
// Card view for the Products tree (owner / incharge / manager).
//
//   category (opens as before)
//     └─ sub category cards   ← tap one
//          └─ product cards, one at a time: swipe left / right (or use Prev / Next)
//             Verify · Send back · Count · Correct … all the same actions as the table.
//
// After you Verify / Send back / Count a product, the deck moves to the next product by itself.
// ─────────────────────────────────────────────────────────────

const isDone = (s) => s === "Matched" || s === "Short" || s === "Excess";
const REVIEW_LABEL = { Verified: "Verified", SentBack: "Sent back" };
const FILTERS = [["all", "All"], ["todo", "To do"], ["done", "Counted"], ["back", "Sent back"]];

// ── table / card switch, remembered on this device ──
const KEY = "auditView";

export function useViewMode() {
  const [mode, setMode] = useState(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "card" || v === "table") return v;
    } catch { /* ignore */ }
    // no choice saved yet: phones start in card view
    return window.matchMedia?.("(max-width: 640px)").matches ? "card" : "table";
  });
  const set = (m) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };
  return [mode, set];
}

export function ViewToggle({ value, onChange }) {
  return (
    <div className="au-seg au-viewtoggle" role="group" aria-label="Layout">
      <button className={value === "table" ? "on" : ""} aria-pressed={value === "table"} onClick={() => onChange("table")}>Table</button>
      <button className={value === "card" ? "on" : ""} aria-pressed={value === "card"} onClick={() => onChange("card")}>Cards</button>
    </div>
  );
}

function ReviewChip({ state }) {
  if (!state || state === "None") return <span className="au-muted">–</span>;
  return <span className={`au-badge au-s-${state}`}>{REVIEW_LABEL[state] || state}</span>;
}

// Verify / Send back for a sub category or a whole category
function GroupReview({ perm, counted, verified, sentBack, label, onVerify, onSendBack }) {
  if (!perm.verify && !perm.sendBack) return null;
  return (
    <>
      {perm.verify && <button className="au-btn au-btn-sm" disabled={counted - verified <= 0} onClick={onVerify}>Verify{label}</button>}
      {perm.sendBack && <button className="au-btn au-btn-sm au-btn-danger" disabled={counted - sentBack <= 0} onClick={onSendBack}>Send back{label}</button>}
    </>
  );
}

export function CardBody({ cat, role, auditId, who, canAct, allowSentBack, perm, ver, doneTick, focus, onAction }) {
  const { data, error, loading, reload } = useLoad(() => api(`/${auditId}/tree/${cat.categoryId}`, { who }), [auditId, who, cat.categoryId, ver]);

  const [subId, setSubId] = useState(null); // null = list of sub category cards
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState("next");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(0);
  const touch = useRef(null);
  const tap = useRef(null);      // the product the person just acted on
  const advance = useRef(null);  // set once the action succeeded: move on when fresh data arrives
  const seen = useRef(null);
  const mine = !!focus && focus.categoryId === cat.categoryId;

  const t = q.trim().toLowerCase();
  const pass = (it) =>
    (filter === "all" || (filter === "back" ? it.reviewStatus === "SentBack" : (filter === "done") === isDone(it.status))) &&
    (!t || it.barcode.toLowerCase().includes(t) || it.productName.toLowerCase().includes(t));

  const sub = data && subId != null ? data.subCategories.find((s) => s.subCategoryId === subId) : null;
  const items = sub ? sub.items.filter(pass) : [];
  const cur = Math.min(idx, Math.max(items.length - 1, 0));

  const go = (d) => {
    const n = cur + d;
    if (n < 0 || n >= items.length) return;
    setDir(d > 0 ? "next" : "prev");
    setIdx(n);
  };

  // a scan: show everything, open the sub category and land on that product
  useEffect(() => { if (mine) { setFilter("all"); setQ(""); } }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mine || !data || seen.current === focus.nonce) return;
    seen.current = focus.nonce;
    for (const sg of data.subCategories) {
      const i = sg.items.findIndex((x) => x.verificationId === focus.verificationId);
      if (i >= 0) { setSubId(sg.subCategoryId); setIdx(i); break; }
    }
  }, [data, focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // the action went through (parent bumped doneTick) -> remember to move to the next product
  useEffect(() => {
    if (tap.current) { advance.current = tap.current; tap.current = null; }
  }, [doneTick]);

  // ...and when the refreshed data is in, step forward
  useEffect(() => {
    const a = advance.current;
    if (!a || !data) return;
    advance.current = null;
    const sg = data.subCategories.find((s) => s.subCategoryId === a.subId);
    if (!sg) return;
    const list = sg.items.filter(pass);
    const pos = list.findIndex((x) => x.verificationId === a.id);
    setDir("next");
    setIdx(Math.max(0, Math.min(pos >= 0 ? pos + 1 : a.idx, list.length - 1)));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // arrow keys (laptops)
  useEffect(() => {
    if (!sub) return;
    const h = (e) => {
      if (document.querySelector(".au-overlay")) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sub, cur, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const review = (action, scope, id, label) => onAction("review", { action, scope, id, label });
  const act = (type, item, advanceAfter) => {
    if (advanceAfter) tap.current = { subId, id: item.verificationId, idx: cur };
    onAction(type, item);
  };

  // swipe
  const onTouchStart = (e) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY, h: false }; };
  const onTouchMove = (e) => {
    const s = touch.current;
    if (!s) return;
    const p = e.touches[0];
    const dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (!s.h && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) s.h = true;
    if (s.h) setDrag(dx);
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (s?.h) { if (drag < -70) go(1); else if (drag > 70) go(-1); }
    setDrag(0);
  };

  // ───── filter + search (both screens) ─────
  const toolbar = (
    <div className="au-row" style={{ margin: ".5rem 0" }}>
      <div className="au-seg au-seg-scroll">
        {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => { setFilter(k); setIdx(0); }}>{l}</button>)}
      </div>
      <BarcodeInput placeholder="Filter by product or barcode" value={q} onChange={(v) => { setQ(v); setIdx(0); }} />
    </div>
  );

  // ───── screen 1: sub category cards ─────
  if (!sub) {
    return (
      <>
        {toolbar}
        {(perm.verify || perm.sendBack) && (
          <div className="au-row au-reviewbar">
            <span className="au-muted">Whole category:</span>
            <GroupReview
              perm={perm} counted={data.done} verified={data.verified} sentBack={data.sentBack} label=" category"
              onVerify={() => review("Verify", "Category", cat.categoryId, data.categoryName)}
              onSendBack={() => review("SendBack", "Category", cat.categoryId, data.categoryName)}
            />
          </div>
        )}
        <div className="au-subcards">
          {data.subCategories.map((sg) => {
            const n = sg.items.filter(pass).length;
            if (n === 0) return null;
            const pct = sg.total ? Math.round((sg.done / sg.total) * 100) : 0;
            return (
              <button key={sg.subCategoryId} className="au-subcard" onClick={() => { setSubId(sg.subCategoryId); setIdx(0); setDir("next"); }}>
                <span className="au-subcard-top">
                  <strong>{sg.subCategoryName}</strong>
                  <span className="au-subcard-go" aria-hidden="true">›</span>
                </span>
                <span className="au-muted">{sg.done} of {sg.total} counted{(filter !== "all" || t) && ` · ${n} shown`}</span>
                <Bar percent={pct} />
                <span className="au-subcard-chips">
                  {sg.verified > 0 && <span className="au-chip au-chip-ok">{sg.verified} verified</span>}
                  {sg.sentBack > 0 && <span className="au-chip au-chip-bad">{sg.sentBack} sent back</span>}
                </span>
              </button>
            );
          })}
        </div>
        {data.subCategories.every((sg) => sg.items.filter(pass).length === 0) && <p className="au-muted">No product matches.</p>}
      </>
    );
  }

  // ───── screen 2: product cards for one sub category ─────
  const it = items[cur];
  const counted = it ? isDone(it.status) : false;
  const rs = it?.reviewStatus;
  const sentBack = rs === "SentBack";
  const managerCan = !!it && role === "manager" && (canAct || (allowSentBack && sentBack));
  const canV = !!it && perm.verify && counted && rs !== "Verified";
  const canB = !!it && perm.sendBack && counted && !sentBack;
  const pct = sub.total ? Math.round((sub.done / sub.total) * 100) : 0;

  return (
    <>
      <div className="au-cardhead">
        <button className="au-btn au-btn-sm" onClick={() => setSubId(null)}>← Sub categories</button>
        <strong className="au-cardhead-t">{sub.subCategoryName}</strong>
      </div>
      <Bar percent={pct} />
      <div className="au-row au-muted" style={{ alignItems: "center", fontSize: ".85rem" }}>
        <span>{sub.done} of {sub.total} counted</span>
        {sub.verified > 0 && <span className="au-chip au-chip-ok">{sub.verified} verified</span>}
        {sub.sentBack > 0 && <span className="au-chip au-chip-bad">{sub.sentBack} sent back</span>}
      </div>
      {(perm.verify || perm.sendBack) && (
        <div className="au-row au-reviewbar">
          <span className="au-muted">Whole sub category:</span>
          <GroupReview
            perm={perm} counted={sub.done} verified={sub.verified} sentBack={sub.sentBack} label=" all"
            onVerify={() => review("Verify", "SubCategory", sub.subCategoryId, sub.subCategoryName)}
            onSendBack={() => review("SendBack", "SubCategory", sub.subCategoryId, sub.subCategoryName)}
          />
        </div>
      )}
      {toolbar}

      {!it ? (
        <p className="au-muted">No product matches in this sub category.</p>
      ) : (
        <>
          <div className="au-deck-nav">
            <button className="au-btn" disabled={cur === 0} onClick={() => go(-1)} aria-label="Previous product">‹ Prev</button>
            <span className="au-deck-count">{cur + 1} / {items.length}</span>
            <button className="au-btn" disabled={cur >= items.length - 1} onClick={() => go(1)} aria-label="Next product">Next ›</button>
          </div>

          <div className="au-deckwrap" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
            <article
              key={it.verificationId}
              id={`au-row-${it.verificationId}`}
              className={`au-pcard au-pcard-${dir} ${focus?.verificationId === it.verificationId ? "au-row-hit" : ""}`}
              style={drag ? { transform: `translateX(${drag}px) rotate(${drag / 60}deg)`, transition: "none", animation: "none" } : undefined}
            >
              <div className="au-pc-top">
                <div>
                  <div className="au-pc-barcode">{it.barcode}</div>
                  <div className="au-pc-name">{it.productName}</div>
                </div>
                <Badge status={it.status} />
              </div>
              {it.stockKind !== "InStock" && <div><span className="au-chip" style={{ marginLeft: 0 }}>{it.stockKind === "SoldOut" ? "Sold out" : "Negative stock"}</span></div>}

              <div className="au-pc-stats">
                <div className="au-stat"><div className="au-stat-v">{qty(it.systemQty)}</div><div className="au-stat-l">System</div></div>
                <div className="au-stat"><div className="au-stat-v">{counted ? qty(it.physicalQty) : "–"}</div><div className="au-stat-l">Counted</div></div>
                <div className={`au-stat ${counted && it.varianceQty < 0 ? "au-t-short" : counted && it.varianceQty > 0 ? "au-t-excess" : ""}`}>
                  <div className="au-stat-v">{counted ? qty(it.varianceQty) : "–"}</div>
                  <div className="au-stat-l">Variance</div>
                </div>
              </div>

              <dl className="au-pc-facts">
                <div><dt>Reason / note</dt><dd>{[it.reasonCode, it.note].filter(Boolean).join(" · ") || "–"}</dd></div>
                <div><dt>Counted by</dt><dd>{it.verifiedBy || "–"}</dd></div>
                <div>
                  <dt>Review</dt>
                  <dd>
                    <ReviewChip state={rs} />
                    {it.reviewNote && <small className="au-block au-muted">{it.reviewNote}</small>}
                    {it.reviewedBy && <small className="au-block au-muted">by {it.reviewedBy}</small>}
                  </dd>
                </div>
              </dl>

              {managerCan && (
                <button className="au-btn au-btn-primary au-pc-big" onClick={() => act("count", it, true)}>
                  {sentBack || counted ? "Recount" : "Count"}
                </button>
              )}

              {(perm.verify || perm.sendBack) && (
                <div className="au-pc-decide">
                  {perm.verify && (
                    <button className="au-btn au-btn-primary" disabled={!canV} onClick={() => act("review", { action: "Verify", scope: "Product", id: it.verificationId, label: it.productName, verificationId: it.verificationId }, true)}>
                      Verify
                    </button>
                  )}
                  {perm.sendBack && (
                    <button className="au-btn au-btn-danger" disabled={!canB} onClick={() => act("review", { action: "SendBack", scope: "Product", id: it.verificationId, label: it.productName, verificationId: it.verificationId }, true)}>
                      Send back
                    </button>
                  )}
                </div>
              )}

              <div className="au-pc-more">
                {role === "incharge" && canAct && (
                  <>
                    <button className="au-btn au-btn-sm" onClick={() => act("count", it, false)}>Correct</button>
                    {it.status !== "Pending" && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => act("reset", it, false)}>Reset</button>}
                  </>
                )}
                <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => onAction("history", it)}>Records</button>
                {role !== "manager" && <button className="au-btn au-btn-ghost au-btn-sm" onClick={() => onAction("log", it)}>Changes</button>}
              </div>
            </article>
          </div>
          <p className="au-muted au-deck-hint">Swipe left or right to change product.</p>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Generic swipe deck: one card at a time. Used by the manager's review list
// and the subordinate's counting screen.
//   items    already filtered list
//   idx      current position (controlled), setIdx
//   getKey   unique key of an item
//   render   (item) => card content
//   hitKey   optional key to highlight (found by scanning)
// ─────────────────────────────────────────────────────────────
export function Deck({ items, idx, setIdx, getKey, render, hitKey }) {
  const [dir, setDir] = useState("next");
  const [drag, setDrag] = useState(0);
  const touch = useRef(null);
  const cur = Math.min(idx, Math.max(items.length - 1, 0));

  const go = (d) => {
    const n = cur + d;
    if (n < 0 || n >= items.length) return;
    setDir(d > 0 ? "next" : "prev");
    setIdx(n);
  };

  useEffect(() => {
    const h = (e) => {
      if (document.querySelector(".au-overlay")) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cur, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return null;
  const it = items[cur];
  const key = getKey(it);

  const onTouchStart = (e) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY, h: false }; };
  const onTouchMove = (e) => {
    const s = touch.current;
    if (!s) return;
    const p = e.touches[0];
    const dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (!s.h && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) s.h = true;
    if (s.h) setDrag(dx);
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (s?.h) { if (drag < -70) go(1); else if (drag > 70) go(-1); }
    setDrag(0);
  };

  return (
    <>
      <div className="au-deck-nav">
        <button className="au-btn" disabled={cur === 0} onClick={() => go(-1)} aria-label="Previous">‹ Prev</button>
        <span className="au-deck-count">{cur + 1} / {items.length}</span>
        <button className="au-btn" disabled={cur >= items.length - 1} onClick={() => go(1)} aria-label="Next">Next ›</button>
      </div>
      <div className="au-deckwrap" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <article
          key={key}
          id={`au-row-${key}`}
          className={`au-pcard au-pcard-${dir} ${hitKey !== undefined && hitKey === key ? "au-row-hit" : ""}`}
          style={drag ? { transform: `translateX(${drag}px) rotate(${drag / 60}deg)`, transition: "none", animation: "none" } : undefined}
        >
          {render(it)}
        </article>
      </div>
      <p className="au-muted au-deck-hint">Swipe left or right to change.</p>
    </>
  );
}