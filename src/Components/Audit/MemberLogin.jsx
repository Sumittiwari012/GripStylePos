import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ROUTE_BASE, session } from "./api";
import { ErrorBox, Field } from "./ui";

export default function MemberLogin() {
  const nav = useNavigate();
  const [step, setStep] = useState("phone"); // phone -> otp
  const [auditCode, setAuditCode] = useState("");
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

  // Already logged in? Go straight to the right screen.
  useEffect(() => {
    const s = session.get();
    if (s?.member) nav(homeFor(s.member.roleId), { replace: true });
  }, [nav]);

  const sendOtp = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/send-otp", { method: "POST", body: { auditCode: auditCode.trim().toUpperCase(), phoneNumber: phone } });
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
      const r = await api("/auth/verify-otp", {
        method: "POST",
        body: { auditCode: auditCode.trim().toUpperCase(), phoneNumber: phone, otp },
      });
      session.set({ token: r.sessionToken, expiresAt: r.expiresAt, member: r.member, audit: r.audit });
      nav(homeFor(r.member.roleId), { replace: true });
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
        <h1>Log in to your audit</h1>
        <p className="au-sub">
          {step === "phone"
            ? "Enter the audit code the owner shared with you and your phone number. We send a one-time code on WhatsApp."
            : `Enter the 6-digit code sent to ${phone} on WhatsApp. It is valid for 5 minutes.`}
        </p>

        {step === "phone" ? (
          <form className="au-form" onSubmit={sendOtp}>
            <Field label="Audit code">
              <input className="au-input au-code" value={auditCode} onChange={(e) => setAuditCode(e.target.value)} maxLength={12} autoCapitalize="characters" required />
            </Field>
            <Field label="Phone number">
              <input className="au-input" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" required />
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
              {busy ? "Checking…" : "Start audit"}
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
      </div>
    </div>
  );
}

export const homeFor = (roleId) => (roleId === 2 ? `${ROUTE_BASE}/incharge` : `${ROUTE_BASE}/manager`);
