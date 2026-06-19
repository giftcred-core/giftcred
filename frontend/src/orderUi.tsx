import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getProduct, asArray, type GiftCard, type Order, type OrderItem } from "./api";

export const ORDER_POLL_SECONDS = 30;

export function isOrderPending(order: { status?: string; cards?: GiftCard[] | unknown }) {
  const status = (order.status || "PROCESSING").toLowerCase();
  if (status === "failed") return false;
  // "Delivered" only when the user can actually see the codes.
  return !asArray<GiftCard>(order.cards).length;
}

// Order is only "delivered" when codes are visible to the user.
export function displayStatus(order: { status?: string; cards?: GiftCard[] | unknown }) {
  const raw = (order.status || "PROCESSING").toLowerCase();
  if (raw === "failed") return "failed";
  if (asArray<GiftCard>(order.cards).length) return "completed";
  return "processing";
}

export function copyToClipboard(text: string) {
  if (text && text !== "N/A") navigator.clipboard.writeText(text);
}

// Deterministic gradient + initials per brand so each card feels unique.
const CARD_GRADIENTS = [
  "linear-gradient(135deg, #f64927 0%, #be185d 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
  "linear-gradient(135deg, #0891b2 0%, #0d9488 100%)",
  "linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #db2777 0%, #9333ea 100%)",
  "linear-gradient(135deg, #059669 0%, #10b981 100%)",
  "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)",
  "linear-gradient(135deg, #b45309 0%, #d97706 100%)",
];

function hashString(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function brandGradient(name: string) {
  return CARD_GRADIENTS[hashString(name || "gift") % CARD_GRADIENTS.length];
}

function brandInitials(name: string) {
  const words = (name || "Gift").trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() || "").join("") || "GC";
}

function formatCardNumber(num: string) {
  if (!num || num === "N/A") return num;
  return num.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function hasCodeValue(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  return Boolean(v && v !== "N/A");
}

export function useProcessingPoll(
  pending: boolean,
  onPoll: () => void | Promise<void>,
  active = true
) {
  const [secondsLeft, setSecondsLeft] = useState(ORDER_POLL_SECONDS);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [polling, setPolling] = useState(false);

  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  useEffect(() => {
    if (!active || !pending) return;

    const runPoll = async () => {
      setPolling(true);
      try {
        await onPollRef.current();
        setLastChecked(new Date());
      } finally {
        setPolling(false);
        setSecondsLeft(ORDER_POLL_SECONDS);
      }
    };

    setSecondsLeft(ORDER_POLL_SECONDS);
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          void runPoll();
          return ORDER_POLL_SECONDS;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [active, pending]);

  return { secondsLeft, lastChecked, polling };
}

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

// Big, tap-friendly field — the whole row copies on click, with clear feedback.
function CodeField({
  label,
  value,
  onCopy,
  format,
}: {
  label: string;
  value: string;
  onCopy: (text: string) => void;
  format?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const disabled = !value || value === "N/A";
  const display = format ? formatCardNumber(value) : value;

  const handle = () => {
    if (disabled) return;
    onCopy(value);
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      className={`code-field ${copied ? "copied" : ""}`}
      onClick={handle}
      disabled={disabled}
      aria-label={`Copy ${label}`}
    >
      <span className="code-field-label">{label}</span>
      <span className="code-field-main">
        <code className="code-field-value">{display}</code>
        <span className="code-field-action">
          {copied ? "✓ Copied" : <><CopyIcon /> Copy</>}
        </span>
      </span>
    </button>
  );
}

type VoucherCard = GiftCard & { sku?: string; productName?: string; brandName?: string };

interface BrandGroup {
  brand: string;
  sku?: string;
  cards: VoucherCard[];
}

function groupCardsByBrand(cards: VoucherCard[], items: OrderItem[]): BrandGroup[] {
  const safeCards = asArray<VoucherCard>(cards);
  const safeItems = asArray<OrderItem>(items);
  const uniqueSkus = [...new Set(safeItems.map((i) => i.sku))];
  const groups = new Map<string, BrandGroup>();

  const findItem = (card: VoucherCard) => {
    if (card.sku) {
      const bySku = safeItems.find((i) => i.sku === card.sku);
      if (bySku) return bySku;
    }
    const amt = parseFloat(String(card.amount));
    return safeItems.find((i) => i.amount === amt);
  };

  for (const card of safeCards) {
    let brand = card.brandName || card.productName;
    let sku = card.sku;

    const match = findItem(card);
    if (match) {
      if (!brand) brand = match.brandName || match.sku;
      if (!sku) sku = match.sku;
    }
    if (!brand && uniqueSkus.length === 1 && safeItems[0]) {
      brand = safeItems[0].brandName || safeItems[0].sku;
      sku = sku || safeItems[0].sku;
    }
    if (!brand) brand = "Gift Cards";

    const key = sku || brand;
    if (!groups.has(key)) groups.set(key, { brand, sku, cards: [] });
    groups.get(key)!.cards.push(card);
  }

  return [...groups.values()];
}

const COUPONS_PREVIEW = 3;

function BrandVoucherCard({
  group,
  onCopy,
}: {
  group: BrandGroup;
  onCopy: (text: string) => void;
}) {
  const { brand, sku, cards: rawCards } = group;
  const cards = asArray<VoucherCard>(rawCards);
  const multi = cards.length > 1;
  const totalValue = cards.reduce((acc, c) => acc + (parseFloat(String(c?.amount)) || 0), 0);

  const [expanded, setExpanded] = useState(cards.length <= COUPONS_PREVIEW);
  const [showRedeem, setShowRedeem] = useState(false);
  const [guide, setGuide] = useState<string | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(false);

  const visibleCards = expanded ? cards : cards.slice(0, COUPONS_PREVIEW);

  const toggleRedeem = async () => {
    const next = !showRedeem;
    setShowRedeem(next);
    if (next && guide === null && sku) {
      setLoadingGuide(true);
      try {
        const p = await getProduct(sku);
        setGuide(p.howToRedeem || "");
      } catch {
        setGuide("");
      } finally {
        setLoadingGuide(false);
      }
    }
  };

  return (
    <div className="brand-voucher">
      <div className="brand-voucher-head" style={{ background: brandGradient(brand) }}>
        <div className="brand-voucher-shine" />
        <span className="brand-voucher-avatar">{brandInitials(brand)}</span>
        <div className="brand-voucher-id">
          {sku ? (
            <Link to={`/product/${sku}`} className="brand-voucher-name">
              {brand} <span className="brand-voucher-ext">↗</span>
            </Link>
          ) : (
            <span className="brand-voucher-name">{brand}</span>
          )}
          <span className="brand-voucher-count">
            {cards.length} card{cards.length > 1 ? "s" : ""} · ₹{totalValue} value
          </span>
        </div>
      </div>

      <div className="brand-voucher-body">
        {visibleCards.map((card, idx) => (
          <div key={idx} className="coupon">
            {multi && <span className="coupon-num">Card {idx + 1}</span>}
            {hasCodeValue(card?.cardNumber) && (
              <CodeField label="Card number" value={card!.cardNumber} onCopy={onCopy} format />
            )}
            {hasCodeValue(card?.cardPin) && (
              <CodeField label="PIN" value={card!.cardPin} onCopy={onCopy} />
            )}
            {hasCodeValue(card?.activationCode) && (
              <CodeField label="Activation code" value={card!.activationCode!} onCopy={onCopy} />
            )}
            <div className="coupon-foot">
              <span className="coupon-value">₹{card?.amount ?? "—"}</span>
              {card?.validity && <span className="coupon-validity">Valid till {card.validity}</span>}
              {card?.activationUrl && (
                <a href={card.activationUrl} target="_blank" rel="noreferrer" className="coupon-activate">
                  Activate →
                </a>
              )}
            </div>
          </div>
        ))}

        {cards.length > COUPONS_PREVIEW && (
          <button type="button" className="coupon-toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Show less" : `Show all ${cards.length} cards`}
          </button>
        )}

        <button
          type="button"
          className={`redeem-btn ${showRedeem ? "open" : ""}`}
          onClick={toggleRedeem}
        >
          <span className="redeem-btn-label">How to redeem</span>
          <span className="redeem-btn-arrow">▾</span>
        </button>

        {showRedeem && (
          <div className="redeem-reveal">
            {loadingGuide ? (
              <p className="muted">Loading instructions…</p>
            ) : guide ? (
              <div className="rich-content" dangerouslySetInnerHTML={{ __html: guide }} />
            ) : (
              <ol className="redeem-fallback">
                <li>Visit {brand}&apos;s website, app, or store.</li>
                <li>At checkout, choose gift card / e-voucher payment.</li>
                <li>Enter the card number and PIN above.</li>
              </ol>
            )}
            {sku && (
              <Link to={`/product/${sku}`} className="order-item-link">
                Full {brand} details →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function VoucherGrid({
  cards,
  items = [],
  onCopy,
}: {
  cards: VoucherCard[] | unknown;
  items?: OrderItem[] | unknown;
  onCopy: (text: string) => void;
}) {
  const safeCards = asArray<VoucherCard>(cards);
  const safeItems = asArray<OrderItem>(items);
  const groups = useMemo(() => groupCardsByBrand(safeCards, safeItems), [safeCards, safeItems]);
  if (!safeCards.length) return null;

  return (
    <div className="voucher-section">
      <div className="voucher-grid">
        {groups.map((group, idx) => (
          <BrandVoucherCard key={group.sku || group.brand || idx} group={group} onCopy={onCopy} />
        ))}
      </div>
    </div>
  );
}

export function OrderPurchasedItems({ items }: { items: OrderItem[] | unknown }) {
  const safeItems = asArray<OrderItem>(items);
  if (!safeItems.length) return null;
  return (
    <div className="order-purchased">
      <h4 className="order-section-title">What you bought</h4>
      <ul className="order-items-list">
        {safeItems.map((item, idx) => {
          const name = item?.brandName || item?.sku || "Gift card";
          return (
            <li key={`${item?.sku}-${item?.amount}-${idx}`} className="order-item-row">
              <span className="order-item-avatar" style={{ background: brandGradient(name) }}>
                {brandInitials(name)}
              </span>
              <Link to={`/product/${item?.sku ?? ""}`} className="order-item-main">
                <span className="order-item-brand">{name}</span>
                <span className="order-item-meta">₹{item?.amount ?? 0} × {item?.quantity ?? 0}</span>
              </Link>
              <span className="order-item-sub">₹{(item?.amount ?? 0) * (item?.quantity ?? 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Circular countdown ring for the processing state.
function CountdownRing({ secondsLeft, polling }: { secondsLeft: number; polling: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const progress = polling ? 0 : secondsLeft / ORDER_POLL_SECONDS;
  return (
    <div className="countdown-ring">
      <svg viewBox="0 0 64 64" className="countdown-ring-svg">
        <circle cx="32" cy="32" r={r} className="countdown-ring-track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="countdown-ring-fill"
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - progress) }}
        />
      </svg>
      <span className="countdown-ring-num">{polling ? "··" : secondsLeft}</span>
    </div>
  );
}

export function ProcessingStatusBlock({
  secondsLeft,
  lastChecked,
  polling,
  error,
  onFetchNow,
  fetchLabel = "Check now",
}: {
  secondsLeft: number;
  lastChecked: Date | null;
  polling: boolean;
  error?: string;
  onFetchNow: () => void;
  fetchLabel?: string;
}) {
  return (
    <div className="processing-status">
      <CountdownRing secondsLeft={secondsLeft} polling={polling} />
      <div className="processing-status-body">
        <p className="processing-status-title">
          <span className="processing-pulse" />
          {polling ? "Checking for your gift cards…" : "Gift cards are being generated"}
        </p>
        <p className="muted processing-status-desc">
          Bulk orders take a little longer. We check automatically every {ORDER_POLL_SECONDS} seconds
          {lastChecked ? ` · last checked at ${lastChecked.toLocaleTimeString()}` : ""}.
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onFetchNow} disabled={polling}>
          {polling ? "Checking…" : fetchLabel}
        </button>
        {error && <p className="error-text processing-error">{error}</p>}
      </div>
    </div>
  );
}

function statusMeta(status: string) {
  switch (status) {
    case "completed": return { label: "Delivered", icon: "✓", step: 3 };
    case "failed": return { label: "Failed", icon: "✕", step: 0 };
    default: return { label: "Processing", icon: "⏳", step: 2 };
  }
}

function OrderTimeline({ status }: { status: string }) {
  const { step } = statusMeta(status);
  const steps = ["Placed", "Processing", "Delivered"];
  if (status === "failed") return null;
  return (
    <div className="order-timeline">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className={`timeline-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
            <span className="timeline-dot">{done ? "✓" : n}</span>
            <span className="timeline-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function OrderDetailBlock({
  order,
  onCopy,
  onFetchCodes,
  refreshing,
  fetchError,
  pollSeconds,
  pollLastChecked,
  pollActive,
}: {
  order: Order;
  onCopy: (text: string) => void;
  onFetchCodes: () => void;
  refreshing: boolean;
  fetchError?: string;
  pollSeconds: number;
  pollLastChecked: Date | null;
  pollActive: boolean;
}) {
  const items = asArray<OrderItem>(order.items);
  const cards = asArray<VoucherCard>(order.cards);
  const total = items.reduce((acc, item) => acc + (item?.amount ?? 0) * (item?.quantity ?? 0), 0);
  const status = displayStatus(order);
  const pending = isOrderPending(order);
  const meta = statusMeta(status);

  return (
    <div className={`order-card status-${status}`}>
      <div className="order-head">
        <div className="order-meta">
          <div className="order-ref-wrap">
            <span className="order-ref-badge">ORDER</span>
            <span className="ref">{order.refno}</span>
          </div>
          <p className="muted order-date">{new Date(order.createdAt).toLocaleString()}</p>
          {order.email && <p className="muted">Sent to {order.email}</p>}
        </div>
        <div className="order-right">
          <div className={`status-badge ${status}`}>{meta.icon} {meta.label}</div>
          <div className="order-total">₹{total}</div>
        </div>
      </div>

      <OrderTimeline status={status} />

      <OrderPurchasedItems items={items} />

      {cards.length > 0 ? (
        <>
          <VoucherGrid cards={cards} items={items} onCopy={onCopy} />
          {pending && pollActive && (
            <ProcessingStatusBlock
              secondsLeft={pollSeconds}
              lastChecked={pollLastChecked}
              polling={refreshing}
              error={fetchError}
              onFetchNow={onFetchCodes}
              fetchLabel="Check for more"
            />
          )}
        </>
      ) : (
        <ProcessingStatusBlock
          secondsLeft={pollSeconds}
          lastChecked={pollLastChecked}
          polling={refreshing}
          error={fetchError}
          onFetchNow={onFetchCodes}
        />
      )}
    </div>
  );
}

export function OrdersSummaryBar({ orders }: { orders: Order[] }) {
  const totalSpent = orders.reduce(
    (acc, o) => acc + asArray<OrderItem>(o.items).reduce((s, i) => s + (i?.amount ?? 0) * (i?.quantity ?? 0), 0),
    0
  );
  const totalCards = orders.reduce((acc, o) => acc + asArray<GiftCard>(o.cards).length, 0);
  const pending = orders.filter(isOrderPending).length;

  return (
    <div className="orders-summary">
      <div className="orders-summary-stat">
        <span className="orders-summary-num">{orders.length}</span>
        <span className="orders-summary-label">Orders</span>
      </div>
      <div className="orders-summary-stat">
        <span className="orders-summary-num">{totalCards}</span>
        <span className="orders-summary-label">Gift cards</span>
      </div>
      <div className="orders-summary-stat">
        <span className="orders-summary-num">₹{totalSpent}</span>
        <span className="orders-summary-label">Total value</span>
      </div>
      {pending > 0 && (
        <div className="orders-summary-stat pending">
          <span className="orders-summary-num">{pending}</span>
          <span className="orders-summary-label">Processing</span>
        </div>
      )}
    </div>
  );
}
