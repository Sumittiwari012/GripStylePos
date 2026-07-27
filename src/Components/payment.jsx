import React, { useState } from 'react';

const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'WALLET'];

// Adjust this if your API is hosted elsewhere / behind a different base path.
const API_BASE = 'https://gripstyleapi.runasp.net/api/OtpChecker';

function Payment({
  invoiceNumber,
  payableAmount,
  walletBalance = 0,
  customerPhone, // required for the WalletOtp endpoint
  existingPayments = [],
  onUpdatePayments,
  onComplete,
  onClose,
  isSubmitting = false,
}) {
  const [payments, setPayments] = useState(existingPayments);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');

  // ── OTP flow state ──
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [pendingWalletAmount, setPendingWalletAmount] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSending, setOtpSending] = useState(false); // RecordOtp in flight
  const [otpVerifying, setOtpVerifying] = useState(false); // VerifyOtp in flight

  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(payableAmount - amountPaid, 0);
  const isFullyPaid = remaining <= 0.001; // float-safe check

  const walletUsed = payments
    .filter((p) => p.method === 'WALLET')
    .reduce((sum, p) => sum + p.amount, 0);
  const walletRemaining = Math.max(walletBalance - walletUsed, 0);

  const getCounterId = () => {
    // Adjust the key/source here to match however you store the logged-in counter.
    const raw = localStorage.getItem('counterId');
    const id = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(id) ? null : id;
  };

  const handleSelectMethod = (m) => {
    setMethod(m);
    setError('');

    if (m === 'WALLET') {
      // Default to using the full available wallet balance, capped at what's still owed.
      // The person can still edit this field down for a partial wallet payment.
      const defaultWalletAmount = Math.min(remaining, walletRemaining);
      setAmountInput(defaultWalletAmount > 0 ? defaultWalletAmount.toFixed(2) : '');
    } else {
      setAmountInput('');
    }
  };

  const commitPayment = (amt) => {
    const newPayments = [...payments, { method, amount: amt, paidAt: new Date().toISOString() }];
    setPayments(newPayments);
    onUpdatePayments(newPayments); // persist to parent's in-memory store, keyed by invoice
    setAmountInput('');
  };

  const validateAmount = (amt) => {
    if (!amt || amt <= 0) {
      return 'Enter a valid amount.';
    }
    if (amt > remaining + 0.001) {
      return `Amount exceeds remaining balance of ₹${remaining.toFixed(2)}.`;
    }
    if (method === 'WALLET' && amt > walletRemaining + 0.001) {
      return `Amount exceeds available wallet balance of ₹${walletRemaining.toFixed(2)}.`;
    }
    return '';
  };

  // ── Kicks off WalletOtp, then opens the OTP entry modal ──
  const startWalletOtpFlow = async (amt) => {
    const counterId = getCounterId();
    if (counterId == null) {
      setError('Could not determine counter ID. Please log in again.');
      return;
    }
    if (!customerPhone) {
      setError('No phone number on file for this customer — cannot send wallet OTP.');
      return;
    }

    setOtpSending(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/WalletOtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterId,
          phoneNumber: customerPhone,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.message || 'Failed to send OTP. Please try again.');
        return;
      }

      setPendingWalletAmount(amt);
      setOtpInput('');
      setOtpError('');
      setOtpModalOpen(true);
    } catch (err) {
      setError('Network error while sending OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleAddPayment = () => {
    const amt = Number(amountInput);
    const validationError = validateAmount(amt);
    setError(validationError);
    if (validationError) return;

    if (method === 'WALLET') {
      // Don't add the payment yet — first confirm the customer's identity via OTP.
      startWalletOtpFlow(amt);
      return;
    }

    commitPayment(amt);
  };

  const handleVerifyOtp = async () => {
    const counterId = getCounterId();
    const otpVal = Number(otpInput);

    if (!otpVal || otpInput.trim().length === 0) {
      setOtpError('Enter the OTP sent to the customer.');
      return;
    }
    if (counterId == null) {
      setOtpError('Could not determine counter ID. Please log in again.');
      return;
    }

    setOtpVerifying(true);
    setOtpError('');

    try {
      const response = await fetch(`${API_BASE}/VerifyOtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterId,
          otpVal,
          // WalletOtp hardcodes "NEW" as the InvoiceNumber on the record it saves —
          // VerifyOtp must be sent the same value to find a match. If the backend is
          // later updated to store the real invoice number instead, swap this back to `invoiceNumber`.
          invoiceNumber: 'NEW',
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setOtpError(data?.message || 'Invalid OTP. Please try again.');
        return;
      }

      // OTP verified — now actually add the wallet payment.
      commitPayment(pendingWalletAmount);
      setOtpModalOpen(false);
      setPendingWalletAmount(null);
      setOtpInput('');
    } catch (err) {
      setOtpError('Network error while verifying OTP. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleCancelOtp = () => {
    setOtpModalOpen(false);
    setPendingWalletAmount(null);
    setOtpInput('');
    setOtpError('');
  };

  const handlePayFull = () => {
    const cap = method === 'WALLET' ? Math.min(remaining, walletRemaining) : remaining;
    setAmountInput(cap.toFixed(2));
  };

  const handleRemovePayment = (index) => {
    const newPayments = payments.filter((_, i) => i !== index);
    setPayments(newPayments);
    onUpdatePayments(newPayments);
  };

  const handleConfirm = () => {
    if (isFullyPaid) {
      onComplete();
    } else {
      onClose(); // partial payment — keep progress in memory, close for now
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <button style={styles.closeButton} onClick={onClose}>&times;</button>

        <h2 style={styles.title}>Payment — #{invoiceNumber}</h2>

        <div style={styles.amountSummary}>
          <div style={styles.amountRow}>
            <span>Payable Amount:</span>
            <strong>₹{payableAmount.toFixed(2)}</strong>
          </div>
          <div style={styles.amountRow}>
            <span>Paid:</span>
            <span>₹{amountPaid.toFixed(2)}</span>
          </div>
          {walletBalance > 0 && (
            <div style={styles.amountRow}>
              <span>Wallet Available:</span>
              <span>₹{walletRemaining.toFixed(2)}</span>
            </div>
          )}
          <div style={{ ...styles.amountRow, ...styles.remainingRow }}>
            <span>Remaining:</span>
            <strong style={{ color: isFullyPaid ? '#28a745' : '#dc3545' }}>
              ₹{remaining.toFixed(2)}
            </strong>
          </div>
        </div>

        {!isFullyPaid && (
          <div style={styles.entryForm}>
            <div style={styles.methodRow}>
              {PAYMENT_METHODS.map((m) => {
                const isWalletDisabled = m === 'WALLET' && walletRemaining <= 0.001;
                return (
                  <button
                    key={m}
                    onClick={() => handleSelectMethod(m)}
                    disabled={isWalletDisabled}
                    style={{
                      ...styles.methodButton,
                      ...(method === m ? styles.methodButtonActive : {}),
                      ...(isWalletDisabled ? styles.methodButtonDisabled : {}),
                    }}
                  >
                    {m === 'WALLET' ? `WALLET (₹${walletRemaining.toFixed(2)})` : m}
                  </button>
                );
              })}
            </div>

            <div style={styles.inputRow}>
              <input
                type="number"
                placeholder="Amount"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                style={styles.amountInput}
              />
              <button onClick={handlePayFull} style={styles.fullButton}>Pay Full</button>
              <button onClick={handleAddPayment} style={styles.addButton} disabled={otpSending}>
                {otpSending && method === 'WALLET' ? 'Sending OTP...' : 'Add'}
              </button>
            </div>

            {error && <p style={styles.errorText}>{error}</p>}
          </div>
        )}

        {payments.length > 0 && (
          <div style={styles.paymentsList}>
            <h3 style={styles.subTitle}>Payments Made</h3>
            {payments.map((p, i) => (
              <div key={i} style={styles.paymentRow}>
                <span>{p.method}</span>
                <span>₹{p.amount.toFixed(2)}</span>
                <button onClick={() => handleRemovePayment(i)} style={styles.removeButton}>&times;</button>
              </div>
            ))}
          </div>
        )}

        <button
          style={{
            ...styles.confirmButton,
            backgroundColor: isFullyPaid ? '#28a745' : '#6c757d',
            opacity: isSubmitting ? 0.7 : 1,
          }}
          onClick={handleConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Processing...' : isFullyPaid ? 'Confirm Payment' : 'Save & Close (Continue Later)'}
        </button>
      </div>

      {otpModalOpen && (
        <div style={styles.otpOverlay}>
          <div style={styles.otpWindow}>
            <button style={styles.closeButton} onClick={handleCancelOtp}>&times;</button>
            <h3 style={styles.title}>Verify OTP</h3>
            <p style={styles.otpHint}>
              An OTP was sent to the customer's WhatsApp for invoice #{invoiceNumber}.
              Enter it below to confirm the wallet payment of ₹{pendingWalletAmount?.toFixed(2)}.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter 4-digit OTP"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              style={styles.amountInput}
              maxLength={4}
              autoFocus
            />
            {otpError && <p style={styles.errorText}>{otpError}</p>}
            <div style={styles.otpButtonRow}>
              <button onClick={handleCancelOtp} style={styles.fullButton} disabled={otpVerifying}>
                Cancel
              </button>
              <button onClick={handleVerifyOtp} style={styles.addButton} disabled={otpVerifying}>
                {otpVerifying ? 'Checking...' : 'Check'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  modalWindow: {
    backgroundColor: '#fff', padding: '30px', borderRadius: '8px',
    width: '90%', maxWidth: '420px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    position: 'relative',
  },
  otpOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 1100,
  },
  otpWindow: {
    backgroundColor: '#fff', padding: '25px', borderRadius: '8px',
    width: '90%', maxWidth: '340px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
    position: 'relative',
  },
  otpHint: { fontSize: '0.85rem', color: '#555', margin: '0 0 15px 0', lineHeight: 1.4 },
  otpButtonRow: { display: 'flex', gap: '8px', marginTop: '12px' },
  closeButton: {
    position: 'absolute', top: '15px', right: '15px', background: 'none',
    border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666', lineHeight: '1',
  },
  title: { margin: '0 0 20px 0', fontSize: '1.3rem', color: '#333' },
  subTitle: { margin: '15px 0 8px 0', fontSize: '1rem', color: '#333' },
  amountSummary: {
    backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '12px', marginBottom: '15px',
  },
  amountRow: {
    display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem',
    color: '#555', marginBottom: '6px',
  },
  remainingRow: {
    borderTop: '1px dashed #ccc', paddingTop: '6px', marginBottom: 0, fontSize: '1rem',
  },
  entryForm: { display: 'flex', flexDirection: 'column', gap: '10px' },
  methodRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  methodButton: {
    padding: '8px 14px', border: '1px solid #ccc', borderRadius: '20px',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem',
  },
  methodButtonActive: {
    backgroundColor: '#007bff', color: '#fff', borderColor: '#007bff',
  },
  methodButtonDisabled: {
    opacity: 0.5, cursor: 'not-allowed',
  },
  inputRow: { display: 'flex', gap: '8px' },
  amountInput: {
    flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem',
  },
  fullButton: {
    padding: '10px 12px', backgroundColor: '#eee', border: '1px solid #ccc',
    borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap',
  },
  addButton: {
    padding: '10px 16px', backgroundColor: '#28a745', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
  },
  errorText: { color: '#dc3545', fontSize: '0.85rem', margin: 0 },
  paymentsList: { marginTop: '10px' },
  paymentRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', backgroundColor: '#fafafa', borderRadius: '4px', marginBottom: '6px',
    fontSize: '0.9rem',
  },
  removeButton: {
    background: 'none', border: 'none', color: '#dc3545', fontSize: '1.1rem', cursor: 'pointer',
  },
  confirmButton: {
    marginTop: '15px', width: '100%', padding: '12px', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem',
  },
};

export default Payment;