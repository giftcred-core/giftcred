import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { WoohooClient } from "../woohoo/client.js";
import { saveOrder } from "./order.js";

/** Woohoo syncOnly=true: instant cards, max 4 gift cards per request. */
export const SYNC_ONLY_MAX_QTY_PER_REQUEST = 4;

export interface PurchaseLine {
  sku: string;
  amount: number;
  quantity: number;
  brandName?: string;
}

export interface PurchaseDetails {
  mobileNumber: string;
  email: string;
}

export interface PlacedCard {
  cardNumber: string;
  cardPin: string;
  activationCode: string;
  activationUrl: string;
  amount: unknown;
  validity: unknown;
}

export interface PlacePurchaseResult {
  success: true;
  orderId: string;
  refno: string;
  cards: PlacedCard[];
  async: boolean;
  message?: string;
}

export class PurchaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseValidationError";
  }
}

export function totalItemQuantity(items: PurchaseLine[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function formatMobile(mobileNumber: string): string {
  if (mobileNumber.length === 10 && /^\d+$/.test(mobileNumber)) {
    return `+91${mobileNumber}`;
  }
  return mobileNumber;
}

export function buildWoohooOrderPayload(
  items: PurchaseLine[],
  details: PurchaseDetails,
  refno: string,
  syncOnly: boolean
): Record<string, unknown> {
  const formattedMobile = formatMobile(details.mobileNumber);
  const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);

  return {
    address: {
      firstname: "Giftcred",
      lastname: "User",
      email: details.email,
      telephone: formattedMobile,
      country: "IN",
      postcode: "560102",
    },
    billing: {
      firstname: "Giftcred",
      lastname: "User",
      email: details.email,
      telephone: formattedMobile,
      country: "IN",
      postcode: "560102",
    },
    payments: [{ code: "svc", amount: totalAmount }],
    refno,
    products: items.map((item) => ({
      sku: item.sku,
      price: item.amount,
      qty: item.quantity,
      currency: 356,
    })),
    deliveryMode: "API",
    syncOnly,
  };
}

function mapCards(raw: Record<string, unknown>[]): PlacedCard[] {
  return raw.map((card) => ({
    cardNumber: String(card.cardNumber ?? "N/A"),
    cardPin: String(card.cardPin ?? "N/A"),
    activationCode: String(card.activationCode ?? "N/A"),
    activationUrl: String(card.activationUrl ?? ""),
    amount: card.amount,
    validity: card.validity,
  }));
}

export function parseWoohooOrderError(body: string): string {
  try {
    const data = JSON.parse(body) as { message?: string; code?: number };
    if (data.message) {
      return data.code ? `${data.message} (code ${data.code})` : data.message;
    }
  } catch {
    // not JSON
  }
  return body;
}

/** One Woohoo order: sync (≤4 cards) or async (>4 cards). Always saved to Postgres. */
export async function placePurchaseOrders(
  client: PoolClient,
  woohoo: WoohooClient,
  items: PurchaseLine[],
  details: PurchaseDetails
): Promise<PlacePurchaseResult> {
  if (!items.length) {
    throw new PurchaseValidationError("Cart is empty.");
  }
  for (const item of items) {
    if (item.quantity < 1) {
      throw new PurchaseValidationError("Each item must have quantity of at least 1.");
    }
  }

  const refno = `ORDER-${randomBytes(6).toString("hex").toUpperCase()}`;
  const totalQty = totalItemQuantity(items);
  const syncOnly = totalQty <= SYNC_ONLY_MAX_QTY_PER_REQUEST;
  const orderPayload = buildWoohooOrderPayload(items, details, refno, syncOnly);

  const response = await woohoo.apiRequest("POST", "/rest/v3/orders", {
    jsonBody: orderPayload,
  });

  if (![200, 201, 202].includes(response.statusCode)) {
    throw new PurchaseValidationError(
      parseWoohooOrderError(response.body) || `Order failed with HTTP ${response.statusCode}`
    );
  }

  const data = JSON.parse(response.body) as {
    orderId?: string;
    refno?: string;
    cards?: Record<string, unknown>[];
    status?: string;
  };

  const cards = syncOnly ? mapCards(data.cards || []) : [];
  const orderId = data.orderId;
  const responseRefno = data.refno ?? refno;
  const status =
    cards.length > 0 ? "COMPLETED" : response.statusCode === 202 ? "PROCESSING" : "PROCESSING";

  if (orderId && responseRefno) {
    await saveOrder(client, {
      orderId,
      refno: responseRefno,
      items: items.map((item) => ({
        sku: item.sku,
        amount: item.amount,
        quantity: item.quantity,
        ...(item.brandName ? { brandName: item.brandName } : {}),
      })),
      mobileNumber: details.mobileNumber,
      email: details.email,
      status,
      cards: cards.length ? cards : null,
    });
  }

  return {
    success: true,
    orderId: orderId ?? "",
    refno: responseRefno,
    cards,
    async: !syncOnly,
    message: syncOnly
      ? undefined
      : "Order placed successfully. Gift cards will appear in My Orders once processing completes.",
  };
}
