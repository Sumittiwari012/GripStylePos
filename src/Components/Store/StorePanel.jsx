import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { storeSession } from "./StoreLogin";
import GodownSection from "./GodownSection";
import "./storePanel.css";

// Page shown after a successful store login (route: /store).
// Wrap it in <RequireStoreUser> in App.jsx so only logged-in users can open it.
//
// The welcome title and "Your login" card are unchanged. Below them are the sections:
//   1. Check godown        stock in the godown linked to this store (see GodownSection.jsx)
//   2. Dispatch & receive  goods leaving the godown for the store, and the store confirming them
//   3. Assign rack         put products on racks in the store
// Each section is a small component below. Replace its placeholder with the real screen
// once its API is ready.

const SECTIONS = [
  { key: "godown", label: "Check godown" },
  { key: "movement", label: "Dispatch & receive" },
  { key: "rack", label: "Assign rack" },
];

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

function Placeholder({ title, children }) {
  return (
    <section className="sp-card sp-empty">
      <h2 className="sp-card-title">{title}</h2>
      <p>{children}</p>
      <p className="sp-note">This screen is not connected to the server yet.</p>
    </section>
  );
}

function MovementSection() {
  const [view, setView] = useState("dispatch"); // dispatch | receive
  return (
    <>
      <div className="sp-subtabs" role="tablist" aria-label="Dispatch or receive">
        <button
          type="button"
          role="tab"
          aria-selected={view === "dispatch"}
          className={view === "dispatch" ? "on" : ""}
          onClick={() => setView("dispatch")}
        >
          Dispatch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "receive"}
          className={view === "receive" ? "on" : ""}
          onClick={() => setView("receive")}
        >
          Receive
        </button>
      </div>
      {view === "dispatch" ? (
        <Placeholder title="Dispatch">
          Check the goods the godown has sent, or is about to send, to this store.
        </Placeholder>
      ) : (
        <Placeholder title="Receive">
          Confirm the goods that arrived at this store against what was dispatched, and note anything short or damaged.
        </Placeholder>
      )}
    </>
  );
}

function RackSection() {
  return (
    <Placeholder title="Assign rack">
      Choose a product and the rack it should be kept on in this store.
    </Placeholder>
  );
}

export default function StorePanel() {
  const nav = useNavigate();
  const s = storeSession.get();
  const [tab, setTab] = useState("godown");

  const logout = () => {
    storeSession.clear();
    nav("/store-login", { replace: true });
  };

  // Guard for direct use without RequireStoreUser
  if (!s?.userId) return <Navigate to="/store-login" replace />;

  return (
    <div className="sp-page">
      <header className="sp-header">
        <div className="sp-header-main">
          <span className="sp-store">{s.storeName || `Store ${s.storeId}`}</span>
          <span className="sp-user">
            {s.userName}
            {s.userTypeName ? ` (${s.userTypeName})` : ""}
          </span>
        </div>
        <button type="button" className="sp-logout" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="sp-main">
        {/* ---- Original part of the panel (unchanged) ---- */}
        <h1 className="sp-title">Welcome, {s.userName}</h1>

        <section className="sp-card" aria-labelledby="sp-account">
          <h2 id="sp-account" className="sp-card-title">Your login</h2>
          <dl className="sp-details">
            <div>
              <dt>Store</dt>
              <dd>{s.storeName || s.storeId}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>{s.userName}</dd>
            </div>
            <div>
              <dt>Mobile number</dt>
              <dd>{s.mobileNumber}</dd>
            </div>
            <div>
              <dt>User type</dt>
              <dd>{s.userTypeName || s.userTypeId}</dd>
            </div>
            <div>
              <dt>Logged in</dt>
              <dd>{fmtDateTime(s.loggedInAt)}</dd>
            </div>
          </dl>
        </section>

        {/* ---- New: store sections, below the original part ---- */}
        <nav className="sp-tabs" role="tablist" aria-label="Store sections">
          {SECTIONS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              id={`sp-tab-${x.key}`}
              aria-selected={tab === x.key}
              aria-controls={`sp-panel-${x.key}`}
              className={tab === x.key ? "on" : ""}
              onClick={() => setTab(x.key)}
            >
              {x.label}
            </button>
          ))}
        </nav>

        <div role="tabpanel" id={`sp-panel-${tab}`} aria-labelledby={`sp-tab-${tab}`}>
          {tab === "godown" && <GodownSection session={s} />}
          {tab === "movement" && <MovementSection />}
          {tab === "rack" && <RackSection />}
        </div>
      </main>
    </div>
  );
}
