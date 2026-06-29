"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState, ErrorBanner, TableSkeleton } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { api } from "@/lib/auth";
import { formatDate } from "@/lib/format";

interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
}

export default function ApiKeysPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const keys = useFetch<{ keys: ApiKey[] }>("/api/keys");
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);

  useRegisterRefresh(keys.refetch);

  const availableScopes = user?.privileges ?? [];

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const createKey = async () => {
    setSubmitting(true);
    const res = await api.post("/api/keys", { name, scopes: selectedScopes });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      showToast(body.error || "Failed to create key", "error");
      return;
    }
    setModalOpen(false);
    setRevealKey(body.key);
    setName("");
    setSelectedScopes([]);
    keys.refetch();
  };

  const revokeKey = async (id: number) => {
    const res = await api.delete(`/api/keys/${id}`);
    if (!res.ok) {
      const body = await res.json();
      showToast(body.error || "Failed to revoke", "error");
      return;
    }
    showToast("API key revoked", "success");
    setConfirmRevoke(null);
    keys.refetch();
  };

  const copyKey = () => {
    if (revealKey) {
      navigator.clipboard.writeText(revealKey);
      showToast("Copied to clipboard", "success");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>API Keys</h2>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={18} /> Generate Key
        </button>
      </div>

      {keys.error ? (
        <ErrorBanner message={keys.error} onRetry={keys.refetch} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Scopes</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.loading ? (
              <TableSkeleton />
            ) : !keys.data?.keys?.length ? (
              <tr><td colSpan={6}><EmptyState /></td></tr>
            ) : (
              keys.data.keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="monospace">{k.prefix}</td>
                  <td>{k.scopes.join(", ") || "—"}</td>
                  <td>{formatDate(k.createdAt)}</td>
                  <td><span className="badge badge-green">Active</span></td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => setConfirmRevoke(k.id)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Generate API Key">
        <div className="form-group">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production integration" />
        </div>
        <div className="form-group">
          <label>Scopes</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {availableScopes.map((scope) => (
              <label key={scope} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {scope}
              </label>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createKey} disabled={submitting || !name}>
            {submitting ? <LoadingSpinner /> : "Generate"}
          </button>
        </div>
      </Modal>

      <Modal open={!!revealKey} onClose={() => setRevealKey(null)} title="🔑 Your API Key">
        <p style={{ color: "#f59e0b", fontSize: 13, marginBottom: 12 }}>
          ⚠️ This key will not be shown again. Copy it now.
        </p>
        <code style={{ display: "block", padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8, wordBreak: "break-all", fontSize: 13 }}>
          {revealKey}
        </code>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={copyKey}>Copy Key</button>
        </div>
      </Modal>

      <Modal open={confirmRevoke !== null} onClose={() => setConfirmRevoke(null)} title="Revoke API Key?">
        <p style={{ color: "var(--text-2)", marginBottom: 16 }}>This action cannot be undone.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setConfirmRevoke(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => confirmRevoke && revokeKey(confirmRevoke)}>
            Revoke
          </button>
        </div>
      </Modal>
    </div>
  );
}
