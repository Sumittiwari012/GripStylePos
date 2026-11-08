import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

// yyyy-MM-dd, required format for <input type="date">
const todayIso = () => new Date().toLocaleDateString('en-CA');

// createdDate comes from the server as "2026-11-08T14:32:10..." (IST).
// Take the date part as-is so the browser's timezone can never shift the day.
const dayOf = (d) => String(d).slice(0, 10);
const cashKey = (counterId, createdDate) => `${counterId}|${dayOf(createdDate)}`;

const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d) => `${fmtDate(d)}, ${fmtTime(d)}`;
const money = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ───────────── small presentational pieces ───────────── */

function StatusPill({ accepted }) {
  return accepted ? (
    <span className="adm-pill adm-pill--ok">Accepted</span>
  ) : (
    <span className="adm-pill adm-pill--wait">Pending</span>
  );
}

function Notice({ kind, children }) {
  if (!children) return null;
  return (
    <p className={`adm-notice adm-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

function Empty({ children }) {
  return <p className="adm-empty">{children}</p>;
}

/* ───────────── page ───────────── */

function Admin() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);

  // ---- Counter-wise cash (same /DateRangeReport endpoint the Report page uses) ----
  // key: "counterId|yyyy-MM-dd"  ->  { loading } | { error } | { amount, count }
  const [cashByKey, setCashByKey] = useState({});

  const loadCashFor = async (rows) => {
    const unique = new Map();
    rows.forEach((s) => unique.set(cashKey(s.counterId, s.createdDate), s));

    await Promise.all(
      [...unique.entries()].map(async ([key, s]) => {
        const day = dayOf(s.createdDate);
        setCashByKey((prev) => ({ ...prev, [key]: { loading: true } }));
        try {
          const params = new URLSearchParams({
            startDate: day,
            endDate: day,
            counterId: s.counterId
          });
          const res = await fetch(`${API_BASE_URL}/DateRangeReport?${params}`);
          if (!res.ok) throw new Error('Request failed');
          const data = await res.json();
          setCashByKey((prev) => ({
            ...prev,
            [key]: {
              amount: Number(data?.cash?.totalAmount ?? 0),
              count: data?.cash?.transactionCount ?? 0
            }
          }));
        } catch (err) {
          console.error('Cash lookup error:', err);
          setCashByKey((prev) => ({ ...prev, [key]: { error: true } }));
        }
      })
    );
  };

  const renderCash = (s) => {
    const c = cashByKey[cashKey(s.counterId, s.createdDate)];
    if (!c || c.loading) return <span className="adm-muted">Loading…</span>;
    if (c.error) return <span className="adm-muted" title="Could not load cash for this counter">Unavailable</span>;
    return (
      <span className="adm-cash">
        <span className="adm-cash__amount">{money(c.amount)}</span>
        <span className="adm-cash__count">
          {c.count} transaction{c.count === 1 ? '' : 's'}
        </span>
      </span>
    );
  };

  // ---- Counter-wise petty cash (same date-range endpoint as the Petty cash history) ----
  // key: "counterId|yyyy-MM-dd"  ->  { loading } | { error } | { amount, count }
  const [pettyByKey, setPettyByKey] = useState({});

  // One request covers every row: fetch the whole date span, then add up each counter's entries per day.
  const loadPettyFor = async (rows) => {
    if (!rows.length) return;

    const keys = [...new Set(rows.map((s) => cashKey(s.counterId, s.createdDate)))];
    const days = rows.map((s) => dayOf(s.createdDate)).sort();
    const fromDate = days[0];
    const toDate = days[days.length - 1];

    setPettyByKey((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = { loading: true }; });
      return next;
    });

    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const res = await fetch(`${API_BASE_URL}/api/PettyCash/GetPettyCash?${params}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('Request failed');

      const totals = {};
      data.forEach((p) => {
        const k = cashKey(p.counterId, p.date);
        const t = (totals[k] ||= { amount: 0, count: 0 });
        t.amount += Number(p.pettyCash || 0);
        t.count += 1;
      });

      setPettyByKey((prev) => {
        const next = { ...prev };
        keys.forEach((k) => { next[k] = totals[k] || { amount: 0, count: 0 }; });
        return next;
      });
    } catch (err) {
      console.error('Petty cash lookup error:', err);
      setPettyByKey((prev) => {
        const next = { ...prev };
        keys.forEach((k) => { next[k] = { error: true }; });
        return next;
      });
    }
  };

  const renderPetty = (s) => {
    const c = pettyByKey[cashKey(s.counterId, s.createdDate)];
    if (!c || c.loading) return <span className="adm-muted">Loading…</span>;
    if (c.error) return <span className="adm-muted" title="Could not load petty cash for this counter">Unavailable</span>;
    if (c.count === 0) return <span className="adm-muted">None given</span>;
    return (
      <span className="adm-cash">
        <span className="adm-cash__amount">{money(c.amount)}</span>
        <span className="adm-cash__count">
          {c.count} entr{c.count === 1 ? 'y' : 'ies'}
        </span>
      </span>
    );
  };

  // Cash + petty cash for one counter on one day
  const amountsFor = (s) => {
    const k = cashKey(s.counterId, s.createdDate);
    const c = cashByKey[k];
    const p = pettyByKey[k];
    if (!c || !p || c.loading || p.loading) return { state: 'loading' };
    if (c.error || p.error) return { state: 'error' };
    return { state: 'ok', cash: c.amount, petty: p.amount, total: c.amount + p.amount };
  };

  const renderTotal = (s) => {
    const a = amountsFor(s);
    if (a.state === 'loading') return <span className="adm-muted">Loading…</span>;
    if (a.state === 'error') return <span className="adm-muted" title="Cash or petty cash could not be loaded">Unavailable</span>;
    return (
      <span className="adm-cash">
        <span className="adm-cash__amount">{money(a.total)}</span>
        <span className="adm-cash__count">cash + petty</span>
      </span>
    );
  };

  const fetchPending = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/SettlementRequest/pending`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Could not load settlements.');
        return;
      }

      setSettlements(data);
      loadCashFor(data);
      loadPettyFor(data);
    } catch (err) {
      console.error('Fetch pending settlements error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (counterId, id) => {
    setApprovingId(id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/SettlementRequest/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterId })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Could not approve settlement.');
        return;
      }

      // Remove it from the list once approved
      setSettlements((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Approve settlement error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setApprovingId(null);
    }
  };

  // ---- Settlement by date range state ----
  const [settlementRangeStart, setSettlementRangeStart] = useState(todayIso());
  const [settlementRangeEnd, setSettlementRangeEnd] = useState(todayIso());
  const [settlementRangeResults, setSettlementRangeResults] = useState([]);
  const [settlementRangeLoading, setSettlementRangeLoading] = useState(true);
  const [settlementRangeError, setSettlementRangeError] = useState('');

  const fetchSettlementRange = async () => {
    if (!settlementRangeStart || !settlementRangeEnd) {
      setSettlementRangeError('Please select both a start and end date.');
      return;
    }
    setSettlementRangeLoading(true);
    setSettlementRangeError('');
    try {
      const params = new URLSearchParams({
        startDate: settlementRangeStart,
        endDate: settlementRangeEnd
      });
      const response = await fetch(`${API_BASE_URL}/api/SettlementRequest/GetSettlementByDateRange?${params}`);
      const data = await response.json();

      if (!response.ok) {
        setSettlementRangeError(data.message || 'Could not load settlements for this range.');
        return;
      }

      setSettlementRangeResults(data);
      loadCashFor(data);
      loadPettyFor(data);
    } catch (err) {
      console.error('Fetch settlement range error:', err);
      setSettlementRangeError('Could not reach the server. Please try again.');
    } finally {
      setSettlementRangeLoading(false);
    }
  };

  // Load today's settlements by default on mount
  useEffect(() => {
    fetchSettlementRange();
  }, []);

  // ---- Add Petty Cash state ----
  const [counters, setCounters] = useState([]);
  const [selectedCounterId, setSelectedCounterId] = useState('');
  const [amount, setAmount] = useState('');
  const [loadingCounters, setLoadingCounters] = useState(true);
  const [submittingPettyCash, setSubmittingPettyCash] = useState(false);
  const [pettyCashError, setPettyCashError] = useState('');
  const [pettyCashSuccess, setPettyCashSuccess] = useState('');

  const [selectedDate, setSelectedDate] = useState(todayIso());

  const fetchCounters = async () => {
    setLoadingCounters(true);
    setPettyCashError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/PettyCash/counters`);
      const data = await response.json();

      if (!response.ok) {
        setPettyCashError(data.message || 'Could not load counters.');
        return;
      }

      setCounters(data);
    } catch (err) {
      console.error('Fetch counters error:', err);
      setPettyCashError('Could not reach the server. Please try again.');
    } finally {
      setLoadingCounters(false);
    }
  };

  useEffect(() => {
    fetchCounters();
  }, []);

  const handleAddPettyCash = async () => {
    setPettyCashError('');
    setPettyCashSuccess('');

    if (!selectedCounterId) {
      setPettyCashError('Please select a counter.');
      return;
    }
    if (!selectedDate) {
      setPettyCashError('Please select a date.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setPettyCashError('Please enter a valid amount.');
      return;
    }

    // Admin's user id — adjust the source (auth context, session, etc.)
    // to match however your app tracks the logged-in admin.
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setPettyCashError('No logged-in user found. Please log in again.');
      return;
    }

    setSubmittingPettyCash(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/PettyCash/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          counterId: Number(selectedCounterId),
          pettyCash: parsedAmount,
          date: selectedDate
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setPettyCashError(data.message || 'Could not add petty cash.');
        return;
      }

      setPettyCashSuccess(`Petty cash of ${money(parsedAmount)} added successfully.`);
      setSelectedCounterId('');
      setAmount('');
      // Refresh the range view so the new entry shows up if it falls in the current window
      fetchPettyCashRange();
    } catch (err) {
      console.error('Add petty cash error:', err);
      setPettyCashError('Could not reach the server. Please try again.');
    } finally {
      setSubmittingPettyCash(false);
    }
  };

  // ---- Petty cash by date range state ----
  const [pettyCashRangeStart, setPettyCashRangeStart] = useState(todayIso());
  const [pettyCashRangeEnd, setPettyCashRangeEnd] = useState(todayIso());
  const [pettyCashRangeResults, setPettyCashRangeResults] = useState([]);
  const [pettyCashRangeLoading, setPettyCashRangeLoading] = useState(true);
  const [pettyCashRangeError, setPettyCashRangeError] = useState('');

  const fetchPettyCashRange = async () => {
    if (!pettyCashRangeStart || !pettyCashRangeEnd) {
      setPettyCashRangeError('Please select both a start and end date.');
      return;
    }
    setPettyCashRangeLoading(true);
    setPettyCashRangeError('');
    try {
      const params = new URLSearchParams({
        fromDate: pettyCashRangeStart,
        toDate: pettyCashRangeEnd
      });
      const response = await fetch(`${API_BASE_URL}/api/PettyCash/GetPettyCash?${params}`);
      const data = await response.json();

      if (!response.ok) {
        setPettyCashRangeError(data.message || 'Could not load petty cash entries for this range.');
        return;
      }

      setPettyCashRangeResults(data);
    } catch (err) {
      console.error('Fetch petty cash range error:', err);
      setPettyCashRangeError('Could not reach the server. Please try again.');
    } finally {
      setPettyCashRangeLoading(false);
    }
  };

  // Load today's petty cash entries by default on mount
  useEffect(() => {
    fetchPettyCashRange();
  }, []);

  const counterName = (id) => counters.find((c) => Number(c.id) === Number(id))?.counterName;

  // Counter cash across every counter in the history range.
  // Each counter + day is counted once, even if it has more than one settlement row.
  const settlementSummary = (() => {
    const seen = new Set();
    const counterIds = new Set();
    let cash = 0;
    let petty = 0;
    let isLoading = false;
    let hasError = false;
    settlementRangeResults.forEach((s) => {
      const k = cashKey(s.counterId, s.createdDate);
      if (seen.has(k)) return;
      seen.add(k);
      counterIds.add(s.counterId);
      const a = amountsFor(s);
      if (a.state === 'loading') isLoading = true;
      else if (a.state === 'error') hasError = true;
      else {
        cash += a.cash;
        petty += a.petty;
      }
    });
    return { cash, petty, total: cash + petty, counters: counterIds.size, isLoading, hasError };
  })();

  const pettyCashTotal = pettyCashRangeResults.reduce((sum, p) => sum + Number(p.pettyCash || 0), 0);

  return (
    <div className="adm">
      <style>{css}</style>

      {/* ───────────── Pending settlement requests ───────────── */}
      <section className="adm-panel" aria-labelledby="pending-title">
        <header className="adm-panel__head">
          <div>
            <h2 id="pending-title" className="adm-title">Settlement requests waiting for approval</h2>
            <p className="adm-sub">
              {loading
                ? 'Checking for requests…'
                : settlements.length === 0
                ? "Today's requests will appear here."
                : `${settlements.length} request${settlements.length === 1 ? '' : 's'} from today`}
            </p>
          </div>
          <button className="adm-btn adm-btn--ghost" onClick={fetchPending} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <Notice kind="error">{error}</Notice>

        {!loading && settlements.length === 0 && !error && (
          <Empty>Nothing to approve right now. New requests show up here after a counter starts a settlement.</Empty>
        )}

        {settlements.length > 0 && (
          <ul className="adm-list">
            {settlements.map((s) => (
              <li key={s.id} className="adm-request">
                <div className="adm-request__who">
                  <span className="adm-request__name">{s.counterName}</span>
                  <span className="adm-muted">Counter #{s.counterId} · requested at {fmtTime(s.createdDate)}</span>
                </div>
                <div className="adm-request__cash">
                  <span className="adm-fieldlabel">Cash collected</span>
                  {renderCash(s)}
                </div>
                <div className="adm-request__cash">
                  <span className="adm-fieldlabel">Petty cash</span>
                  {renderPetty(s)}
                </div>
                <div className="adm-request__cash adm-request__total">
                  <span className="adm-fieldlabel">Total to settle</span>
                  {renderTotal(s)}
                </div>
                <button
                  className="adm-btn adm-btn--primary"
                  onClick={() => handleApprove(s.counterId, s.id)}
                  disabled={approvingId === s.id}
                >
                  {approvingId === s.id ? 'Approving…' : 'Approve settlement'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ───────────── Settlement history ───────────── */}
      <section className="adm-panel" aria-labelledby="history-title">
        <header className="adm-panel__head">
          <div>
            <h2 id="history-title" className="adm-title">Settlement history</h2>
            <p className="adm-sub">Cash, petty cash and their total are shown for each counter on the day of its request.</p>
          </div>
        </header>

        <div className="adm-filters">
          <label className="adm-field">
            <span className="adm-fieldlabel">From</span>
            <input
              className="adm-input"
              type="date"
              value={settlementRangeStart}
              onChange={(e) => setSettlementRangeStart(e.target.value)}
            />
          </label>
          <label className="adm-field">
            <span className="adm-fieldlabel">To</span>
            <input
              className="adm-input"
              type="date"
              value={settlementRangeEnd}
              onChange={(e) => setSettlementRangeEnd(e.target.value)}
            />
          </label>
          <button className="adm-btn adm-btn--primary" onClick={fetchSettlementRange} disabled={settlementRangeLoading}>
            {settlementRangeLoading ? 'Searching…' : 'Search'}
          </button>

          
        </div>

        <Notice kind="error">{settlementRangeError}</Notice>

        {!settlementRangeLoading && settlementRangeResults.length === 0 && !settlementRangeError && (
          <Empty>No settlement requests between these dates. Try a wider range.</Empty>
        )}

        {settlementRangeResults.length > 0 && (
          <div className="adm-table" role="table" aria-label="Settlement history">
            <div className="adm-tr adm-tr--head adm-tr--settle" role="row">
              <span role="columnheader">Counter</span>
              <span role="columnheader">Requested</span>
              <span role="columnheader" className="adm-right">Cash</span>
              <span role="columnheader" className="adm-right">Petty cash</span>
              <span role="columnheader" className="adm-right">Total</span>
              <span role="columnheader" className="adm-right">Status</span>
            </div>
            {settlementRangeResults.map((s) => (
              <div key={s.id} className="adm-tr adm-tr--settle" role="row">
                <span role="cell" className="adm-strong">
                  {s.counterName} <span className="adm-muted">#{s.counterId}</span>
                </span>
                <span role="cell" className="adm-muted" data-label="Requested">{fmtDateTime(s.createdDate)}</span>
                <span role="cell" className="adm-right" data-label="Cash">{renderCash(s)}</span>
                <span role="cell" className="adm-right" data-label="Petty cash">{renderPetty(s)}</span>
                <span role="cell" className="adm-right" data-label="Total">{renderTotal(s)}</span>
                <span role="cell" className="adm-right" data-label="Status"><StatusPill accepted={s.accepted} /></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ───────────── Petty cash ───────────── */}
      <section className="adm-panel" aria-labelledby="petty-title">
        <header className="adm-panel__head">
          <div>
            <h2 id="petty-title" className="adm-title">Petty cash</h2>
            <p className="adm-sub">Give a counter its starting cash for the day.</p>
          </div>
        </header>

        <div className="adm-split">
          {/* Add form */}
          <div className="adm-form">
            <h3 className="adm-subtitle">Add petty cash</h3>

            <Notice kind="error">{pettyCashError}</Notice>
            <Notice kind="success">{pettyCashSuccess}</Notice>

            <label className="adm-field">
              <span className="adm-fieldlabel">Counter</span>
              <select
                className="adm-input"
                value={selectedCounterId}
                onChange={(e) => setSelectedCounterId(e.target.value)}
                disabled={loadingCounters}
              >
                <option value="">{loadingCounters ? 'Loading counters…' : 'Select a counter'}</option>
                {counters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.counterName}
                  </option>
                ))}
              </select>
            </label>

            <div className="adm-form__row">
              <label className="adm-field">
                <span className="adm-fieldlabel">Date</span>
                <input
                  className="adm-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </label>
              <label className="adm-field">
                <span className="adm-fieldlabel">Amount (₹)</span>
                <input
                  className="adm-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            </div>

            <button className="adm-btn adm-btn--primary adm-btn--block" onClick={handleAddPettyCash} disabled={submittingPettyCash}>
              {submittingPettyCash ? 'Adding…' : 'Add petty cash'}
            </button>
          </div>

          {/* History */}
          <div className="adm-history">
            <h3 className="adm-subtitle">Petty cash history</h3>

            <div className="adm-filters">
              <label className="adm-field">
                <span className="adm-fieldlabel">From</span>
                <input
                  className="adm-input"
                  type="date"
                  value={pettyCashRangeStart}
                  onChange={(e) => setPettyCashRangeStart(e.target.value)}
                />
              </label>
              <label className="adm-field">
                <span className="adm-fieldlabel">To</span>
                <input
                  className="adm-input"
                  type="date"
                  value={pettyCashRangeEnd}
                  onChange={(e) => setPettyCashRangeEnd(e.target.value)}
                />
              </label>
              <button className="adm-btn adm-btn--ghost" onClick={fetchPettyCashRange} disabled={pettyCashRangeLoading}>
                {pettyCashRangeLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            <Notice kind="error">{pettyCashRangeError}</Notice>

            {!pettyCashRangeLoading && pettyCashRangeResults.length === 0 && !pettyCashRangeError && (
              <Empty>No petty cash entries between these dates.</Empty>
            )}

            {pettyCashRangeResults.length > 0 && (
              <>
                <div className="adm-table" role="table" aria-label="Petty cash history">
                  <div className="adm-tr adm-tr--head adm-tr--petty" role="row">
                    <span role="columnheader">Counter</span>
                    <span role="columnheader">Date</span>
                    <span role="columnheader" className="adm-right">Amount</span>
                    <span role="columnheader" className="adm-right">Status</span>
                  </div>
                  {pettyCashRangeResults.map((p) => (
                    <div key={p.id} className="adm-tr adm-tr--petty" role="row">
                      <span role="cell" className="adm-strong">
                        {counterName(p.counterId) || `Counter #${p.counterId}`}
                      </span>
                      <span role="cell" className="adm-muted" data-label="Date">{fmtDate(p.date)}</span>
                      <span role="cell" className="adm-right adm-num" data-label="Amount">{money(p.pettyCash)}</span>
                      <span role="cell" className="adm-right" data-label="Status"><StatusPill accepted={p.accepted} /></span>
                    </div>
                  ))}
                </div>
                <p className="adm-total">
                  Total for this range <strong className="adm-num">{money(pettyCashTotal)}</strong>
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────── styles ─────────────
   One scoped stylesheet (prefix "adm") so the layout can respond to screen size
   and show keyboard focus, which inline style objects cannot do. */
const css = `
.adm {
  --ink: #1d2433;
  --ink-soft: #5b6475;
  --ink-faint: #8a92a3;
  --line: #e3e6ec;
  --surface: #ffffff;
  --accent: #0b6bcb;
  --accent-dark: #0954a1;
  --ok: #1e7f43;
  --ok-bg: #e6f4ea;
  --wait: #9a5b00;
  --wait-bg: #fff3d6;
  --bad: #b42318;
  --bad-bg: #fdecea;

  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1040px;
  margin: 0 auto;
  padding: 20px 16px 40px;
  color: var(--ink);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.45;
}
.adm *, .adm *::before, .adm *::after { box-sizing: border-box; }

.adm-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px;
}
.adm-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.adm-title { margin: 0; font-size: 1.15rem; font-weight: 700; }
.adm-subtitle { margin: 0 0 12px; font-size: 1rem; font-weight: 700; }
.adm-sub { margin: 4px 0 0; color: var(--ink-soft); font-size: 0.88rem; }

.adm-muted { color: var(--ink-soft); }
.adm-strong { font-weight: 600; }
.adm-right { text-align: right; justify-self: end; }
.adm-num { font-variant-numeric: tabular-nums; }
.adm-fieldlabel { display: block; font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); margin-bottom: 4px; }

/* buttons */
.adm-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 9px 16px;
  font: inherit;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s, border-color 0.15s;
}
.adm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.adm-btn--primary { background: var(--accent); color: #fff; }
.adm-btn--primary:hover:not(:disabled) { background: var(--accent-dark); }
.adm-btn--ghost { background: #fff; color: var(--ink); border-color: #c9ceda; }
.adm-btn--ghost:hover:not(:disabled) { background: #f1f3f7; }
.adm-btn--block { width: 100%; padding: 11px 16px; }
.adm-btn:focus-visible, .adm-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* inputs */
.adm-field { display: flex; flex-direction: column; min-width: 0; }
.adm-input {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #c9ceda;
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 0.92rem;
}
.adm-input:disabled { background: #f1f3f7; color: var(--ink-faint); }
.adm-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}
.adm-filters .adm-field { width: 170px; }

/* notices */
.adm-notice { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; font-size: 0.88rem; }
.adm-notice--error { background: var(--bad-bg); color: var(--bad); }
.adm-notice--success { background: var(--ok-bg); color: var(--ok); }
.adm-empty {
  margin: 0;
  padding: 22px 16px;
  text-align: center;
  color: var(--ink-soft);
  background: #fafbfc;
  border: 1px dashed var(--line);
  border-radius: 8px;
}

/* status pill */
.adm-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}
.adm-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.adm-pill--ok { background: var(--ok-bg); color: var(--ok); }
.adm-pill--wait { background: var(--wait-bg); color: var(--wait); }

/* cash figure */
.adm-cash { display: inline-flex; flex-direction: column; line-height: 1.2; }
.adm-cash__amount { font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.adm-cash__count { font-size: 0.76rem; color: var(--ink-faint); margin-top: 2px; }

/* counter cash summary beside Search */
.adm-sum {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  padding: 8px 14px;
  border: 1px solid #cfe0f5;
  border-radius: 8px;
  background: #f4f8fd;
}
.adm-sum .adm-fieldlabel { margin-bottom: 0; }
.adm-sum__total { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.adm-sum__parts { font-size: 0.78rem; color: var(--ink-soft); }
.adm-sum__warn { font-size: 0.76rem; color: var(--bad); margin-top: 2px; }

/* pending requests: the rows that need a decision */
.adm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.adm-request {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-left: 4px solid #e0a100;
  border-radius: 8px;
  background: #fffdf6;
}
.adm-request__who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.adm-request__name { font-weight: 700; font-size: 1rem; }
.adm-request__total { padding-left: 14px; border-left: 1px solid #f0e3b8; }

/* tables (div grids so they can reflow on phones) */
.adm-table { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.adm-tr {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
}
.adm-tr:last-child { border-bottom: none; }
.adm-tr--head { background: #f4f5f8; color: var(--ink-soft); font-size: 0.8rem; font-weight: 600; }
.adm-tr--settle { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 100px; }
.adm-tr--petty { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 100px; }
.adm-tr:not(.adm-tr--head):hover { background: #fafbfc; }

.adm-total { margin: 12px 0 0; text-align: right; color: var(--ink-soft); font-size: 0.9rem; }
.adm-total strong { color: var(--ink); margin-left: 6px; }

/* petty cash layout */
.adm-split { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 28px; align-items: start; }
.adm-form { display: flex; flex-direction: column; gap: 14px; }
.adm-form .adm-notice { margin: 0; }
.adm-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.adm-history { min-width: 0; }
.adm-history .adm-filters .adm-field { width: 150px; }

/* phones */
@media (max-width: 720px) {
  .adm { padding: 12px 10px 32px; }
  .adm-panel { padding: 16px 14px; }
  .adm-split { grid-template-columns: 1fr; gap: 24px; }
  .adm-filters .adm-field, .adm-history .adm-filters .adm-field { width: calc(50% - 6px); }
  .adm-filters .adm-btn { width: 100%; }
  .adm-sum { width: 100%; margin-left: 0; align-items: flex-start; text-align: left; }

  .adm-request { grid-template-columns: 1fr; gap: 10px; }
  .adm-request__total { padding-left: 0; border-left: none; }
  .adm-request .adm-btn { width: 100%; }

  .adm-tr--head { display: none; }
  .adm-tr--settle, .adm-tr--petty { grid-template-columns: 1fr 1fr; row-gap: 6px; }
  .adm-tr--settle > :first-child, .adm-tr--petty > :first-child { grid-column: 1 / -1; }
  .adm-tr [data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 0.72rem;
    color: var(--ink-faint);
    font-weight: 600;
  }
  .adm-right { text-align: left; justify-self: start; }
}

@media (prefers-reduced-motion: reduce) {
  .adm-btn { transition: none; }
}
`;

export default Admin;