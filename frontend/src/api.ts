import axios from 'axios';

// Same-origin /api when frontend + API are deployed together on Vercel
const API_BASE = import.meta.env.VITE_API_URL || "/api";

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

export const getCatalog = async (): Promise<any[]> => {
  const response = await axios.get(`${API_BASE}/catalog`);
  return response.data;
};

export const getProduct = async (sku: string): Promise<any> => {
  const response = await axios.get(`${API_BASE}/catalog/${sku}`);
  return response.data;
};

export const placePurchaseOrder = async (orderData: {
  items: { sku: string; amount: number; quantity: number; brandName?: string }[];
  mobileNumber: string;
  email: string;
  message?: string;
}) => {
  const response = await axios.post(`${API_BASE}/purchase`, orderData);
  return response.data;
};

export const getOrderHistory = async (): Promise<Order[]> => {
  const response = await axios.get(`${API_BASE}/orders`);
  return response.data;
};

export const refreshOrder = async (orderId: string): Promise<Order> => {
  const response = await axios.post(`${API_BASE}/orders/${orderId}/refresh`);
  return response.data;
};
