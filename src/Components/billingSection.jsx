import React, { useState, useRef, useEffect, useMemo } from 'react';
import './billingSection.css';
import AddCustomer from './addCustomer';
import Quotation from './quotation';
import Payment from './payment';
import InvoiceBill from './invoiceBill';
import { safeBuildBillLines, safeEvaluate, applyCoupon, offersForProduct } from './offerEngine';

// Normal POS calls (invoice number, coupons, addTransaction) -> dummy POS API
const API_BASE_URL = 'https://gripstyleapi.runasp.net';
// Offer controller (api/MOffer) -> official GripStyle API
const OFFER_API_BASE_URL = 'https://gripstyleapi.runasp.net';
const WA_SERVICE_URL = 'http://localhost:4001'; // change to your Baileys service URL once deployed
const WA_API_KEY = 'your-long-random-secret';

const buildInvoiceMessageText = ({
  invoiceNumber, customerName, items = [], totalAmount = 0, discount = 0, taxAmount = 0, payableAmount = 0
}) => {
  const itemLines = items
    .map((item) => `- ${item.name} x${item.quantity} - Rs.${(item.price * item.quantity).toFixed(2)}`)
    .join('\n');

  return [
    `Invoice: ${invoiceNumber}`,
    customerName ? `Customer: ${customerName}` : null,
    '',
    itemLines,
    '',
    `Total: Rs.${totalAmount.toFixed(2)}`,
    discount > 0 ? `Discount: Rs.${discount.toFixed(2)}` : null,
    `Tax: Rs.${taxAmount.toFixed(2)}`,
    `Payable: Rs.${payableAmount.toFixed(2)}`,
    '',
    'Thank you for your business!'
  ].filter(Boolean).join('\n');
};

const sendInvoiceViaWhatsApp = async ({ phoneNumber, invoiceNumber, customerName, message }) => {
  if (!phoneNumber || !message) {
    console.warn('Skipping WhatsApp send: missing phone number or message');
    return;
  }
  try {
    const res = await fetch(`${WA_SERVICE_URL}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
      body: JSON.stringify({ phoneNumber, invoiceNumber, customerName, message })
    });
    const data = await res.json();
    if (!data.success) console.error('WhatsApp send failed:', data.message);
    else console.log('✅ Invoice sent via WhatsApp');
  } catch (err) {
    console.error('WhatsApp send error (non-blocking):', err);
  }
};

// Format: GSC{counterId}-{ddMMyyyy}/{serial padded to 4 digits}. Read-only peek.
const peekInvoiceNumber = async () => {
  const counterId = localStorage.getItem('counterId') || '0';
  let lastSerial = 0;
  try {
    const res = await fetch(`${API_BASE_URL}/GetCounterInvoiceNumber?counterId=${counterId}`);
    if (res.ok) lastSerial = await res.json();
  } catch (err) {
    console.error('Failed to fetch last invoice number:', err);
  }
  const nextSerial = Number(lastSerial) || 0;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `GSC${counterId}-${dd}${mm}${yyyy}/${String(nextSerial).padStart(4, '0')}`;
};

// Returns the product's available stock, or null if the products API doesn't expose it
// (unknown stock is never treated as zero, so billing isn't blocked by missing data).
const getStock = (product) => {
  const raw = product.quantity ?? product.Quantity ?? product.stock ?? product.Stock ?? product.availableQuantity;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
};
const isOutOfStock = (product) => {
  const stock = getStock(product);
  return stock !== null && stock <= 0;
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

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const [otpValue, setOtpValue] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');

  const [completedInvoice, setCompletedInvoice] = useState(null);
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const [postSaleWarning, setPostSaleWarning] = useState('');

  // ── Offers (never block billing) ──
  const [offers, setOffers] = useState([]);
  const [dismissedReminders, setDismissedReminders] = useState(new Set());
  const [toast, setToast] = useState('');
  const seenReminderIds = useRef(new Set());
  const toastTimer = useRef(null);

  const searchInputRef = useRef(null);

  const focusSearchInput = () => {
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  useEffect(() => {
    focusSearchInput();
  }, []);

  // Load live offers once. If this fails, billing just carries on without offers.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${OFFER_API_BASE_URL}/api/MOffer?onlyLive=true`);
        if (res.ok) setOffers(await res.json());
      } catch (e) {
        console.error('Failed to load offers (billing continues without them)', e);
      }
    })();
  }, []);

  // Barcode -> subCategoryId lookup from the official API. Offers are tied to
  // sub-categories, and the POS products API may not return them, so this
  // fills the gap for items added from ANY place (grid or search box).
  const [subCatByBarcode, setSubCatByBarcode] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${OFFER_API_BASE_URL}/api/MOffer/product-subcategories`);
        if (!res.ok) return;
        const rows = await res.json();
        const map = {};
        rows.forEach((r) => {
          const bc = r.barcode ?? r.Barcode;
          const sc = r.subCategoryId ?? r.SubCategoryId;
          if (bc != null && sc != null) map[String(bc).trim()] = sc;
        });
        setSubCatByBarcode(map);
      } catch (e) {
        console.error('Failed to load barcode->subcategory map (offers may not match)', e);
      }
    })();
  }, []);

  const resolveSubCat = (p) =>
    p.subCategoryId ?? p.SubCategoryId ?? subCatByBarcode[String(p.barcode ?? '').trim()] ?? null;

  // Cart with subCategoryId guaranteed where it can be resolved
  // Resolution order for a cart item: its own field -> the product list entry
  // (same id) -> the barcode map. This is what makes items added from the
  // product grid behave exactly like items added from the search box.
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const enrichedCart = useMemo(
    () =>
      cart.map((i) => {
        if (i.subCategoryId != null) return i;
        const src = productById.get(i.id);
        return { ...i, subCategoryId: (src ? resolveSubCat(src) : null) ?? resolveSubCat(i) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, productById, subCatByBarcode]
  );

  const prevCartLengthRef = useRef(cart.length);
  useEffect(() => {
    if (cart.length > prevCartLengthRef.current) focusSearchInput();
    prevCartLengthRef.current = cart.length;
  }, [cart]);

  // ── Derived bill lines: offers first, then coupon (honouring immuneToCoupon) ──
  const engineLines = useMemo(() => safeBuildBillLines(enrichedCart, offers), [enrichedCart, offers]);
  const { lines: billLines, overriddenOfferIds } = useMemo(
    () => applyCoupon(engineLines, appliedCoupon),
    [engineLines, appliedCoupon]
  );
  const { applications, reminders } = useMemo(() => safeEvaluate(enrichedCart, offers), [enrichedCart, offers]);

  // A coupon overrides non-immune offers, so reminding about them is just noise
  const visibleReminders = reminders.filter(
    (r) => !dismissedReminders.has(r.id) && !(appliedCoupon && !r.offer.immuneToCoupon)
  );

  // Pop a toast once per brand-new reminder
  useEffect(() => {
    const fresh = reminders.filter((r) => !seenReminderIds.current.has(r.id));
    fresh.forEach((r) => seenReminderIds.current.add(r.id));
    if (fresh.length) {
      setToast(fresh[0].message);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 6000);
    }
  }, [reminders]);

  const resetOfferUi = () => {
    seenReminderIds.current = new Set();
    setDismissedReminders(new Set());
    setToast('');
  };

  const discount = discountByInvoice[invoiceNumber] ?? 0;

  const handleDiscountChange = (value) => {
    setDiscountByInvoice((prev) => ({ ...prev, [invoiceNumber]: value }));
  };

  // ── Amounts (all read billLines, which already carry offer + coupon prices) ──
  const totalAmount = billLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  // Pre-coupon total, used for coupon eligibility checks
  const preCouponTotal = engineLines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const taxableAmount = billLines.reduce((sum, l) => {
    const cgst = Number(l.cgst) || 0;
    return sum + (l.price * l.quantity) / (100 + 2 * cgst) * 100;
  }, 0);
  const taxAmount = billLines.reduce((sum, l) => {
    const cgst = Number(l.cgst) || 0;
    const taxable = (l.price * l.quantity) / (100 + 2 * cgst) * 100;
    return sum + taxable * (cgst / 100) * 2;
  }, 0);

  const totalCouponDiscount = billLines.reduce((s, l) => s + (l.couponOff || 0) * l.quantity, 0);

  const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), totalAmount);
  const payableAmount = totalAmount - safeDiscount;

  const currentPayments = paymentsByInvoice[invoiceNumber] ?? [];
  const amountPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);

  // ── Coupon apply/remove ──
  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) { setCouponError('Enter a coupon code.'); return; }
    const phoneNumber = selectedCustomer?.mobileNumber ?? selectedCustomer?.phoneNumber;
    if (!phoneNumber) { setCouponError('Add a customer before applying a coupon.'); return; }

    setIsApplyingCoupon(true);
    setCouponError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/CouponRedemption/CouponCodeVerification?couponCode=${encodeURIComponent(code)}&phoneNumber=${encodeURIComponent(phoneNumber)}&purchaseAmount=${Math.round(preCouponTotal)}`
      );
      const result = await res.json();

      if (!res.ok) {
        throw new Error((typeof result === 'string' ? result : result?.message) || 'Invalid or expired coupon code.');
      }

      const verifiedCoupon = {
        code,
        raw: result,
        couponAssignmentId: result.couponAssignmentId ?? result.CouponAssignmentId,
        customerId: result.customerId ?? result.CustomerId,
        requiresOtp: result.requiresOtp ?? result.RequiresOtp ?? false,
        verified: result.verified ?? result.Verified ?? false,
        verifiedAt: new Date().toISOString()
      };

      setAppliedCoupon(verifiedCoupon);
      try {
        localStorage.setItem(`verifiedCoupon_${invoiceNumber ?? 'pending'}`, JSON.stringify(verifiedCoupon));
      } catch (storageErr) {
        console.error('Failed to persist verified coupon to localStorage:', storageErr);
      }
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.message || 'Could not apply coupon.');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
    setOtpValue('');
    setOtpError('');
    try {
      localStorage.removeItem(`verifiedCoupon_${invoiceNumber ?? 'pending'}`);
    } catch (storageErr) {
      console.error('Failed to clear verified coupon from localStorage:', storageErr);
    }
  };

  const handleVerifyOtp = async () => {
    if (!appliedCoupon) return;
    const otpVal = Number(otpValue);
    if (!otpVal) { setOtpError('Enter the OTP sent to the customer.'); return; }

    setIsVerifyingOtp(true);
    setOtpError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/CouponRedemption/CouponOtpVerification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponAssignmentId: appliedCoupon.couponAssignmentId,
          customerId: appliedCoupon.customerId,
          otpVal
        })
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error((typeof result === 'string' ? result : result?.message) || 'Invalid or expired OTP.');
      }

      const verifiedCoupon = { ...appliedCoupon, verified: true };
      setAppliedCoupon(verifiedCoupon);
      setOtpValue('');
      try {
        localStorage.setItem(`verifiedCoupon_${invoiceNumber ?? 'pending'}`, JSON.stringify(verifiedCoupon));
      } catch (storageErr) {
        console.error('Failed to persist OTP-verified coupon to localStorage:', storageErr);
      }
    } catch (err) {
      setOtpError(err.message || 'Could not verify OTP.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const redeemAppliedCoupon = async () => {
    if (!appliedCoupon?.couponAssignmentId || !appliedCoupon?.customerId) {
      return { success: false, message: 'Missing coupon assignment/customer id.' };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/CouponRedemption/RedeemCoupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponAssignmentId: appliedCoupon.couponAssignmentId,
          customerId: appliedCoupon.customerId,
          verified: appliedCoupon.verified === true
        })
      });
      const result = await res.json();
      if (!res.ok) return { success: false, message: result?.message || 'Coupon redemption failed.' };
      return { success: true, result };
    } catch (err) {
      return { success: false, message: err.message || 'Coupon redemption error.' };
    }
  };

  // NOTE: the old "bake coupon into cart prices" effect is gone. Cart items now
  // keep price = originalPrice; offers and coupons are applied on billLines.

  const handleAddFromSearch = (product) => {
    if (!invoiceNumber) {
      alert('Please add a customer before adding items.');
      return;
    }
    if (isOutOfStock(product)) {
      setToast(`"${product.productName}" is out of stock and was not added.`);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 4000);
      setItemSearchTerm('');
      focusSearchInput();
      return;
    }
    const salePrice = Number(product.retailSalePrice) || 0;
    const mrp = Number(product.mrp) || 0;
    const cgst = Number(product.cgst) || 0;
    const sgst = Number(product.sgst) || 0;
    const hsn = product.HSNCode ?? product.hsnCode ?? '-';
    const subCategoryId = product.subCategoryId ?? product.SubCategoryId ?? null;

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prevCart,
        {
          id: product.id,
          name: product.productName,
          price: salePrice,
          originalPrice: salePrice,
          mrp, cgst, sgst,
          barcode: product.barcode,
          hsn,
          subCategoryId, // needed for offer matching
          quantity: 1
        }
      ];
    });
    setItemSearchTerm('');
    focusSearchInput();
  };

  const increaseCount = (id) => {
    setCart(cart.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item)));
  };

  const decreaseCount = (id) => {
    setCart((prevCart) => {
      const item = prevCart.find((i) => i.id === id);
      if (item && item.quantity <= 1) return prevCart.filter((i) => i.id !== id);
      return prevCart.map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i));
    });
  };

  const handleSaveQuotation = () => {
    const quotation = {
      invoiceNumber,
      customer: selectedCustomer,
      cart,
      discount,
      coupon: appliedCoupon,
      payments: paymentsByInvoice[invoiceNumber] ?? [],
      savedAt: new Date().toISOString()
    };
    const existing = JSON.parse(localStorage.getItem('savedQuotations') || '[]');
    const updated = [...existing.filter((q) => q.invoiceNumber !== invoiceNumber), quotation];
    localStorage.setItem('savedQuotations', JSON.stringify(updated));
    alert(`Quotation ${invoiceNumber} saved.`);
  };

  const handleLoadQuotation = async (quotation) => {
    const freshInvoiceNumber = await peekInvoiceNumber();
    setInvoiceNumber(freshInvoiceNumber);
    setSelectedCustomer(quotation.customer ?? null);
    setCart(quotation.cart ?? []);
    if (quotation.discount !== undefined) {
      setDiscountByInvoice((prev) => ({ ...prev, [freshInvoiceNumber]: quotation.discount }));
    }
    if (quotation.payments?.length) {
      setPaymentsByInvoice((prev) => ({ ...prev, [freshInvoiceNumber]: quotation.payments }));
    }
    setAppliedCoupon(quotation.coupon ?? null);
    setCouponCode('');
    setCouponError('');
    setOtpValue('');
    setOtpError('');
    resetOfferUi();
    setIsQuotationListOpen(false);
    focusSearchInput();
  };

  const handleCustomerAdded = async (customer) => {
    setSelectedCustomer(customer);
    const nextInvoiceNumber = await peekInvoiceNumber();
    setInvoiceNumber(nextInvoiceNumber);
    setIsCustomerWindowOpen(false);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
    setOtpValue('');
    setOtpError('');
    resetOfferUi();
    try {
      localStorage.removeItem('verifiedCoupon_pending');
    } catch (storageErr) {
      console.error('Failed to clear pending verified coupon from localStorage:', storageErr);
    }
    focusSearchInput();
  };

  const searchResults = itemSearchTerm.trim() === ''
    ? []
    : products.filter((p) => {
        const term = itemSearchTerm.toLowerCase();
        return (p.productName ?? '').toLowerCase().includes(term) || (p.barcode ?? '').toLowerCase().includes(term);
      });

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      handleAddFromSearch(searchResults.find((p) => !isOutOfStock(p)) ?? searchResults[0]);
    }
  };

  const handleUpdatePayments = (newPayments) => {
    setPaymentsByInvoice((prev) => ({ ...prev, [invoiceNumber]: newPayments }));
  };

  // ── Finalize sale ──
  const handlePaymentComplete = async () => {
    if (appliedCoupon?.requiresOtp && !appliedCoupon?.verified) {
      setTransactionError('Verify the coupon OTP before completing the sale.');
      return;
    }

    setIsSubmittingTransaction(true);
    setTransactionError('');
    setPostSaleWarning('');

    const counterId = localStorage.getItem('counterId');
    if (!counterId) {
      setTransactionError('Counter ID missing — please log in again before completing the sale.');
      setIsSubmittingTransaction(false);
      return;
    }

    const finalInvoiceNumber = await peekInvoiceNumber();

    const payload = {
      phoneNumber: selectedCustomer?.mobileNumber ?? selectedCustomer?.phoneNumber,
      invoiceNumber: finalInvoiceNumber,
      totalAmount,
      discount: 0, // discount is no longer reported to the customer purchase master
      couponCode: appliedCoupon?.code ?? null,
      payableAmount,
      counterId: Number(counterId),
      // One entry per bill line: the same product can appear more than once
      // (once per offer application, plus a plain line).
      items: billLines.map((item) => {
        const mrp = Number(item.mrp) || item.price;
        const itemDiscount = Math.max(mrp - item.price, 0) * item.quantity;
        return {
          productId: item.id,
          quantity: item.quantity,
          salePrice: item.price,
          mrp,
          discount: itemDiscount,
          afterTaxation: item.price * item.quantity,
          hsnCode: item.hsn,
          offerId: item.offerId ?? null
        };
      }),
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

      const finalizedInvoiceNumber = result?.invoiceNumber || finalInvoiceNumber;

      const totalSaved =
        billLines.reduce((s, l) => s + Math.max((Number(l.mrp) || l.price) - l.price, 0) * l.quantity, 0) +
        safeDiscount;

      const customerName = selectedCustomer?.customerName ?? selectedCustomer?.name;
      sendInvoiceViaWhatsApp({
        phoneNumber: payload.phoneNumber,
        invoiceNumber: finalizedInvoiceNumber,
        customerName,
        message: buildInvoiceMessageText({
          invoiceNumber: finalizedInvoiceNumber,
          customerName,
          items: billLines,
          totalAmount,
          discount: totalSaved,
          taxAmount,
          payableAmount
        })
      });

      if (appliedCoupon?.verified) {
        const redemption = await redeemAppliedCoupon();
        if (!redemption.success) {
          console.error('Coupon redemption failed after sale completed:', redemption.message);
          setPostSaleWarning(
            `Sale completed, but the coupon "${appliedCoupon.code}" could not be redeemed: ${redemption.message}`
          );
        }
      }

      setCompletedInvoice({
        invoiceNumber: finalizedInvoiceNumber,
        customer: selectedCustomer,
        cart: billLines, // receipt gets the split lines
        totalAmount,
        discount: safeDiscount,
        couponDiscount: totalCouponDiscount,
        couponCode: appliedCoupon?.code ?? null,
        taxAmount,
        payableAmount,
        payments: currentPayments,
        completedAt: new Date().toISOString()
      });

      const existingQuotations = JSON.parse(localStorage.getItem('savedQuotations') || '[]');
      localStorage.setItem(
        'savedQuotations',
        JSON.stringify(existingQuotations.filter((q) => q.invoiceNumber !== invoiceNumber))
      );

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
      focusSearchInput();
    } catch (err) {
      console.error('Transaction failed:', err);
      setTransactionError(err.message || 'Transaction failed. Please try again.');
    } finally {
      setIsSubmittingTransaction(false);
    }
  };

  const handleCloseReceipt = () => {
    try {
      localStorage.removeItem(`verifiedCoupon_${invoiceNumber ?? 'pending'}`);
    } catch (storageErr) {
      console.error('Failed to clear verified coupon from localStorage:', storageErr);
    }
    setCompletedInvoice(null);
    setCart([]);
    setSelectedCustomer(null);
    setInvoiceNumber(null);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
    setOtpValue('');
    setOtpError('');
    setPostSaleWarning('');
    resetOfferUi();
    focusSearchInput();
  };

  return (
    <aside className="billing-sidebar bs-sidebar">

      {toast && (
        <div className="bs-offer-toast" onClick={() => setToast('')}>💡 {toast}</div>
      )}

      <div className="bs-top-actions">
        <button className="bs-secondary-button" onClick={() => setIsCustomerWindowOpen(true)}>
          Add Customer
        </button>
        {isCustomerWindowOpen && (
          <AddCustomer onClose={() => setIsCustomerWindowOpen(false)} onCustomerAdded={handleCustomerAdded} />
        )}
        <button className="bs-secondary-button" onClick={() => setIsQuotationListOpen(true)}>
          Quotations
        </button>
        {isQuotationListOpen && (
          <Quotation onClose={() => setIsQuotationListOpen(false)} onLoadQuotation={handleLoadQuotation} />
        )}
      </div>

      {selectedCustomer && (
        <div className="bs-customer-info">
          <span className="bs-customer-name">{selectedCustomer.customerName ?? selectedCustomer.name}</span>
          <span className="bs-customer-number">{selectedCustomer.mobileNumber ?? selectedCustomer.phoneNumber}</span>
          <span className="bs-customer-wallet">
            Wallet: ₹{Number(selectedCustomer.currentBalance ?? selectedCustomer.walletValue ?? 0).toFixed(2)}
          </span>
        </div>
      )}

      <div className="bs-search-wrapper">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search to add item..."
          value={itemSearchTerm}
          onChange={(e) => setItemSearchTerm(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="bs-search-input"
        />
        {searchResults.length > 0 && (
          <ul className="bs-dropdown">
            {searchResults.map((product) => (
              <li
                key={product.id}
                onClick={() => handleAddFromSearch(product)}
                className="bs-dropdown-item"
                style={isOutOfStock(product) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <div className="bs-dropdown-item-info">
                  <span>{product.productName}</span>
                  <span className="bs-dropdown-barcode">Barcode: {product.barcode}</span>
                  {isOutOfStock(product) && (
                    <span style={{ color: '#dc3545', fontSize: '0.75rem' }}>Out of stock</span>
                  )}
                  {offersForProduct({ ...product, subCategoryId: resolveSubCat(product) }, offers).map((o) => (
                    <span key={o.id} className="bs-offer-badge">🏷 {o.name}</span>
                  ))}
                </div>
                <strong>₹{Number(product.retailSalePrice).toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bs-products-container">
        <h3 className="bs-section-title">
          {invoiceNumber ? `Invoice #${invoiceNumber}` : 'No customer added yet'}
        </h3>
        {billLines.length === 0 && <p className="bs-empty-text">Cart is empty.</p>}
        {billLines.map((product) => {
          const mrp = Number(product.mrp) || product.price;
          const itemDiscount = Math.max(mrp - product.price, 0) * product.quantity;
          const saleValue = product.price * product.quantity;
          const isLatest = product.id === cart[cart.length - 1]?.id;
          return (
            <div
              key={product.key}
              className={`bs-product-row${isLatest ? ' bs-product-row--latest' : ''}`}
            >
              <div className="bs-product-main">
                <span className="bs-product-name">{product.name}</span>
                <span className="bs-product-barcode">Barcode: {product.barcode}</span>
                {product.offerName && (
                  <span className="bs-offer-badge">🏷 {product.offerName}</span>
                )}
              </div>
              <div className="bs-product-columns">
                <div className="bs-product-col">
                  <span className="bs-col-label">Qty</span>
                  <div className="bs-quantity-controls">
                    <button onClick={() => decreaseCount(product.id)} className="bs-icon-button">-</button>
                    <span className="bs-quantity-text">{product.quantity}</span>
                    <button onClick={() => increaseCount(product.id)} className="bs-icon-button">+</button>
                  </div>
                </div>
                <div className="bs-product-col">
                  <span className="bs-col-label">MRP</span>
                  <span className="bs-col-value">₹{mrp.toFixed(2)}</span>
                </div>
                <div className="bs-product-col">
                  <span className="bs-col-label">Discount</span>
                  <span className="bs-col-value">₹{itemDiscount.toFixed(2)}</span>
                </div>
                <div className="bs-product-col">
                  <span className="bs-col-label">Sale Value</span>
                  <span className="bs-col-value bs-col-value--strong">₹{saleValue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(applications.length > 0 || visibleReminders.length > 0) && (
        <div className="bs-offers-panel">
          <h3 className="bs-section-title">Offers</h3>

          {applications.map((a, i) => {
            const overridden = overriddenOfferIds.includes(a.offer.id);
            return (
              <p key={i} style={{ color: overridden ? '#6b7280' : '#198754', margin: '2px 0' }}>
                {overridden
                  ? `↪ ${a.offer.name} replaced by coupon (not combinable)`
                  : `✓ ${a.offer.name} applied: saved ₹${a.discount.toFixed(2)}${
                      appliedCoupon && a.offer.immuneToCoupon ? ' (coupon stacked on top)' : ''
                    }`}
              </p>
            );
          })}

          {visibleReminders.map((r) => (
            <div key={r.id} style={{ color: '#b45309', margin: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>💡 {r.message}</span>
              <button
                onClick={() => setDismissedReminders((p) => new Set(p).add(r.id))}
                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                aria-label="Dismiss reminder"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="bs-coupon-summary-row">
        <div className="bs-coupon-container">
          <h3 className="bs-section-title">Coupon Code</h3>
          {appliedCoupon ? (
            appliedCoupon.requiresOtp && !appliedCoupon.verified ? (
              <div className="bs-coupon-otp-row">
                <span className="bs-coupon-applied-text">
                  "{appliedCoupon.code}" — OTP sent to the customer, verify to apply ₹{totalCouponDiscount.toFixed(2)} off
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter OTP"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  className="bs-coupon-input"
                  disabled={isVerifyingOtp}
                />
                <button className="bs-coupon-apply-button" onClick={handleVerifyOtp} disabled={isVerifyingOtp}>
                  {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                </button>
                <button className="bs-coupon-remove-button" onClick={handleRemoveCoupon}>Remove</button>
                {otpError && <p className="bs-error-text">{otpError}</p>}
              </div>
            ) : (
              <div className="bs-coupon-applied-row">
                <span className="bs-coupon-applied-text">
                  "{appliedCoupon.code}" applied — ₹{totalCouponDiscount.toFixed(2)} off
                </span>
                <button className="bs-coupon-remove-button" onClick={handleRemoveCoupon}>Remove</button>
              </div>
            )
          ) : (
            <div className="bs-coupon-row">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="bs-coupon-input"
                disabled={isApplyingCoupon}
              />
              <button
                className="bs-coupon-apply-button"
                onClick={handleApplyCoupon}
                disabled={isApplyingCoupon || !invoiceNumber}
              >
                {isApplyingCoupon ? 'Applying...' : 'Apply'}
              </button>
            </div>
          )}
          {couponError && <p className="bs-error-text">{couponError}</p>}
        </div>

        <div className="bs-summary-container">
          <h3 className="bs-section-title">Bill Summary</h3>
          <div className="bs-summary-row">
            <span>Taxable Amount:</span>
            <span>₹{taxableAmount.toFixed(2)}</span>
          </div>

          <div className="bs-summary-row">
            <span>Discount:</span>
            <input
              type="number"
              min="0"
              max={totalAmount}
              value={discount}
              onChange={(e) => handleDiscountChange(e.target.value)}
              className="bs-discount-input"
            />
          </div>

          {totalCouponDiscount > 0 && (
            <div className="bs-summary-row">
              <span>Coupon Discount:</span>
              <span>-₹{totalCouponDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="bs-summary-row">
            <span>Tax Amount:</span>
            <span>₹{taxAmount.toFixed(2)}</span>
          </div>

          <div className="bs-summary-total">
            <span>Payable Amount:</span>
            <span>₹{payableAmount.toFixed(2)}</span>
          </div>

          {amountPaid > 0 && (
            <div className="bs-summary-row">
              <span>Paid So Far:</span>
              <span>₹{amountPaid.toFixed(2)} / ₹{payableAmount.toFixed(2)}</span>
            </div>
          )}

          {transactionError && <p className="bs-error-text">{transactionError}</p>}
        </div>
      </div>

      <div className="bs-bottom-actions">
        {/* Offers and reminders never disable this button */}
        <button
          className="bs-primary-button bs-primary-button--payment"
          onClick={() => setIsPaymentWindowOpen(true)}
          disabled={!invoiceNumber || cart.length === 0 || (appliedCoupon?.requiresOtp && !appliedCoupon?.verified)}
        >
          Payment
        </button>
        <button
          className="bs-primary-button bs-primary-button--quotation"
          onClick={handleSaveQuotation}
          disabled={!invoiceNumber}
        >
          Quotation
        </button>
      </div>

      {isPaymentWindowOpen && (
        <Payment
          invoiceNumber={invoiceNumber}
          payableAmount={payableAmount}
          walletBalance={Number(selectedCustomer?.currentBalance ?? selectedCustomer?.walletValue ?? 0)}
          customerPhone={selectedCustomer?.mobileNumber ?? selectedCustomer?.phoneNumber}
          existingPayments={currentPayments}
          onUpdatePayments={handleUpdatePayments}
          onComplete={handlePaymentComplete}
          onClose={() => {
            setIsPaymentWindowOpen(false);
            focusSearchInput();
          }}
          isSubmitting={isSubmittingTransaction}
        />
      )}

      {completedInvoice && (
        <InvoiceBill invoice={completedInvoice} onClose={handleCloseReceipt} />
      )}

      {postSaleWarning && (
        <p className="bs-error-text bs-post-sale-warning">{postSaleWarning}</p>
      )}

    </aside>
  );
}

export default BillingSection;