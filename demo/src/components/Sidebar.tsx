"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Key,
  LayoutDashboard,
  Lock,
  LogOut,
  Monitor,
  ScrollText,
  Shield,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { group: "OVERVIEW", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    group: "PLATFORM",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Users },
      { href: "/dashboard/roles", label: "Roles & RBAC", icon: Shield },
    ],
  },
  {
    group: "FINANCE",
    items: [
      { href: "/dashboard/ledger", label: "Wallets & Ledger", icon: Wallet },
      { href: "/dashboard/holds", label: "Active Holds", icon: Lock },
    ],
  },
  {
    group: "SECURITY",
    items: [
      { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
      { href: "/dashboard/sessions", label: "Active Sessions", icon: Monitor },
      { href: "/dashboard/security", label: "IP & SSO Settings", icon: ShieldAlert },
      { href: "/dashboard/audit", label: "Audit Logs", icon: ScrollText },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("gc_sidebar_collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("gc_sidebar_collapsed", next ? "1" : "0");
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <h1 className="grad-text">{collapsed ? "GC" : "GiftCred"}</h1>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((section) => (
          <div key={section.group}>
            <div className="nav-group-label">{section.group}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  title={item.label}
                >
                  <Icon size={20} />
                  <span className="nav-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user-email">{user?.email}</div>
        <button className="btn btn-ghost" style={{ width: "100%", marginBottom: 8 }} onClick={() => logout()}>
          <LogOut size={18} />
          <span className="nav-label">Logout</span>
        </button>
        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={toggle}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
