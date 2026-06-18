import type { PoolClient } from "pg";
import { config } from "../config.js";
import {
  buildAbsoluteUrl,
  buildRequestSignatureBaseString,
  canonicalRequestBodyString,
  computeHmacSha512Hex,
  isWoohooSignatureBodyAbsent,
} from "./signature.js";

export class WoohooAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WoohooAuthError";
  }
}

export class WoohooAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WoohooAPIError";
  }
}

export interface HttpDebugResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class WoohooClient {
  private bearerToken: string | null = null;

  private async loadTokenFromDb(client: PoolClient): Promise<string | null> {
    const result = await client.query<{ access_token: string; expires_at: Date | null }>(
      `SELECT access_token, expires_at FROM oauth_tokens
       WHERE is_active = TRUE ORDER BY id DESC LIMIT 1`
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.expires_at && row.expires_at <= new Date()) return null;
    return row.access_token;
  }

  private async saveTokenToDb(
    client: PoolClient,
    bearerToken: string,
    expiresIn = 3600
  ): Promise<void> {
    await client.query(`UPDATE oauth_tokens SET is_active = FALSE WHERE is_active = TRUE`);
    const expiresAt = new Date(Date.now() + Math.max(60, expiresIn) * 1000);
    await client.query(
      `INSERT INTO oauth_tokens (access_token, access_token_secret, expires_at, is_active)
       VALUES ($1, NULL, $2, TRUE)`,
      [bearerToken, expiresAt]
    );
  }

  private async fetchOAuth2Token(): Promise<{ token: string; expiresIn: number }> {
    const clientId = config.woohooConsumerKey();
    const clientSecret = config.woohooConsumerSecret();
    const username = config.woohooUsername();
    const password = config.woohooPassword();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    };

    const verifyRes = await fetch(config.oauth2VerifyUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ clientId, username, password }),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    const verifyParsed = (await verifyRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (verifyRes.status >= 400) {
      throw new WoohooAuthError(`OAuth2 verify failed (${verifyRes.status}): ${JSON.stringify(verifyParsed)}`);
    }

    const authorizationCode = String(
      verifyParsed.authorizationCode ?? verifyParsed.authorization_code ?? verifyParsed.code ?? ""
    );
    if (!authorizationCode) {
      throw new WoohooAuthError(`OAuth2 verify missing authorizationCode: ${JSON.stringify(verifyParsed)}`);
    }

    const tokenRes = await fetch(config.oauth2TokenUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ clientId, clientSecret, authorizationCode }),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    const tokenParsed = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (tokenRes.status >= 400) {
      throw new WoohooAuthError(
        `OAuth2 token request failed (${tokenRes.status}): ${JSON.stringify(tokenParsed)}`
      );
    }

    const accessToken = tokenParsed.token ?? tokenParsed.access_token;
    if (!accessToken) {
      throw new WoohooAuthError(`OAuth2 token missing in response: ${JSON.stringify(tokenParsed)}`);
    }
    return { token: String(accessToken), expiresIn: Number(tokenParsed.expires_in || 3600) };
  }

  async authenticate(client: PoolClient, force = false): Promise<string> {
    if (!force) {
      const cached = await this.loadTokenFromDb(client);
      if (cached) {
        this.bearerToken = cached;
        return cached;
      }
    }
    const { token, expiresIn } = await this.fetchOAuth2Token();
    await this.saveTokenToDb(client, token, expiresIn);
    this.bearerToken = token;
    return token;
  }

  private requireBearer(): string {
    if (!this.bearerToken) {
      throw new WoohooAuthError("Bearer token not available. Call authenticate() first.");
    }
    return this.bearerToken;
  }

  async apiRequest(
    method: string,
    path: string,
    options: {
      jsonBody?: Record<string, unknown>;
      params?: Record<string, string | number>;
    } = {}
  ): Promise<HttpDebugResponse> {
    const bearer = this.requireBearer();
    const absoluteUrl = buildAbsoluteUrl(config.woohooBaseUrl, path, options.params);
    const methodUpper = method.toUpperCase();
    const prettyJson = config.signatureJsonPretty;
    const hasWireBody = methodUpper === "POST" && !isWoohooSignatureBodyAbsent(options.jsonBody);
    const canonicalBody =
      hasWireBody && options.jsonBody
        ? canonicalRequestBodyString(options.jsonBody as never, prettyJson)
        : null;

    const baseString = buildRequestSignatureBaseString(
      methodUpper,
      absoluteUrl,
      options.jsonBody,
      prettyJson
    );
    const signature = computeHmacSha512Hex(config.woohooConsumerSecret(), baseString);
    const dateAtClient = new Date().toISOString();
    const sigHeader = config.signatureHeader;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearer}`,
      dateAtClient,
      [sigHeader]: signature,
      Accept: "*/*",
      "User-Agent": "Mozilla/5.0",
    };
    if (canonicalBody !== null) headers["Content-Type"] = "application/json";

    const response = await fetch(absoluteUrl, {
      method: methodUpper,
      headers,
      body: canonicalBody ?? undefined,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });

    const body = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return { statusCode: response.status, headers: responseHeaders, body };
  }

  getProduct(sku: string): Promise<HttpDebugResponse> {
    return this.apiRequest("GET", `/rest/v3/catalog/products/${sku}`);
  }

  getCategoryProducts(
    categoryId: string,
    offset = 0,
    limit = 50
  ): Promise<HttpDebugResponse> {
    return this.apiRequest("GET", `/rest/v3/catalog/categories/${categoryId}/products`, {
      params: { offset, limit },
    });
  }
}
