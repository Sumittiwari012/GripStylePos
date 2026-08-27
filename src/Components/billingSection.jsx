import React, { useState, useRef, useEffect } from 'react';
import './billingSection.css';
import AddCustomer from './addCustomer';
import Quotation from './quotation';
import Payment from './payment';
import InvoiceBill from './invoiceBill';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';
const WA_SERVICE_URL = 'http://localhost:4001'; // change to your Baileys service URL once deployed
const WA_API_KEY = 'your-long-random-secret';

// Builds a plain-text invoice summary to send over WhatsApp instead of a URL.
const buildInvoiceMessageText = ({
  invoiceNumber,
  customerName,
  items = [],
  totalAmount = 0,
  discount = 0,
  taxAmount = 0,
  payableAmount = 0
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
  ]
    .filter(Boolean)
    .join('\n');
};

const sendInvoiceViaWhatsApp = async ({ phoneNumber, invoiceNumber, customerName, message }) => {
  if (!phoneNumber || !message) {
    console.warn('Skipping WhatsApp send: missing phone number or message');
    return;
  }
  try {
    const res = await fetch(`${WA_SERVICE_URL}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': WA_API_KEY
      },
      body: JSON.stringify({ phoneNumber, invoiceNumber, customerName, message })
    });
    const data = await res.json();
    if (!data.success) {
      console.error('WhatsApp send failed:', data.message);
    } else {
      console.log('✅ Invoice sent via WhatsApp');
    }
  } catch (err) {
    console.error('WhatsApp send error (non-blocking):', err);
  }
};

// ── Invoice numbering ──────────────────────────────────────────────────
// Format: GSC{counterId}-{ddMMyyyy}/{serial padded to 4 digits}
// e.g. GSC1-29072026/0078
//
// The serial's source of truth is now the backend's CounterInvoice table
// (per-counter), not localStorage. This is a read-only "peek" — it fetches
// the counter's last-used serial and shows what the NEXT one would be,
// without spending anything. The backend (addTransaction) is responsible
// for actually advancing CounterInvoice once a sale is confirmed saved, so
// there's no separate "commit" step needed here anymore.
const peekInvoiceNumber = async () => {
  const counterId = localStorage.getItem('counterId') || '0';

  let lastSerial = 0;
  try {
    const res = await fetch(`${API_BASE_URL}/GetCounterInvoiceNumber?counterId=${counterId}`);
    if (res.ok) {
      // Endpoint returns the raw numeric LastInvoiceNumber (e.g. 78).
      lastSerial = await res.json();
    }
    // 404 (no row yet for this counter) → lastSerial stays 0, first invoice starts at 0001.
  } catch (err) {
    console.error('Failed to fetch last invoice number:', err);
  }

  const nextSerial = (Number(lastSerial) || 0);

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;
  const serialStr = String(nextSerial).padStart(4, '0');

  return `GSC${counterId}-${dateStr}/${serialStr}`;
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

  // ── Coupon code (scoped to the current invoice, mirrors discount/payments) ──
  // appliedCoupon shape: { code, raw, couponAssignmentId, customerId,
  // requiresOtp, verified, verifiedAt }. `verified` starts out as whatever
  // CouponCodeVerification returned — true immediately for an open coupon
  // (no OTP needed), false for a customer-locked one until the OTP step
  // below flips it to true. RedeemCoupon is only ever called once this is true.
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // ── OTP step for customer-locked coupons ──
  const [otpValue, setOtpValue] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');

  const [completedInvoice, setCompletedInvoice] = useState(null); // holds data for the receipt modal
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  // Sale already went through, but something after it (e.g. redeeming the
  // coupon) failed — surfaced separately so it never blocks/hides the receipt.
  const [postSaleWarning, setPostSaleWarning] = useState('');

  const searchInputRef = useRef(null);

  const focusSearchInput = () => {
    // small delay lets any closing modal/DOM update finish first
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  // Keep the search box focused on initial load
  useEffect(() => {
    focusSearchInput();
  }, []);

  // ── Re-focus the search box whenever a new line item lands in the cart ──
  // Covers additions made from this component's own search dropdown (which
  // already calls focusSearchInput directly) AND additions made from the
  // product grid in the parent component, which has no direct handle on
  // this component's input. Only fires when the cart actually grows (a
  // brand-new line, not a quantity +/- on an existing one), so it doesn't
  // yank focus away while someone's adjusting quantities elsewhere.
  const prevCartLengthRef = useRef(cart.length);
  useEffect(() => {
    if (cart.length > prevCartLengthRef.current) {
      focusSearchInput();
    }
    prevCartLengthRef.current = cart.length;
  }, [cart]);

  const discount = discountByInvoice[invoiceNumber] ?? 0;

  const handleDiscountChange = (value) => {
    setDiscountByInvoice((prev) => ({ ...prev, [invoiceNumber]: value }));
  };

  // ── Coupon apply/remove ──
  // Calls the real CouponCodeVerification endpoint (GET) and stores its
  // response. No redemption happens here, and no OTP step is wired up yet
  // even if the response comes back with RequiresOtp: true. The actual
  // per-item repricing happens in the effect below, keyed off this state.
  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      setCouponError('Enter a coupon code.');
      return;
    }
    const phoneNumber = selectedCustomer?.mobileNumber ?? selectedCustomer?.phoneNumber;
    if (!phoneNumber) {
      setCouponError('Add a customer before applying a coupon.');
      return;
    }

    setIsApplyingCoupon(true);
    setCouponError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/CouponRedemption/CouponCodeVerification?couponCode=${encodeURIComponent(code)}&phoneNumber=${encodeURIComponent(phoneNumber)}&purchaseAmount=${Math.round(totalAmount)}`
      );
      const result = await res.json();

      if (!res.ok) {
        // Backend returns BadRequest(string) with the message as plain text/JSON.
        throw new Error((typeof result === 'string' ? result : result?.message) || 'Invalid or expired coupon code.');
      }

      const verifiedCoupon = {
        code,
        raw: result,
        couponAssignmentId: result.couponAssignmentId ?? result.CouponAssignmentId,
        customerId: result.customerId ?? result.CustomerId,
        // For an open coupon (no OTP needed) the backend already returns
        // Verified: true here — nothing further to do before redeeming.
        // For a customer-locked coupon it comes back false, and only the
        // OTP verification below (handleVerifyOtp) can flip it to true.
        requiresOtp: result.requiresOtp ?? result.RequiresOtp ?? false,
        verified: result.verified ?? result.Verified ?? false,
        verifiedAt: new Date().toISOString()
      };

      setAppliedCoupon(verifiedCoupon);

      // Persist the verification response (per invoice) so it survives a
      // refresh; this is storage only for now, no redemption call yet.
      try {
        localStorage.setItem(
          `verifiedCoupon_${invoiceNumber ?? 'pending'}`,
          JSON.stringify(verifiedCoupon)
        );
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

  // ── OTP verification for customer-locked coupons ──
  // Checks the OTP that CouponCodeVerification sent over WhatsApp. On
  // success, flips appliedCoupon.verified to true — that's the flag
  // handlePaymentComplete checks before calling RedeemCoupon.
  const handleVerifyOtp = async () => {
    if (!appliedCoupon) return;
    const otpVal = Number(otpValue);
    if (!otpVal) {
      setOtpError('Enter the OTP sent to the customer.');
      return;
    }

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

  // ── Actually commit the redemption ──
  // Called from handlePaymentComplete, only once the sale itself has
  // succeeded and appliedCoupon.verified is true (either because the
  // coupon never needed OTP, or because handleVerifyOtp already flipped
  // it). Non-blocking by design: the sale has already gone through by the
  // time this runs, so a failure here shouldn't undo it — it's surfaced
  // via postSaleWarning instead.
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
      if (!res.ok) {
        return { success: false, message: result?.message || 'Coupon redemption failed.' };
      }
      return { success: true, result };
    } catch (err) {
      return { success: false, message: err.message || 'Coupon redemption error.' };
    }
  };

  // ── Bake the coupon discount into each cart item's own price ──────────
  // Every item carries `originalPrice`, its sale price before any coupon
  // (set once, when it's added to the cart, and never touched again). This
  // effect recomputes `item.price` from that fixed baseline every time the
  // cart or the applied coupon changes, so it's safe to re-run repeatedly
  // without compounding discounts:
  //   - Percentage coupon: per-item discount = item.mrp × pct (off ITS OWN
  //     MRP, per unit).
  //   - Flat-amount coupon: the flat amount is split across items in
  //     proportion to each item's share of the cart's total MRP.
  //   - While a coupon is applied, item.price is priced off `mrp` directly
  //     (mrp − that item's coupon discount per unit) — the coupon
  //     supersedes any pre-existing product discount rather than stacking
  //     on top of it. With no coupon applied, item.price falls back to
  //     originalPrice — the item's normal discounted sale price.
  // Because `price` (not just a separately-tracked discount number) is what
  // gets stored on the item, every downstream consumer — the cart rows
  // below, the /addTransaction payload, and the receipt handed to
  // InvoiceBill — reads the correct already-discounted value with no extra
  // calculation of its own.
  useEffect(() => {
    if (cart.length === 0) return;

    const couponPercentage = Number(appliedCoupon?.raw?.discountPercentage ?? appliedCoupon?.raw?.DiscountPercentage) || 0;
    const couponFlatAmount = Number(appliedCoupon?.raw?.discountAmount ?? appliedCoupon?.raw?.DiscountAmount) || 0;

    const totalCartMrp = cart.reduce((sum, item) => {
      const mrp = Number(item.mrp) || item.originalPrice || item.price;
      return sum + mrp * item.quantity;
    }, 0);

    const rawCouponDiscounts = cart.map((item) => {
      if (!appliedCoupon) return 0;
      const mrp = Number(item.mrp) || item.originalPrice || item.price;
      if (couponPercentage > 0) {
        return mrp * (couponPercentage / 100) * item.quantity;
      }
      if (couponFlatAmount > 0 && totalCartMrp > 0) {
        const mrpShare = (mrp * item.quantity) / totalCartMrp;
        return couponFlatAmount * mrpShare;
      }
      return 0;
    });

    let changed = false;
    const nextCart = cart.map((item, idx) => {
      const originalPrice = item.originalPrice ?? item.price;
      const mrp = Number(item.mrp) || originalPrice;
      const couponDiscountPerUnit = item.quantity > 0 ? rawCouponDiscounts[idx] / item.quantity : 0;

      // While a coupon is applied, price off MRP directly — the coupon
      // supersedes any existing product discount rather than stacking on it.
      // With no coupon applied, rawCouponDiscounts is all zeros, so this
      // collapses back to originalPrice — the previous discounted state.
      const basePrice = appliedCoupon ? mrp : originalPrice;
      const newPrice = Math.max(basePrice - couponDiscountPerUnit, 0);

      if (item.originalPrice === originalPrice && Math.abs(newPrice - item.price) < 0.005) {
        return item;
      }
      changed = true;
      return { ...item, originalPrice, price: newPrice };
    });

    if (changed) setCart(nextCart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, appliedCoupon]);

  const handleAddFromSearch = (product) => {
    if (!invoiceNumber) {
      alert('Please add a customer before adding items.');
      return;
    }
    const salePrice = Number(product.retailSalePrice) || 0;
    const mrp = Number(product.mrp) || 0;
    const cgst = Number(product.cgst) || 0;
    const sgst = Number(product.sgst) || 0;
    // Normalize HSN field: product master may send it as HSNCode or hsnCode.
    const hsn = product.HSNCode ?? product.hsnCode ?? '-';

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
          originalPrice: salePrice, // fixed baseline the coupon effect discounts from
          mrp,
          cgst,
          sgst,
          barcode: product.barcode,
          hsn,
          quantity: 1
        }
      ];
    });
    setItemSearchTerm('');
    focusSearchInput();
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
    const updated = [
      ...existing.filter((q) => q.invoiceNumber !== invoiceNumber),
      quotation
    ];
    localStorage.setItem('savedQuotations', JSON.stringify(updated));
    alert(`Quotation ${invoiceNumber} saved.`);
  };

  // Re-peek a fresh number rather than trusting the one stored on the
  // quotation — other sales may have completed since it was saved.
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
    setIsQuotationListOpen(false);
    focusSearchInput();
  };

  // Display-only — peeks the next number from the backend, doesn't spend it.
  // If the sale is never completed, the counter is never touched.
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
    try {
      localStorage.removeItem('verifiedCoupon_pending');
    } catch (storageErr) {
      console.error('Failed to clear pending verified coupon from localStorage:', storageErr);
    }
    focusSearchInput();
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
  // item.price already has any coupon discount baked in (see the repricing
  // effect above), so totalAmount here is the post-coupon total — no
  // separate "subtract the coupon" step needed anywhere below.
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

  // ── Total coupon discount, for the "Coupon Discount" summary row and the
  // applied-coupon badge ──
  // FIXED: now computed against `mrp`, not `originalPrice`. Since the
  // repricing effect above now prices items off `mrp` directly whenever a
  // coupon is applied (mrp − couponDiscountPerUnit), the coupon's true
  // discount per item is `mrp − item.price` — not `originalPrice − item.price`.
  // The old originalPrice-based version silently subtracted back out each
  // item's pre-existing product discount (mrp − originalPrice), which is why
  // it under-reported the coupon's real value whenever items already had
  // their own discount baked in. Gated on `appliedCoupon` so it's exactly 0
  // with no coupon applied (matching the old behavior), and — because the
  // per-item proration in the repricing effect is designed to always sum
  // back to the full flat/percentage amount — this now reliably totals to
  // the coupon's actual value.
  const totalCouponDiscount = appliedCoupon
    ? cart.reduce((sum, item) => {
        const mrp = Number(item.mrp) || item.originalPrice || item.price;
        return sum + Math.max(mrp - item.price, 0) * item.quantity;
      }, 0)
    : 0;

  const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), totalAmount);
  const payableAmount = totalAmount - safeDiscount;

  const currentPayments = paymentsByInvoice[invoiceNumber] ?? [];
  const amountPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);

  const handleUpdatePayments = (newPayments) => {
    setPaymentsByInvoice((prev) => ({ ...prev, [invoiceNumber]: newPayments }));
  };

  // ── Finalize sale: call API, then show receipt, then reset everything ──
  const handlePaymentComplete = async () => {

    // A customer-locked coupon must clear OTP before the sale is finalized —
    // otherwise RedeemCoupon would just reject it later with nothing written.
    if (appliedCoupon?.requiresOtp && !appliedCoupon?.verified) {
      setTransactionError('Verify the coupon OTP before completing the sale.');
      return;
    }

    setIsSubmittingTransaction(true);
    setTransactionError('');
    setPostSaleWarning('');

    // ── Pull the logged-in counter's ID from localStorage (set at login) ──
    const counterId = localStorage.getItem('counterId');

    if (!counterId) {
      setTransactionError('Counter ID missing — please log in again before completing the sale.');
      setIsSubmittingTransaction(false);
      return;
    }

    // Peek a fresh number right before submitting, so we use the true next
    // number even if some time has passed since the customer/cart was set up.
    const finalInvoiceNumber = await peekInvoiceNumber();

    const payload = {
  phoneNumber: selectedCustomer?.mobileNumber ?? selectedCustomer?.phoneNumber,
  invoiceNumber: finalInvoiceNumber,
  totalAmount,
  // Always sent as 0 to the customer purchase master — discount is no
  // longer reported to the backend, regardless of what was actually
  // applied (manual discount + coupon). payableAmount still reflects the
  // real discounted amount the customer paid.
  discount: 0,
  couponCode: appliedCoupon?.code ?? null,
  payableAmount,
  counterId: Number(counterId),
  items: cart.map((item) => {
    const mrp = Number(item.mrp) || item.price;
    const itemDiscount = Math.max(mrp - item.price, 0) * item.quantity;
    return {
      productId: item.id,
      quantity: item.quantity,
      salePrice: item.price,
      mrp,
      discount: itemDiscount,
      afterTaxation: item.price * item.quantity,
      hsnCode: item.hsn
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

      // Note: no client-side "commit" step needed anymore — the backend
      // (addTransaction) parses result.invoiceNumber and syncs
      // CounterInvoice.LastInvoiceNumber for this counter as part of the
      // same DB transaction as the sale itself.

      const finalizedInvoiceNumber = result?.invoiceNumber || finalInvoiceNumber;

      const customerName = selectedCustomer?.customerName ?? selectedCustomer?.name;
      const invoiceMessage = buildInvoiceMessageText({
        invoiceNumber: finalizedInvoiceNumber,
        customerName,
        items: cart,
        totalAmount,
        discount: safeDiscount + totalCouponDiscount,
        taxAmount,
        payableAmount
      });
      sendInvoiceViaWhatsApp({
        phoneNumber: payload.phoneNumber,
        invoiceNumber: finalizedInvoiceNumber,
        customerName,
        message: invoiceMessage
      });

      // ── Redeem the coupon now that the sale has actually gone through ──
      // Only fires if a coupon is applied AND it's verified — true already
      // for an open coupon (RequiresOtp was false), or true because
      // handleVerifyOtp flipped it after a successful OTP check. If a
      // customer-locked coupon somehow reached here unverified, skip the
      // call rather than send verified:false (RedeemCoupon rejects that
      // outright with nothing written, so there'd be no point).
      if (appliedCoupon?.verified) {
        const redemption = await redeemAppliedCoupon();
        if (!redemption.success) {
          console.error('Coupon redemption failed after sale completed:', redemption.message);
          setPostSaleWarning(
            `Sale completed, but the coupon "${appliedCoupon.code}" could not be redeemed: ${redemption.message}`
          );
        }
      }

      // ── Success: prepare receipt data before clearing state ──
      // `cart` here already carries the coupon-adjusted `price`/`mrp` per
      // item (from the repricing effect above), so InvoiceBill's own
      // mrp - price math for "Disc.Amt" will show the real discount
      // instead of ₹0.00.
      console.log("Cart before printing:", cart);
      setCompletedInvoice({
        invoiceNumber: finalizedInvoiceNumber,
        customer: selectedCustomer,
        cart,
        totalAmount,
        discount: safeDiscount,
        couponDiscount: totalCouponDiscount,
        couponCode: appliedCoupon?.code ?? null,
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
      focusSearchInput();
    } catch (err) {
      console.error('Transaction failed:', err);
      setTransactionError(err.message || 'Transaction failed. Please try again.');
      // Nothing to roll back on the frontend — since the number was only
      // ever peeked (never spent client-side), the next retry will simply
      // peek the same next serial again from CounterInvoice.
    } finally {
      setIsSubmittingTransaction(false);
    }
  };

  // ── Called when the receipt modal is closed — reset for a brand new sale ──
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
    focusSearchInput();
  };

  return (
    <aside className="billing-sidebar bs-sidebar">

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
            {searchResults.map(product => (
              <li key={product.id} onClick={() => handleAddFromSearch(product)} className="bs-dropdown-item">
                <div className="bs-dropdown-item-info">
                  <span>{product.productName}</span>
                  <span className="bs-dropdown-barcode">Barcode: {product.barcode}</span>
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
        {cart.length === 0 && <p className="bs-empty-text">Cart is empty.</p>}
        {cart.map((product, index) => {
          // product.price already reflects any coupon discount (baked in
          // by the repricing effect above), so this is just mrp - price —
          // no separate coupon math needed here.
          const mrp = Number(product.mrp) || product.price;
          const itemDiscount = Math.max(mrp - product.price, 0) * product.quantity;
          const saleValue = product.price * product.quantity;
          const isLatest = index === cart.length - 1;
          return (
            <div
              key={product.id}
              className={`bs-product-row${isLatest ? ' bs-product-row--latest' : ''}`}
            >
              <div className="bs-product-main">
                <span className="bs-product-name">{product.name}</span>
                <span className="bs-product-barcode">Barcode: {product.barcode}</span>
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
                <button
                  className="bs-coupon-apply-button"
                  onClick={handleVerifyOtp}
                  disabled={isVerifyingOtp}
                >
                  {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                </button>
                <button className="bs-coupon-remove-button" onClick={handleRemoveCoupon}>
                  Remove
                </button>
                {otpError && <p className="bs-error-text">{otpError}</p>}
              </div>
            ) : (
              <div className="bs-coupon-applied-row">
                <span className="bs-coupon-applied-text">
                  "{appliedCoupon.code}" applied — ₹{totalCouponDiscount.toFixed(2)} off
                </span>
                <button className="bs-coupon-remove-button" onClick={handleRemoveCoupon}>
                  Remove
                </button>
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