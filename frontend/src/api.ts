import { apiClient } from './authApi';
import { asArray, asNumberArray } from './util/array';

export { asArray, asNumberArray } from './util/array';

export interface GiftCard {
    cardNumber: string;
    cardPin: string;
    amount: string;
    validity: string;
    activationCode?: string;
    activationUrl?: string;
    status?: string;
}

export interface OrderItem {
    sku: string;
    amount: number;
    quantity: number;
    brandName?: string;
}

export interface Order {
    orderId: string;
    refno: string;
    items: OrderItem[];
    mobileNumber: string;
    email: string;
    createdAt: string;
    status: string;
    cards: GiftCard[];
}

function normalizeOrder(raw: Record<string, unknown>): Order {
  return {
    ...(raw as unknown as Order),
    items: asArray<OrderItem>(raw.items),
    cards: asArray<GiftCard>(raw.cards),
  };
}

function normalizeProduct(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const price = p.price as Record<string, unknown> | undefined;
  return {
    ...p,
    importantPoints: asArray<string>(p.importantPoints),
    price: price
      ? {
          ...price,
          type: String(price.type ?? "RANGE"),
          min: Number(price.min ?? 10),
          max: Number(price.max ?? 10000),
          denominations: asNumberArray(price.denominations),
        }
      : undefined,
  };
}

export const getCatalog = async (): Promise<any[]> => {
  const response = await apiClient.get("/catalog");
  return asArray(response.data);
};

export const getProduct = async (sku: string): Promise<any | null> => {
  const response = await apiClient.get(`/catalog/${sku}`);
  return normalizeProduct(response.data);
};

export const placePurchaseOrder = async (orderData: {
  items: { sku: string; amount: number; quantity: number; brandName?: string }[];
  mobileNumber: string;
  email: string;
  message?: string;
}) => {
  const { email: _email, ...payload } = orderData;
  const response = await apiClient.post("/purchase", payload);
  const data = response.data as Record<string, unknown>;
  return {
    ...data,
    success: Boolean(data?.success ?? true),
    cards: asArray<GiftCard>(data?.cards),
  };
};

export const getOrderHistory = async (): Promise<Order[]> => {
  const response = await apiClient.get("/orders");
  return asArray<Record<string, unknown>>(response.data).map(normalizeOrder);
};

export const refreshOrder = async (orderId: string): Promise<Order> => {
  const response = await apiClient.post(`/orders/${orderId}/refresh`);
  return normalizeOrder(response.data as Record<string, unknown>);
};
