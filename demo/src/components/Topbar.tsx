"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRefresh } from "@/context/RefreshContext";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user, logout } = useAuth();
  const { triggerRefresh } = useRefresh();

  return (
    <header className="topbar">
      <h2>{title}</h2>
      <div className="topbar-right">
        <button className="btn btn-ghost" onClick={triggerRefresh} title="Refresh">
          <RefreshCw size={18} />
        </button>
        <span style={{ fontSize: 14, color: "var(--text-2)" }}>{user?.email}</span>
        <span className="role-pill">{user?.roleSlug?.replace(/_/g, " ")}</span>
        <button className="btn btn-ghost" onClick={() => logout()}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
