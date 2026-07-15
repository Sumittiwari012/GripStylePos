import React, { useState } from 'react';
import ReturnBill from './returnbill';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

// Same date+counter scheme as BillingSection's getInvoiceNumber, but with its
// own counter key so return numbers and sale numbers don't collide, and "GSR"
// instead of "GS" as the prefix.
const getReturnInvoiceNumber = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;

  const storedCounter = parseInt(localStorage.getItem('returnInvoiceCounter') || '0', 10);
  const newCounter = storedCounter + 1;
  localStorage.setItem('returnInvoiceCounter', newCounter.toString());

  return `GSR${dateStr}${String(newCounter).padStart(4, '0')}`;
};

function ReturnSection() {
  const [invoiceInput, setInvoiceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [transaction, setTransaction] = useState(null);

  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completedReturn, setCompletedReturn] = useState(null);

  // Keyed by ProductId. Value = { checked, returnQty, maxQty, ...item }
  const [selectedItems, setSelectedItems] = useState({});

  const handleSearch = async (e) => {
    e.preventDefault();
    const invoiceNumber = invoiceInput.trim();
    if (!invoiceNumber) return;

    setLoading(true);
    setFetchError('');
    setTransaction(null);
    setSelectedItems({});
    setSubmitError('');
    setCompletedReturn(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/getTransactionDetails/${encodeURIComponent(invoiceNumber)}`
      );

      if (response.status === 404) {
        setFetchError('No transaction found with this invoice number.');
        return;
      }
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      setTransaction(data);
    } catch (err) {
      setFetchError('Could not load this invoice. Please try again.');
      console.error('Failed to fetch transaction details:', err);
    } finally {
      setLoading(false);
    }
  };

  // Quantity already returned per product, summed across every past return
  // filed against this invoice - so a fully (or partially) returned item can't
  // be returned again beyond what's actually left.
  const returnedQtyByProduct = (transaction?.returns ?? []).reduce((acc, ret) => {
    (ret.items ?? []).forEach((ri) => {
      acc[ri.productId] = (acc[ri.productId] ?? 0) + ri.quantity;
    });
    return acc;
  }, {});

  const remainingQtyFor = (item) =>
    Math.max(item.quantity - (returnedQtyByProduct[item.productId] ?? 0), 0);

  // Clicking an item card adds ONE unit to the return panel. Clicking it again
  // (while it's already in the panel) adds one more, up to whatever quantity
  // is actually still returnable - the same "add to cart" pattern as the
  // billing section.
  const addItemToReturn = (item) => {
    const remaining = remainingQtyFor(item);
    if (remaining <= 0) return;

    setSelectedItems((prev) => {
      const key = item.productId;
      const existing = prev[key];

      if (existing) {
        if (existing.returnQty >= existing.maxQty) return prev; // already at max
        return {
          ...prev,
          [key]: { ...existing, returnQty: existing.returnQty + 1 }
        };
      }

      return {
        ...prev,
        [key]: {
          ...item,
          returnQty: 1,
          maxQty: remaining
        }
      };
    });
  };

  const removeItemFromReturn = (productId) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const updateReturnQty = (productId, rawValue) => {
    setSelectedItems((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;

      let qty = Number(rawValue);
      if (Number.isNaN(qty)) qty = 0;
      if (qty < 0) qty = 0;
      if (qty > existing.maxQty) qty = existing.maxQty;

      return {
        ...prev,
        [productId]: { ...existing, returnQty: qty }
      };
    });
  };

  const selectedList = Object.values(selectedItems);

  const returnTotal = selectedList.reduce((sum, item) => {
    const unitAfterTax = item.quantity > 0 ? item.afterTaxation / item.quantity : 0;
    return sum + unitAfterTax * item.returnQty;
  }, 0);

  const handleSubmitReturn = async () => {
    if (selectedList.length === 0) return;

    const itemsToReturn = selectedList.filter((item) => item.returnQty > 0);
    if (itemsToReturn.length === 0) return;

    const returnInvoiceNumber = getReturnInvoiceNumber();

    const payload = {
      phoneNumber: transaction.customerMobile,
      invoiceNumber: transaction.invoiceNumber,
      returnInvoiceNumber,
      items: itemsToReturn.map((item) => {
        const unitAfterTax = item.quantity > 0 ? item.afterTaxation / item.quantity : 0;
        return {
          productId: item.productId,
          quantity: item.returnQty,
          salePrice: item.salePrice,
          afterTaxation: unitAfterTax * item.returnQty
        };
      })
    };

    // Snapshot the returned items' display details now, since transaction/selectedItems
    // get cleared right after a successful submit and the receipt needs this data.
    const returnedItemsSnapshot = itemsToReturn.map((item) => {
      const unitAfterTax = item.quantity > 0 ? item.afterTaxation / item.quantity : 0;
      return {
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        quantity: item.returnQty,
        salePrice: item.salePrice,
        lineTotal: unitAfterTax * item.returnQty
      };
    });

    setIsSubmittingReturn(true);
    setSubmitError('');

    try {
      const response = await fetch(`${API_BASE_URL}/addReturn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || `Request failed with status ${response.status}`);
      }

      setCompletedReturn({
        returnInvoiceNumber: result.returnInvoiceNumber ?? returnInvoiceNumber,
        originalInvoiceNumber: transaction.invoiceNumber,
        customerName: transaction.customerName,
        customerMobile: transaction.customerMobile,
        items: returnedItemsSnapshot,
        totalAmount: result.totalAmount ?? returnTotal,
        updatedCustomerBalance: result.updatedCustomerBalance,
        completedAt: new Date().toISOString()
      });

      // Return is done - clear the working state so the panel goes back to empty.
      setSelectedItems({});
      setTransaction(null);
      setInvoiceInput('');
    } catch (err) {
      console.error('Return failed:', err);
      setSubmitError(err.message || 'Return failed. Please try again.');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <h2 style={styles.heading}>Process a Return</h2>

      <form onSubmit={handleSearch} style={styles.searchRow}>
        <input
          type="text"
          value={invoiceInput}
          onChange={(e) => setInvoiceInput(e.target.value)}
          placeholder="Enter invoice number"
          style={styles.searchInput}
        />
        <button type="submit" style={styles.searchButton} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {fetchError && <p style={styles.errorText}>{fetchError}</p>}

      {completedReturn && (
        <ReturnBill returnData={completedReturn} onClose={() => setCompletedReturn(null)} />
      )}

      {transaction && (
        <div style={styles.contentRow}>
          {/* Left: invoice header + selectable items */}
          <div style={styles.invoiceColumn}>
            <div style={styles.invoiceHeader}>
              <h3 style={styles.invoiceNumber}>Invoice: {transaction.invoiceNumber}</h3>
              <p style={styles.headerRow}>Customer ID: {transaction.customerId}</p>
              <p style={styles.headerRow}>Customer: {transaction.customerName}</p>
              <p style={styles.headerRow}>Mobile: {transaction.customerMobile}</p>
              <p style={styles.headerRow}>
                Customer Balance: ₹{Number(transaction.customerBalance).toFixed(2)}
              </p>
              <p style={styles.headerRow}>
                Purchase Date: {new Date(transaction.purchaseDate).toLocaleDateString()}
              </p>
              <p style={styles.headerRow}>Total Amount: ₹{Number(transaction.totalAmount).toFixed(2)}</p>
              {transaction.isReturned && (
                <p style={styles.alreadyReturnedTag}>This invoice already has a return on record.</p>
              )}
            </div>

            <h4 style={styles.itemsHeading}>Items - click to add one unit to the return panel</h4>
            <div style={styles.itemsList}>
              {transaction.items.map((item) => {
                const inPanel = selectedItems[item.productId];
                const remaining = remainingQtyFor(item);
                const alreadyReturned = returnedQtyByProduct[item.productId] ?? 0;
                const atMax = inPanel && inPanel.returnQty >= inPanel.maxQty;
                const nothingLeft = remaining <= 0;
                return (
                  <button
                    key={item.productId}
                    type="button"
                    onClick={() => addItemToReturn(item)}
                    disabled={atMax || nothingLeft}
                    style={{
                      ...styles.itemCard,
                      ...(inPanel ? styles.itemCardSelected : {}),
                      ...(atMax || nothingLeft ? styles.itemCardMaxed : {})
                    }}
                  >
                    <div style={styles.itemNameRow}>
                      <span style={styles.itemName}>{item.productName}</span>
                      {inPanel && (
                        <span style={styles.selectedBadge}>
                          {inPanel.returnQty} / {inPanel.maxQty} added
                        </span>
                      )}
                    </div>
                    <p style={styles.itemDetail}>Barcode: {item.barcode}</p>
                    <p style={styles.itemDetail}>Qty Purchased: {item.quantity}</p>
                    {alreadyReturned > 0 && (
                      <p style={styles.itemDetail}>
                        Already Returned: {alreadyReturned} · Remaining: {remaining}
                      </p>
                    )}
                    <p style={styles.itemDetail}>Sale Price: ₹{Number(item.salePrice).toFixed(2)}</p>
                    <p style={styles.itemDetail}>Line Total: ₹{Number(item.afterTaxation).toFixed(2)}</p>
                    {nothingLeft && (
                      <p style={styles.itemFullyReturnedTag}>Fully returned</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: return panel - previous returns history, then the active return builder */}
          <div style={styles.rightColumn}>
            {transaction.returns && transaction.returns.length > 0 && (
              <div style={styles.pastReturnsBox}>
                <h4 style={styles.itemsHeading}>Previous Returns</h4>
                {transaction.returns.map((ret) => (
                  <div key={ret.returnInvoiceNumber} style={styles.pastReturnCard}>
                    <div style={styles.pastReturnHeaderRow}>
                      <span style={styles.pastReturnNumber}>{ret.returnInvoiceNumber}</span>
                      <span style={styles.pastReturnDate}>
                        {ret.createdDate ? new Date(ret.createdDate).toLocaleString() : ''}
                      </span>
                    </div>
                    <p style={styles.pastReturnTotal}>
                      Refunded: ₹{Number(ret.totalAmount).toFixed(2)}
                    </p>
                    <ul style={styles.pastReturnItemsList}>
                      {(ret.items ?? []).map((ri) => (
                        <li key={`${ret.returnInvoiceNumber}-${ri.productId}`} style={styles.pastReturnItemRow}>
                          <span>{ri.productName}</span>
                          <span style={styles.pastReturnItemQty}>x{ri.quantity}</span>
                          <span>₹{Number(ri.salePrice).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.returnPanel}>
              <h4 style={styles.returnPanelHeading}>Return Panel</h4>

            {selectedList.length === 0 ? (
              <p style={styles.returnEmptyText}>No items selected yet. Click an item on the left.</p>
            ) : (
              <>
                <div style={styles.returnItemsList}>
                  {selectedList.map((item) => (
                    <div key={item.productId} style={styles.returnItemRow}>
                      <div style={styles.returnItemInfo}>
                        <span style={styles.returnItemName}>{item.productName}</span>
                        <span style={styles.returnItemBarcode}>{item.barcode}</span>
                      </div>
                      <div style={styles.returnQtyControl}>
                        <input
                          type="number"
                          min={0}
                          max={item.maxQty}
                          value={item.returnQty}
                          onChange={(e) => updateReturnQty(item.productId, e.target.value)}
                          style={styles.returnQtyInput}
                        />
                        <span style={styles.returnQtyMax}>/ {item.maxQty}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItemFromReturn(item.productId)}
                        style={styles.removeButton}
                        aria-label={`Remove ${item.productName} from return`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div style={styles.returnTotalRow}>
                  <span>Estimated Refund</span>
                  <strong>₹{returnTotal.toFixed(2)}</strong>
                </div>

                {submitError && <p style={styles.errorText}>{submitError}</p>}

                <button
                  type="button"
                  style={{ ...styles.submitButton, opacity: isSubmittingReturn ? 0.7 : 1 }}
                  onClick={handleSubmitReturn}
                  disabled={isSubmittingReturn}
                >
                  {isSubmittingReturn ? 'Processing...' : 'Submit Return'}
                </button>
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    padding: '1rem 0'
  },
  heading: {
    marginBottom: '1rem'
  },
  searchRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '1rem'
  },
  searchInput: {
    flex: 1,
    maxWidth: '320px',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '15px',
    outline: 'none'
  },
  searchButton: {
    padding: '10px 18px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#0056b3',
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  errorText: {
    color: '#dc3545'
  },
  contentRow: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  invoiceColumn: {
    flex: '1 1 420px',
    minWidth: '320px'
  },
  invoiceHeader: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
    backgroundColor: '#fafafa'
  },
  invoiceNumber: {
    margin: '0 0 8px 0'
  },
  headerRow: {
    margin: '2px 0',
    fontSize: '0.9rem'
  },
  alreadyReturnedTag: {
    marginTop: '8px',
    color: '#b8860b',
    fontWeight: 'bold',
    fontSize: '0.85rem'
  },
  itemsHeading: {
    margin: '0 0 10px 0'
  },
  itemsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px'
  },
  itemCard: {
    textAlign: 'left',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '0.75rem 0.9rem',
    backgroundColor: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
  },
  itemCardSelected: {
    borderColor: '#0056b3',
    borderWidth: '2px',
    backgroundColor: '#eaf1fb'
  },
  itemCardMaxed: {
    cursor: 'not-allowed',
    opacity: 0.7
  },
  itemNameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  itemName: {
    fontWeight: 'bold',
    fontSize: '0.95rem'
  },
  selectedBadge: {
    fontSize: '0.7rem',
    color: '#0056b3',
    fontWeight: 'bold'
  },
  itemDetail: {
    margin: '2px 0',
    fontSize: '0.82rem',
    color: '#444'
  },
  itemFullyReturnedTag: {
    margin: '6px 0 0 0',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#dc3545'
  },
  pastReturnsSection: {
    marginTop: '20px'
  },
  pastReturnCard: {
    border: '1px solid #e0d7c3',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '10px',
    backgroundColor: '#fdfaf3'
  },
  pastReturnHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  pastReturnNumber: {
    fontWeight: 'bold',
    fontSize: '0.9rem',
    color: '#7a5c00'
  },
  pastReturnDate: {
    fontSize: '0.75rem',
    color: '#888'
  },
  pastReturnTotal: {
    margin: '4px 0 8px 0',
    fontSize: '0.85rem',
    color: '#444'
  },
  pastReturnItemsList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  pastReturnItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    color: '#555'
  },
  pastReturnItemQty: {
    color: '#888'
  },
  rightColumn: {
    flex: '0 0 300px',
    minWidth: '260px',
    marginLeft: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    position: 'sticky',
    top: '90px'
  },
  pastReturnsBox: {
    border: '1px solid #e0d7c3',
    borderRadius: '8px',
    padding: '1rem',
    backgroundColor: '#fdfaf3'
  },
  returnPanel: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '1rem',
    backgroundColor: '#fff'
  },
  returnPanelHeading: {
    margin: '0 0 12px 0'
  },
  returnEmptyText: {
    fontSize: '0.85rem',
    color: '#777'
  },
  returnItemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '14px'
  },
  returnItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #eee',
    paddingBottom: '8px'
  },
  returnItemInfo: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0
  },
  returnItemName: {
    fontSize: '0.85rem',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  returnItemBarcode: {
    fontSize: '0.75rem',
    color: '#888'
  },
  returnQtyControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  returnQtyInput: {
    width: '48px',
    padding: '4px 6px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    textAlign: 'center'
  },
  returnQtyMax: {
    fontSize: '0.75rem',
    color: '#999'
  },
  removeButton: {
    border: 'none',
    background: 'none',
    color: '#dc3545',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '2px 6px'
  },
  returnTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.95rem',
    marginBottom: '12px'
  },
  submitButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#2C6B4B',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem'
  }
};

export default ReturnSection;