"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState, ErrorBanner, PermissionDenied, TableSkeleton } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { api } from "@/lib/auth";
import { formatDate } from "@/lib/format";

interface UserRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  role_id: number;
  role_slug: string;
  role_name: string;
  email_verified_at: string | null;
  last_login_at: string | null;
}

interface Role {
  id: number;
  name: string;
  slug: string;
}

function statusBadge(s: string) {
  if (s === "active") return "badge-green";
  if (s === "pending") return "badge-yellow";
  return "badge-red";
}

export default function UsersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteAccountId, setInviteAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const users = useFetch<{ users: UserRow[] }>("/api/users");
  const roles = useFetch<{ roles: Role[] }>("/api/users/roles");

  useRegisterRefresh(() => {
    users.refetch();
    roles.refetch();
  });

  const filtered = useMemo(() => {
    const list = users.data?.users ?? [];
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
    );
  }, [users.data, search]);

  const sendInvite = async () => {
    setSubmitting(true);
    const res = await api.post("/api/users/invites", {
      email: inviteEmail,
      roleId: Number(inviteRoleId),
      accountId: Number(inviteAccountId || user?.accountId),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      showToast(body.error || "Failed to send invite", "error");
      return;
    }
    showToast("Invite sent!", "success");
    setModalOpen(false);
    setInviteEmail("");
  };

  if (users.status === 403) return <PermissionDenied />;

  return (
    <div>
      <div className="page-header">
        <h2>
          Users{" "}
          {users.data && (
            <span className="badge badge-blue">{users.data.users.length}</span>
          )}
        </h2>
        <button className="btn btn-primary" onClick={() => {
          setInviteAccountId(String(user?.accountId ?? ""));
          setModalOpen(true);
        }}>
          <Plus size={18} /> Invite User
        </button>
      </div>

      <input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 20 }}
      />

      {users.error ? (
        <ErrorBanner message={users.error} onRetry={users.refetch} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Verified</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.loading ? (
              <TableSkeleton />
            ) : !filtered.length ? (
              <tr><td colSpan={7}><EmptyState /></td></tr>
            ) : (
              filtered.map((u, i) => (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td>{u.first_name} {u.last_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role_name || u.role_slug}</td>
                  <td><span className={`badge ${statusBadge(u.status)}`}>{u.status}</span></td>
                  <td>{u.email_verified_at ? "✅" : "❌"}</td>
                  <td>{u.last_login_at ? formatDate(u.last_login_at) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Invite User">
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
            <option value="">Select role…</option>
            {(roles.data?.roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Account ID</label>
          <input
            type="number"
            value={inviteAccountId}
            onChange={(e) => setInviteAccountId(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={sendInvite} disabled={submitting}>
            {submitting ? <LoadingSpinner /> : "Send Invite"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
