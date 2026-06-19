import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { config } from "./config.js";
import { ensureDb, withClient } from "./db.js";
import { requireAuth, type AuthedRequest } from "./middleware/auth.js";
import { getCatalogProduct, getCatalogProducts, validatePurchaseSkus } from "./services/catalog.js";
import {
  AuthValidationError,
  getUserById,
  loginUser,
  registerUser,
  signToken,
} from "./services/auth.js";
import { getOrderByIdForUser, getOrdersByUserId, orderToDict, refreshOrderCards } from "./services/order.js";
import {
  placePurchaseOrders,
  PurchaseValidationError,
} from "./services/purchase.js";
import { asJsonArray } from "./util/array.js";
import { WoohooAuthError, WoohooClient } from "./woohoo/client.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    cors({
      origin: config.corsOrigins(),
      credentials: true,
    })
  );

  app.use(async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await ensureDb();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await withClient(async (client) => {
        const result = await client.query("SELECT current_database() AS db, NOW() AS now");
        res.json({
          status: "ok",
          database: "connected",
          db: result.rows[0].db,
          timestamp: result.rows[0].now,
        });
      });
    } catch (err) {
      res.status(503).json({
        status: "error",
        database: "disconnected",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const email = String((req.body as Record<string, unknown>)?.email ?? "").trim();
      const password = String((req.body as Record<string, unknown>)?.password ?? "");
      await withClient(async (client) => {
        const user = await registerUser(client, email, password);
        const token = signToken(user);
        res.status(201).json({ token, user: { id: user.id, email: user.email } });
      });
    } catch (err) {
      if (err instanceof AuthValidationError) {
        res.status(400).json({ detail: err.message });
        return;
      }
      next(err);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const email = String((req.body as Record<string, unknown>)?.email ?? "").trim();
      const password = String((req.body as Record<string, unknown>)?.password ?? "");
      await withClient(async (client) => {
        const user = await loginUser(client, email, password);
        const token = signToken(user);
        res.json({ token, user: { id: user.id, email: user.email } });
      });
    } catch (err) {
      if (err instanceof AuthValidationError) {
        res.status(401).json({ detail: err.message });
        return;
      }
      next(err);
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      await withClient(async (client) => {
        const user = await getUserById(client, req.user!.id);
        if (!user) {
          res.status(401).json({ detail: "Account not found." });
          return;
        }
        res.json({ user });
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog", async (_req, res, next) => {
    try {
      const products = await withClient((client) => getCatalogProducts(client));
      res.json(products);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/catalog/:sku", async (req, res, next) => {
    try {
      const product = await withClient((client) => getCatalogProduct(client, req.params.sku));
      if (!product) {
        res.status(404).json({ detail: "Product not found" });
        return;
      }
      res.json(product);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/purchase", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const rawItems = asJsonArray<Record<string, unknown>>(body.items);
      const items = rawItems
        .map((i) => ({
          sku: String(i?.sku ?? "").trim(),
          amount: Number(i?.amount),
          quantity: Number(i?.quantity),
          ...(i?.brandName ? { brandName: String(i.brandName) } : {}),
        }))
        .filter((i) => i.sku && Number.isFinite(i.amount) && Number.isFinite(i.quantity));

      const mobileNumber = String(body.mobileNumber ?? "").trim();
      const email = req.user!.email;

      if (!items.length) {
        res.status(400).json({ detail: "Cart is empty." });
        return;
      }
      if (!mobileNumber || mobileNumber.length < 10) {
        res.status(400).json({ detail: "Please enter a valid 10-digit mobile number." });
        return;
      }

      await withClient(async (client) => {
        try {
          await validatePurchaseSkus(
            client,
            items.map((i) => i.sku)
          );
        } catch (err) {
          res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
          return;
        }

        const woohoo = new WoohooClient();
        await woohoo.authenticate(client);

        try {
          const result = await placePurchaseOrders(client, woohoo, items, {
            mobileNumber,
            email,
            userId: req.user!.id,
          });
          res.json(result);
        } catch (err) {
          if (err instanceof PurchaseValidationError) {
            res.status(400).json({ detail: err.message });
            return;
          }
          throw err;
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/orders", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const orders = await withClient((client) => getOrdersByUserId(client, req.user!.id));
      res.json(orders.map(orderToDict));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/orders/:orderId/refresh", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const orderId = String(req.params.orderId);
      await withClient(async (client) => {
        const order = await getOrderByIdForUser(client, orderId, req.user!.id);
        if (!order) {
          res.status(404).json({ detail: "Order not found" });
          return;
        }
        const woohoo = new WoohooClient();
        await woohoo.authenticate(client);
        const refreshed = await refreshOrderCards(client, woohoo, order);
        res.json(orderToDict(refreshed));
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (err instanceof WoohooAuthError) {
      res.status(502).json({
        detail: err.message,
        source: "woohoo",
        hint: "Check WOOHOO_* credentials in .env — this is not a database error.",
      });
      return;
    }
    const pgCode = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (pgCode === "ECONNREFUSED" || pgCode === "ENOTFOUND" || pgCode === "ETIMEDOUT") {
      res.status(503).json({
        detail: err instanceof Error ? err.message : "Database connection failed",
        source: "database",
        hint: "Check DATABASE_URL, firewall, and that Postgres allows remote connections on port 5432.",
      });
      return;
    }
    if (err instanceof Error && err.message.includes("SSL")) {
      res.status(503).json({
        detail: err.message,
        source: "database",
        hint: "Try adding ?sslmode=disable to DATABASE_URL, or set DATABASE_SSL=true if your host requires SSL.",
      });
      return;
    }
    res.status(500).json({ detail: err instanceof Error ? err.message : "Internal server error" });
  });

  return app;
}
