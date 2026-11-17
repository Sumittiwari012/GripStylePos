// ─────────────────────────────────────────────────────────────
// Audit API client.
// Owner, incharge and manager all log in with a WhatsApp OTP and send the
// returned token as the X-Audit-Session header.
// Edit the two settings below to match your project.
// ─────────────────────────────────────────────────────────────
export const API_BASE = "https://gripstyleapi.runasp.net"; // your backend URL, no trailing slash
export const ROUTE_BASE = "/audit"; // where you mount these pages in your router

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
 * api("/5/scan/123")
 * `who` is kept only so older calls keep working; it no longer changes the request.
 */
export async function api(path, { method = "GET", body, who = "member" } = {}) {
  const headers = { "Content-Type": "application/json" };
  const current = session.get();
  if (current?.token) headers["X-Audit-Session"] = current.token;

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
    // Session expired -> back to the right login page.
    // (Not for /auth/ calls: a wrong OTP is also a 401 and must show its message.)
    if (res.status === 401 && !path.startsWith("/auth/")) {
      const wasOwner = !!current?.owner || who === "owner";
      session.clear();
      window.location.assign(`${ROUTE_BASE}/${wasOwner ? "owner-login" : "login"}`);
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
