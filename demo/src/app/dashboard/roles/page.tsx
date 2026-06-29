"use client";

import { Fragment, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EmptyState, ErrorBanner, PermissionDenied, TableSkeleton } from "@/components/ErrorBanner";
import { useFetch } from "@/hooks/useFetch";
import { useRegisterRefresh } from "@/context/RefreshContext";

interface Role {
  id: number;
  name: string;
  slug: string;
  account_id: number | null;
  is_system: boolean;
  description: string | null;
}

function pillClass(slug: string) {
  if (slug.startsWith("platform_")) return "pill-purple";
  if (slug.startsWith("manage_")) return "pill-blue";
  if (slug.startsWith("view_")) return "pill-grey";
  if (slug.startsWith("place_")) return "pill-green";
  if (slug.startsWith("assign_")) return "pill-yellow";
  return "pill-grey";
}

export default function RolesPage() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const roles = useFetch<{ roles: Role[] }>("/api/users/roles");

  useRegisterRefresh(roles.refetch);

  if (roles.status === 403) return <PermissionDenied />;

  return (
    <div>
      {roles.error ? (
        <ErrorBanner message={roles.error} onRetry={roles.refetch} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Slug</th>
              <th>Scope</th>
              <th>System</th>
            </tr>
          </thead>
          <tbody>
            {roles.loading ? (
              <TableSkeleton />
            ) : !roles.data?.roles?.length ? (
              <tr><td colSpan={4}><EmptyState /></td></tr>
            ) : (
              roles.data.roles.map((role) => (
                <Fragment key={role.id}>
                  <tr
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpanded(expanded === role.id ? null : role.id)}
                  >
                    <td>{role.name}</td>
                    <td><code>{role.slug}</code></td>
                    <td>
                      <span className="badge badge-blue">
                        {role.account_id === null ? "system" : "account-scoped"}
                      </span>
                    </td>
                    <td>{role.is_system ? "✅" : "—"}</td>
                  </tr>
                  {expanded === role.id && (
                    <tr key={`${role.id}-exp`}>
                      <td colSpan={4} style={{ padding: 16, background: "rgba(255,255,255,0.02)" }}>
                        <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>
                          {role.description || "No description"}
                        </p>
                        <span className={`pill ${pillClass(role.slug)}`}>{role.slug}</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
