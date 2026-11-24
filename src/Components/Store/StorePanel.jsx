import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { storeSession } from "./StoreLogin";
import GodownSection from "./GodownSection";
import DispatchSection from "./DispatchSection";
import RackSection from "./RackSection";
import "./storePanel.css";

// Page shown after a successful store login (route: /store).
// Wrap it in <RequireStoreUser> in App.jsx so only logged-in users can open it.
//
// The welcome title and "Your login" card are unchanged. Below them are the sections:
//   1. Check godown        stock in the godown linked to this store (see GodownSection.jsx)
//   2. Dispatch            goods leaving / entering the godown, and creating a new dispatch (see DispatchSection.jsx)
//   3. Assign rack         put received goods on racks in the store (see RackSection.jsx)

const SECTIONS = [
  { key: "godown", label: "Check godown" },
  { key: "dispatch", label: "Dispatch" },
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
          {tab === "dispatch" && <DispatchSection session={s} />}
          {tab === "rack" && <RackSection session={s} />}
        </div>
      </main>
    </div>
  );
}