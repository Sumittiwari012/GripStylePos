import { Navigate, useNavigate } from "react-router-dom";
import { storeSession } from "./StoreLogin";
import "./storePanel.css";

// Page shown after a successful store login (route: /store).
// Wrap it in <RequireStoreUser> in App.jsx so only logged-in users can open it.
// Add your store tools inside the <main> area; the header and logout already work.

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
          <span className="sp-store">Store {s.storeId}</span>
          <span className="sp-user">{s.userName}</span>
        </div>
        <button type="button" className="sp-logout" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="sp-main">
        <h1 className="sp-title">Welcome, {s.userName}</h1>

        <section className="sp-card" aria-labelledby="sp-account">
          <h2 id="sp-account" className="sp-card-title">Your login</h2>
          <dl className="sp-details">
            <div>
              <dt>Store</dt>
              <dd>{s.storeId}</dd>
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
              <dd>{s.userTypeId}</dd>
            </div>
            <div>
              <dt>Logged in</dt>
              <dd>{fmtDateTime(s.loggedInAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="sp-card sp-empty">
          <h2 className="sp-card-title">Store tools</h2>
          <p>Nothing has been added to this panel yet. Tell me what the store team should do here and I will build it.</p>
        </section>
      </main>
    </div>
  );
}
