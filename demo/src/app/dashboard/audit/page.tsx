"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EmptyState, ErrorBanner, PermissionDenied, TableSkeleton } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useRegisterRefresh } from "@/context/RefreshContext";
import { formatDate } from "@/lib/format";

const AUDIT_ACTIONS = [
  "login_success", "login_failed", "logout", "session_revoked", "session_revoked_by_admin",
  "user_created", "user_updated", "role_changed", "role_assigned", "invite_sent", "invite_accepted",
  "password_changed", "account_created", "account_updated", "otp_sent", "otp_verified", "sso_linked",
];

interface AuditLog {
  id: number;
  action: string;
  acting_user_id: number | null;
  account_id: number | null;
  ip_address: string | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

function actionBadgeClass(action: string) {
  if (/login_success|sso/i.test(action)) return "badge-blue";
  if (/invite|created|assigned|activated/i.test(action)) return "badge-green";
  if (/hold|wallet|api_key/i.test(action)) return "badge-orange";
  if (/failed|blocked/i.test(action)) return "badge-red";
  if (/revoked|logout/i.test(action)) return "badge-grey";
  if (/mfa/i.test(action)) return "badge-purple";
  return "badge-grey";
}

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [applied, setApplied] = useState({ action: "", startDate: "", endDate: "", page: 1 });

  const qs = new URLSearchParams({
    page: String(applied.page),
    limit: "25",
    ...(applied.action ? { action: applied.action } : {}),
    ...(applied.startDate ? { startDate: applied.startDate } : {}),
    ...(applied.endDate ? { endDate: applied.endDate } : {}),
  });

  const audit = useFetch<{ logs: AuditLog[]; pagination: { page: number; totalPages: number; total: number } }>(
    `/api/audit/logs?${qs.toString()}`,
    [applied]
  );

  useRegisterRefresh(audit.refetch);

  const applyFilters = () => setApplied({ action, startDate, endDate, page: 1 });

  if (audit.status === 403) return <PermissionDenied />;

  return (
    <div>
      <div className="info-banner" style={{ background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.25)" }}>
        🔒 This audit log is immutable. Records cannot be modified or deleted.
      </div>

      <div className="card card-static" style={{ padding: 16, marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
          <label>Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
          <label>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={applyFilters}>Apply</button>
      </div>

      {audit.error ? (
        <ErrorBanner message={audit.error} onRetry={audit.refetch} />
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>User ID</th>
                <th>Account</th>
                <th>IP</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.loading ? (
                <TableSkeleton />
              ) : !audit.data?.logs?.length ? (
                <tr><td colSpan={6}><EmptyState /></td></tr>
              ) : (
                audit.data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.created_at)}</td>
                    <td><span className={`badge ${actionBadgeClass(log.action)}`}>{log.action}</span></td>
                    <td>{log.acting_user_id ?? "—"}</td>
                    <td>{log.account_id ?? "—"}</td>
                    <td>{log.ip_address || "—"}</td>
                    <td>
                      <details>
                        <summary style={{ cursor: "pointer", fontSize: 12 }}>JSON</summary>
                        <pre style={{ fontSize: 11, marginTop: 8, maxWidth: 280, overflow: "auto" }}>
                          {JSON.stringify(log.new_value, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>

          {audit.data?.pagination && (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20, alignItems: "center" }}>
              <button
                className="btn btn-ghost"
                disabled={applied.page <= 1}
                onClick={() => setApplied((p) => ({ ...p, page: p.page - 1 }))}
              >
                Previous
              </button>
              <span style={{ fontSize: 14, color: "var(--text-2)" }}>
                Page {audit.data.pagination.page} of {audit.data.pagination.totalPages}
              </span>
              <button
                className="btn btn-ghost"
                disabled={applied.page >= audit.data.pagination.totalPages}
                onClick={() => setApplied((p) => ({ ...p, page: p.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
