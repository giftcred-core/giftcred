"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ErrorBanner, PermissionDenied } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { api } from "@/lib/auth";

interface Account {
  id: number;
  name: string;
  sso_enforced: boolean;
  mfa_enforced: boolean;
  ip_allowlist: string[] | unknown;
}

interface IpEntry {
  cidr: string;
  label: string;
}

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const accountId = user?.accountId;

  const account = useFetch<{ account: Account }>(
    accountId ? `/api/accounts/${accountId}` : null,
    [accountId]
  );

  const [ipEnabled, setIpEnabled] = useState(false);
  const [ipList, setIpList] = useState<IpEntry[]>([]);
  const [newCidr, setNewCidr] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [ssoEnforced, setSsoEnforced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mfaModal, setMfaModal] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  useRegisterRefresh(() => {
    account.refetch();
    refreshUser();
  });

  useEffect(() => {
    if (account.data?.account) {
      const a = account.data.account;
      const list = Array.isArray(a.ip_allowlist)
        ? (a.ip_allowlist as string[]).map((c) => ({ cidr: c, label: c }))
        : [];
      setIpList(list);
      setIpEnabled(list.length > 0);
      setSsoEnforced(Boolean(a.sso_enforced));
    }
  }, [account.data]);

  const saveAccount = async (patch: { ssoEnforced?: boolean; ipAllowlist?: string[] }) => {
    if (!accountId) return;
    setSaving(true);
    const res = await api.patch(`/api/accounts/${accountId}`, patch);
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      showToast(body.error || "Failed to update", "error");
      return;
    }
    showToast("Settings saved", "success");
    account.refetch();
  };

  const toggleIpRestriction = async (enabled: boolean) => {
    setIpEnabled(enabled);
    if (!enabled) {
      setIpList([]);
      await saveAccount({ ipAllowlist: [] });
    }
  };

  const addCidr = async () => {
    if (!newCidr.trim()) return;
    const next = [...ipList, { cidr: newCidr.trim(), label: newLabel.trim() || newCidr.trim() }];
    setIpList(next);
    setNewCidr("");
    setNewLabel("");
    await saveAccount({ ipAllowlist: next.map((e) => e.cidr) });
  };

  const removeCidr = async (idx: number) => {
    const next = ipList.filter((_, i) => i !== idx);
    setIpList(next);
    await saveAccount({ ipAllowlist: next.map((e) => e.cidr) });
  };

  const toggleSso = async () => {
    const next = !ssoEnforced;
    setSsoEnforced(next);
    await saveAccount({ ssoEnforced: next });
  };

  const setupMfa = async () => {
    setMfaLoading(true);
    const res = await api.post("/api/auth/mfa/setup", {});
    const body = await res.json();
    setMfaLoading(false);
    if (!res.ok) {
      showToast(body.error || "MFA setup failed", "error");
      return;
    }
    setQrUrl(body.qrCodeDataUrl || "");
    setMfaModal(true);
  };

  const enableMfa = async () => {
    setMfaLoading(true);
    const res = await api.post("/api/auth/mfa/enable", { code: totpCode });
    const body = await res.json();
    setMfaLoading(false);
    if (!res.ok) {
      showToast(body.error || "Invalid code", "error");
      return;
    }
    showToast("MFA enabled!", "success");
    setMfaModal(false);
    refreshUser();
  };

  if (account.status === 403) return <PermissionDenied />;
  if (account.error) return <ErrorBanner message={account.error} onRetry={account.refetch} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="card card-static" style={{ padding: 24 }}>
        <h3 style={{ marginBottom: 16 }}>IP Allowlist</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={ipEnabled}
            onChange={(e) => toggleIpRestriction(e.target.checked)}
            disabled={saving}
          />
          Enable IP Restriction
        </label>
        {ipEnabled && (
          <>
            <div className="tag-list">
              {ipList.map((entry, i) => (
                <span key={entry.cidr} className="tag">
                  {entry.label} ({entry.cidr})
                  <button onClick={() => removeCidr(i)}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input placeholder="203.0.113.0/24" value={newCidr} onChange={(e) => setNewCidr(e.target.value)} />
              <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ maxWidth: 160 }} />
              <button className="btn btn-primary" onClick={addCidr} disabled={saving}>Add</button>
            </div>
          </>
        )}
      </div>

      <div className="card card-static" style={{ padding: 24 }}>
        <h3 style={{ marginBottom: 16 }}>SSO Enforcement</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={ssoEnforced} onChange={toggleSso} disabled={saving} />
          Enforce SSO Login
        </label>
        {ssoEnforced ? (
          <div className="info-banner" style={{ background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.25)" }}>
            Password login disabled for non-platform users
          </div>
        ) : (
          <div className="info-banner" style={{ background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.25)" }}>
            Password login is currently permitted
          </div>
        )}
      </div>

      <div className="card card-static" style={{ padding: 24 }}>
        <h3 style={{ marginBottom: 16 }}>MFA Status</h3>
        <p style={{ marginBottom: 12, color: "var(--text-2)" }}>
          Status:{" "}
          <span className={`badge ${user?.mfaEnabled ? "badge-green" : "badge-yellow"}`}>
            {user?.mfaEnabled ? "Enabled" : "Not enabled"}
          </span>
        </p>
        {!user?.mfaEnabled && (
          <button className="btn btn-primary" onClick={setupMfa} disabled={mfaLoading}>
            {mfaLoading ? <LoadingSpinner /> : "Setup MFA"}
          </button>
        )}
      </div>

      <Modal open={mfaModal} onClose={() => setMfaModal(false)} title="Setup MFA">
        {qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt="MFA QR Code" style={{ display: "block", margin: "0 auto 16px", maxWidth: 200 }} />
        )}
        <div className="form-group">
          <label>Enter TOTP code</label>
          <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="000000" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setMfaModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={enableMfa} disabled={mfaLoading}>
            {mfaLoading ? <LoadingSpinner /> : "Enable MFA"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
