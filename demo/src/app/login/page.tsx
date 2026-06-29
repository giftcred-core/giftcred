"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import {
  FileText,
  Lock,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/backend";

function LoginForm() {
  const { login, verifyMfa } = useAuth();
  const searchParams = useSearchParams();
  const mfaMode = searchParams.get("mfa") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    if (result.error) setError(result.error);
    setLoading(false);
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await verifyMfa(mfaCode);
    if (result.error) setError(result.error);
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <h1 className="grad-text">GiftCred Platform</h1>
        <p>Enterprise-grade gifting, rewards &amp; loyalty management</p>
        <ul className="feature-list">
          <li><ShieldCheck size={22} /> MFA &amp; SSO Authentication</li>
          <li><Wallet size={22} /> Bank-Grade BMS Ledger</li>
          <li><Lock size={22} /> IP Allowlisting &amp; API Keys</li>
          <li><FileText size={22} /> Complete Audit Trail</li>
          <li><Users size={22} /> Multi-Tenant RBAC</li>
        </ul>
      </div>
      <div className="login-right">
        <div className="login-card">
          <h2 className="grad-text">GiftCred</h2>
          {mfaMode ? (
            <form onSubmit={handleMfa}>
              <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 16 }}>
                Enter your authenticator code to continue.
              </p>
              <div className="form-group">
                <label>TOTP Code</label>
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={loading}>
                {loading ? <LoadingSpinner /> : "Verify MFA"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@giftcred.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={loading}>
                {loading ? <LoadingSpinner /> : "Sign In"}
              </button>
              <div className="divider">or sign in with</div>
              <a href={`${API_BASE}/api/auth/sso/google`} className="btn btn-ghost sso-btn">
                Continue with Google
              </a>
              <a href={`${API_BASE}/api/auth/sso/microsoft`} className="btn btn-ghost sso-btn">
                Continue with Microsoft
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}><LoadingSpinner size={32} /></div>}>
      <LoginForm />
    </Suspense>
  );
}
