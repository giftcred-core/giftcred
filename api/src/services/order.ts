import type { PoolClient } from "pg";
import { WoohooClient } from "../woohoo/client.js";

export interface OrderRow {
  order_id: string;
  refno: string;
  items: unknown;
  mobile_number: string;
  email: string | null;
  created_at: Date;
  status: string | null;
  cards: unknown;
}

export function orderToDict(order: OrderRow) {
  return {
    orderId: order.order_id,
    refno: order.refno,
    items: (order.items as unknown[]) || [],
    mobileNumber: order.mobile_number,
    email: order.email,
    createdAt: order.created_at.toISOString(),
    status: order.status || "PROCESSING",
    cards: (order.cards as unknown[]) || [],
  };
}

function statusFromResponse(statusCode: number): string {
  if (statusCode === 409) return "PROCESSING";
  if (statusCode === 200) return "COMPLETED";
  return "FAILED";
}

export async function refreshOrderCards(
  client: PoolClient,
  woohoo: WoohooClient,
  order: OrderRow
): Promise<OrderRow> {
  const response = await woohoo.apiRequest("GET", `/rest/v3/order/${order.order_id}/cards/`, {
    params: { offset: 0, limit: 100 },
  });

  let cardsData: unknown[] = [];
  if (response.statusCode === 200) {
    const apiData = JSON.parse(response.body) as { cards?: unknown[] };
    cardsData = apiData.cards || [];
  }

  const status = statusFromResponse(response.statusCode);
  await client.query(
    `UPDATE orders SET status = $1, cards = $2::jsonb, updated_at = NOW() WHERE order_id = $3`,
    [status, JSON.stringify(cardsData), order.order_id]
  );

  order.status = status;
  order.cards = cardsData;
  return order;
}

export async function getOrders(client: PoolClient): Promise<OrderRow[]> {
  const result = await client.query<OrderRow>(
    `SELECT order_id, refno, items, mobile_number, email, created_at, status, cards
     FROM orders ORDER BY id DESC`
  );
  return result.rows;
}

export async function getOrderById(client: PoolClient, orderId: string): Promise<OrderRow | null> {
  const result = await client.query<OrderRow>(
    `SELECT order_id, refno, items, mobile_number, email, created_at, status, cards
     FROM orders WHERE order_id = $1`,
    [orderId]
  );
  return result.rows[0] ?? null;
}

export async function saveOrder(
  client: PoolClient,
  data: {
    orderId: string;
    refno: string;
    items: unknown[];
    mobileNumber: string;
    email: string;
    status: string;
    cards: unknown[] | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO orders (order_id, refno, items, mobile_number, email, status, cards)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb)`,
    [
      data.orderId,
      data.refno,
      JSON.stringify(data.items),
      data.mobileNumber,
      data.email,
      data.status,
      data.cards ? JSON.stringify(data.cards) : null,
    ]
  );
}
