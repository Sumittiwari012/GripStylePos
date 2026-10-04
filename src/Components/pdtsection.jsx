import React, { useState, useEffect } from 'react';
import './pdtsection.css';
import BillingSection from './billingSection';
import PurchaseMasterList from './Purchasemasterlist';
import PurchaseDetailList from './Purchasedetaillist';
import PaymentList from './Paymentlist';
import ReturnSection from './returnsection';
import Report from './report';
import LoginPage from './LoginPage';
import PettyCashCheck from './PettyCashCheck';
import Admin from './Admin';
const API_BASE_URL = 'https://gripstyleapi.runasp.net';

// Simple emoji placeholders for nav icons — swap these for real SVGs
// or an icon font/library whenever you have one wired up.
const NAV_ICONS = {
  products: '🛒',
  invoices: '🧾',
  invoiceDetail: '📑',
  payment: '💳',
  returns: '🔄',
  report: '📊',
  admin: '🛠️',
  freeze: '❄️',
  logout: '🚪'
};

const COLUMN_OPTIONS = [2, 3, 4];

const PINNED_KEY = 'pinnedProductIds';

// The top area (bar + pinned products) stays at the top of the screen while
// the page scrolls, whether the product grid is shown or hidden.
const stickyWrapStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 5,
  background: '#fff',
  borderBottom: '1px solid #e5e7eb',
  boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
};

const barStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  padding: '10px 12px'
};

const pinnedStripStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 12px 10px',
  overflowX: 'auto'
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
  padding: '6px 8px 6px 12px',
  border: '1px solid #16a34a',
  borderRadius: '999px',
  background: '#f0fdf4',
  fontSize: '0.82rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const chipRemoveStyle = {
  border: 'none',
  background: 'transparent',
  color: '#6b7280',
  fontSize: '1rem',
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px'
};

// ─────────────────────────────────────────────────────────
// Product Listing — its own component, its own div.
// The top area (toggle, columns, search and the PINNED products) is always
// visible. Pin a product with the 📌 on its card and it stays in the pinned
// strip, one click from the cart, so it never has to be searched again.
// The product grid below is collapsed by default and opens on demand
// (or as soon as you type in the search). Pins are saved on this computer.
// ─────────────────────────────────────────────────────────
function ProductListing({
  products,
  loading,
  fetchError,
  onAddToCart,
  columnCount,
  onColumnCountChange,
  pinnedIds,
  onTogglePin
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter((product) =>
    (product.productName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // keep the order the cashier pinned them in; skip products that no longer exist
  const pinnedProducts = pinnedIds
    .map((id) => products.find((p) => String(p.id) === id))
    .filter(Boolean);

  return (
    <div className="pdt-product-listing">
      {/* Pinned area: always visible, whether the grid is open or hidden */}
      <div style={stickyWrapStyle}>
        <div className="pdt-listing-header" style={barStyle}>
          <h2 className="pdt-heading" style={{ margin: 0 }}>Current Listings</h2>

          <button
            type="button"
            className="pdt-toggle-btn"
            onClick={() => setIsOpen((prev) => !prev)}
          >
            {isOpen ? 'Hide Products' : 'Show Products'}
          </button>

          <div className="pdt-column-select">
            <label htmlFor="pdt-columns">Columns:</label>
            <select
              id="pdt-columns"
              value={columnCount}
              onChange={(e) => onColumnCountChange(Number(e.target.value))}
            >
              {COLUMN_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            placeholder="Search listings..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value) setIsOpen(true); // typing opens the grid
            }}
            className="pdt-search-input"
            style={{ flex: 1, minWidth: '140px' }}
          />
        </div>

        <div style={pinnedStripStyle}>
          <span style={{ fontSize: '0.8rem', color: '#6b7280', flexShrink: 0 }}>📌 Pinned:</span>

          {pinnedProducts.length === 0 && (
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              Nothing pinned yet. Open the products and click 📌 on a card to pin it here.
            </span>
          )}

          {pinnedProducts.map((product) => {
            const salePrice = Number(product.retailSalePrice) || 0;
            return (
              <div
                key={product.id}
                style={chipStyle}
                role="button"
                tabIndex={0}
                title="Click to add to the cart"
                onClick={() => onAddToCart(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAddToCart(product);
                  }
                }}
              >
                <span style={{ fontWeight: 600 }}>{product.productName}</span>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>₹{salePrice.toFixed(2)}</span>
                <button
                  type="button"
                  title="Unpin"
                  aria-label={`Unpin ${product.productName}`}
                  style={chipRemoveStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(product.id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {isOpen && (
        <>
          {loading && <p className="pdt-status-text">Loading products...</p>}
          {fetchError && <p className="pdt-error-text">{fetchError}</p>}

          {!loading && !fetchError && (
            <div
              className="pdt-grid"
              style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
            >
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const salePrice = Number(product.retailSalePrice) || 0;
                  const mrp = Number(product.mrp) || 0;
                  const hasDiscount = mrp > salePrice;
                  const isPinned = pinnedIds.includes(String(product.id));

                  return (
                    <div
                      key={product.id}
                      className="pdt-card pdt-card--clickable"
                      style={{ position: 'relative' }}
                      role="button"
                      tabIndex={0}
                      onClick={() => onAddToCart(product)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onAddToCart(product);
                        }
                      }}
                    >
                      <button
                        type="button"
                        title={isPinned ? 'Unpin' : 'Pin to the top'}
                        aria-label={isPinned ? `Unpin ${product.productName}` : `Pin ${product.productName}`}
                        aria-pressed={isPinned}
                        onClick={(e) => {
                          e.stopPropagation(); // don't add to the cart
                          onTogglePin(product.id);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '1.05rem',
                          lineHeight: 1,
                          opacity: isPinned ? 1 : 0.35,
                          filter: isPinned ? 'none' : 'grayscale(1)'
                        }}
                      >
                        📌
                      </button>

                      <h3 className="pdt-card-title" style={{ paddingRight: 24 }}>{product.productName}</h3>
                      <p className="pdt-card-row">Barcode: {product.barcode}</p>

                      <div className="pdt-card-price-row">
                        <span className="pdt-card-price">₹{salePrice.toFixed(2)}</span>
                        {mrp > 0 && (
                          <span className="pdt-card-mrp">
                            MRP:{' '}
                            <span className={hasDiscount ? 'pdt-card-mrp-strike' : ''}>
                              ₹{mrp.toFixed(2)}
                            </span>
                          </span>
                        )}
                      </div>

                      <p className="pdt-card-row">Quantity: <strong>{product.quantity}</strong></p>
                    </div>
                  );
                })
              ) : (
                <p className="pdt-status-text">No products match your search.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Pdtsection() {
  const [activeView, setActiveView] = useState('products'); // 'products' | 'invoices'

  const [columnCount, setColumnCount] = useState(4);
  // Billing panel is a fixed 50% of the viewport width, regardless
  // of how many product columns are showing.
  const billingWidth = '50%';

  const [isFrozen, setIsFrozen] = useState(() => {
    return localStorage.getItem('isFrozen') === 'true';
  });
  const [cart, setCart] = useState([]);

  // Pinned products (ids), saved on this computer so they survive a refresh
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
      return Array.isArray(saved) ? saved.map(String) : [];
    } catch {
      return [];
    }
  });

  const handleTogglePin = (id) => {
    setPinnedIds((prev) => {
      const key = String(id);
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key];
      try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
      return next;
    });
  };

  const handleAddToCart = (product) => {
    const salePrice = Number(product.retailSalePrice) || 0;
    const cgst = Number(product.CGST ?? product.cgst) || 0;
    const sgst = Number(product.SGST ?? product.sgst) || 0;
    const hsn = product.HSNCode ?? product.hsnCode ?? product.hsn ?? '-';

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prevCart,
        {
          id: product.id,
          name: product.productName,
          price: salePrice,
          mrp: Number(product.mrp) || 0,
          cgst,
          sgst,
          hsn,
          barcode: product.barcode,
          quantity: 1
        }
      ];
    });
  };
  const [passwordInput, setPasswordInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const FREEZE_PASSWORD = '1234';


  const [pettyCashAccepted, setPettyCashAccepted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('isAdmin') === 'true';
  });
  const [counterId, setCounterId] = useState(() => {
    return localStorage.getItem('counterId') || '';
  });
  const [userId, setUserId] = useState(() => {
    return localStorage.getItem('userId') || '';
  });

  const handleLoginSuccess = (adminFlag, cid, uid) => {
    setIsAdmin(adminFlag);
    setCounterId(cid);
    setUserId(uid);
    setIsLoggedIn(true);
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('isAdmin', String(adminFlag));
    localStorage.setItem('counterId', cid || '');
    localStorage.setItem('userId', uid || '');
  };

  // ── Logout state ────────────────────────────────────────
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [settlementPending, setSettlementPending] = useState(false);

  const clearSession = () => {
    setIsLoggedIn(false);
    setIsAdmin(false);
    setCounterId('');
    setUserId('');
    setPettyCashAccepted(false);
    setLogoutError('');
    setSettlementPending(false);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('counterId');
    localStorage.removeItem('userId');
  };

  const handleAuthToggle = async () => {
    setLogoutError('');
    setSettlementPending(false);

    // Admins have no MLoginLogout record on the backend, so just clear locally
    if (isAdmin) {
      clearSession();
      return;
    }

    setLoggingOut(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/Auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          counterId: Number(counterId)
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = data.message || 'Logout failed. Please try again.';
        if (msg.toLowerCase().includes('settlement')) {
          setSettlementPending(true);
        }
        setLogoutError(msg);
        return;
      }

      clearSession();
    } catch (err) {
      console.error('Logout error:', err);
      setLogoutError('Could not reach the server. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  // ── Product data from API ──────────────────────────────
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  // ── Logout state ────────────────────────────────────────


  useEffect(() => {
    if (!settlementPending) return;
    const timer = setTimeout(() => {
      setSettlementPending(false);
      setLogoutError('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [settlementPending]);
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const response = await fetch(`${API_BASE_URL}/getProducts`);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        setProducts(data);
      } catch (err) {
        setFetchError('Could not load products. Please try again.');
        console.error('Failed to fetch products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleFreeze = () => {
    setPasswordInput('');
    setUnlockError('');
    setIsFrozen(true);
    localStorage.setItem('isFrozen', 'true');
  };

  const handleUnlock = (e) => {
    e.preventDefault();
    if (passwordInput === FREEZE_PASSWORD) {
      setIsFrozen(false);
      setPasswordInput('');
      setUnlockError('');
      localStorage.removeItem('isFrozen');
    } else {
      setUnlockError('Incorrect password. Try again.');
    }
  };

  const handleNavClick = (view) => (e) => {
    e.preventDefault();
    setActiveView(view);
  };

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }
  if (!isAdmin && !pettyCashAccepted) {
    return (
      <PettyCashCheck
        counterId={counterId}
        userId={userId}
        onAccepted={() => setPettyCashAccepted(true)}
        onDenied={clearSession}
      />
    );
  }

  // Icon-only nav item: shows the emoji/icon always, reveals the
  // label as a tooltip on hover via the .pdt-nav-label span.
  const navItem = (view, label) => (
    <li>
      <a
        href={`#${view}`}
        onClick={handleNavClick(view)}
        className={`pdt-nav-link${activeView === view ? ' pdt-nav-link--active' : ''}`}
        aria-label={label}
      >
        <span className="pdt-nav-icon">{NAV_ICONS[view] ?? '•'}</span>
        <span className="pdt-nav-label">{label}</span>
      </a>
    </li>
  );

  return (
    <>
      <div className="pdt-shell">
        {/* Vertical sidebar navbar — icon-only squares, label on hover.
            position: fixed (set in CSS) so it stays put and never
            moves with horizontal scroll of the content area. */}
        <nav className="pdt-navbar pdt-navbar--vertical">
          <ul className="pdt-nav-links">
            {navItem('products', 'POS')}
            {navItem('invoices', 'Invoices')}
            {navItem('invoiceDetail', 'Invoice Detail')}
            {navItem('payment', 'Payment')}
            {navItem('returns', 'Returns')}
            {navItem('report', 'Report')}
            {isAdmin && navItem('admin', 'Admin')}
            <li>
              <button onClick={handleFreeze} className="pdt-nav-button" aria-label="Freeze">
                <span className="pdt-nav-icon">{NAV_ICONS.freeze}</span>
                <span className="pdt-nav-label">Freeze</span>
              </button>
            </li>
            <li>
              <button
                onClick={handleAuthToggle}
                className="pdt-nav-button pdt-nav-button--logout"
                disabled={loggingOut}
                aria-label={loggingOut ? 'Logging out...' : 'Logout'}
              >
                <span className="pdt-nav-icon">{NAV_ICONS.logout}</span>
                <span className="pdt-nav-label">
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </span>
              </button>
            </li>
          </ul>
        </nav>

        <div
          className="pdt-main"
          style={{ marginRight: activeView === 'products' ? billingWidth : 0 }}
        >
          {settlementPending && (
            <p className="pdt-alert">
              Settlement pending — please complete today's settlement before logging out.
            </p>
          )}
          {logoutError && !settlementPending && (
            <p className="pdt-alert">{logoutError}</p>
          )}

          {activeView === 'invoices' ? (
            <main className="pdt-content">
              <PurchaseMasterList />
            </main>
          ) : activeView === 'invoiceDetail' ? (
            <main className="pdt-content">
              <PurchaseDetailList />
            </main>
          ) : activeView === 'payment' ? (
            <main className="pdt-content">
              <PaymentList />
            </main>
          ) : activeView === 'returns' ? (
            <main className="pdt-content">
              <ReturnSection />
            </main>
          ) : activeView === 'report' ? (
            <main className="pdt-content">
              <Report />
            </main>
          ) : activeView === 'admin' ? (
            <main className="pdt-content">
              <Admin />
            </main>
          ) : (
            <main className="pdt-content">
              <ProductListing
                products={products}
                loading={loading}
                fetchError={fetchError}
                onAddToCart={handleAddToCart}
                columnCount={columnCount}
                onColumnCountChange={setColumnCount}
                pinnedIds={pinnedIds}
                onTogglePin={handleTogglePin}
              />
            </main>
          )}
        </div>

        {activeView === 'products' && (
          <div className="pdt-billing-panel" style={{ width: billingWidth }}>
            <BillingSection
              products={products}
              cart={cart}
              setCart={setCart}
            />
          </div>
        )}
      </div>

      {isFrozen && (
        <div className="pdt-overlay">
          <form onSubmit={handleUnlock} className="pdt-unlock-box">
            <h2 className="pdt-unlock-title">Screen Locked</h2>
            <p className="pdt-unlock-text">Enter password to unlock</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              autoFocus
              className="pdt-unlock-input"
            />
            {unlockError && <p className="pdt-unlock-error">{unlockError}</p>}
            <button type="submit" className="pdt-unlock-button">
              Unlock
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default Pdtsection;