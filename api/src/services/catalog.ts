import sanitizeHtml from "sanitize-html";
import type { PoolClient } from "pg";
import { loadCatalogFromDb, saveCatalogToDb, upsertCatalogProductInDb } from "./catalog-cache.js";
import { WoohooAPIError, WoohooClient } from "../woohoo/client.js";

const PLACEHOLDER_IMAGE = "https://via.placeholder.com/150";

export const PINNED_SKUS = [
  "CNPIN",
  "VOUCHERCODE",
  "CLAIMCODE",
  "UBEFLOW",
  "GOOGLEPLAYGCB2B",
  "DISABLEDSTS",
  "PROCESSINGSTS",
  "testsuccess001",
  "APITESTTIMFAIL",
];

const PINNED_ORDER = new Map(PINNED_SKUS.map((sku, i) => [sku, i]));

const cache: {
  products: CatalogProduct[];
  bySku: Map<string, CatalogProduct>;
  detailSkus: Set<string>;
  categoryName: string;
  loadedAt: string | null;
} = {
  products: [],
  bySku: new Map(),
  detailSkus: new Set(),
  categoryName: "Gift Card",
  loadedAt: null,
};

export interface CatalogProduct {
  sku: string;
  name: string;
  brandName: string;
  category: string;
  pinned: boolean;
  image: string;
  bannerImage: string;
  discount: string;
  minAmount: number;
  maxAmount: number;
  description: string;
  validity: string;
  howToRedeem: string;
  terms: string;
  termsLink: string;
  importantPoints: string[];
  price?: {
    type: string;
    min: number;
    max: number;
    denominations: number[];
  };
}

function sanitizeRichHtml(value: unknown): string {
  const text = (value == null ? "" : String(value)).trim();
  if (!text) return "";
  if (!text.includes("<")) {
    return text
      .split(/\r?\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${sanitizeHtml(p)}</p>`)
      .join("");
  }
  return sanitizeHtml(text, {
    allowedTags: ["p", "br", "ul", "ol", "li", "b", "strong", "i", "em", "u", "a", "span", "h3", "h4"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    transformTags: { div: "p" },
  }).replace(/<p>\s*<\/p>/g, "");
}

function intPrice(value: unknown, fallback = 0): number {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseDenominations(price: Record<string, unknown> | undefined): number[] {
  const raw = price?.denominations;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item).trim())
    .filter((s) => /^\d+$/.test(s))
    .map((s) => parseInt(s, 10));
}

function productImage(raw: Record<string, unknown>): string {
  const images = raw.images as Record<string, string> | undefined;
  if (images) {
    for (const key of ["base", "mobile", "small", "thumbnail", "image"]) {
      if (images[key]) return String(images[key]);
    }
  }
  return raw.brandLogo ? String(raw.brandLogo) : PLACEHOLDER_IMAGE;
}

function importantPoints(raw: Record<string, unknown>): string[] {
  const points: string[] = [];
  const cpg = (raw.cpg as Record<string, unknown>) || {};
  for (const item of (cpg.redemptionTerms as unknown[]) || []) {
    if (item) points.push(String(item));
  }
  if (raw.importantInstructions) points.push(String(raw.importantInstructions));
  return points;
}

function defaultRedeemHtml(): string {
  return (
    "<ol>" +
    "<li>Visit the brand's website, app or nearest store.</li>" +
    "<li>Add your items and proceed to checkout / payment.</li>" +
    "<li>Choose <strong>Gift Card</strong> (or eGift / voucher) as the payment option.</li>" +
    "<li>Enter the card number and PIN shown in your order.</li>" +
    "<li>The gift card value is applied instantly to your purchase.</li>" +
    "</ol>"
  );
}

function defaultTermsHtml(validity: string): string {
  const validityLine = validity ? `<li>Valid for ${sanitizeHtml(validity)}.</li>` : "";
  return (
    "<ul>" +
    validityLine +
    "<li>This gift card cannot be exchanged for cash or refunded.</li>" +
    "<li>Use the full balance before the expiry date.</li>" +
    "<li>Standard brand terms &amp; conditions apply.</li>" +
    "</ul>"
  );
}

function termsHtml(raw: Record<string, unknown>, validity: string): string {
  const sections: string[] = [];
  const tnc = (raw.tnc as Record<string, unknown>) || {};
  const content = sanitizeRichHtml(tnc.content);
  if (content && !content.toLowerCase().includes("brand tnc")) sections.push(content);

  const cpg = (raw.cpg as Record<string, unknown>) || {};
  const termsList = ((cpg.redemptionTerms as unknown[]) || [])
    .map((t) => String(t).trim())
    .filter(Boolean);
  if (termsList.length) {
    sections.push("<ul>" + termsList.map((t) => `<li>${sanitizeHtml(t)}</li>`).join("") + "</ul>");
  }
  return sections.length ? sections.join("") : defaultTermsHtml(validity);
}

function termsLink(raw: Record<string, unknown>): string {
  const tnc = (raw.tnc as Record<string, unknown>) || {};
  const link = String(tnc.link || "").trim();
  return link.startsWith("http") ? link : "";
}

function howToRedeemHtml(raw: Record<string, unknown>): string {
  const cpg = (raw.cpg as Record<string, unknown>) || {};
  const how = sanitizeRichHtml(cpg.howToUse || raw.importantInstructions);
  return how || defaultRedeemHtml();
}

function toListItem(raw: Record<string, unknown>, categoryName: string): CatalogProduct {
  const sku = String(raw.sku || "");
  const name = String(raw.name || sku);
  const minAmount = intPrice(raw.minPrice, 10);
  const maxAmount = intPrice(raw.maxPrice, 10000);
  const image = productImage(raw);
  const validity = String(raw.expiry || raw.formatExpiry || "1 Year");
  return {
    sku,
    name,
    brandName: name,
    category: categoryName,
    pinned: PINNED_ORDER.has(sku),
    image,
    bannerImage: image,
    discount: "0",
    minAmount,
    maxAmount,
    description: sanitizeRichHtml(raw.shortDescription || raw.description || name),
    validity,
    howToRedeem: howToRedeemHtml(raw),
    terms: termsHtml(raw, validity),
    termsLink: termsLink(raw),
    importantPoints: importantPoints(raw),
  };
}

function toDetailItem(raw: Record<string, unknown>, categoryName: string): CatalogProduct {
  const item = toListItem(raw, categoryName);
  const price = (raw.price as Record<string, unknown>) || {};
  let priceType = String(price.type || price.price || "RANGE").toUpperCase();
  const denominations = parseDenominations(price);
  const minAmount = intPrice(price.min ?? raw.minPrice, item.minAmount);
  const maxAmount = intPrice(price.max ?? raw.maxPrice, item.maxAmount);
  if (denominations.length && (priceType === "FIXED" || priceType === "SLAB")) priceType = "FIXED";
  item.price = { type: priceType, min: minAmount, max: maxAmount, denominations };
  item.description = sanitizeRichHtml(raw.description || raw.shortDescription || item.name);
  item.howToRedeem = howToRedeemHtml(raw);
  item.terms = termsHtml(raw, item.validity);
  item.termsLink = termsLink(raw);
  return item;
}

function sortKey(product: CatalogProduct): [number, number, string] {
  const order = PINNED_ORDER.get(product.sku);
  if (order !== undefined) return [0, order, ""];
  return [1, 0, product.brandName.toLowerCase()];
}

function sortedProducts(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
}

function isWoohooSku(sku: string): boolean {
  const s = sku.trim();
  if (!s) return false;
  if (s.includes(":") || s.toLowerCase().startsWith("valuedesign")) return false;
  return /^[\x00-\x7F]+$/.test(s) && /^[A-Za-z0-9_-]+$/.test(s);
}

async function loadCatalog(client: PoolClient, woohoo: WoohooClient): Promise<void> {
  await woohoo.authenticate(client);

  const categoriesResp = await woohoo.apiRequest("GET", "/rest/v3/catalog/categories");
  if (categoriesResp.statusCode >= 400) {
    throw new WoohooAPIError(`Categories fetch failed: HTTP ${categoriesResp.statusCode}`);
  }

  const categoriesData = JSON.parse(categoriesResp.body) as Record<string, unknown>;
  const categoryId = String(categoriesData.id || "");
  const categoryName = String(categoriesData.name || "Gift Card");
  if (!categoryId) throw new WoohooAPIError("No category id in Woohoo catalog response");

  const productsBySku = new Map<string, CatalogProduct>();
  let offset = 0;
  const limit = 50;

  while (true) {
    const pageResp = await woohoo.getCategoryProducts(categoryId, offset, limit);
    if (pageResp.statusCode >= 400) {
      throw new WoohooAPIError(`Category products failed: HTTP ${pageResp.statusCode}`);
    }
    const page = JSON.parse(pageResp.body) as { products?: Record<string, unknown>[] };
    const batch = page.products || [];
    if (!batch.length) break;

    for (const raw of batch) {
      const sku = String(raw.sku || "").trim();
      if (!isWoohooSku(sku)) continue;
      productsBySku.set(sku, toListItem(raw, categoryName));
    }
    if (batch.length < limit) break;
    offset += limit;
  }

  const detailSkus = new Set<string>();
  for (const sku of PINNED_SKUS) {
    try {
      const resp = await woohoo.getProduct(sku);
      if (resp.statusCode !== 200) continue;
      const raw = JSON.parse(resp.body) as Record<string, unknown>;
      if (raw && typeof raw === "object") {
        productsBySku.set(sku, toDetailItem(raw, categoryName));
        detailSkus.add(sku);
      }
    } catch {
      // pinned SKU optional
    }
  }

  cache.products = sortedProducts([...productsBySku.values()]);
  cache.bySku = productsBySku;
  cache.detailSkus = detailSkus;
  cache.categoryName = categoryName;
  cache.loadedAt = new Date().toISOString();

  await saveCatalogToDb(client, {
    products: cache.products,
    detailSkus: cache.detailSkus,
    categoryName: cache.categoryName,
  });
}

function applyCacheFromDb(data: {
  products: CatalogProduct[];
  detailSkus: Set<string>;
  categoryName: string;
  loadedAt: string;
}): void {
  cache.products = sortedProducts([...data.products]);
  cache.bySku = new Map(cache.products.map((p) => [p.sku, p]));
  cache.detailSkus = data.detailSkus;
  cache.categoryName = data.categoryName;
  cache.loadedAt = data.loadedAt;
}

async function ensureCatalogLoaded(client: PoolClient): Promise<void> {
  if (cache.bySku.size > 0) return;

  const fromDb = await loadCatalogFromDb(client);
  if (fromDb) {
    applyCacheFromDb(fromDb);
    return;
  }

  const woohoo = new WoohooClient();
  await loadCatalog(client, woohoo);
}

export async function getCatalogProducts(client: PoolClient): Promise<CatalogProduct[]> {
  await ensureCatalogLoaded(client);
  return sortedProducts([...cache.products]);
}

export async function getCatalogProduct(
  client: PoolClient,
  sku: string
): Promise<CatalogProduct | null> {
  await ensureCatalogLoaded(client);
  let product = cache.bySku.get(sku);
  const hasDetail = cache.detailSkus.has(sku);
  if (product && hasDetail) return product;
  if (!isWoohooSku(sku)) return product ?? null;

  const woohoo = new WoohooClient();
  await woohoo.authenticate(client);
  const resp = await woohoo.getProduct(sku);
  if (resp.statusCode !== 200) return product ?? null;

  const raw = JSON.parse(resp.body) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return product ?? null;

  const detail = toDetailItem(raw, cache.categoryName || "Gift Card");
  cache.bySku.set(sku, detail);
  cache.detailSkus.add(sku);
  const idx = cache.products.findIndex((p) => p.sku === sku);
  if (idx >= 0) cache.products[idx] = detail;
  else cache.products.push(detail);
  cache.products = sortedProducts(cache.products);
  await upsertCatalogProductInDb(client, detail, true);
  return detail;
}

export async function validatePurchaseSkus(client: PoolClient, skus: string[]): Promise<void> {
  await ensureCatalogLoaded(client);
  const known = new Set(cache.bySku.keys());
  for (const sku of skus) {
    if (!isWoohooSku(sku)) throw new Error(`SKU '${sku}' is not a Woohoo catalog product`);
    if (!known.has(sku)) throw new Error(`SKU '${sku}' is not in the Woohoo catalog`);
  }
}
