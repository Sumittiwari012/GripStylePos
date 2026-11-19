// ─────────────────────────────────────────────────────────────
// Rack API client. Same shape as api.js (audit).
// The rack manager logs in with a WhatsApp OTP and sends the returned token
// as the X-Rack-Token header. Only user id 1 is allowed by the backend.
// API_BASE comes from api.js, so there is one place to change the backend URL.
// ─────────────────────────────────────────────────────────────
import { API_BASE, ApiError } from "../audit/api";

export const RACK_BASE = "/rack"; // where you mount the rack pages in your router
export const RACK_ADMIN_USER_ID = 1;

const SESSION_KEY = "rackSession";

export const rackSession = {
  get() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      // the server forgets a token after its lifetime, so drop it here too
      if (s?.expiresAt && Date.now() > s.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
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
 * rackApi("/GetRacks", { auth: true })
 * auth: true sends the OTP token. On a 401 the session is cleared and the
 * person is sent back to the rack login page.
 */
export async function rackApi(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const current = rackSession.get();
    if (current?.token) headers["X-Rack-Token"] = current.token;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api/Rack${path}`, {
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
      data = { message: text }; // BadRequest("...") comes back as plain text
    }
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      rackSession.clear();
      window.location.assign(`${RACK_BASE}/login`);
    }
    throw new ApiError(res.status, readMessage(data), data);
  }
  return data;
}

const enc = encodeURIComponent;
const clean = (v) => (typeof v === "string" && v.trim() === "" ? null : v);

export const RackApi = {
  // login
  sendOtp: () => rackApi("/SendOtp", { method: "POST", body: { userId: RACK_ADMIN_USER_ID } }),
  verifyOtp: (otp) => rackApi("/VerifyOtp", { method: "POST", body: { userId: RACK_ADMIN_USER_ID, otpVal: Number(otp) } }),

  // manager (token required)
  getRacks: () => rackApi("/GetRacks", { auth: true }),
  createRack: (f) =>
    rackApi("/CreateRack", {
      method: "POST",
      auth: true,
      body: {
        rackCode: f.rackCode.trim(),
        rackName: clean(f.rackName),
        godown: clean(f.godown),
        section: clean(f.section),
        description: clean(f.description),
        isActive: true,
      },
    }),
  deleteRack: (rackId) => rackApi(`/DeleteRack?rackId=${rackId}`, { method: "DELETE", auth: true }),
  assignProducts: (rackId, productIds) => rackApi("/AssignProducts", { method: "POST", auth: true, body: { rackId, productIds } }),
  moveAll: (fromRackId, toRackId) => rackApi("/MoveAllProducts", { method: "POST", auth: true, body: { fromRackId, toRackId } }),
  findByBarcode: (barcode) => rackApi(`/FindByBarcode?barcode=${enc(barcode)}`, { auth: true }),

  // public
  scan: (rackId) => rackApi(`/Scan?rackId=${enc(rackId)}`),
  locate: (barcode) => rackApi(`/Locate?barcode=${enc(barcode)}`),
  byCode: (code) => rackApi(`/ByCode?code=${enc(code)}`), // { id, rackCode, rackName }
};

// A rack QR code holds  https://your-site/rack/<id>.
// Pass allowBare = true to also accept a typed rack number.
export function parseRackId(text, allowBare = false) {
  const s = String(text).trim();
  const m = s.match(/\/rack\/(\d+)\b/) || (allowBare ? s.match(/^(\d+)$/) : null);
  return m ? m[1] : null;
}
