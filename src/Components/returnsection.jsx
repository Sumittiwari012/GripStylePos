import React, { useState } from 'react';
import ReturnBill from './returnbill';
import DataTable from './DataTable';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

// The real prefix in use (per production data) is "GSRC1", not "GSR1".
const RETURN_INVOICE_PREFIX_FALLBACK = 'GSRC1';

// Builds today's return invoice number off the *last* one on record, fetched
// from the backend (GetLastReturnInvoiceNumber) rather than a localStorage
// counter — localStorage is per-browser/per-counter and can't stay in sync
// with what other counters have already issued, and a backend value can't
// be reset by clearing site data.
//
// Expected shape of the value the API returns: "<PREFIX>-<DDMMYYYY>/<NNNN>",
// e.g. "GSRC1-22082026/0007" — same "prefix-date/counter" scheme the sale
// invoice numbers use (see BillingSection's getInvoiceNumber). We keep the
// prefix as-is, swap the date segment for *today's* date, and increment
// whatever comes after the "/". If there's no previous return yet (API
// returns null/empty) or the value doesn't match the expected shape, we
// fall back to a fresh "GSRC1-<today>/0001".
const getReturnInvoiceNumber = async () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;
  const fallback = `${RETURN_INVOICE_PREFIX_FALLBACK}-${dateStr}/0001`;

  try {
    const response = await fetch(`${API_BASE_URL}/getLastReturnInvoiceNumber`);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    // The endpoint returns a bare string body, NOT JSON (calling .json() on
    // it throws "Unexpected token ... is not valid JSON"). Read it as text.
    const rawText = (await response.text()).trim();
    console.log('getLastReturnInvoiceNumber raw response:', rawText); // TEMP: verify what the backend actually sent

    // Defensive: if the backend ever does start returning a real JSON string
    // (wrapped in quotes) or a JSON object, handle those shapes too instead
    // of just falling back.
    let lastReturnInvoiceNumber = rawText;
    if (rawText.startsWith('"') || rawText.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawText);
        lastReturnInvoiceNumber =
          typeof parsed === 'string'
            ? parsed
            : parsed?.returnInvoiceNumber ?? parsed?.lastReturnInvoiceNumber ?? parsed?.data ?? parsed?.value ?? null;
      } catch {
        // not actually JSON despite the leading quote/brace — keep rawText as-is
      }
    }

    if (!lastReturnInvoiceNumber || typeof lastReturnInvoiceNumber !== 'string') {
      console.warn('Unexpected /getLastReturnInvoiceNumber payload shape, using fallback:', rawText);
      return fallback;
    }

    // Split "<prefix>-<date>/<counter>" on the last "/" to isolate the
    // counter, then split what's left on the last "-" to isolate the prefix
    // from the (old) date segment.
    const slashIndex = lastReturnInvoiceNumber.lastIndexOf('/');
    if (slashIndex === -1) {
      console.warn(
        `Unexpected return invoice number format ("${lastReturnInvoiceNumber}") — no "/" found. Falling back to a fresh number.`
      );
      return fallback;
    }

    const prefixAndDate = lastReturnInvoiceNumber.slice(0, slashIndex);
    const counterPart = lastReturnInvoiceNumber.slice(slashIndex + 1);

    const dashIndex = prefixAndDate.lastIndexOf('-');
    const prefix = dashIndex === -1 ? prefixAndDate : prefixAndDate.slice(0, dashIndex);

    const lastCounter = parseInt(counterPart, 10);
    const nextCounter = Number.isNaN(lastCounter) ? 1 : lastCounter + 1;
    // Keep the same zero-padding width the last invoice number used (falls
    // back to 4 digits if that couldn't be determined).
    const paddedCounter = String(nextCounter).padStart(counterPart.length || 4, '0');

    return `${prefix}-${dateStr}/${paddedCounter}`;
  } catch (err) {
    console.error('Failed to fetch last return invoice number, falling back to a fresh one:', err);
    return fallback;
  }
};

function ReturnSection() {
  const [invoiceInput, setInvoiceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [transaction, setTransaction] = useState(null);

  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completedReturn, setCompletedReturn] = useState(null);

  // ── OTP gate state ──
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Bumped after every successful return submission to force the returns
  // list (below) to refetch and pick up the new record.
  const [returnsListVersion, setReturnsListVersion] = useState(0);

  const counterId = localStorage.getItem('counterId');

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
      // NOTE: the backend controller binds this as [FromQuery] string
      // invoiceNumber — NOT returnInvoiceNumber — so the query param name
      // below must be "invoiceNumber" or every call 400s with "Invoice
      // number is required." regardless of the value/encoding sent.
      const response = await fetch(
        `${API_BASE_URL}/GetTransactionDetails?invoiceNumber=${encodeURIComponent(invoiceNumber)}`
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

  // ── Step 1: "Submit Return" click → request an OTP, open the verification modal ──
  const handleSubmitReturn = async () => {
    if (selectedList.length === 0) return;

    const itemsToReturn = selectedList.filter((item) => item.returnQty > 0);
    if (itemsToReturn.length === 0) return;

    if (!counterId) {
      setSubmitError('Counter ID missing — please log in again.');
      return;
    }

    setIsRequestingOtp(true);
    setSubmitError('');
    setOtpError('');
    setOtpInput('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/OtpChecker/RecordOtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterId: Number(counterId),
          invoiceNumber: transaction.invoiceNumber
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || `Request failed with status ${response.status}`);
      }

      setIsOtpModalOpen(true);
    } catch (err) {
      console.error('OTP request failed:', err);
      setSubmitError(err.message || 'Could not send OTP. Please try again.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // ── Step 2: "Check" click in the modal → verify OTP, then actually process the return ──
  const handleVerifyOtp = async () => {
    const otpValue = otpInput.trim();
    if (!otpValue) {
      setOtpError('Please enter the OTP.');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError('');

    try {
      const verifyResponse = await fetch(`${API_BASE_URL}/api/OtpChecker/VerifyOtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterId: Number(counterId),
          otpVal: Number(otpValue),
          invoiceNumber: transaction.invoiceNumber
        })
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok) {
        setOtpError(verifyResult?.message || 'Invalid OTP. Please try again.');
        return;
      }

      // OTP verified — close the modal and actually process the return.
      setIsOtpModalOpen(false);
      setOtpInput('');
      await performReturnSubmission();
    } catch (err) {
      console.error('OTP verification failed:', err);
      setOtpError('Could not reach the server. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleCancelOtp = () => {
    setIsOtpModalOpen(false);
    setOtpInput('');
    setOtpError('');
  };

  // ── Step 3: the actual addReturn call, unchanged apart from being gated behind OTP now ──
  const performReturnSubmission = async () => {
    const itemsToReturn = selectedList.filter((item) => item.returnQty > 0);
    if (itemsToReturn.length === 0) return;

    setIsSubmittingReturn(true);
    setSubmitError('');

    let returnInvoiceNumber;
    try {
      returnInvoiceNumber = await getReturnInvoiceNumber();
    } catch (err) {
      console.error('Failed to generate return invoice number:', err);
      setSubmitError('Could not generate a return invoice number. Please try again.');
      setIsSubmittingReturn(false);
      return;
    }

    const payload = {
      phoneNumber: transaction.customerMobile,
      invoiceNumber: transaction.invoiceNumber,
      returnInvoiceNumber,
      counterId: Number(counterId),
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
    // cgst/sgst are carried through from the transaction items (sourced from
    // GetTransactionDetails, which already includes them) so ReturnBill can
    // render its Tax Details table right after a fresh submission, not just
    // when viewing a past return via GetReturnDetail.
    const returnedItemsSnapshot = itemsToReturn.map((item) => {
      const unitAfterTax = item.quantity > 0 ? item.afterTaxation / item.quantity : 0;
      return {
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        quantity: item.returnQty,
        salePrice: item.salePrice,
        cgst: item.cgst,
        sgst: item.sgst,
        lineTotal: unitAfterTax * item.returnQty
      };
    });

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
        // Wallet balance as it stood before this return was applied — taken
        // from the transaction we already had loaded, before the backend's
        // credit. Lets the receipt show Previous → Credited → New.
        previousCustomerBalance: transaction.customerBalance,
        updatedCustomerBalance: result.updatedCustomerBalance,
        completedAt: new Date().toISOString()
      });

      // Return is done - clear the working state so the panel goes back to empty
      // (which also moves the returns list back up, since it renders in the
      // "no transaction loaded" branch below).
      setSelectedItems({});
      setTransaction(null);
      setInvoiceInput('');

      // Pick up the just-created return in the list.
      setReturnsListVersion((v) => v + 1);
    } catch (err) {
      console.error('Return failed:', err);
      setSubmitError(err.message || 'Return failed. Please try again.');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // ── View a past return: fetch its full detail and open it in ReturnBill ──
  // Mirrors PurchaseMasterList's handlePrint for original invoices.
  const handleViewReturn = async (returnInvoiceNumber) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/getReturnDetail?returnInvoiceNumber=${encodeURIComponent(returnInvoiceNumber)}`
      );

      if (!response.ok) {
        throw new Error('Unable to load this return.');
      }

      const data = await response.json();

      const previousCustomerBalance =
        data.previousCustomerBalance ??
        // Fall back to deriving it, if the backend doesn't send it directly:
        // wallet credits only add, so previous = updated - refunded.
        (data.updatedCustomerBalance != null
          ? Number(data.updatedCustomerBalance) - Number(data.totalAmount)
          : null);

      setCompletedReturn({
        returnInvoiceNumber: data.returnInvoiceNumber,
        originalInvoiceNumber: data.originalInvoiceNumber ?? data.invoiceNumber,
        customerName: data.customerName,
        customerMobile: data.customerMobile,
        // cgst/sgst now come through from GetReturnDetail (backend includes
        // them alongside the rest of MProducts' fields) so the Tax Details
        // table can be rebuilt for a previously-completed return too.
        items: (data.items ?? []).map((ri) => ({
          productId: ri.productId,
          productName: ri.productName,
          barcode: ri.barcode,
          quantity: ri.quantity,
          salePrice: ri.salePrice,
          cgst: ri.cgst,
          sgst: ri.sgst,
          lineTotal: ri.lineTotal ?? ri.afterTaxation ?? (ri.salePrice ?? 0) * (ri.quantity ?? 0)
        })),
        totalAmount: data.totalAmount,
        previousCustomerBalance,
        updatedCustomerBalance: data.updatedCustomerBalance,
        completedAt: data.createdDate ?? data.completedAt
      });
    } catch (err) {
      console.error('Failed to load return details:', err);
      alert(err.message || 'Could not load this return.');
    }
  };

  const returnListColumns = [
    { key: 'returnInvoiceNumber', label: 'Return #' },
    { key: 'originalInvoiceNumber', label: 'Original Invoice' },
    { key: 'customerName', label: 'Customer' },
    {
      key: 'totalAmount',
      label: 'Refunded',
      render: (row) => `₹${Number(row.totalAmount).toFixed(2)}`
    },
    {
      key: 'createdDate',
      label: 'Date',
      render: (row) => row.createdDate ? new Date(row.createdDate).toLocaleString() : ''
    },
    {
      key: 'view',
      label: '',
      render: (row) => (
        <button
          onClick={() => handleViewReturn(row.returnInvoiceNumber)}
          style={styles.viewButton}
        >
          View
        </button>
      )
    }
  ];

  const returnsList = counterId ? (
    <DataTable
      key={returnsListVersion}
      buildEndpoint={(fromDate, toDate) =>
        `${API_BASE_URL}/GetReturn?CounterId=${encodeURIComponent(counterId)}&FromDate=${fromDate}&ToDate=${toDate}`
      }
      columns={returnListColumns}
      title="Today's Returns"
      emptyMessage="No returns recorded yet."
    />
  ) : (
    <p style={styles.errorText}>Counter ID missing — please log in again to see returns.</p>
  );

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

      {transaction ? (
        <>
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
                    style={{ ...styles.submitButton, opacity: (isSubmittingReturn || isRequestingOtp) ? 0.7 : 1 }}
                    onClick={handleSubmitReturn}
                    disabled={isSubmittingReturn || isRequestingOtp}
                  >
                    {isRequestingOtp ? 'Sending OTP...' : isSubmittingReturn ? 'Processing...' : 'Submit Return'}
                  </button>
                </>
              )}
              </div>
            </div>
          </div>

          {/* Invoice is loaded → list pushed below the transaction/return-panel content */}
          <div style={styles.returnsListSection}>
            {returnsList}
          </div>
        </>
      ) : (
        // No transaction loaded → list sits right under the search bar
        <div style={styles.returnsListSection}>
          {returnsList}
        </div>
      )}

      {/* ── OTP verification modal ── */}
      {isOtpModalOpen && (
        <div style={styles.otpOverlay}>
          <div style={styles.otpBox}>
            <h3 style={styles.otpTitle}>Enter OTP</h3>
            <p style={styles.otpSubtext}>
              An OTP has been sent to {transaction?.customerMobile} to confirm this return.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
              placeholder="4-digit OTP"
              autoFocus
              style={styles.otpInput}
            />
            {otpError && <p style={styles.errorText}>{otpError}</p>}
            <div style={styles.otpButtonRow}>
              <button
                type="button"
                onClick={handleCancelOtp}
                style={styles.otpCancelButton}
                disabled={isVerifyingOtp || isSubmittingReturn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyOtp}
                style={{ ...styles.otpCheckButton, opacity: (isVerifyingOtp || isSubmittingReturn) ? 0.7 : 1 }}
                disabled={isVerifyingOtp || isSubmittingReturn}
              >
                {isVerifyingOtp ? 'Checking...' : isSubmittingReturn ? 'Processing...' : 'Check'}
              </button>
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
  viewButton: {
    padding: '4px 8px',
    fontSize: '11px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#2C6B4B',
    color: 'white',
    cursor: 'pointer'
  },
  returnsListSection: {
    marginTop: '24px'
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
  },
  otpOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  otpBox: {
    backgroundColor: '#fff',
    padding: '2rem',
    borderRadius: '10px',
    minWidth: '320px',
    maxWidth: '360px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
  },
  otpTitle: {
    margin: '0 0 8px 0'
  },
  otpSubtext: {
    margin: '0 0 16px 0',
    fontSize: '0.85rem',
    color: '#555'
  },
  otpInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '18px',
    letterSpacing: '4px',
    textAlign: 'center',
    boxSizing: 'border-box',
    outline: 'none'
  },
  otpButtonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px'
  },
  otpCancelButton: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  otpCheckButton: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#2C6B4B',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold'
  }
};

export default ReturnSection;