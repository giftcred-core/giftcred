import { createHash, createHmac } from "node:crypto";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function sortObjectDeep(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  const sorted: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortObjectDeep((value as Record<string, JsonValue>)[key]);
  }
  return sorted;
}

export function sortQueryStringUrl(absApiUrl: string): string {
  const url = new URL(absApiUrl);
  if (!url.search) return absApiUrl;
  const segments = url.search.slice(1).split("&").filter(Boolean);
  segments.sort((a, b) => {
    const keyA = a.split("=")[0] ?? "";
    const keyB = b.split("=")[0] ?? "";
    return keyA.localeCompare(keyB);
  });
  url.search = segments.length ? `?${segments.join("&")}` : "";
  return url.toString();
}

export function canonicalRequestBodyString(body: JsonValue, pretty = false): string {
  const sorted = sortObjectDeep(body);
  return pretty ? JSON.stringify(sorted, null, 4) : JSON.stringify(sorted);
}

export function isWoohooSignatureBodyAbsent(body: unknown): boolean {
  if (body === null || body === undefined) return true;
  if (typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body as object).length === 0;
}

export function buildRequestSignatureBaseString(
  method: string,
  absoluteApiUrl: string,
  requestBody?: unknown,
  prettyJson = false
): string {
  const methodUpper = method.toUpperCase();
  const encodedUrl = rfc3986Encode(
    absoluteApiUrl.includes("?") ? sortQueryStringUrl(absoluteApiUrl) : absoluteApiUrl
  );
  const base = `${methodUpper}&${encodedUrl}`;
  if (methodUpper === "GET" || isWoohooSignatureBodyAbsent(requestBody)) return base;
  const encodedBody = rfc3986Encode(
    canonicalRequestBodyString(requestBody as JsonValue, prettyJson)
  );
  return `${base}&${encodedBody}`;
}

export function computeHmacSha512Hex(clientSecret: string, baseString: string): string {
  return createHmac("sha512", clientSecret).update(baseString).digest("hex");
}

export function buildAbsoluteUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number>
): string {
  const root = baseUrl.replace(/\/$/, "");
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  let url = `${root}${pathPart}`;
  if (params && Object.keys(params).length) {
    const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    const query = sorted.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
    url = `${url}?${query}`;
  }
  return sortQueryStringUrl(url);
}

// re-export for tests
export {};
