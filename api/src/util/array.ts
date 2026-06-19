/** Keys sometimes used by APIs instead of returning a bare array. */
const WRAPPER_KEYS = ["data", "orders", "results", "products", "items", "cards"] as const;

function isEntity(obj: Record<string, unknown>): boolean {
  return "cardNumber" in obj || "orderId" in obj || ("sku" in obj && !Array.isArray(obj.sku));
}

/**
 * Coerce JSONB / API values into a real array.
 * Handles null, JSON strings, single objects, object maps, and { data: [...] } wrappers.
 */
export function asJsonArray<T = unknown>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];

  if (typeof value === "string") {
    try {
      return asJsonArray<T>(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (!isEntity(obj)) {
      for (const key of WRAPPER_KEYS) {
        const nested = obj[key];
        if (nested != null) {
          const arr = asJsonArray<T>(nested);
          if (arr.length) return arr;
        }
      }
    }

    if ("cardNumber" in obj || "sku" in obj) return [value as T];

    const vals = Object.values(obj);
    if (vals.length && vals.every((v) => v != null && typeof v === "object")) {
      return vals as T[];
    }
  }

  return [];
}
