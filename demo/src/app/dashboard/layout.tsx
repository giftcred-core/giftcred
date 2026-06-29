"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { RefreshProvider } from "@/context/RefreshContext";
import { useAuth } from "@/context/AuthContext";
import { getTokens } from "@/lib/auth";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/users": "Users",
  "/dashboard/roles": "Roles & RBAC",
  "/dashboard/ledger": "Wallets & Ledger",
  "/dashboard/holds": "Active Holds",
  "/dashboard/api-keys": "API Keys",
  "/dashboard/sessions": "Active Sessions",
  "/dashboard/security": "IP & SSO Settings",
  "/dashboard/audit": "Audit Logs",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const title = TITLES[pathname] || "Dashboard";

  useEffect(() => {
    const { accessToken } = getTokens();
    if (!accessToken && !isLoading) {
      router.replace("/login");
    }
  }, [isLoading, router]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (!user && !getTokens().accessToken) return null;

  return (
    <RefreshProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <Topbar title={title} />
          <main className="main-content page-enter">{children}</main>
        </div>
      </div>
    </RefreshProvider>
  );
}
