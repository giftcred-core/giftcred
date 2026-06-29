"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import {
  EmptyState,
  ErrorBanner,
  PermissionDenied,
  StatSkeleton,
  TableSkeleton,
} from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useAuth } from "@/context/AuthContext";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { formatDate, formatINR } from "@/lib/format";

interface Wallet {
  id: string;
  currencyCode: string;
  ledgerBalance: number;
  heldBalance: number;
  availableBalance: number;
  status: string;
}

interface AuditLog {
  id: number;
  action: string;
  ip_address: string | null;
  created_at: string;
}

function actionBadge(action: string) {
  if (action.includes("login_success") || action.includes("sso")) return "badge-blue";
  if (action.includes("failed") || action.includes("blocked")) return "badge-red";
  if (action.includes("invite") || action.includes("created")) return "badge-green";
  return "badge-grey";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const wallets = useFetch<{ wallets: Wallet[] }>("/api/ledger/wallets/me");
  const sessions = useFetch<{ sessions: unknown[] }>("/api/auth/sessions");
  const audit = useFetch<{ logs: AuditLog[] }>("/api/audit/logs?limit=5");

  useRegisterRefresh(() => {
    wallets.refetch();
    sessions.refetch();
    audit.refetch();
  });

  const wallet = wallets.data?.wallets?.[0];
  const chartData = wallet
    ? [
        { name: "Ledger", value: wallet.ledgerBalance / 100 },
        { name: "Available", value: wallet.availableBalance / 100 },
        { name: "Held", value: wallet.heldBalance / 100 },
      ]
    : [];

  return (
    <div>
      <div className="stat-grid">
        {wallets.loading ? (
          <>
            <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="My Available Balance"
              value={wallet ? formatINR(wallet.availableBalance) : "—"}
            />
            <StatCard
              label="My Held Balance"
              value={wallet ? formatINR(wallet.heldBalance) : "—"}
            />
            <StatCard
              label="Active Sessions"
              value={sessions.data ? String(sessions.data.sessions.length) : "—"}
            />
            <StatCard label="Account ID" value={user ? String(user.accountId) : "—"} />
          </>
        )}
      </div>

      <div className="chart-grid">
        <div className="card card-static chart-card">
          <h3>Wallet Balance Breakdown</h3>
          {wallets.loading ? (
            <div className="skeleton" style={{ height: 220 }} />
          ) : wallet ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#475569" fontSize={12} />
                <YAxis stroke="#475569" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.1)" }}
                  formatter={(v) => [`₹${Number(v ?? 0).toLocaleString("en-IN")}`, ""]}
                />
                <Bar dataKey="value" fill="url(#grad)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No wallet found" />
          )}
        </div>

        <div className="card card-static chart-card">
          <h3>Your Access Profile</h3>
          {user ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
              <div><span style={{ color: "var(--text-3)" }}>Role:</span> <strong>{user.roleSlug}</strong></div>
              <div><span style={{ color: "var(--text-3)" }}>Privileges:</span> <strong>{user.privileges.length}</strong></div>
              <div>
                <span style={{ color: "var(--text-3)" }}>MFA:</span>{" "}
                <span className={`badge ${user.mfaEnabled ? "badge-green" : "badge-yellow"}`}>
                  {user.mfaEnabled ? "Enabled" : "Not enabled"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-3)" }}>Account Type:</span>{" "}
                <span className="badge badge-purple">{user.accountType}</span>
              </div>
            </div>
          ) : (
            <div className="skeleton" style={{ height: 120 }} />
          )}
        </div>
      </div>

      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Recent Audit Activity</h3>
      {audit.status === 403 ? (
        <PermissionDenied />
      ) : audit.error ? (
        <ErrorBanner message={audit.error} onRetry={audit.refetch} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {audit.loading ? (
              <TableSkeleton rows={5} />
            ) : !audit.data?.logs?.length ? (
              <tr><td colSpan={3}><EmptyState /></td></tr>
            ) : (
              audit.data.logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.created_at)}</td>
                  <td><span className={`badge ${actionBadge(log.action)}`}>{log.action}</span></td>
                  <td>{log.ip_address || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
