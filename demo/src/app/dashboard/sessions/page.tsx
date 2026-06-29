"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EmptyState, ErrorBanner, TableSkeleton } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useToast } from "@/context/ToastContext";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { api } from "@/lib/auth";
import { formatDate } from "@/lib/format";

interface Session {
  id: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return <span>{remaining}</span>;
}

export default function SessionsPage() {
  const { showToast } = useToast();
  const [localSessions, setLocalSessions] = useState<Session[] | null>(null);
  const sessions = useFetch<{ sessions: Session[] }>("/api/auth/sessions");

  useRegisterRefresh(sessions.refetch);

  useEffect(() => {
    if (sessions.data?.sessions) setLocalSessions(sessions.data.sessions);
  }, [sessions.data]);

  const revoke = async (id: number) => {
    const res = await api.delete(`/api/auth/sessions/${id}`);
    if (!res.ok) {
      const body = await res.json();
      showToast(body.error || "Failed to revoke", "error");
      return;
    }
    setLocalSessions((prev) => prev?.filter((s) => s.id !== id) ?? []);
    showToast("Session revoked", "success");
  };

  if (sessions.error) return <ErrorBanner message={sessions.error} onRetry={sessions.refetch} />;

  const list = localSessions ?? sessions.data?.sessions ?? [];

  return (
    <DataTable>
      <thead>
        <tr>
          <th>#</th>
          <th>IP Address</th>
          <th>User Agent</th>
          <th>Created</th>
          <th>Last Used</th>
          <th>Expires In</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sessions.loading ? (
          <TableSkeleton />
        ) : !list.length ? (
          <tr><td colSpan={7}><EmptyState /></td></tr>
        ) : (
          list.map((s, i) => (
            <tr key={s.id}>
              <td>{i + 1}</td>
              <td>{s.ipAddress || "—"}</td>
              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.userAgent || "—"}
              </td>
              <td>{formatDate(s.createdAt)}</td>
              <td>{formatDate(s.lastUsedAt)}</td>
              <td><ExpiryCountdown expiresAt={s.expiresAt} /></td>
              <td>
                <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => revoke(s.id)}>
                  Revoke
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}
