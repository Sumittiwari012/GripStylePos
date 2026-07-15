import React, { useState } from 'react';

const PAYMENT_METHODS = ['Cash', 'Card', 'UPI','WALLET'];

function Payment({ invoiceNumber, payableAmount, walletBalance = 0, existingPayments = [], onUpdatePayments, onComplete, onClose, isSubmitting = false })  {
  const [payments, setPayments] = useState(existingPayments);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');

  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(payableAmount - amountPaid, 0);
  const isFullyPaid = remaining <= 0.001; // float-safe check

  const walletUsed = payments
    .filter((p) => p.method === 'WALLET')
    .reduce((sum, p) => sum + p.amount, 0);
  const walletRemaining = Math.max(walletBalance - walletUsed, 0);

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

  const handleAddPayment = () => {
    const amt = Number(amountInput);
    setError('');

    if (!amt || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (amt > remaining + 0.001) {
      setError(`Amount exceeds remaining balance of ₹${remaining.toFixed(2)}.`);
      return;
    }
    if (method === 'WALLET' && amt > walletRemaining + 0.001) {
      setError(`Amount exceeds available wallet balance of ₹${walletRemaining.toFixed(2)}.`);
      return;
    }

    const newPayments = [...payments, { method, amount: amt, paidAt: new Date().toISOString() }];
    setPayments(newPayments);
    onUpdatePayments(newPayments); // persist to parent's in-memory store, keyed by invoice
    setAmountInput('');
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
          <div style={{...styles.amountRow, ...styles.remainingRow}}>
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
                      ...(isWalletDisabled ? styles.methodButtonDisabled : {})
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
              <button onClick={handleAddPayment} style={styles.addButton}>Add</button>
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
            opacity: isSubmitting ? 0.7 : 1
          }}
          onClick={handleConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Processing...' : isFullyPaid ? 'Confirm Payment' : 'Save & Close (Continue Later)'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000
  },
  modalWindow: {
    backgroundColor: '#fff', padding: '30px', borderRadius: '8px',
    width: '90%', maxWidth: '420px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    position: 'relative'
  },
  closeButton: {
    position: 'absolute', top: '15px', right: '15px', background: 'none',
    border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666', lineHeight: '1'
  },
  title: { margin: '0 0 20px 0', fontSize: '1.3rem', color: '#333' },
  subTitle: { margin: '15px 0 8px 0', fontSize: '1rem', color: '#333' },
  amountSummary: {
    backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '12px', marginBottom: '15px'
  },
  amountRow: {
    display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem',
    color: '#555', marginBottom: '6px'
  },
  remainingRow: {
    borderTop: '1px dashed #ccc', paddingTop: '6px', marginBottom: 0, fontSize: '1rem'
  },
  entryForm: { display: 'flex', flexDirection: 'column', gap: '10px' },
  methodRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  methodButton: {
    padding: '8px 14px', border: '1px solid #ccc', borderRadius: '20px',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem'
  },
  methodButtonActive: {
    backgroundColor: '#007bff', color: '#fff', borderColor: '#007bff'
  },
  methodButtonDisabled: {
    opacity: 0.5, cursor: 'not-allowed'
  },
  inputRow: { display: 'flex', gap: '8px' },
  amountInput: {
    flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem'
  },
  fullButton: {
    padding: '10px 12px', backgroundColor: '#eee', border: '1px solid #ccc',
    borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap'
  },
  addButton: {
    padding: '10px 16px', backgroundColor: '#28a745', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
  },
  errorText: { color: '#dc3545', fontSize: '0.85rem', margin: 0 },
  paymentsList: { marginTop: '10px' },
  paymentRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', backgroundColor: '#fafafa', borderRadius: '4px', marginBottom: '6px',
    fontSize: '0.9rem'
  },
  removeButton: {
    background: 'none', border: 'none', color: '#dc3545', fontSize: '1.1rem', cursor: 'pointer'
  },
  confirmButton: {
    marginTop: '15px', width: '100%', padding: '12px', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem'
  }
};

export default Payment;