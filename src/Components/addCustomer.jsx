import React, { useState } from 'react';

const API_BASE_URL = 'http://gripstyleapi.runasp.net';

// onCustomerAdded lets the parent (BillingSection) know a customer was created
function AddCustomer({ onClose, onCustomerAdded }) {
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    address: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCustomerInfo({ ...customerInfo, [name]: value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/addCustomer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Name: customerInfo.name,
          PhoneNumber: customerInfo.phone,
          Address: customerInfo.address
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const savedCustomer = await response.json();

      if (onCustomerAdded) {
        onCustomerAdded(savedCustomer);
      }

      onClose();
    } catch (err) {
      console.error('Failed to save customer:', err);
      setError('Could not save customer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalWindow}>
        <button style={styles.closeButton} onClick={onClose}>&times;</button>

        <h2 style={styles.title}>Add New Customer</h2>

        <form onSubmit={handleSave} style={styles.form}>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Customer Name</label>
            <input
              type="text"
              name="name"
              placeholder="e.g. John Doe"
              value={customerInfo.name}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Phone Number</label>
            <input
              type="tel"
              name="phone"
              placeholder="e.g. +1 555-0198"
              value={customerInfo.phone}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Address</label>
            <textarea
              name="address"
              placeholder="Full shipping/billing address"
              value={customerInfo.address}
              onChange={handleChange}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              required
            />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button type="submit" style={styles.saveButton} disabled={saving}>
            {saving ? 'Saving...' : 'Save Customer'}
          </button>

        </form>
      </div>
    </div>
  );
}

// Inline styles for the Modal
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent black
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000 // Ensures it sits on top of everything else
  },
  errorText: {
    color: '#dc3545',
    fontSize: '0.85rem',
    margin: 0
  },
  modalWindow: {
    backgroundColor: '#fff',
    padding: '30px',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '400px',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    position: 'relative' // Needed to position the close button absolutely
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  label: {
    fontWeight: 'bold',
    fontSize: '0.9rem',
    color: '#555'
  },
  input: {
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  saveButton: {
    marginTop: '10px',
    padding: '12px',
    backgroundColor: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem'
  }
};

export default AddCustomer;