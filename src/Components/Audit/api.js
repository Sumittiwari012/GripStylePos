// ─────────────────────────────────────────────────────────────
// Audit API client.
//  • Owner calls  -> your existing login token  (Authorization: Bearer ...)
//  • Incharge / manager calls -> OTP session     (X-Audit-Session: ...)
// Edit the three settings below to match your project.
// ─────────────────────────────────────────────────────────────
export const API_BASE = "https://gripstyleapi.runasp.net"; // your backend URL, no trailing slash
export const ROUTE_BASE = "/audit"; // where you mount these pages in your router
export const getOwnerToken = () => localStorage.getItem("token"); // where your owner login keeps its JWT

const SESSION_KEY = "auditSession";

export const session = {
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

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function readMessage(data) {
  if (!data) return "Something went wrong.";
  if (data.message) return data.message;
  if (data.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  return data.title || "Something went wrong.";
}

/**
 * api("/5/scan/123", { who: "member" })
 * who: "owner" | "member"  (member is the default)
 */
export async function api(path, { method = "GET", body, who = "member" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (who === "owner") {
    const t = getOwnerToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  } else {
    const s = session.get();
    if (s?.token) headers["X-Audit-Session"] = s.token;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api/audit${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
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

  if (!res.ok) {
    if (res.status === 401 && who === "member") {
      session.clear();
      window.location.assign(`${ROUTE_BASE}/login`);
    }
    throw new ApiError(res.status, readMessage(data), data);
  }
  return data;
}

// ── formatting helpers ──
export const qty = (n) =>
  n === null || n === undefined ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

export const REASONS = ["Damaged", "Returned", "Lost", "WrongBilling", "FoundExtra", "Other"];
export const ROLE = { INCHARGE: 2, MANAGER: 3 };
