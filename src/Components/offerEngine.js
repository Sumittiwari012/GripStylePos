// offerEngine.js
// Pure helpers. Nothing here may ever block billing: the safe* wrappers
// fall back to plain cart lines if anything goes wrong.

const FLAT = 1, PERCENT = 2, BXGY = 3, BUNDLE = 4;

// How the discount is spread across units: 'highest' | 'equal' | 'proportional'
const SPLIT_MODE = { [FLAT]: 'highest', [PERCENT]: 'highest', [BUNDLE]: 'equal' };

const unitPrice = (item) => Number(item.originalPrice ?? item.price) || 0;
const sum = (units) => units.reduce((t, u) => t + u.price, 0);

// ── pool: one "unit" per physical piece, grouped by sub-category ──
const buildPool = (cart) => {
  const pool = {};
  cart.forEach((item) => {
    const sc = item.subCategoryId;
    for (let i = 0; i < item.quantity; i++) {
      const unit = { item, price: unitPrice(item), used: false };
      if (sc != null) (pool[sc] ??= []).push(unit);
      (pool.__all ??= []).push(unit);
    }
  });
  return pool;
};

const free = (pool, sc) => (pool[sc] ?? []).filter((u) => !u.used);

const takeSlots = (slots, pool, order) => {
  const units = [], missing = [];
  (slots ?? []).forEach((s) => {
    const avail = free(pool, s.subCategoryId).sort((a, b) =>
      order === 'desc' ? b.price - a.price : a.price - b.price
    );
    if (avail.length >= s.qty) units.push(...avail.slice(0, s.qty));
    else missing.push({ ...s, short: s.qty - avail.length });
  });
  return { units, missing };
};

// Map(unit -> discount). Never discounts a unit below 0.
const distribute = (units, total, mode) => {
  const disc = new Map(units.map((u) => [u, 0]));
  let left = Math.min(total, sum(units));

  if (mode === 'highest') {
    [...units].sort((a, b) => b.price - a.price).forEach((u) => {
      const d = Math.min(u.price, left);
      disc.set(u, d);
      left -= d;
    });
  } else if (mode === 'equal') {
    let pending = [...units];
    while (left > 0.005 && pending.length) {
      const share = left / pending.length;
      const next = [];
      pending.forEach((u) => {
        const room = u.price - disc.get(u);
        const d = Math.min(share, room);
        disc.set(u, disc.get(u) + d);
        left -= d;
        if (room - d > 0.005) next.push(u);
      });
      pending = next;
    }
  } else {
    const base = sum(units);
    units.forEach((u) => disc.set(u, base ? (u.price / base) * left : 0));
  }
  return disc;
};

const computeDiscount = (offer, buyUnits, getUnits) => {
  const B = sum(buyUnits);
  switch (offer.offerTypeId) {
    case FLAT:
      return distribute(buyUnits, offer.flatAmount || 0, SPLIT_MODE[FLAT]);
    case PERCENT:
      return distribute(buyUnits, (B * (offer.discountPercentage || 0)) / 100, SPLIT_MODE[PERCENT]);
    case BUNDLE:
      return distribute(buyUnits, Math.max(B - (offer.comboPrice || 0), 0), SPLIT_MODE[BUNDLE]);
    case BXGY: // GET units become free
      return new Map(getUnits.map((u) => [u, u.price]));
    default:
      return new Map();
  }
};

const tryOffer = (offer, pool) => {
  const buy = takeSlots(offer.buySlots, pool, 'desc');
  if (buy.missing.length) return null;

  let getUnits = [];
  if (offer.offerTypeId === BXGY) {
    buy.units.forEach((u) => (u.used = true)); // GET must not overlap BUY
    const get = takeSlots(offer.getSlots, pool, 'asc');
    buy.units.forEach((u) => (u.used = false));
    if (get.missing.length) return null;
    getUnits = get.units;
  }

  const disc = computeDiscount(offer, buy.units, getUnits);
  const discount = [...disc.values()].reduce((t, d) => t + d, 0);
  return { offer, buyUnits: buy.units, getUnits, disc, discount };
};

// ── friendly reminders (informational only) ──
const describeBenefit = (o) => {
  switch (o.offerTypeId) {
    case FLAT:    return `₹${o.flatAmount} off`;
    case PERCENT: return `${o.discountPercentage}% off`;
    case BXGY:    return 'the GET item(s) free';
    case BUNDLE:  return `the bundle at ₹${o.comboPrice}`;
    default:      return 'a discount';
  }
};

const fmtMissing = (missing) =>
  missing.map((m) => `${m.short} more ${m.subCategoryName ?? 'item'}`).join(', ');

const buildReminders = (offers, pool) => {
  const reminders = [];
  offers.forEach((o) => {
    const slots = [...(o.buySlots ?? []), ...(o.getSlots ?? [])];
    if (!slots.some((s) => free(pool, s.subCategoryId).length > 0)) return;

    const buy = takeSlots(o.buySlots, pool, 'desc');
    let phase = null, missing = [];

    if (buy.missing.length) {
      phase = 'buy';
      missing = buy.missing;
    } else if (o.offerTypeId === BXGY) {
      buy.units.forEach((u) => (u.used = true));
      const get = takeSlots(o.getSlots, pool, 'asc');
      buy.units.forEach((u) => (u.used = false));
      if (get.missing.length) { phase = 'get'; missing = get.missing; }
    }
    if (!phase) return;

    reminders.push({
      id: `${o.id}-${phase}-${missing.map((m) => `${m.subCategoryId}:${m.short}`).join(',')}`,
      offer: o,
      phase,
      missing,
      message:
        phase === 'get'
          ? `"${o.name}": customer has the BUY items but not the GET item. Ask if they want to add ${fmtMissing(missing)} to get ${describeBenefit(o)}.`
          : `"${o.name}": ask the customer to add ${fmtMissing(missing)} to get ${describeBenefit(o)}.`,
    });
  });
  return reminders;
};

// ── main evaluation ──
export const evaluateOffers = (cart, offers) => {
  const pool = buildPool(cart);
  const applications = [];

  // Greedy: keep committing whichever application saves the most
  for (let guard = 0; guard < 200; guard++) {
    let best = null;
    offers.forEach((o) => {
      const app = tryOffer(o, pool);
      if (app && app.discount > 0 && (!best || app.discount > best.discount)) best = app;
    });
    if (!best) break;
    [...best.buyUnits, ...best.getUnits].forEach((u) => (u.used = true));
    applications.push(best);
  }

  return { applications, reminders: buildReminders(offers, pool), pool };
};

// Each application becomes its own set of bill lines (same barcode can repeat)
export const buildBillLines = (cart, offers) => {
  const { applications, pool } = evaluateOffers(cart, offers);
  const lines = [];

  applications.forEach((app, n) => {
    const groups = new Map();
    const add = (units, role) =>
      units.forEach((u) => {
        const k = `${u.item.id}-${role}`;
        const g = groups.get(k) ?? { item: u.item, role, qty: 0, gross: 0, off: 0 };
        g.qty += 1;
        g.gross += u.price;
        g.off += app.disc.get(u) ?? 0;
        groups.set(k, g);
      });
    add(app.buyUnits, 'buy');
    add(app.getUnits, 'get');

    groups.forEach(({ item, role, qty, gross, off }) => {
      lines.push({
        ...item,
        key: `${item.id}-o${app.offer.id}-${n}-${role}`,
        quantity: qty,
        price: Math.max(gross - off, 0) / qty,
        offerId: app.offer.id,
        offerName: app.offer.name,
        immuneToCoupon: app.offer.immuneToCoupon === true,
      });
    });
  });

  // Units not consumed by any offer: plain lines
  const plain = new Map();
  (pool.__all ?? []).filter((u) => !u.used).forEach((u) => {
    const g = plain.get(u.item.id) ?? { item: u.item, qty: 0 };
    g.qty += 1;
    plain.set(u.item.id, g);
  });
  plain.forEach(({ item, qty }) =>
    lines.push({ ...item, key: `${item.id}-plain`, quantity: qty, price: unitPrice(item), offerId: null })
  );

  return lines;
};

export const safeBuildBillLines = (cart, offers) => {
  try {
    return buildBillLines(cart, offers);
  } catch (e) {
    console.error('Offer engine failed, billing plain lines', e);
    return cart.map((i) => ({ ...i, key: `${i.id}-plain`, price: unitPrice(i), offerId: null }));
  }
};

export const safeEvaluate = (cart, offers) => {
  try {
    const { applications, reminders } = evaluateOffers(cart, offers);
    return { applications, reminders };
  } catch (e) {
    console.error('Offer evaluation failed', e);
    return { applications: [], reminders: [] };
  }
};

// ── coupon ──
//  immuneToCoupon = true  -> coupon STACKS on the offer price
//  immuneToCoupon = false -> regular path: reprice from MRP, offer discount dropped
//  plain line             -> regular path
export const applyCoupon = (lines, coupon) => {
  if (!coupon) return { lines, overriddenOfferIds: [] };

  const pct  = Number(coupon.raw?.discountPercentage ?? coupon.raw?.DiscountPercentage) || 0;
  const flat = Number(coupon.raw?.discountAmount ?? coupon.raw?.DiscountAmount) || 0;

  const baseOf = (l) => {
    const mrp = Number(l.mrp) || l.originalPrice || l.price;
    return l.offerId != null && l.immuneToCoupon === true ? l.price : mrp;
  };

  const totalBase = lines.reduce((s, l) => s + baseOf(l) * l.quantity, 0);
  const overridden = new Set();

  const out = lines.map((l) => {
    const base = baseOf(l);
    let off = 0; // per unit
    if (pct > 0) off = base * (pct / 100);
    else if (flat > 0 && totalBase > 0) off = (flat * ((base * l.quantity) / totalBase)) / l.quantity;

    off = Math.min(off, base);
    if (l.offerId != null && !l.immuneToCoupon) overridden.add(l.offerId);
    return { ...l, price: Math.max(base - off, 0), couponOff: off };
  });

  return { lines: out, overriddenOfferIds: [...overridden] };
};

// Search dropdown tag: which live offers include this product's sub-category?
export const offersForProduct = (product, offers) => {
  const sc = product.subCategoryId ?? product.SubCategoryId;
  if (sc == null) return [];
  return offers.filter((o) =>
    [...(o.buySlots ?? []), ...(o.getSlots ?? [])].some((s) => s.subCategoryId === sc)
  );
};
