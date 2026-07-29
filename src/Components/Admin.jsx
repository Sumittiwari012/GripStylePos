import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

// yyyy-MM-dd, required format for <input type="date">
const todayIso = () => new Date().toLocaleDateString('en-CA');

function Admin() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);

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

      setPettyCashSuccess(`Petty cash of ₹${parsedAmount} added successfully.`);
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

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <h2 style={styles.title}>Today's Settlement Requests</h2>
        <button style={styles.refreshButton} onClick={fetchPending} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {!loading && settlements.length === 0 && !error && (
        <p style={styles.emptyText}>No pending settlement requests for today.</p>
      )}

      {settlements.length > 0 && (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={styles.colCounter}>Counter</span>
            <span style={styles.colTime}>Requested At</span>
            <span style={styles.colAction}>Action</span>
          </div>
          {settlements.map((s) => (
            <div key={s.id} style={styles.tableRow}>
              <span style={styles.colCounter}>{s.counterName} (#{s.counterId})</span>
              <span style={styles.colTime}>
                {new Date(s.createdDate).toLocaleTimeString()}
              </span>
              <span style={styles.colAction}>
                <button
                  style={styles.approveButton}
                  onClick={() => handleApprove(s.counterId, s.id)}
                  disabled={approvingId === s.id}
                >
                  {approvingId === s.id ? 'Approving...' : 'Approve'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Settlement by date range section ---- */}
      <div style={styles.rangeSection}>
        <h2 style={styles.title}>Settlement History</h2>

        <div style={styles.rangeRow}>
          <div style={styles.field}>
            <label style={styles.label}>From</label>
            <input
              style={styles.input}
              type="date"
              value={settlementRangeStart}
              onChange={(e) => setSettlementRangeStart(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>To</label>
            <input
              style={styles.input}
              type="date"
              value={settlementRangeEnd}
              onChange={(e) => setSettlementRangeEnd(e.target.value)}
            />
          </div>
          <button
            style={styles.searchButton}
            onClick={fetchSettlementRange}
            disabled={settlementRangeLoading}
          >
            {settlementRangeLoading ? 'Loading...' : 'Search'}
          </button>
        </div>

        {settlementRangeError && <p style={styles.errorText}>{settlementRangeError}</p>}

        {!settlementRangeLoading && settlementRangeResults.length === 0 && !settlementRangeError && (
          <p style={styles.emptyText}>No settlement requests in this range.</p>
        )}

        {settlementRangeResults.length > 0 && (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <span style={styles.colCounter}>Counter</span>
              <span style={styles.colTime}>Date</span>
              <span style={styles.colAction}>Status</span>
            </div>
            {settlementRangeResults.map((s) => (
              <div key={s.id} style={styles.tableRow}>
                <span style={styles.colCounter}>{s.counterName} (#{s.counterId})</span>
                <span style={styles.colTime}>
                  {new Date(s.createdDate).toLocaleString()}
                </span>
                <span style={styles.colAction}>
                  {s.accepted ? (
                    <span style={styles.acceptedBadge}>Accepted</span>
                  ) : (
                    <span style={styles.pendingBadge}>Pending</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Add Petty Cash section ---- */}
      <div style={styles.pettyCashSection}>
        <h2 style={styles.title}>Add Petty Cash</h2>

        {pettyCashError && <p style={styles.errorText}>{pettyCashError}</p>}
        {pettyCashSuccess && <p style={styles.successText}>{pettyCashSuccess}</p>}

        <div style={styles.field}>
          <label style={styles.label}>Counter</label>
          <select
            style={styles.input}
            value={selectedCounterId}
            onChange={(e) => setSelectedCounterId(e.target.value)}
            disabled={loadingCounters}
          >
            <option value="">
              {loadingCounters ? 'Loading counters...' : 'Select a counter'}
            </option>
            {counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.counterName}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Date</label>
          <input
            style={styles.input}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Amount</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <button style={styles.approveButton} onClick={handleAddPettyCash} disabled={submittingPettyCash}>
          {submittingPettyCash ? 'Adding...' : 'Add'}
        </button>

        {/* ---- Petty cash by date range ---- */}
        <div style={styles.rangeSection}>
          <h3 style={{ ...styles.title, fontSize: '1.1rem' }}>Petty Cash History</h3>

          <div style={styles.rangeRow}>
            <div style={styles.field}>
              <label style={styles.label}>From</label>
              <input
                style={styles.input}
                type="date"
                value={pettyCashRangeStart}
                onChange={(e) => setPettyCashRangeStart(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>To</label>
              <input
                style={styles.input}
                type="date"
                value={pettyCashRangeEnd}
                onChange={(e) => setPettyCashRangeEnd(e.target.value)}
              />
            </div>
            <button
              style={styles.searchButton}
              onClick={fetchPettyCashRange}
              disabled={pettyCashRangeLoading}
            >
              {pettyCashRangeLoading ? 'Loading...' : 'Search'}
            </button>
          </div>

          {pettyCashRangeError && <p style={styles.errorText}>{pettyCashRangeError}</p>}

          {!pettyCashRangeLoading && pettyCashRangeResults.length === 0 && !pettyCashRangeError && (
            <p style={styles.emptyText}>No petty cash entries in this range.</p>
          )}

          {pettyCashRangeResults.length > 0 && (
            <div style={styles.table}>
              <div style={styles.tableHeader}>
                <span style={styles.colCounter}>Counter</span>
                <span style={styles.colTime}>Date</span>
                <span style={styles.colTime}>Amount</span>
                <span style={styles.colAction}>Status</span>
              </div>
              {pettyCashRangeResults.map((p) => (
  <div key={p.id} style={styles.tableRow}>
    <span style={styles.colCounter}>#{p.counterId}</span>
    <span style={styles.colTime}>
      {new Date(p.date).toLocaleDateString()}
    </span>
    <span style={styles.colTime}>₹{Number(p.pettyCash).toFixed(2)}</span>
    <span style={styles.colAction}>
      {p.accepted ? (
        <span style={styles.acceptedBadge}>Accepted</span>
      ) : (
        <span style={styles.pendingBadge}>Pending</span>
      )}
    </span>
  </div>
))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    padding: '10px'
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  title: {
    margin: 0,
    fontSize: '1.3rem'
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.85rem'
  },
  searchButton: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    height: '37px',
    alignSelf: 'flex-end'
  },
  errorText: {
    color: '#dc3545',
    fontSize: '0.9rem',
    marginBottom: '15px'
  },
  successText: {
    color: '#28a745',
    fontSize: '0.9rem',
    marginBottom: '15px'
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic'
  },
  table: {
    border: '1px solid #ddd',
    borderRadius: '6px',
    overflow: 'hidden'
  },
  tableHeader: {
    display: 'flex',
    backgroundColor: '#333',
    color: '#fff',
    padding: '10px 14px',
    fontWeight: 'bold',
    fontSize: '0.85rem'
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #eee',
    fontSize: '0.9rem'
  },
  colCounter: {
    flex: 2
  },
  colTime: {
    flex: 1,
    color: '#666'
  },
  colAction: {
    flex: 1,
    textAlign: 'right'
  },
  approveButton: {
    padding: '6px 14px',
    backgroundColor: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.8rem'
  },
  acceptedBadge: {
    color: '#28a745',
    fontWeight: 'bold',
    fontSize: '0.8rem'
  },
  pendingBadge: {
    color: '#dc3545',
    fontWeight: 'bold',
    fontSize: '0.8rem'
  },
  rangeSection: {
    marginTop: '30px',
    paddingTop: '20px',
    borderTop: '1px solid #ddd'
  },
  rangeRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    marginBottom: '15px',
    flexWrap: 'wrap'
  },
  pettyCashSection: {
    marginTop: '30px',
    paddingTop: '20px',
    borderTop: '1px solid #ddd',
    maxWidth: '500px'
  },
  field: {
    marginBottom: '14px',
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    marginBottom: '6px',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    color: '#333'
  },
  input: {
    padding: '8px 10px',
    fontSize: '0.9rem',
    border: '1px solid #ccc',
    borderRadius: '4px'
  },
  readOnlyInput: {
    backgroundColor: '#f2f2f2',
    color: '#666'
  }
};

export default Admin;