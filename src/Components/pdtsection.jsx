import React, { useState, useEffect } from 'react';
import BillingSection from './billingSection';
import PurchaseMasterList from './Purchasemasterlist';
import PurchaseDetailList from './Purchasedetaillist';
import PaymentList from './Paymentlist';
import CustomerList from './Customerlist';
import ReturnSection from './returnsection';
const API_BASE_URL = 'https://gripstyleapi.runasp.net';

function Pdtsection() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('products'); // 'products' | 'invoices'

  const [isFrozen, setIsFrozen] = useState(() => {
    return localStorage.getItem('isFrozen') === 'true';
  });
  const [cart, setCart] = useState([]);

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

  const [isLoggedIn, setIsLoggedIn] = useState(true);

  // ── Product data from API ──────────────────────────────
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

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

  const filteredProducts = products.filter((product) =>
    (product.productName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const handleAuthToggle = () => {
    setIsLoggedIn((prev) => !prev);
  };

  const handleNavClick = (view) => (e) => {
    e.preventDefault();
    setActiveView(view);
  };

  return (
    <>
      <div className="product-section-wrapper">
        <nav className="product-nav" style={styles.navbar}>
          <ul style={styles.navLinks}>
            <li>
              <a
                href="#products"
                onClick={handleNavClick('products')}
                style={{
                  ...styles.link,
                  ...(activeView === 'products' ? styles.activeLink : {})
                }}
              >
                Listings
              </a>
            </li>
            <li>
              <a
                href="#invoices"
                onClick={handleNavClick('invoices')}
                style={{
                  ...styles.link,
                  ...(activeView === 'invoices' ? styles.activeLink : {})
                }}
              >
                Invoices
              </a>
            </li>
            <li>
              <a
                href="#invoiceDetail"
                onClick={handleNavClick('invoiceDetail')}
                style={{
                  ...styles.link,
                  ...(activeView === 'invoiceDetail' ? styles.activeLink : {})
                }}
              >
                Invoice Detail
              </a>
            </li>
            <li>
              <a
                href="#payment"
                onClick={handleNavClick('payment')}
                style={{
                  ...styles.link,
                  ...(activeView === 'payment' ? styles.activeLink : {})
                }}
              >
                Payment
              </a>
            </li>
            <li>
              <a
                href="#customers"
                onClick={handleNavClick('customers')}
                style={{
                  ...styles.link,
                  ...(activeView === 'customers' ? styles.activeLink : {})
                }}
              >
                Customers
              </a>
            </li>
            <li><a href="#returns"
  onClick={handleNavClick('returns')}
  style={{ ...styles.link, ...(activeView === 'returns' ? styles.activeLink : {}) }}
>Returns</a></li>
           

            <li>
              <button onClick={handleFreeze} style={styles.navButton}>
                Freeze
              </button>
            </li>
            <li>
              <button onClick={handleAuthToggle} style={styles.navButton}>
                {isLoggedIn ? 'Logout' : 'Login'}
              </button>
            </li>
          </ul>
        </nav>

        {activeView === 'invoices' ? (
          <main className="invoice-display" style={styles.mainContent}>
            <PurchaseMasterList />
          </main>
        ) : activeView === 'invoiceDetail' ? (
          <main className="invoice-detail-display" style={styles.mainContent}>
            <PurchaseDetailList />
          </main>
        ) : activeView === 'payment' ? (
          <main className="payment-display" style={styles.mainContent}>
            <PaymentList />
          </main>
        ) : activeView === 'customers' ? (
          <main className="customers-display" style={styles.mainContent}>
            <CustomerList />
          </main>
        ) : activeView === 'returns' ? (
  <main className="returns-display" style={styles.mainContent}>
    <ReturnSection />
  </main>
        ) : (
          <main className="product-display" style={styles.mainContent}>
            <div style={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search listings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <h2>Current Listings</h2>

            {loading && <p>Loading products...</p>}
            {fetchError && <p style={{ color: '#dc3545' }}>{fetchError}</p>}

           {!loading && !fetchError && (
    <div className="product-grid" style={styles.grid}>
      {filteredProducts.length > 0 ? (
        filteredProducts.map((product) => {
          const salePrice = Number(product.retailSalePrice) || 0;
          const cgst = Number(product.cgst) || 0;
          const sgst = Number(product.sgst) || 0;

          const taxableAmount = (salePrice / (100 + cgst + sgst)) * 100;
          const totalTax = salePrice * ((cgst + sgst) / 100);

          return (
            <div key={product.id} className="product-card" style={styles.card}>
              <h3 style={styles.cardTitle}>{product.productName}</h3>
              <p style={styles.cardRow}>Barcode: {product.barcode}</p>
              <p style={styles.cardRow}>Sale Price: ₹{salePrice.toFixed(2)}</p>
              <p style={styles.cardRow}>Quantity: <strong>{product.quantity}</strong></p>
              <p style={styles.cardRow}>CGST: {cgst}%</p>
              <p style={styles.cardRow}>SGST: {sgst}%</p>
              <p style={styles.cardRow}>Taxable Amount: ₹{taxableAmount.toFixed(2)}</p>
              <p style={styles.cardRow}>Total Tax: ₹{totalTax.toFixed(2)}</p>
              <button style={styles.button} onClick={() => handleAddToCart(product)}>
                Add to Cart
              </button>
            </div>
          );
        })
      ) : (
        <p>No products match your search.</p>
      )}
    </div>
  )}
          </main>
        )}
      </div>

      {activeView === 'products' && (
        <BillingSection
          products={products}
          cart={cart}
          setCart={setCart}
        />
      )}

      {isFrozen && (
        <div style={styles.overlay}>
          <form onSubmit={handleUnlock} style={styles.unlockBox}>
            <h2 style={styles.unlockTitle}>Screen Locked</h2>
            <p style={styles.unlockText}>Enter password to unlock</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              autoFocus
              style={styles.unlockInput}
            />
            {unlockError && <p style={styles.unlockError}>{unlockError}</p>}
            <button type="submit" style={styles.unlockButton}>
              Unlock
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// Inline styles for quick testing
const styles = {
  navbar: {
    width: '900px',        // ← matched to mainContent's maxWidth instead of 60%
    maxWidth: '100%',      // ← prevents overflow on small screens
          // ← centers it, matching mainContent
    display: 'flex',
    justifyContent: 'flex-start', 
    padding: '1rem 2rem',
    backgroundColor: '#333',
    color: '#fff',
    alignItems: 'center',
    borderRadius: '8px',
    position: 'sticky',    // ← stays in place while scrolling
    top: 0,                 // ← sticks to the top of the viewport
    zIndex: 1000 
  },
  navLinks: {
    listStyleType: 'none',
    display: 'flex',
    gap: '40px',
    margin: 0,
    padding: 0,
    alignItems: 'center'
  },
  link: {
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 'bold'
  },
  activeLink: {
    color: '#F5A623',
    borderBottom: '2px solid #F5A623',
    paddingBottom: '2px'
  },
  navButton: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit'
  },
  mainContent: {
    padding: '2rem',
    maxWidth: '900px',
          // ← added: centers mainContent to match navbar
  },
  // ...rest unchanged
  searchContainer: {
    marginBottom: '20px', // Adds space between the search bar and the heading
  },
  searchInput: {
    width: '100%',
    maxWidth: '400px',
    padding: '10px 15px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '16px',
    outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '20px',
    marginTop: '20px'
  },
  card: {
  border: '1px solid #ddd',
  padding: '0.85rem 1rem',   // ← reduced from 1.5rem
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
},
cardTitle: {
  margin: '0 0 6px 0',       // ← kills default h3 margin, adds small gap below
  fontSize: '1.05rem'
},
cardRow: {
  margin: '2px 0',           // ← kills default p margin (~1em), tightens line spacing
  fontSize: '0.9rem',
  lineHeight: 1.3
},
  button: {
  marginTop: '8px',          // ← reduced from 10px
  padding: '6px 14px',       // ← reduced from 8px 16px
  backgroundColor: '#0056b3',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem'
},
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
  unlockBox: {
    backgroundColor: '#fff',
    padding: '2rem 2.5rem',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    minWidth: '300px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
  },
  unlockTitle: {
    margin: 0
  },
  unlockText: {
    margin: '0 0 10px 0',
    color: '#555'
  },
  unlockInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
    textAlign: 'center'
  },
  unlockError: {
    color: '#dc3545',
    fontSize: '0.85rem',
    margin: '4px 0 0 0'
  },
  unlockButton: {
    marginTop: '10px',
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

export default Pdtsection;