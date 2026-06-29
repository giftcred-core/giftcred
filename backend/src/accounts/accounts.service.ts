import type { PoolClient } from "pg";
import { AuditAction } from "../audit/actions.js";
import { writeAuditLog } from "../audit/audit.service.js";

export async function createMasterAccount(
  client: PoolClient,
  input: { name: string; actingUserId?: number; ipAddress?: string }
) {
  const result = await client.query<{ id: number; name: string; account_type: string }>(
    `
    INSERT INTO accounts (name, account_type, status)
    VALUES ($1, 'master', 'active')
    RETURNING id, name, account_type
    `,
    [input.name]
  );
  const account = result.rows[0];

  await writeAuditLog(client, {
    actingUserId: input.actingUserId ?? null,
    accountId: account.id,
    action: AuditAction.ACCOUNT_CREATED,
    newValue: { name: account.name, accountType: account.account_type },
    ipAddress: input.ipAddress ?? null,
  });

  return account;
}

export async function createChildAccount(
  client: PoolClient,
  input: {
    masterAccountId: number;
    name: string;
    actingUserId: number;
    ipAddress?: string;
  }
) {
  const result = await client.query<{ id: number; name: string; account_type: string; parent_account_id: number }>(
    `
    INSERT INTO accounts (name, account_type, parent_account_id, status)
    VALUES ($1, 'child', $2, 'active')
    RETURNING id, name, account_type, parent_account_id
    `,
    [input.name, input.masterAccountId]
  );
  const account = result.rows[0];

  await writeAuditLog(client, {
    actingUserId: input.actingUserId,
    accountId: account.id,
    action: AuditAction.ACCOUNT_CREATED,
    newValue: {
      name: account.name,
      accountType: account.account_type,
      parentAccountId: account.parent_account_id,
    },
    ipAddress: input.ipAddress ?? null,
  });

  return account;
}

export async function listAccountsInScope(
  client: PoolClient,
  auth: { accountId: number; accountType: string; isPlatformAdmin: boolean }
) {
  if (auth.isPlatformAdmin) {
    const result = await client.query(
      `SELECT id, name, account_type, parent_account_id, status, created_at FROM accounts ORDER BY created_at DESC`
    );
    return result.rows;
  }

  if (auth.accountType === "master") {
    const result = await client.query(
      `
      SELECT id, name, account_type, parent_account_id, status, created_at
      FROM accounts
      WHERE id = $1 OR parent_account_id = $1
      ORDER BY created_at DESC
      `,
      [auth.accountId]
    );
    return result.rows;
  }

  const result = await client.query(
    `SELECT id, name, account_type, parent_account_id, status, created_at FROM accounts WHERE id = $1`,
    [auth.accountId]
  );
  return result.rows;
}

export async function getAccountById(client: PoolClient, accountId: number) {
  const result = await client.query(
    `
    SELECT id, name, account_type, parent_account_id, status, metadata, created_at,
           COALESCE(mfa_enforced, FALSE) AS mfa_enforced,
           COALESCE(sso_enforced, FALSE) AS sso_enforced,
           COALESCE(ip_allowlist, '[]'::jsonb) AS ip_allowlist
    FROM accounts WHERE id = $1
    `,
    [accountId]
  );
  return result.rows[0] ?? null;
}

export async function updateAccountSecurity(
  client: PoolClient,
  accountId: number,
  input: {
    ssoEnforced?: boolean;
    ipAllowlist?: string[];
    actingUserId: number;
    ipAddress?: string;
  }
) {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.ssoEnforced !== undefined) {
    updates.push(`sso_enforced = $${idx++}`);
    params.push(input.ssoEnforced);
  }
  if (input.ipAllowlist !== undefined) {
    updates.push(`ip_allowlist = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.ipAllowlist));
  }

  if (!updates.length) {
    throw new Error("No security fields to update.");
  }

  updates.push(`updated_at = NOW()`);
  params.push(accountId);

  const result = await client.query(
    `
    UPDATE accounts
    SET ${updates.join(", ")}
    WHERE id = $${idx}
    RETURNING id, name, account_type, parent_account_id, status, metadata, created_at,
              COALESCE(mfa_enforced, FALSE) AS mfa_enforced,
              COALESCE(sso_enforced, FALSE) AS sso_enforced,
              COALESCE(ip_allowlist, '[]'::jsonb) AS ip_allowlist
    `,
    params
  );

  const account = result.rows[0];
  if (!account) return null;

  await writeAuditLog(client, {
    actingUserId: input.actingUserId,
    accountId,
    action: AuditAction.ACCOUNT_UPDATED,
    newValue: {
      ssoEnforced: input.ssoEnforced,
      ipAllowlist: input.ipAllowlist,
    },
    ipAddress: input.ipAddress ?? null,
  });

  return account;
}
