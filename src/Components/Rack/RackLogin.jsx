import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorBox, Field } from "../Audit/ui";
import { RACK_ADMIN_USER_IDS, RACK_BASE, RackApi, rackSession } from "./rackApi";
import "../Audit/audit.css";
import "./rack.css";

// Rack manager login. The code goes by WhatsApp to the mobile number saved for user 1.
export default function RackLogin() {
  const nav = useNavigate();
  const [step, setStep] = useState("send"); // send -> otp
  const [userId, setUserId] = useState(RACK_ADMIN_USER_IDS[0]);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Already logged in? Go straight to the racks.
  useEffect(() => {
    if (rackSession.get()) nav(`${RACK_BASE}/manage`, { replace: true });
  }, [nav]);

  const sendOtp = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await RackApi.sendOtp(userId);
      setStep("otp");
      setWait(30);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await RackApi.verifyOtp(userId, otp);
      rackSession.set({ userId, token: r.token, expiresAt: Date.now() + r.expiresInMinutes * 60 * 1000 });
      nav(`${RACK_BASE}/manage`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="au au-login">
      <div className="au-login-card">
        <div className="au-brand">Racks</div>
        <h1>Rack manager login</h1>
        <p className="au-sub">
          {step === "send"
            ? "Choose who is logging in. We send a one-time code on WhatsApp to that person's registered mobile number."
            : "Enter the 4-digit code we sent on WhatsApp."}
        </p>

        {step === "send" ? (
          <form className="au-form" onSubmit={sendOtp}>
            <Field label="User">
              <select className="au-input" value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
                {RACK_ADMIN_USER_IDS.map((id) => <option key={id} value={id}>User {id}</option>)}
              </select>
            </Field>
            <button className="au-btn au-btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form className="au-form" onSubmit={verify}>
            <Field label="One-time code">
              <input
                className="au-input au-input-big au-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                maxLength={4}
                autoFocus
                required
              />
            </Field>
            <button className="au-btn au-btn-primary" disabled={busy || otp.length < 4}>
              {busy ? "Checking…" : "Log in"}
            </button>
            <div className="au-row">
              <button type="button" className="au-btn au-btn-ghost au-btn-sm" disabled={wait > 0 || busy} onClick={sendOtp}>
                {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
              </button>
              <button type="button" className="au-btn au-btn-ghost au-btn-sm" disabled={busy} onClick={() => { setStep("send"); setOtp(""); setError(null); }}>
                Change user
              </button>
            </div>
          </form>
        )}
        <ErrorBox error={error} />
        <p className="au-muted au-switch">Just checking stock? <Link to={RACK_BASE}>Scan a rack QR code</Link></p>
      </div>
    </div>
  );
}
