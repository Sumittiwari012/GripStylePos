import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "./storeLogin.css";

// ─────────────────────────────────────────────────────────────
// Store user login. Three steps, matching StoreController:
//   1. GetStores + VerifyStore   pick the store from a dropdown
//   2. SendLoginOtp    phone number (must belong to a user of that store) -> OTP on WhatsApp
//   3. VerifyLoginOtp  OTP -> login complete
// Edit the two settings below to match your project.
// ─────────────────────────────────────────────────────────────
const API_BASE_URL = "https://gripstyleapi.runasp.net"; // no trailing slash
export const STORE_HOME = "/store"; // where the store panel lives in your router

const SESSION_KEY = "storeSession";

export const storeSession = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  },
  set(value) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
};

// Use around the store panel route so people who have not logged in are sent here:
//   <Route path="/store" element={<RequireStoreUser><StorePanel /></RequireStoreUser>} />
//   <Route path="/store-login" element={<StoreLogin />} />
export function RequireStoreUser({ children, loginPath = "/store-login" }) {
  if (!storeSession.get()?.userId) return <Navigate to={loginPath} replace />;
  return children;
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/Store/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) throw new Error(data?.message || "Something went wrong. Please try again.");
  return data;
}

async function get(path) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/Store/${path}`);
  } catch {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error("Could not load the stores. Please try again.");
  return res.json();
}

const onlyDigits = (v) => v.replace(/\D/g, "");

export default function StoreLogin() {
  const nav = useNavigate();
  const [step, setStep] = useState("store"); // store -> phone -> otp
  const [stores, setStores] = useState([]);
  const [storesState, setStoresState] = useState("loading"); // loading | ready | failed
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [masked, setMasked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const inputRef = useRef(null);

  // Already logged in? Go straight to the panel.
  useEffect(() => {
    if (storeSession.get()?.userId) nav(STORE_HOME, { replace: true });
  }, [nav]);

  // Load the stores for the dropdown
  const loadStores = async () => {
    setError("");
    setStoresState("loading");
    try {
      const r = await get("GetStores");
      setStores(r.stores || []);
      setStoresState("ready");
    } catch (e) {
      setError(e.message);
      setStoresState("failed");
    }
  };

  useEffect(() => {
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend countdown
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Move the cursor to the field of the active step
  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 1
  const verifyStore = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await post("VerifyStore", { storeId: Number(storeId) });
      setStoreName(r.storeName || `Store ${storeId}`);
      setStep("phone");
    });
  };

  // Step 2 (also used by "Send a new code")
  const sendOtp = (e) => {
    e?.preventDefault();
    run(async () => {
      const r = await post("SendLoginOtp", { storeId: Number(storeId), phoneNumber: phone });
      setMasked(r.maskedPhoneNumber || phone);
      setOtp("");
      setWait(r.resendAfterSeconds || 30);
      setStep("otp");
    });
  };

  // Step 3
  const verifyOtp = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await post("VerifyLoginOtp", {
        storeId: Number(storeId),
        phoneNumber: phone,
        otpVal: Number(otp),
      });
      storeSession.set({
        userId: r.userId,
        userName: r.userName,
        userTypeId: r.userTypeId,
        storeId: r.storeId,
        storeName: r.storeName,
        mobileNumber: r.mobileNumber,
        loggedInAt: new Date().toISOString(),
      });
      nav(STORE_HOME, { replace: true });
    });
  };

  const changeStore = () => {
    setStep("store");
    setStoreName("");
    setPhone("");
    setOtp("");
    setError("");
    setWait(0);
  };

  const changeNumber = () => {
    setStep("phone");
    setOtp("");
    setError("");
  };

  const storeDone = step !== "store";
  const phoneDone = step === "otp";

  return (
    <div className="sl-page">
      <main className="sl-card">
        <h1 className="sl-title">Store login</h1>
        <p className="sl-sub">
          {step === "store" && "Choose your store to begin."}
          {step === "phone" && "Enter the phone number registered for this store. We send a code on WhatsApp."}
          {step === "otp" && `Enter the 4-digit code sent to ${masked} on WhatsApp. It is valid for 5 minutes.`}
        </p>

        {/* Steps already confirmed collapse into one line each */}
        <ol className="sl-steps" aria-label="Login progress">
          <li className={`sl-step ${storeDone ? "is-done" : "is-active"}`}>
            <span className="sl-mark" aria-hidden="true">{storeDone ? "✓" : "1"}</span>
            <div className="sl-step-body">
              {storeDone ? (
                <div className="sl-summary">
                  <span><strong>{storeName}</strong> verified</span>
                  <button type="button" className="sl-link" onClick={changeStore} disabled={busy}>Change</button>
                </div>
              ) : (
                <form onSubmit={verifyStore} className="sl-form">
                  <label className="sl-label" htmlFor="sl-store">Store</label>
                  <select
                    id="sl-store"
                    ref={inputRef}
                    className="sl-input sl-select"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    disabled={storesState !== "ready" || busy}
                    required
                  >
                    <option value="">
                      {storesState === "loading" ? "Loading stores…" : storesState === "failed" ? "Could not load stores" : "Select your store"}
                    </option>
                    {stores.map((st) => (
                      <option key={st.storeId} value={st.storeId}>
                        {st.storeName}
                      </option>
                    ))}
                  </select>
                  {storesState === "ready" && stores.length === 0 && (
                    <p className="sl-hint">No stores have been set up yet.</p>
                  )}
                  {storesState === "failed" ? (
                    <button type="button" className="sl-btn" onClick={loadStores}>
                      Try again
                    </button>
                  ) : (
                    <button className="sl-btn" disabled={busy || !storeId}>
                      {busy ? "Checking…" : "Continue"}
                    </button>
                  )}
                </form>
              )}
            </div>
          </li>

          <li className={`sl-step ${phoneDone ? "is-done" : step === "phone" ? "is-active" : "is-waiting"}`}>
            <span className="sl-mark" aria-hidden="true">{phoneDone ? "✓" : "2"}</span>
            <div className="sl-step-body">
              {step === "store" && <span className="sl-waiting">Phone number</span>}
              {step === "phone" && (
                <form onSubmit={sendOtp} className="sl-form">
                  <label className="sl-label" htmlFor="sl-phone">Phone number</label>
                  <div className="sl-phone">
                    <span className="sl-prefix">+91</span>
                    <input
                      id="sl-phone"
                      ref={inputRef}
                      className="sl-input sl-input-bare"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(e) => setPhone(onlyDigits(e.target.value).slice(-10))}
                      required
                    />
                  </div>
                  <button className="sl-btn" disabled={busy || phone.length < 10}>
                    {busy ? "Sending…" : "Send code"}
                  </button>
                </form>
              )}
              {phoneDone && (
                <div className="sl-summary">
                  <span>Code sent to <strong>{masked}</strong></span>
                  <button type="button" className="sl-link" onClick={changeNumber} disabled={busy}>Change number</button>
                </div>
              )}
            </div>
          </li>

          <li className={`sl-step ${step === "otp" ? "is-active" : "is-waiting"}`}>
            <span className="sl-mark" aria-hidden="true">3</span>
            <div className="sl-step-body">
              {step !== "otp" && <span className="sl-waiting">One-time code</span>}
              {step === "otp" && (
                <form onSubmit={verifyOtp} className="sl-form">
                  <label className="sl-label" htmlFor="sl-otp">One-time code</label>
                  <input
                    id="sl-otp"
                    ref={inputRef}
                    className="sl-input sl-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(onlyDigits(e.target.value))}
                    required
                  />
                  <button className="sl-btn" disabled={busy || otp.length < 4}>
                    {busy ? "Checking…" : "Log in"}
                  </button>
                  <button
                    type="button"
                    className="sl-link sl-resend"
                    disabled={wait > 0 || busy}
                    onClick={sendOtp}
                  >
                    {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
                  </button>
                </form>
              )}
            </div>
          </li>
        </ol>

        <p className="sl-error" role="alert" aria-live="assertive">{error}</p>
      </main>
    </div>
  );
}
