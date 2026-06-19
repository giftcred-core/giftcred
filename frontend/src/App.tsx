import { BrowserRouter as Router, Routes, Route, Link, NavLink, useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState, createContext, useContext, useMemo } from "react";
import { getCatalog, placePurchaseOrder, getOrderHistory, getProduct, refreshOrder, asArray } from "./api";
import type { Order } from "./api";
import { AuthProvider, ProtectedRoute, useAuth } from "./auth";
import { AuthPage } from "./AuthPage";
import { loadStoredCart, saveStoredCart, clearStoredCart } from "./cartStorage";
import {
  copyToClipboard,
  isOrderPending,
  OrderDetailBlock,
  OrderPurchasedItems,
  OrdersSummaryBar,
  ProcessingStatusBlock,
  useProcessingPoll,
  VoucherGrid,
} from "./orderUi";

// Max quantity per cart line (Woohoo allows larger orders via async mode).
const MAX_LINE_QTY = 10;

// --- Types ---
interface Price {
  type: string;
  min: number;
  max: number;
  denominations: number[];
}

interface Product {
  sku: string;
  name: string;
  brandName: string;
  image: string;
  bannerImage: string;
  discount: string;
  price?: Price;
  description: string;
  validity: string;
  howToRedeem: string;
  terms?: string;
  termsLink?: string;
  importantPoints?: string[];
  category?: string;
  pinned?: boolean;
}

interface CartItem {
  sku: string;
  brandName: string;
  amount: number;
  quantity: number;
  image: string;
  discount: string;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (sku: string, amount: number) => void;
  updateQuantity: (sku: string, amount: number, qty: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType>({
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQuantity: () => {},
  clearCart: () => {}
});

export function useCart() {
  return useContext(CartContext);
}

// --- Theme ---
type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {}
});

function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("giftcred-theme") as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("giftcred-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

// --- Helpers ---
const fallbackImg = (brand: string, w = 400, h = 250) =>
  `https://placehold.co/${w}x${h}/f6f1ec/9a9189?text=${encodeURIComponent(brand)}`;

// --- Navbar ---
function Navbar() {
  const { cart } = useCart();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <nav className="navbar">
      <div className="container">
        <Link to="/" className="brand-logo">
          <span className="logo-mark">🎁</span>
          <span>Giftcred</span>
        </Link>

        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Home</NavLink>
          <NavLink to="/catalog" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Browse</NavLink>
          {user && (
            <NavLink to="/orders" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Orders</NavLink>
          )}
        </div>

        <div className="nav-actions">
          <button className="icon-btn" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          {user ? (
            <>
              <span className="nav-user" title={user.email}>{user.email.split("@")[0]}</span>
              <button type="button" className="btn btn-ghost btn-sm nav-signout" onClick={logout}>Sign out</button>
            </>
          ) : (
            <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          )}
          <Link to="/cart" className="icon-btn cart-btn" aria-label="Cart">
            🛒
            {totalItems > 0 && <span className="cart-count">{totalItems}</span>}
          </Link>
        </div>
      </div>
    </nav>
  );
}

// --- Footer ---
function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <Link to="/" className="brand-logo" style={{ fontSize: "1.15rem" }}>
          <span className="logo-mark">🎁</span>
          <span>Giftcred</span>
        </Link>
        <div className="footer-links">
          <Link to="/catalog">Browse</Link>
          <Link to="/orders">Orders</Link>
          <a href="#how">How it works</a>
          <a href="#why">Why Giftcred</a>
        </div>
        <span className="muted">© {new Date().getFullYear()} Giftcred. Give the gift of choice.</span>
      </div>
    </footer>
  );
}

// --- Landing ---
function FeaturedCard({ product }: { product: Product }) {
  return (
    <Link to={`/product/${product.sku}`} className="card reveal">
      <div className="card-image-container">
        {product.discount && parseFloat(product.discount) > 0 && (
          <span className="card-discount-badge">{product.discount}% OFF</span>
        )}
        {product.pinned && <span className="card-pin-badge">📌 Pinned</span>}
        <img
          src={product.image}
          alt={product.brandName}
          className="card-image"
          loading="lazy"
          onError={(e) => { e.currentTarget.src = fallbackImg(product.brandName); }}
        />
      </div>
      <div className="card-content">
        <p className="card-category">{product.category || "Gift Card"}</p>
        <h3 className="card-brand">{product.brandName}</h3>
        <div className="card-cta">
          <span>Buy now</span>
          <span className="arrow">→</span>
        </div>
      </div>
    </Link>
  );
}

function Landing() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    getCatalog().then((res) => setProducts(asArray<Product>(res))).catch((e) => console.error(e));
  }, []);

  const featured = products.slice(0, 8);
  const brandNames = products.slice(0, 14).map((p) => p?.brandName ?? "");

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="reveal">
            <span className="eyebrow">🎁 Give the gift of choice</span>
            <h1>
              Gift credits that become <span className="gradient-text">real gift cards</span>
            </h1>
            <p className="hero-lead">
              Fast, simple and flexible. Send credits from top brands and let them pick exactly
              what they love. Delivered in moments.
            </p>
            <div className="hero-cta">
              <Link to="/catalog" className="btn btn-primary btn-lg">Get started</Link>
              <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
            </div>
            <div className="hero-trust">
              <div>
                <div className="t-num gradient-text">{products.length || "100"}+</div>
                <div className="t-label">Brands available</div>
              </div>
              <div>
                <div className="t-num gradient-text">Instant</div>
                <div className="t-label">Delivery</div>
              </div>
              <div>
                <div className="t-num gradient-text">1</div>
                <div className="t-label">Credit, many choices</div>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <span className="hero-emoji e1">✨</span>
            <span className="hero-emoji e2">😍</span>
            <div className="float-card c1">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="fc-brand">Giftcred</span>
                <div className="fc-chip" />
              </div>
              <div className="fc-amount">₹5,000</div>
            </div>
            <div className="float-card c2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="fc-brand">Choice</span>
                <div className="fc-chip" />
              </div>
              <div className="fc-amount">🎁</div>
            </div>
            <div className="float-card c3">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="fc-brand">Reward</span>
                <div className="fc-chip" />
              </div>
              <div className="fc-amount">₹1,000</div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      {brandNames.length > 0 && (
        <div className="marquee">
          <div className="marquee-track">
            {[...brandNames, ...brandNames].map((b, i) => (
              <span key={i}>{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Featured */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Popular right now</span>
            <h2>Gift cards from brands they love</h2>
            <p>Hand-picked favourites across retail, food, entertainment and more.</p>
          </div>
          <div className="grid">
            {featured.length === 0
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : featured.map((p, i) => <FeaturedCard key={p?.sku ?? `featured-${i}`} product={p} />)}
          </div>
          <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
            <Link to="/catalog" className="btn btn-outline btn-lg">Explore full catalogue →</Link>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="section" id="why" style={{ background: "var(--surface)" }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Why Giftcred</span>
            <h2>Everything you need to gift better</h2>
            <p>The gift of choice, without the friction.</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: "🛍️", title: "Wide catalog", text: "Gift cards from hundreds of brands — retail, food, entertainment and more, always at great value." },
              { icon: "⚡", title: "Instant delivery", text: "Credits turn into gift cards in moments. No waiting, no hassle — choice when it matters." },
              { icon: "🎯", title: "Easy redemption", text: "A simple flow from credit to card. Works for individuals and scales for businesses." },
              { icon: "🤝", title: "Flexible for all", text: "Use as rewards, incentives or personal gifts. One platform for consumers and enterprises." }
            ].map((f) => (
              <div className="feature-card reveal" key={f.title}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three steps from credit to card</h2>
            <p>Simple for you, delightful for them.</p>
          </div>
          <div className="steps">
            {[
              { emoji: "💳", title: "Get credits", text: "Purchase or receive gift credits. One credit, many choices — no need to pick a brand upfront." },
              { emoji: "😍", title: "Choose a brand", text: "Browse the catalogue and pick from top brands. Swap credits for the gift card that fits." },
              { emoji: "⚡", title: "Deliver instantly", text: "The gift card is delivered in moments. Recipients get real value they can use right away." }
            ].map((s, i) => (
              <div className="step reveal" key={s.title}>
                <div className="step-num">{i + 1}</div>
                <div className="step-emoji">{s.emoji}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="section" style={{ background: "var(--surface)" }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">One platform</span>
            <h2>Endless ways to reward</h2>
            <p>Whether you run a rewards program or just want to give better gifts.</p>
          </div>
          <div className="usecase-grid">
            <div className="usecase u1 reveal">
              <span className="uc-emoji">🏆</span>
              <h3>Rewards & loyalty</h3>
              <p>Power your program with gift cards from top brands. Better engagement, happier users.</p>
            </div>
            <div className="usecase u2 reveal">
              <span className="uc-emoji">🏢</span>
              <h3>Corporate gifting</h3>
              <p>Send credits instead of fixed cards. Recipients pick what they love; you keep admin simple.</p>
            </div>
            <div className="usecase u3 reveal">
              <span className="uc-emoji">🎁</span>
              <h3>Personal gifts</h3>
              <p>Give the gift of choice. No more guessing — they choose the brand and use it when they want.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="section">
        <div className="container">
          <div className="stats reveal">
            <div className="stat">
              <div className="s-num">{products.length || "100"}+</div>
              <div className="s-label">Brands</div>
            </div>
            <div className="stat">
              <div className="s-num">Instant</div>
              <div className="s-label">Delivery</div>
            </div>
            <div className="stat">
              <div className="s-num">1</div>
              <div className="s-label">Credit, many choices</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div className="cta-band reveal">
            <h2>Ready to give the gift of choice?</h2>
            <p>Join teams and individuals who use Giftcred for rewards, gifting and loyalty.</p>
            <Link to="/catalog" className="btn btn-primary btn-lg">Browse gift cards</Link>
          </div>
        </div>
      </section>
    </>
  );
}

// --- Skeleton card ---
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton sk-img" />
      <div className="sk-body">
        <div className="skeleton sk-line" style={{ width: "40%" }} />
        <div className="skeleton sk-line" style={{ width: "70%", height: "16px" }} />
        <div className="skeleton sk-line" style={{ width: "30%", marginTop: "0.8rem" }} />
      </div>
    </div>
  );
}

// --- Catalogue ---
function Catalogue() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    getCatalog()
      .then((res) => setProducts(asArray<Product>(res)))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p?.category && set.add(p.category));
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = category === "All" || p?.category === category;
      const matchesQuery =
        !query ||
        (p?.brandName ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (p?.category ?? "").toLowerCase().includes(query.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [products, query, category]);

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">Browse gift cards</h1>
        <p className="page-sub">Pick a brand, choose an amount, and send instantly.</p>

        <div className="catalog-toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search brands or categories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {categories.length > 1 && (
          <div className="chips">
            {categories.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid">
            {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🔍</div>
            <h3>No gift cards found</h3>
            <p>Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((p, i) => <FeaturedCard key={p?.sku ?? `product-${i}`} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Product Detail ---
function ProductDetail() {
  const { sku } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"desc" | "redeem" | "terms">("desc");
  const [showToast, setShowToast] = useState<boolean>(false);

  useEffect(() => {
    if (sku) {
      getProduct(sku)
        .then((res) => setProduct(res ? (res as Product) : null))
        .catch((err) => console.error(err));
    }
  }, [sku]);

  if (!product) {
    return (
      <div className="page">
        <div className="container">
          <div className="detail-layout">
            <div className="skeleton" style={{ height: "320px", borderRadius: "var(--radius-lg)" }} />
            <div>
              <div className="skeleton sk-line" style={{ width: "60%", height: "32px", marginBottom: "1rem" }} />
              <div className="skeleton sk-line" style={{ width: "40%", marginBottom: "2rem" }} />
              <div className="skeleton" style={{ height: "200px", borderRadius: "var(--radius)" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const priceObj = product.price || { type: "RANGE", min: 10, max: 10000, denominations: [] as number[] };
  const denominations = asArray<number>(priceObj.denominations);
  const isFixed = priceObj.type === "FIXED" || priceObj.type === "SLAB";

  const handleAddToCart = (redirect: boolean) => {
    const amt = parseInt(amount, 10);
    if (!amt || isNaN(amt) || amt <= 0) {
      alert("Please select a valid amount.");
      return;
    }
    if (priceObj.type === "RANGE" && (amt < priceObj.min || amt > priceObj.max)) {
      alert(`Amount must be between ₹${priceObj.min} and ₹${priceObj.max}`);
      return;
    }

    addToCart({
      sku: product.sku,
      brandName: product.brandName,
      amount: amt,
      quantity,
      image: product.image,
      discount: product.discount
    });

    if (redirect) {
      navigate("/cart");
    } else {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    }
  };

  const payAmount = amount ? parseInt(amount, 10) * quantity : 0;
  const discountedAmount = payAmount - (payAmount * parseFloat(product.discount) / 100);

  const denoms = isFixed
    ? denominations
    : [100, 200, 500, 1000].filter(
        (d) =>
          d >= priceObj.min &&
          d <= priceObj.max &&
          (denominations.length === 0 || denominations.includes(d))
      );

  return (
    <div className="page">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/catalog">Browse</Link> &nbsp;›&nbsp; {product.brandName}
        </div>

        <div className="detail-layout">
          <div className="detail-card">
            <div className="gift-card-visual">
              <img
                src={product.bannerImage || product.image}
                alt={product.brandName}
                onError={(e) => { e.currentTarget.src = fallbackImg(product.brandName, 600, 340); }}
              />
              <div className="gift-card-overlay">
                {product.validity && <span className="badge-soft">{product.validity}</span>}
                {product.discount && parseFloat(product.discount) > 0 && (
                  <span className="badge-soft brand">upto {product.discount}% off</span>
                )}
              </div>
            </div>
            <div className="tabs">
              <button className={`tab ${activeTab === "desc" ? "active" : ""}`} onClick={() => setActiveTab("desc")}>About</button>
              <button className={`tab ${activeTab === "redeem" ? "active" : ""}`} onClick={() => setActiveTab("redeem")}>How to redeem</button>
              <button className={`tab ${activeTab === "terms" ? "active" : ""}`} onClick={() => setActiveTab("terms")}>Terms</button>
            </div>
            <div className="tab-content">
              {activeTab === "desc" && (
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: product.description || "<p>No description available.</p>" }} />
              )}
              {activeTab === "redeem" && (
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: product.howToRedeem || "<p>Redemption details will be shared with your voucher.</p>" }} />
              )}
              {activeTab === "terms" && (
                <>
                  <div className="rich-content" dangerouslySetInnerHTML={{ __html: product.terms || "<p>Standard terms &amp; conditions apply.</p>" }} />
                  {product.termsLink && (
                    <a className="terms-link" href={product.termsLink} target="_blank" rel="noreferrer">
                      View full terms ↗
                    </a>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="detail-card">
            <p className="category-subtitle">{product.category || "Gift Card"}</p>
            <h1 className="brand-title">{product.brandName}</h1>
            {product.discount && parseFloat(product.discount) > 0 && (
              <span className="discount-pill">🎉 {product.discount}% off</span>
            )}

            <div className="input-group">
              <label>Select amount</label>
              {denoms.length > 0 && (
                <div className="denoms">
                  {denoms.map((d: number) => (
                    <button
                      key={d}
                      className={`denom ${amount === d.toString() ? "active" : ""}`}
                      onClick={() => setAmount(d.toString())}
                    >
                      ₹{d}
                    </button>
                  ))}
                </div>
              )}
              {!isFixed && (
                <div className="amount-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Min ₹${priceObj.min} — Max ₹${priceObj.max}`}
                    min={priceObj.min}
                    max={priceObj.max}
                  />
                </div>
              )}
            </div>

            <div className="input-group">
              <label>Quantity</label>
              <div className="quantity-selector">
                <button className="qty-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
                <span className="qty-display">{quantity}</span>
                <button className="qty-btn" onClick={() => setQuantity((q) => Math.min(MAX_LINE_QTY, q + 1))} disabled={quantity >= MAX_LINE_QTY}>+</button>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
                Up to {MAX_LINE_QTY} per item. Orders with more than 4 cards are processed asynchronously.
              </p>
            </div>

            <div className="payment-summary">
              <p className="you-pay-label">Subtotal</p>
              <div className="price-display">
                <span className="discounted-price">₹{discountedAmount > 0 ? discountedAmount.toFixed(2) : "0.00"}</span>
                {amount && parseFloat(product.discount) > 0 && (
                  <span className="original-price">₹{payAmount.toFixed(2)}</span>
                )}
              </div>
            </div>

            <div className="button-group">
              <button className="btn btn-outline" onClick={() => handleAddToCart(false)} disabled={!amount}>
                Add to cart
              </button>
              <button className="btn btn-primary" onClick={() => handleAddToCart(true)} disabled={!amount}>
                Buy now
              </button>
            </div>
          </div>
        </div>
      </div>

      {showToast && <div className="toast">✓ Added to cart</div>}
    </div>
  );
}

// --- Cart ---
function Cart() {
  const { cart, removeFromCart, updateQuantity, clearCart } = useCart();
  const { user } = useAuth();

  const [mobile, setMobile] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [orderResult, setOrderResult] = useState<any>(null);
  const [fetchingCodes, setFetchingCodes] = useState(false);
  const [fetchCodesError, setFetchCodesError] = useState("");

  const email = user?.email ?? "";

  const totalPayable = cart.reduce((acc, item) => {
    const payAmt = item.amount * item.quantity;
    const discAmt = payAmt - (payAmt * parseFloat(item.discount) / 100);
    return acc + discAmt;
  }, 0);

  const handleCheckout = async () => {
    setError("");
    if (!mobile || mobile.length < 10) return setError("Please enter a valid 10-digit mobile number.");
    if (!email) return setError("Please sign in to place an order.");

    setLoading(true);
    const purchasedItems = cart.map((i) => ({
      sku: i.sku,
      amount: i.amount,
      quantity: i.quantity,
      brandName: i.brandName,
    }));
    try {
      const data = await placePurchaseOrder({
        items: purchasedItems,
        mobileNumber: mobile,
        email: email
      });
      if (data.success) {
        setOrderResult({
          ...data,
          items: asArray(purchasedItems),
          cards: asArray(data.cards),
        });
        clearCart();
      } else {
        setError("Checkout failed. Please try again.");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error placing order.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => copyToClipboard(text);

  const handleFetchCodesOnSuccess = useCallback(async () => {
    if (!orderResult?.orderId) return;
    setFetchingCodes(true);
    setFetchCodesError("");
    try {
      const updated = await refreshOrder(orderResult.orderId);
      setOrderResult((prev: any) => ({
        ...prev,
        cards: asArray(updated.cards),
        status: updated.status,
      }));
    } catch (err: any) {
      setFetchCodesError(err.response?.data?.detail || "Could not fetch codes yet. Try again shortly.");
    } finally {
      setFetchingCodes(false);
    }
  }, [orderResult?.orderId]);

  const successCards = asArray(orderResult?.cards);
  const successItems = asArray(orderResult?.items);
  const successPending = orderResult && isOrderPending({ ...orderResult, cards: successCards });
  const successPoll = useProcessingPoll(!!successPending, handleFetchCodesOnSuccess, !!orderResult?.orderId);

  if (orderResult) {
    return (
      <div className="page">
        <div className="container order-success-wrap">
          <div className="success-hero">
            <div className="check">✓</div>
            <h2>{successCards.length ? "Your gift cards are ready!" : "Order placed!"}</h2>
            <p>
              {orderResult.message ||
                (successCards.length
                  ? `Vouchers for ${email || "your inbox"} are ready below — copy them anytime.`
                  : `Bulk order received — we'll check for your gift cards every 30 seconds.`)}
            </p>
            <div className="success-ref-pill">Order ref · {orderResult.refno}</div>
          </div>
          <div className="detail-card order-success-card">
            <OrderPurchasedItems items={successItems} />
            {successCards.length > 0 && (
              <VoucherGrid cards={successCards} items={successItems} onCopy={handleCopy} />
            )}
            {successPending && (
              <ProcessingStatusBlock
                secondsLeft={successPoll.secondsLeft}
                lastChecked={successPoll.lastChecked}
                polling={fetchingCodes || successPoll.polling}
                error={fetchCodesError}
                onFetchNow={handleFetchCodesOnSuccess}
                fetchLabel={successCards.length ? "Refresh codes now" : "Fetch codes now"}
              />
            )}
          </div>
          <div className="order-success-actions">
            <Link to="/catalog" className="btn btn-ghost">Keep shopping</Link>
            <Link to="/orders" className="btn btn-primary">View all orders</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">Your cart</h1>
        <p className="page-sub">Review your gift cards and add delivery details.</p>

        {cart.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🛒</div>
            <h3>Your cart is empty</h3>
            <p>Browse the catalogue to find the perfect gift.</p>
            <Link to="/catalog" className="btn btn-primary" style={{ marginTop: "1.2rem" }}>Browse gift cards</Link>
          </div>
        ) : (
          <div className="cart-grid">
            <div>
              {cart.map((item, idx) => (
                <div key={idx} className="cart-item">
                  <img
                    src={item.image}
                    alt={item.brandName}
                    onError={(e) => { e.currentTarget.src = fallbackImg(item.brandName); }}
                  />
                  <div className="cart-item-info">
                    <h4>{item.brandName}</h4>
                    <p className="cart-item-price">₹{item.amount} each</p>
                    <div className="cart-actions">
                      <div className="quantity-selector">
                        <button onClick={() => updateQuantity(item.sku, item.amount, item.quantity - 1)} disabled={item.quantity <= 1} className="qty-btn">−</button>
                        <span className="qty-display">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.sku, item.amount, item.quantity + 1)} disabled={item.quantity >= MAX_LINE_QTY} className="qty-btn">+</button>
                      </div>
                      <button className="btn-remove" onClick={() => removeFromCart(item.sku, item.amount)}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="summary-panel">
              <h3>{user ? "Delivery details" : "Checkout"}</h3>

              {!user ? (
                <div className="cart-guest-banner">
                  <p className="muted">Your cart is saved on this device. Sign in when you&apos;re ready to checkout — nothing will be lost.</p>
                  <Link to="/login?from=/cart" className="btn btn-primary btn-block btn-lg">Sign in to checkout</Link>
                  <Link to="/login?from=/cart" className="btn btn-ghost btn-block">Create account</Link>
                </div>
              ) : (
                <>
              <div className="input-group">
                <label>Mobile number</label>
                <div className="country-code-wrap">
                  <span className="cc">+91</span>
                  <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ""))} maxLength={10} placeholder="10-digit number" />
                </div>
              </div>
              <div className="input-group">
                <label>Account email</label>
                <input type="email" value={email} readOnly disabled className="input-readonly" />
              </div>
                </>
              )}

              <div className="summary-total">
                <span className="label">Total to pay</span>
                <span className="amount">₹{totalPayable.toFixed(2)}</span>
              </div>

              {error && <p className="error-text">{error}</p>}
              {user && (
              <button className="btn btn-primary btn-block btn-lg" onClick={handleCheckout} disabled={loading || cart.length === 0}>
                {loading ? "Processing..." : "Place order"}
              </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Order History ---
function OrderSkeleton() {
  return (
    <div className="order-card">
      <div className="order-head">
        <div style={{ flex: 1 }}>
          <div className="skeleton sk-line" style={{ width: "180px", height: "18px" }} />
          <div className="skeleton sk-line" style={{ width: "140px" }} />
        </div>
        <div className="skeleton sk-line" style={{ width: "90px", height: "26px" }} />
      </div>
      <div className="skeleton" style={{ height: "70px", borderRadius: "var(--radius-sm)" }} />
    </div>
  );
}

function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});

  const handleFetchCodes = useCallback(async (orderId: string) => {
    setRefreshingId(orderId);
    setRefreshErrors((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    try {
      const updated = await refreshOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.orderId === orderId ? updated : o)));
    } catch (err: any) {
      setRefreshErrors((prev) => ({
        ...prev,
        [orderId]: err.response?.data?.detail || "Could not fetch codes yet. Try again shortly.",
      }));
    } finally {
      setRefreshingId(null);
    }
  }, []);

  const pollPendingOrders = useCallback(async () => {
    const pending = orders.filter(isOrderPending);
    for (const order of pending) {
      try {
        const updated = await refreshOrder(order.orderId);
        setOrders((prev) => prev.map((o) => (o.orderId === order.orderId ? updated : o)));
      } catch {
        // keep polling on next interval
      }
    }
  }, [orders]);

  const hasPending = orders.some(isOrderPending);
  const poll = useProcessingPoll(hasPending, pollPendingOrders, !loading && orders.length > 0);

  useEffect(() => {
    let cancelled = false;

    const loadOrders = async () => {
      try {
        const res = await getOrderHistory();
        if (cancelled) return;
        setOrders(res);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOrders();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">Your orders</h1>
        <p className="page-sub">Track delivery and view your gift card details.</p>

        {!loading && orders.length > 0 && <OrdersSummaryBar orders={orders} />}

        {loading ? (
          <div className="orders-list">
            {Array.from({ length: 3 }).map((_, i) => <OrderSkeleton key={i} />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📦</div>
            <h3>No orders yet</h3>
            <p>Your purchased gift cards will appear here.</p>
            <Link to="/catalog" className="btn btn-primary" style={{ marginTop: "1.2rem" }}>Browse gift cards</Link>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <OrderDetailBlock
                key={order.orderId}
                order={order}
                onCopy={copyToClipboard}
                onFetchCodes={() => handleFetchCodes(order.orderId)}
                refreshing={refreshingId === order.orderId}
                fetchError={refreshErrors[order.orderId]}
                pollSeconds={poll.secondsLeft}
                pollLastChecked={poll.lastChecked}
                pollActive={hasPending && isOrderPending(order)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- App ---
function App() {
  const [cart, setCart] = useState<CartItem[]>(() => loadStoredCart());

  useEffect(() => {
    saveStoredCart(cart);
  }, [cart]);

  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === item.sku && i.amount === item.amount);
      if (existing) {
        return prev.map((i) =>
          i.sku === item.sku && i.amount === item.amount
            ? { ...i, quantity: Math.min(MAX_LINE_QTY, i.quantity + item.quantity) }
            : i
        );
      }
      return [...prev, { ...item, quantity: Math.min(MAX_LINE_QTY, item.quantity) }];
    });
  };

  const removeFromCart = (sku: string, amount: number) => {
    setCart((prev) => prev.filter((i) => !(i.sku === sku && i.amount === amount)));
  };

  const updateQuantity = (sku: string, amount: number, quantity: number) => {
    const qty = Math.min(MAX_LINE_QTY, Math.max(1, quantity));
    setCart((prev) => prev.map((i) => (i.sku === sku && i.amount === amount ? { ...i, quantity: qty } : i)));
  };

  const clearCart = () => {
    setCart([]);
    clearStoredCart();
  };

  return (
    <ThemeProvider>
      <AuthProvider>
      <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart }}>
        <Router>
          <div className="app">
            <Navbar />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/catalog" element={<Catalogue />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
              <Route path="/product/:sku" element={<ProductDetail />} />
            </Routes>
            <Footer />
          </div>
        </Router>
      </CartContext.Provider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
