import type { PoolClient } from "pg";
import type { CatalogProduct } from "./catalog.js";

const CACHE_ROW_ID = 1;

function catalogTtlMs(): number {
  // Default: refresh catalog from Woohoo at most once per month (~30 days)
  const hours = Number(process.env.CATALOG_CACHE_TTL_HOURS || 24 * 30);
  return hours * 60 * 60 * 1000;
}

export async function loadCatalogFromDb(
  client: PoolClient
): Promise<{
  products: CatalogProduct[];
  detailSkus: Set<string>;
  categoryName: string;
  loadedAt: string;
} | null> {
  const result = await client.query<{
    category_name: string;
    products: CatalogProduct[];
    detail_skus: string[];
    loaded_at: Date;
  }>(
    `SELECT category_name, products, detail_skus, loaded_at
     FROM catalog_cache WHERE id = $1`,
    [CACHE_ROW_ID]
  );

  const row = result.rows[0];
  if (!row) return null;

  const age = Date.now() - new Date(row.loaded_at).getTime();
  if (age > catalogTtlMs()) return null;

  return {
    products: row.products || [],
    detailSkus: new Set(row.detail_skus || []),
    categoryName: row.category_name || "Gift Card",
    loadedAt: new Date(row.loaded_at).toISOString(),
  };
}

export async function saveCatalogToDb(
  client: PoolClient,
  data: {
    products: CatalogProduct[];
    detailSkus: Set<string>;
    categoryName: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO catalog_cache (id, category_name, products, detail_skus, loaded_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       category_name = EXCLUDED.category_name,
       products = EXCLUDED.products,
       detail_skus = EXCLUDED.detail_skus,
       loaded_at = NOW()`,
    [
      CACHE_ROW_ID,
      data.categoryName,
      JSON.stringify(data.products),
      JSON.stringify([...data.detailSkus]),
    ]
  );
}

export async function upsertCatalogProductInDb(
  client: PoolClient,
  product: CatalogProduct,
  isDetail: boolean
): Promise<void> {
  const existing = await loadCatalogFromDb(client);
  if (!existing) return;

  const products = [...existing.products];
  const detailSkus = new Set(existing.detailSkus);
  const idx = products.findIndex((p) => p.sku === product.sku);
  if (idx >= 0) products[idx] = product;
  else products.push(product);
  if (isDetail) detailSkus.add(product.sku);

  await saveCatalogToDb(client, {
    products,
    detailSkus,
    categoryName: existing.categoryName,
  });
}
