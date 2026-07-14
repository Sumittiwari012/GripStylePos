import React, { useState } from 'react';
import AddCustomer from './addCustomer';
import Quotation from './quotation';
import Payment from './payment';
import InvoiceBill from './invoiceBill';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

const getInvoiceNumber = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;

  const storedCounter = parseInt(localStorage.getItem('invoiceCounter') || '0', 10);
  const newCounter = storedCounter + 1;
  localStorage.setItem('invoiceCounter', newCounter.toString());

  return `GS${dateStr}${String(newCounter).padStart(4, '0')}`;
};

function BillingSection({ products = [], cart = [], setCart }) {
  const [isCustomerWindowOpen, setIsCustomerWindowOpen] = useState(false);
  const [isQuotationListOpen, setIsQuotationListOpen] = useState(false);
  const [isPaymentWindowOpen, setIsPaymentWindowOpen] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  const [invoiceNumber, setInvoiceNumber] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discountByInvoice, setDiscountByInvoice] = useState({});
  const [paymentsByInvoice, setPaymentsByInvoice] = useState({});

  const [completedInvoice, setCompletedInvoice] = useState(null); // holds data for the receipt modal
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState('');

  const discount = discountByInvoice[invoiceNumber] ?? 0;

  const handleDiscountChange = (value) => {
    setDiscountByInvoice((prev) => ({ ...prev, [invoiceNumber]: value }));
  };

  const handleCustomerAdded = (customer) => {
    setSelectedCustomer(customer);
    setInvoiceNumber(getInvoiceNumber());
    setIsCustomerWindowOpen(false);
  };

  const handleSaveQuotation = () => {
    const quotation = {
      invoiceNumber,
      customer: selectedCustomer,
      cart,
      discount,
      payments: paymentsByInvoice[invoiceNumber] ?? [],
      savedAt: new Date().toISOString()
    };

    const existing = JSON.parse(localStorage.getItem('savedQuotations') || '[]');
    const updated = [
      ...existing.filter((q) => q.invoiceNumber !== invoiceNumber),
      quotation
    ];
    localStorage.setItem('savedQuotations', JSON.stringify(updated));
    alert(`Quotation ${invoiceNumber} saved.`);
  };

  const handleLoadQuotation = (quotation) => {
    setInvoiceNumber(quotation.invoiceNumber);
    setSelectedCustomer(quotation.customer ?? null);
    setCart(quotation.cart ?? []);
    if (quotation.discount !== undefined) {
      setDiscountByInvoice((prev) => ({ ...prev, [quotation.invoiceNumber]: quotation.discount }));
    }
    if (quotation.payments?.length) {
      setPaymentsByInvoice((prev) => ({ ...prev, [quotation.invoiceNumber]: quotation.payments }));
    }
    setIsQuotationListOpen(false);
  };

  const handleAddFromSearch = (product) => {
    if (!invoiceNumber) {
      alert('Please add a customer before adding items.');
      return;
    }
    const salePrice = Number(product.retailSalePrice) || 0;
    const cgst = Number(product.cgst) || 0;
    const sgst = Number(product.sgst) || 0;

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prevCart,
        { id: product.id, name: product.productName, price: salePrice, cgst, sgst, barcode: product.barcode, quantity: 1 }
      ];
    });
    setItemSearchTerm('');
  };

  const increaseCount = (id) => {
    setCart(cart.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item));
  };

  const decreaseCount = (id) => {
    setCart((prevCart) => {
      const item = prevCart.find((i) => i.id === id);
      if (item && item.quantity <= 1) return prevCart.filter((i) => i.id !== id);
      return prevCart.map((i) => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
    });
  };

  const searchResults = itemSearchTerm.trim() === ''
    ? []
    : products.filter(p => {
        const term = itemSearchTerm.toLowerCase();
        return (p.productName ?? '').toLowerCase().includes(term) || (p.barcode ?? '').toLowerCase().includes(term);
      });

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchResults.length > 0) handleAddFromSearch(searchResults[0]);
  };

  // ── Amounts ──
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxableAmount = cart.reduce((sum, item) => {
    const itemTotal = item.price * item.quantity;
    return sum + (itemTotal / (100 + 2 * item.cgst) * 100);
  }, 0);
  const taxAmount = cart.reduce((sum, item) => {
    const itemTotal = item.price * item.quantity;
    const itemTaxable = itemTotal / (100 + 2 * item.cgst) * 100;
    return sum + (itemTaxable * (item.cgst / 100) * 2);
  }, 0);

  const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), totalAmount);
  const payableAmount = totalAmount - safeDiscount;

  const currentPayments = paymentsByInvoice[invoiceNumber] ?? [];
  const amountPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);

  const handleUpdatePayments = (newPayments) => {
    setPaymentsByInvoice((prev) => ({ ...prev, [invoiceNumber]: newPayments }));
  };

  // ── Finalize sale: call API, then show receipt, then reset everything ──
  const handlePaymentComplete = async () => {

    setIsSubmittingTransaction(true);
    setTransactionError('');

    const payload = {
      phoneNumber: selectedCustomer?.mobileNumber ?? selectedCustomer?.phoneNumber,
      invoiceNumber,
      totalAmount,
      discount: safeDiscount,
      payableAmount,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        salePrice: item.price,
        afterTaxation: item.price * item.quantity
      })),
      payments: currentPayments.map((p) => ({
        paymentMethod: p.method,
        bankAccountNumber: p.bankAccountNumber ?? null,
        amountPaid: p.amount
      }))
    };

    try {
      const response = await fetch(`${API_BASE_URL}/addTransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || `Request failed with status ${response.status}`);
      }

      // ── Success: prepare receipt data before clearing state ──
      setCompletedInvoice({
        invoiceNumber,
        customer: selectedCustomer,
        cart,
        totalAmount,
        discount: safeDiscount,
        taxAmount,
        payableAmount,
        payments: currentPayments,
        completedAt: new Date().toISOString()
      });

      // ── Clear quotation memory (localStorage) for this invoice ──
      const existingQuotations = JSON.parse(localStorage.getItem('savedQuotations') || '[]');
      const updatedQuotations = existingQuotations.filter((q) => q.invoiceNumber !== invoiceNumber);
      localStorage.setItem('savedQuotations', JSON.stringify(updatedQuotations));

      // ── Clear payment memory (in-memory state) for this invoice ──
      setPaymentsByInvoice((prev) => {
        const updated = { ...prev };
        delete updated[invoiceNumber];
        return updated;
      });
      setDiscountByInvoice((prev) => {
        const updated = { ...prev };
        delete updated[invoiceNumber];
        return updated;
      });

      setIsPaymentWindowOpen(false);
    } catch (err) {
      console.error('Transaction failed:', err);
      setTransactionError(err.message || 'Transaction failed. Please try again.');
    } finally {
      setIsSubmittingTransaction(false);
    }
  };

  // ── Called when the receipt modal is closed — reset for a brand new sale ──
  const handleCloseReceipt = () => {
    setCompletedInvoice(null);
    setCart([]);
    setSelectedCustomer(null);
    setInvoiceNumber(null);
  };

  return (
    <aside className="billing-sidebar" style={styles.sidebar}>

      <div style={styles.topActions}>
        <button style={styles.secondaryButton} onClick={() => setIsCustomerWindowOpen(true)}>
          Add Customer
        </button>
        {isCustomerWindowOpen && (
          <AddCustomer onClose={() => setIsCustomerWindowOpen(false)} onCustomerAdded={handleCustomerAdded} />
        )}
        <button style={styles.secondaryButton} onClick={() => setIsQuotationListOpen(true)}>
          Quotations
        </button>
        {isQuotationListOpen && (
          <Quotation onClose={() => setIsQuotationListOpen(false)} onLoadQuotation={handleLoadQuotation} />
        )}
      </div>

      {selectedCustomer && (
        <div style={styles.customerInfo}>
          <span style={styles.customerName}>{selectedCustomer.customerName ?? selectedCustomer.name}</span>
          <span style={styles.customerNumber}>{selectedCustomer.mobileNumber ?? selectedCustomer.phoneNumber}</span>
          <span style={styles.customerWallet}>
            Wallet: ₹{Number(selectedCustomer.currentBalance ?? selectedCustomer.walletValue ?? 0).toFixed(2)}
          </span>
        </div>
      )}

      <div style={styles.searchWrapper}>
        <input
          type="text"
          placeholder="Search to add item..."
          value={itemSearchTerm}
          onChange={(e) => setItemSearchTerm(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={styles.searchInput}
        />
        {searchResults.length > 0 && (
          <ul style={styles.dropdown}>
            {searchResults.map(product => (
              <li key={product.id} onClick={() => handleAddFromSearch(product)} style={styles.dropdownItem}>
                <div style={styles.dropdownItemInfo}>
                  <span>{product.productName}</span>
                  <span style={styles.dropdownBarcode}>Barcode: {product.barcode}</span>
                </div>
                <strong>₹{Number(product.retailSalePrice).toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={styles.productsContainer}>
        <h3 style={styles.sectionTitle}>
          {invoiceNumber ? `Invoice #${invoiceNumber}` : 'No customer added yet'}
        </h3>
        {cart.length === 0 && <p style={styles.emptyText}>Cart is empty.</p>}
        {cart.map((product) => {
          const itemTotal = product.price * product.quantity;
          const itemTaxable = itemTotal / (100 + 2 * product.cgst) * 100;
          const itemTax = itemTaxable * (product.cgst / 100) * 2;
          return (
            <div key={product.id} style={styles.productRow}>
              <div style={styles.productInfo}>
                <span style={styles.productName}>{product.name}</span>
                <span style={styles.productPrice}>₹{product.price} x {product.quantity}</span>
                <div style={styles.productTaxBreakdown}>
                  <span>Taxable: ₹{itemTaxable.toFixed(2)}</span>
                  <span>Tax: ₹{itemTax.toFixed(2)}</span>
                  <span style={styles.productTotal}>Total: ₹{itemTotal.toFixed(2)}</span>
                </div>
              </div>
              <div style={styles.quantityControls}>
                <button onClick={() => decreaseCount(product.id)} style={styles.iconButton}>-</button>
                <span style={styles.quantityText}>{product.quantity}</span>
                <button onClick={() => increaseCount(product.id)} style={styles.iconButton}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.summaryContainer}>
        <h3 style={styles.sectionTitle}>Bill Summary</h3>
        <div style={styles.summaryRow}>
          <span>Taxable Amount:</span>
          <span>₹{taxableAmount.toFixed(2)}</span>
        </div>

        <div style={styles.summaryRow}>
          <span>Discount:</span>
          <input
            type="number"
            min="0"
            max={totalAmount}
            value={discount}
            onChange={(e) => handleDiscountChange(e.target.value)}
            style={styles.discountInput}
          />
        </div>

        <div style={styles.summaryRow}>
          <span>Tax Amount:</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>

        <div style={styles.summaryTotal}>
          <span>Payable Amount:</span>
          <span>₹{payableAmount.toFixed(2)}</span>
        </div>

        {amountPaid > 0 && (
          <div style={styles.summaryRow}>
            <span>Paid So Far:</span>
            <span>₹{amountPaid.toFixed(2)} / ₹{payableAmount.toFixed(2)}</span>
          </div>
        )}

        {transactionError && <p style={styles.errorText}>{transactionError}</p>}
      </div>

      <div style={styles.bottomActions}>
        <button
          style={{...styles.primaryButton, backgroundColor: '#007bff'}}
          onClick={() => setIsPaymentWindowOpen(true)}
          disabled={!invoiceNumber || cart.length === 0}
        >
          Payment
        </button>
        <button
          style={{...styles.primaryButton, backgroundColor: '#ffc107', color: '#333'}}
          onClick={handleSaveQuotation}
          disabled={!invoiceNumber}
        >
          Quotation
        </button>
        <button style={{...styles.primaryButton, backgroundColor: '#dc3545'}}>Return</button>
      </div>

      {isPaymentWindowOpen && (
        <Payment
  invoiceNumber={invoiceNumber}
  payableAmount={payableAmount}
  existingPayments={currentPayments}
  onUpdatePayments={handleUpdatePayments}
  onComplete={handlePaymentComplete}
  onClose={() => setIsPaymentWindowOpen(false)}
  isSubmitting={isSubmittingTransaction}
/>
      )}

      {completedInvoice && (
        <InvoiceBill invoice={completedInvoice} onClose={handleCloseReceipt} />
      )}

    </aside>
  );
}
// styles object unchanged from your last version

// Inline styles
const styles = {
  sidebar: {
    width: '30%',
    minWidth: '300px',
    height: '100vh',
    position: 'fixed',
    right: 0,
    top: 0,
    backgroundColor: '#f8f9fa',
    borderLeft: '1px solid #ddd',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    boxSizing: 'border-box',
    boxShadow: '-2px 0 5px rgba(0,0,0,0.05)',
    zIndex: 100
  },
  errorText: {
    color: '#dc3545',
    fontSize: '0.85rem',
    margin: '8px 0 0 0'
  },
  discountInput: {
  width: '90px',
  padding: '4px 8px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.9rem',
  textAlign: 'right'
},
  topActions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    marginBottom: '15px'
  },
  secondaryButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  customerInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '15px',
    fontSize: '0.85rem'
  },
  customerName: {
    fontWeight: 'bold'
  },
  customerNumber: {
    color: '#555'
  },
  customerWallet: {
    fontWeight: 'bold',
    color: '#28a745'
  },
  searchWrapper: {
    position: 'relative',
    marginBottom: '20px'
  },
  searchInput: {
    width: '100%',
    padding: '10px 15px',
    borderRadius: '6px',
    border: '1px solid #aaa',
    fontSize: '15px',
    boxSizing: 'border-box',
    outline: 'none'
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '4px',
    maxHeight: '200px',
    overflowY: 'auto',
    margin: '5px 0 0 0',
    padding: 0,
    listStyleType: 'none',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    zIndex: 10
  },
  dropdownItem: {
    padding: '10px 15px',
    cursor: 'pointer',
    borderBottom: '1px solid #eee',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  dropdownItemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  dropdownBarcode: {
    fontSize: '0.75rem',
    color: '#888'
  },
  productsContainer: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '20px'
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '1.1rem',
    borderBottom: '2px solid #ddd',
    paddingBottom: '5px'
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic'
  },
  productRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '6px',
    border: '1px solid #eee'
  },
  productInfo: {
    display: 'flex',
    flexDirection: 'column'
  },
  productName: {
    fontWeight: 'bold',
    fontSize: '0.95rem'
  },
  productPrice: {
    color: '#666',
    fontSize: '0.85rem'
  },
  productTaxBreakdown: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '6px',
    fontSize: '0.75rem',
    color: '#777'
  },
  productTotal: {
    fontWeight: 'bold',
    color: '#333'
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  iconButton: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  quantityText: {
    fontWeight: 'bold',
    minWidth: '20px',
    textAlign: 'center'
  },
  summaryContainer: {
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    marginBottom: '20px'
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
    color: '#555'
  },
  summaryTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px dashed #ccc',
    fontWeight: 'bold',
    fontSize: '1.2rem'
  },
  bottomActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  primaryButton: {
    padding: '12px',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem'
  }
};

export default BillingSection;