"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useToast } from "@/context/ToastContext";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { api } from "@/lib/auth";
import { formatINR, truncateId } from "@/lib/format";

interface Wallet {
  id: string;
  currencyCode: string;
  ledgerBalance: number;
  heldBalance: number;
  availableBalance: number;
  status: string;
}

interface PlacedHold {
  id: string;
  accountId: string;
  amount: number;
  orderReference: string;
  status: string;
}

export default function HoldsPage() {
  const { showToast } = useToast();
  const wallets = useFetch<{ wallets: Wallet[] }>("/api/ledger/wallets/me");
  const [holds, setHolds] = useState<PlacedHold[]>([]);
  const [modalWallet, setModalWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [ttl, setTtl] = useState("30");
  const [orderRef, setOrderRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [captureModal, setCaptureModal] = useState<PlacedHold | null>(null);
  const [captureAmount, setCaptureAmount] = useState("");
  const [destAccountId, setDestAccountId] = useState("");

  useRegisterRefresh(wallets.refetch);

  const placeHold = async () => {
    if (!modalWallet) return;
    setLoading(true);
    const paise = Number(amount);
    const res = await api.post("/api/ledger/holds", {
      accountId: modalWallet.id,
      amount: paise,
      ttlMinutes: Number(ttl),
      idempotencyKey: `hold-${modalWallet.id}-${Date.now()}`,
      orderReference: orderRef,
    });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      showToast(body.error || "Failed to place hold", "error");
      return;
    }
    showToast("✅ Hold placed successfully. Available balance reduced.", "success");
    setHolds((prev) => [
      ...prev,
      {
        id: body.hold.id,
        accountId: body.hold.accountId,
        amount: body.hold.amount,
        orderReference: body.hold.orderReference,
        status: body.hold.status,
      },
    ]);
    setModalWallet(null);
    wallets.refetch();
  };

  const voidHold = async (hold: PlacedHold) => {
    const res = await api.post(`/api/ledger/holds/${hold.id}/void`, {});
    const body = await res.json();
    if (!res.ok) {
      showToast(body.error || "Failed to void hold", "error");
      return;
    }
    showToast("Hold released", "success");
    setHolds((prev) => prev.map((h) => (h.id === hold.id ? { ...h, status: "RELEASED" } : h)));
    wallets.refetch();
  };

  const captureHold = async () => {
    if (!captureModal) return;
    setLoading(true);
    const res = await api.post(`/api/ledger/holds/${captureModal.id}/capture`, {
      captureAmount: Number(captureAmount),
      destinationAccountId: destAccountId,
      idempotencyKey: `capture-${captureModal.id}-${Date.now()}`,
    });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      showToast(body.error || "Failed to capture hold", "error");
      return;
    }
    showToast("Hold captured", "success");
    setHolds((prev) =>
      prev.map((h) => (h.id === captureModal.id ? { ...h, status: "CAPTURED" } : h))
    );
    setCaptureModal(null);
    wallets.refetch();
  };

  return (
    <div>
      <div className="info-banner">
        Holds temporarily reserve available balance. Ledger balance only changes when a hold is captured.
        Amounts are in paise (1 rupee = 100 paise).
      </div>

      {wallets.error ? (
        <ErrorBanner message={wallets.error} onRetry={wallets.refetch} />
      ) : wallets.loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : !wallets.data?.wallets?.length ? (
        <EmptyState message="No wallets available" />
      ) : (
        <div className="wallet-grid">
          {wallets.data.wallets.map((w) => (
            <div key={w.id} className="card card-static wallet-card">
              <h3>{w.currencyCode} Wallet</h3>
              <p className="monospace" style={{ margin: "8px 0 16px", color: "var(--text-3)" }}>
                {truncateId(w.id)}
              </p>
              <div className="balance-row"><span>Available</span><strong>{formatINR(w.availableBalance)}</strong></div>
              <div className="balance-row"><span>Held</span><strong>{formatINR(w.heldBalance)}</strong></div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => setModalWallet(w)}>Place Hold</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {holds.length > 0 && (
        <>
          <h3 style={{ margin: "24px 0 12px" }}>Session Holds (this browser session)</h3>
          <div className="card card-static" style={{ padding: 16 }}>
            {holds.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <strong>{h.orderReference}</strong>
                  <span className={`badge badge-${h.status === "ACTIVE" ? "yellow" : "green"}`} style={{ marginLeft: 8 }}>
                    {h.status}
                  </span>
                  <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
                    {formatINR(h.amount)} · {truncateId(h.id)}
                  </p>
                </div>
                {h.status === "ACTIVE" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => {
                      setCaptureModal(h);
                      setCaptureAmount(String(h.amount));
                    }}>Capture</button>
                    <button className="btn btn-danger" onClick={() => voidHold(h)}>Void</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={!!modalWallet} onClose={() => setModalWallet(null)} title="Place Hold">
        <div className="form-group">
          <label>Amount (paise)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000 = ₹100" />
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>1 rupee = 100 paise</p>
        </div>
        <div className="form-group">
          <label>TTL (minutes)</label>
          <input type="number" value={ttl} onChange={(e) => setTtl(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Order Reference</label>
          <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="order-uber-001" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setModalWallet(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={placeHold} disabled={loading}>
            {loading ? <LoadingSpinner /> : "Place Hold"}
          </button>
        </div>
      </Modal>

      <Modal open={!!captureModal} onClose={() => setCaptureModal(null)} title="Capture Hold">
        <div className="form-group">
          <label>Capture Amount (paise)</label>
          <input type="number" value={captureAmount} onChange={(e) => setCaptureAmount(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Destination Account ID (UUID)</label>
          <input value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)} placeholder="Tenant pool account UUID" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setCaptureModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={captureHold} disabled={loading}>
            {loading ? <LoadingSpinner /> : "Capture"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
