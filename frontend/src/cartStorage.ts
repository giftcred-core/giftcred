import { asArray } from "./util/array";

const CART_KEY = "giftcred-cart";

export interface StoredCartItem {
  sku: string;
  brandName: string;
  amount: number;
  quantity: number;
  image: string;
  discount: string;
}

export function loadStoredCart(): StoredCartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    return asArray<StoredCartItem>(JSON.parse(raw)).filter(
      (i) => i?.sku && Number.isFinite(i.amount) && Number.isFinite(i.quantity)
    );
  } catch {
    return [];
  }
}

export function saveStoredCart(items: StoredCartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function clearStoredCart(): void {
  localStorage.removeItem(CART_KEY);
}
