import React, { useState, useEffect } from 'react';

function Quotation({ onClose, onLoadQuotation }) {
  const [quotations, setQuotations] = useState([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('savedQuotations') || '[]');
    // most recently saved first
    setQuotations(saved.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)));
  }, []);

  const handleDelete = (invoiceNumber, e) => {
    e.stopPropagation(); // don't trigger the row's onClick (load)
    const updated = quotations.filter((q) => q.invoiceNumber !== invoiceNumber);
    setQuotations(updated);
    localStorage.setItem('savedQuotations', JSON.stringify(updated));
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <button style={styles.closeButton} onClick={onClose}>&times;</button>

        <h2 style={styles.title}>Saved Quotations</h2>

        {quotations.length === 0 ? (
          <p style={styles.emptyText}>No saved quotations yet.</p>
        ) : (
          <ul style={styles.list}>
            {quotations.map((q) => {
              const itemCount = (q.cart ?? []).reduce((sum, i) => sum + i.quantity, 0);
              const total = (q.cart ?? []).reduce((sum, i) => sum + i.price * i.quantity, 0);

              return (
                <li
                  key={q.invoiceNumber}
                  style={styles.listItem}
                  onClick={() => onLoadQuotation(q)}
                >
                  <div style={styles.listItemInfo}>
                    <span style={styles.invoiceNumber}>#{q.invoiceNumber}</span>
                    <span style={styles.metaText}>
                      {q.customer?.customerName ?? q.customer?.name ?? 'No customer'} · {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <span style={styles.metaText}>
                      {new Date(q.savedAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={styles.listItemRight}>
                    <strong>₹{total.toFixed(2)}</strong>
                    <button
                      style={styles.deleteButton}
                      onClick={(e) => handleDelete(q.invoiceNumber, e)}
                    >
                      &times;
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modalWindow: {
    backgroundColor: '#fff',
    padding: '30px',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '450px',
    maxHeight: '70vh',
    overflowY: 'auto',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    position: 'relative'
  },
  closeButton: {
    position: 'absolute',
    top: '15px',
    right: '15px',
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#666',
    lineHeight: '1'
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '1.4rem',
    color: '#333'
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic'
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    border: '1px solid #eee',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#fafafa'
  },
  listItemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  invoiceNumber: {
    fontWeight: 'bold',
    fontSize: '0.95rem'
  },
  metaText: {
    fontSize: '0.75rem',
    color: '#777'
  },
  listItemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    color: '#dc3545',
    fontSize: '1.2rem',
    cursor: 'pointer',
    lineHeight: '1'
  }
};

export default Quotation;