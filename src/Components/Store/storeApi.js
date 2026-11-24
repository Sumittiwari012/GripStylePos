// Shared helper for the store panel sections.
// Backend address: set VITE_API_URL to override it (e.g. for local testing); otherwise the deployed API is used.
// It must be the full address, not a relative path, or the request goes to the Netlify site instead of the API.
export const API_BASE = (import.meta.env.VITE_API_URL || "https://gripstyleapi.runasp.net").replace(/\/$/, "");

export async function getJson(path, signal) {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}

export async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}
