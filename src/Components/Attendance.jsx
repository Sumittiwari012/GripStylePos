import { useState, useEffect } from "react";
import {
  User,
  LogIn,
  LogOut,
  Clock,
  Phone,
  ShieldCheck
} from "lucide-react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

const API_BASE_URL = "https://gripstyleapi.runasp.net";
const STORAGE_KEY = "attendanceUser";
const OTP_ID_STORAGE_KEY = "attendanceOtpId"; // holds the InvoiceNumber/Idval between the two steps

// ── Helpers that don't need component state ──

const getGeolocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords), // { latitude, longitude, accuracy }
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

const getDeviceFingerprint = async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
};

// ── Formatting helpers for AttendanceHistory rows ──
const formatDateOnly = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatTimeOnly = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
};

export default function Attendance() {
  // ── Session / auth state ──
  const [checkingSession, setCheckingSession] = useState(true);
  const [user, setUser] = useState(null); // { userId, username, mobileNumber, ... } once logged in

  const [authStep, setAuthStep] = useState("phone"); // "phone" | "otp"
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Attendance state ──
  const [loggedIn, setLoggedIn] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // "login" | "logout" | null
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyStale, setHistoryStale] = useState(true); // refetch after login/logout

  // ── On mount: check localStorage for an existing user, then ask the
  //     backend for the REAL clock-in status instead of assuming "logged out".
  //     Without this, `loggedIn` always starts at false on page load, which
  //     is just a guess — if you forgot to log out yesterday, the backend
  //     still has an open entry and will correctly reject a fresh login.
  useEffect(() => {
    const init = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      let parsedUser = null;

      if (stored) {
        try {
          parsedUser = JSON.parse(stored);
          setUser(parsedUser);
        } catch {
          // Corrupted value — treat as no session
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      if (parsedUser?.userId) {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/Attendance/Status?userId=${encodeURIComponent(parsedUser.userId)}`
          );
          const data = await res.json().catch(() => ({}));

          if (res.ok) {
            setLoggedIn(Boolean(data.loggedIn));
          } else {
            // If the status check itself fails, don't silently claim
            // "logged out" — surface it so it's not mistaken for truth.
            console.error("Status check failed:", data);
          }
        } catch (err) {
          console.error("Status check error:", err);
        }
      }

      setCheckingSession(false);
    };

    init();
  }, []);

  // ── Step 1: submit phone number → call SignupOtp, store the returned
  //     InvoiceNumber (Idval) so it can be sent back on verification ──
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (!/^\d{10}$/.test(phoneNumber.trim())) {
      setAuthError("Enter a valid 10-digit mobile number.");
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/Attendance/SignupOtp?PhoneNumber=${encodeURIComponent(phoneNumber.trim())}`,
        { method: "POST" }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Could not send OTP. Please try again.");
      }

      // Hang onto the InvoiceNumber (Idval) — it's needed on the verify call.
      localStorage.setItem(OTP_ID_STORAGE_KEY, data.invoiceNumber);

      setAuthStep("otp");
    } catch (err) {
      console.error("Send OTP error:", err);
      setAuthError(err.message || "Could not reach the server. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Step 2: submit OTP + the stored Idval → call SignUpVerification,
  //     then store the returned user in localStorage ──
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthError("");

    const idVal = localStorage.getItem(OTP_ID_STORAGE_KEY);
    if (!idVal) {
      setAuthError("Session expired — please request a new OTP.");
      setAuthStep("phone");
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/Attendance/SignUpVerification?OtpVal=${encodeURIComponent(otp.trim())}&Idval=${encodeURIComponent(idVal)}`,
        { method: "POST" }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Incorrect OTP. Please try again.");
      }

      const userRecord = {
        userId: data.user?.id ?? data.user?.Id,
        username: data.user?.userName ?? data.user?.UserName,
        mobileNumber: data.user?.mobileNumber ?? data.user?.MobileNumber ?? phoneNumber.trim()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(userRecord));
      localStorage.removeItem(OTP_ID_STORAGE_KEY); // one-time use — clear it now that verification succeeded
      setUser(userRecord);
    } catch (err) {
      console.error("OTP verify error:", err);
      setAuthError(err.message || "Could not verify OTP. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Fetch attendance history from the backend ──
  const fetchHistory = async () => {
    if (!user?.userId) return;

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/Attendance/AttendanceHistory?UserId=${encodeURIComponent(user.userId)}`
      );
      const data = await res.json().catch(() => ([]));

      if (!res.ok) {
        throw new Error(data.message || "Could not load history.");
      }

      setHistory(Array.isArray(data) ? data : []);
      setHistoryStale(false);
    } catch (err) {
      console.error("Fetch history error:", err);
      setHistoryError(err.message || "Could not load history. Please try again.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Confirm popup action → actually calls ClockIn / ClockOut ──
  // This now lives inside the component so it can see `user`, `confirmAction`,
  // and the state setters — the previous top-level version referenced all of
  // these out of scope and would have thrown at runtime.
  const handleConfirm = async () => {
    if (!confirmAction || !user?.userId) return;

    setConfirmError("");
    setConfirmLoading(true);

    try {
      const coords = await getGeolocation();
      const fingerprint = await getDeviceFingerprint();

      const endpoint = confirmAction === "login" ? "ClockIn" : "ClockOut";

      const res = await fetch(`${API_BASE_URL}/api/Attendance/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          deviceFingerprint: fingerprint
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Surfaces backend errors like "already_clocked_in" / "no_open_clock_in"
        throw new Error(data.error || data.message || "Action failed. Please try again.");
      }

      console.log("Discrepancy check:", data); // distanceFromOfficeMeters, accuracyMeters, gpsVerified

      setLoggedIn(confirmAction === "login");

      // The local `history` array is now populated straight from
      // AttendanceHistory, so instead of hand-building a row here, just
      // mark it stale — if the history panel is open, refetch immediately;
      // otherwise it'll refetch the next time the panel is opened.
      setHistoryStale(true);
      if (showHistory) {
        fetchHistory();
      }

      setConfirmAction(null);
    } catch (err) {
      console.error(err);
      setConfirmError(
        err.message === "Geolocation not supported" || err.code
          ? "Could not verify your location. Please enable location access and try again."
          : err.message || "Could not verify location/device. Please try again."
      );
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── Still checking localStorage on first render ──
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // ── No stored user — show phone + OTP login gate ──
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm p-6">

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto flex items-center justify-center">
              {authStep === "phone" ? <Phone size={28} /> : <ShieldCheck size={28} />}
            </div>
            <h2 className="mt-4 font-bold text-lg">
              {authStep === "phone" ? "Login to Attendance" : "Verify OTP"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {authStep === "phone"
                ? "Enter your mobile number to continue"
                : `OTP sent to ${phoneNumber}`}
            </p>
          </div>

          {authStep === "phone" ? (
            <form onSubmit={handleSendOtp}>
              <label className="text-sm text-gray-500 mb-1 block">Mobile Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full border rounded-lg p-3"
                maxLength={10}
              />

              {authError && (
                <p className="text-red-500 text-sm mt-2">{authError}</p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="mt-5 w-full bg-blue-600 text-white py-3 rounded-lg font-medium disabled:opacity-60"
              >
                {authLoading ? "Sending..." : "Send OTP"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <label className="text-sm text-gray-500 mb-1 block">Enter OTP</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="4-digit OTP"
                className="w-full border rounded-lg p-3 tracking-widest text-center"
                maxLength={4}
              />

              {authError && (
                <p className="text-red-500 text-sm mt-2">{authError}</p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="mt-5 w-full bg-blue-600 text-white py-3 rounded-lg font-medium disabled:opacity-60"
              >
                {authLoading ? "Verifying..." : "Verify & Continue"}
              </button>

              <button
                type="button"
                className="mt-3 w-full text-gray-500 text-sm py-2"
                onClick={() => {
                  setAuthStep("phone");
                  setOtp("");
                  setAuthError("");
                  localStorage.removeItem(OTP_ID_STORAGE_KEY);
                }}
              >
                Change mobile number
              </button>
            </form>
          )}

        </div>
      </div>
    );
  }

  // ── Logged in — main attendance view ──
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center">

      {/* Card: header, user, status, history toggle */}

      <div className="w-full max-w-sm bg-white relative">

        {/* Header */}

        <div className="flex items-center justify-center p-4 border-b">
          <h2 className="font-bold text-lg">Attendance</h2>
        </div>

        {/* User */}

        <div className="text-center mt-8">
          <div className="w-20 h-20 bg-blue-100 rounded-full mx-auto flex items-center justify-center">
            <User size={40} />
          </div>

          <h2 className="mt-3 font-semibold text-xl">
            {user.username}
          </h2>

          <p className="text-gray-500">
            {user.userId}
          </p>
        </div>

        {/* Status */}

        <div className="mx-5 mt-8 bg-gray-50 rounded-xl p-5 shadow-sm">

          <p className="text-gray-500">
            Current Status
          </p>

          <h2
            className={`text-xl font-bold mt-2 ${
              loggedIn ? "text-green-600" : "text-red-500"
            }`}
          >
            {loggedIn ? "Logged In" : "Logged Out"}
          </h2>

          {!loggedIn ? (
            <button
              onClick={() => setConfirmAction("login")}
              className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg flex justify-center gap-2"
            >
              <LogIn size={20} />
              Login
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction("logout")}
              className="mt-6 w-full bg-red-500 text-white py-3 rounded-lg flex justify-center gap-2"
            >
              <LogOut size={20} />
              Logout
            </button>
          )}
        </div>

        {/* History toggle */}

        <div className="mx-5 mt-5 mb-8">
          <button
            onClick={() => {
              const opening = !showHistory;
              setShowHistory(opening);
              if (opening && (historyStale || history.length === 0)) {
                fetchHistory();
              }
            }}
            className="w-full border border-gray-300 text-gray-700 py-3 rounded-lg flex justify-center items-center gap-2 font-medium"
          >
            <Clock size={18} />
            {showHistory ? "Hide History" : "View History"}
          </button>
        </div>

      </div>

      {/* History table — not boxed into the card's max-w-sm; scrolls
          horizontally on its own so wide content can be reached by sliding
          the screen rather than being clipped or forced to wrap. */}

      {showHistory && (
        <div className="w-full overflow-x-auto">
          {historyLoading ? (
            <p className="text-center text-gray-500 py-6 text-sm">Loading history...</p>
          ) : historyError ? (
            <div className="text-center py-6">
              <p className="text-red-500 text-sm">{historyError}</p>
              <button
                onClick={fetchHistory}
                className="mt-2 text-blue-600 text-sm underline"
              >
                Retry
              </button>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">No attendance records yet.</p>
          ) : (
            <table className="w-full text-sm border-t">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Date</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">User ID</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Login Time</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Logout Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, index) => (
                  <tr
                    key={item.id ?? index}
                    className={index !== history.length - 1 ? "border-b" : ""}
                  >
                    <td className="py-2 px-3 whitespace-nowrap">{formatDateOnly(item.date)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{item.userId}</td>
                    <td className="py-2 px-3 text-green-600 whitespace-nowrap">
                      {formatTimeOnly(item.loginDateTime)}
                    </td>
                    <td className="py-2 px-3 text-red-500 whitespace-nowrap">
                      {formatTimeOnly(item.logoutDateTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Confirm popup (shared for login + logout) */}

      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">

          <div className="bg-white rounded-xl w-80 p-5">

            <h3 className="font-bold text-lg">
              {confirmAction === "login" ? "Confirm Login" : "Confirm Logout"}
            </h3>

            <p className="text-gray-500 text-sm mt-2">
              Are you sure you want to {confirmAction === "login" ? "login" : "logout"}?
            </p>

            {confirmError && (
              <p className="text-red-500 text-sm mt-2">{confirmError}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 border rounded-lg py-2 disabled:opacity-60"
                onClick={() => {
                  setConfirmAction(null);
                  setConfirmError("");
                }}
                disabled={confirmLoading}
              >
                Cancel
              </button>

              <button
                className={`flex-1 text-white rounded-lg py-2 disabled:opacity-60 ${
                  confirmAction === "login" ? "bg-blue-600" : "bg-red-500"
                }`}
                onClick={handleConfirm}
                disabled={confirmLoading}
              >
                {confirmLoading ? "Please wait..." : "Confirm"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}