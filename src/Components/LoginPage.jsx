import React, { useState } from 'react';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

function LoginPage({ onLoginSuccess }) {
  const [userId, setUserId] = useState('');
  const [counterId, setCounterId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/Auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          counterId: counterId === '' ? null : Number(counterId),
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Login failed.');
        return;
      }

      onLoginSuccess(data.isAdmin, counterId, userId);
    } catch (err) {
      console.error('Login error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <form onSubmit={handleSubmit} style={styles.loginBox}>
        <h2 style={styles.title}>Login</h2>

        <input
          type="number"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={styles.input}
          autoFocus
          required
        />
        <input
          type="number"
          placeholder="Counter ID (leave blank for admin)"
          value={counterId}
          onChange={(e) => setCounterId(e.target.value)}
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  loginBox: {
    backgroundColor: '#fff',
    padding: '2rem 2.5rem',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: '320px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
  },
  title: {
    margin: '0 0 10px 0',
    textAlign: 'center'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  error: {
    color: '#dc3545',
    fontSize: '0.85rem',
    margin: 0
  },
  button: {
    marginTop: '6px',
    width: '100%',
    padding: '10px',
    backgroundColor: '#0056b3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem'
  }
};

export default LoginPage;