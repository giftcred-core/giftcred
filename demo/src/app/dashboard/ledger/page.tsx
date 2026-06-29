"use client";

import { StatCard } from "@/components/StatCard";
import { EmptyState, ErrorBanner, StatSkeleton } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { formatINR, truncateId } from "@/lib/format";

interface Wallet {
  id: string;
  currencyCode: string;
  ledgerBalance: number;
  heldBalance: number;
  availableBalance: number;
  status: string;
}

export default function LedgerPage() {
  const wallets = useFetch<{ wallets: Wallet[] }>("/api/ledger/wallets/me");
  useRegisterRefresh(wallets.refetch);

  const list = wallets.data?.wallets ?? [];
  const primary = list[0];

  return (
    <div>
      <div className="info-banner">
        Every balance change in this wallet is backed by a matching journal entry.
        Debits always equal credits. No balance can appear from thin air.
      </div>

      {wallets.error ? (
        <ErrorBanner message={wallets.error} onRetry={wallets.refetch} />
      ) : (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {wallets.loading ? (
              <><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
            ) : primary ? (
              <>
                <StatCard label="💰 Ledger Balance" value={formatINR(primary.ledgerBalance)} />
                <StatCard label="🔒 Held Balance" value={formatINR(primary.heldBalance)} />
                <StatCard label="✅ Available Balance" value={formatINR(primary.availableBalance)} />
              </>
            ) : null}
          </div>

          <div className="wallet-grid">
            {wallets.loading ? (
              <div className="skeleton" style={{ height: 200 }} />
            ) : !list.length ? (
              <EmptyState message="No wallets found. Accept an invite or contact admin." />
            ) : (
              list.map((w) => {
                const pct = w.ledgerBalance > 0
                  ? Math.round((w.availableBalance / w.ledgerBalance) * 100)
                  : 0;
                return (
                  <div key={w.id} className="card card-static wallet-card">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <h3>{w.currencyCode}</h3>
                      <span className={`badge ${w.status === "ACTIVE" ? "badge-green badge-pulse" : "badge-grey"}`}>
                        {w.status}
                      </span>
                    </div>
                    <p className="monospace" style={{ marginBottom: 16, color: "var(--text-3)" }}>
                      {truncateId(w.id)}
                    </p>
                    <div className="balance-row">
                      <span>Ledger</span>
                      <strong>{formatINR(w.ledgerBalance)}</strong>
                    </div>
                    <div className="balance-row">
                      <span>Held</span>
                      <strong>{formatINR(w.heldBalance)}</strong>
                    </div>
                    <div className="balance-row">
                      <span>Available</span>
                      <strong>{formatINR(w.availableBalance)}</strong>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
                      {pct}% available of ledger balance
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
