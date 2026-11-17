import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ROUTE_BASE, session } from "./api";
import { ErrorBox, Field } from "./ui";

export default function OwnerLogin() {
  const nav = useNavigate();
  const [step, setStep] = useState("phone"); // phone -> otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Already logged in as owner? Go straight to the audits.
  useEffect(() => {
    if (session.get()?.owner) nav(`${ROUTE_BASE}/owner`, { replace: true });
  }, [nav]);

  const sendOtp = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/owner/send-otp", { method: "POST", body: { phoneNumber: phone } });
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
      const r = await api("/auth/owner/verify-otp", { method: "POST", body: { phoneNumber: phone, otp } });
      session.set({ token: r.sessionToken, expiresAt: r.expiresAt, owner: r.owner });
      nav(`${ROUTE_BASE}/owner`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="au au-login">
      <div className="au-login-card">
        <div className="au-brand">Stock audit</div>
        <h1>Owner login</h1>
        <p className="au-sub">
          {step === "phone"
            ? "Enter your registered phone number. We send a one-time code on WhatsApp."
            : `Enter the 6-digit code sent to ${phone} on WhatsApp. It is valid for 5 minutes.`}
        </p>

        {step === "phone" ? (
          <form className="au-form" onSubmit={sendOtp}>
            <Field label="Phone number">
              <input className="au-input" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" autoFocus required />
            </Field>
            <button className="au-btn au-btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form className="au-form" onSubmit={verify}>
            <Field label="One-time code">
              <input className="au-input au-input-big au-code" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} autoFocus required />
            </Field>
            <button className="au-btn au-btn-primary" disabled={busy || otp.length < 6}>
              {busy ? "Checking…" : "Log in"}
            </button>
            <div className="au-row">
              <button type="button" className="au-btn au-btn-ghost au-btn-sm" disabled={wait > 0 || busy} onClick={sendOtp}>
                {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
              </button>
              <button type="button" className="au-btn au-btn-ghost au-btn-sm" onClick={() => { setStep("phone"); setOtp(""); setError(null); }}>
                Change number
              </button>
            </div>
          </form>
        )}
        <ErrorBox error={error} />
        <p className="au-muted au-switch">Incharge or manager? <Link to={`${ROUTE_BASE}/login`}>Log in with the audit code</Link></p>
      </div>
    </div>
  );
}
