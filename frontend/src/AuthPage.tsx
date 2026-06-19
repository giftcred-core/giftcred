import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./auth";

type Mode = "login" | "register";

export function AuthPage({ redirectHint }: { redirectHint?: string }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
      const from = searchParams.get("from");
      navigate(from?.startsWith("/") ? from : "/orders");
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      setError(
        ax.response?.data?.detail ||
        (ax.response?.status === 404 ? "Account service unavailable — please restart the API server." : null) ||
        ax.message ||
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="container auth-wrap">
        <div className="auth-card">
          <div className="auth-header">
            <span className="auth-logo">🎁</span>
            <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="muted">
              {redirectHint ||
                (mode === "login"
                  ? "Sign in to view your orders and checkout."
                  : "Just email and password — no verification needed for now.")}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => { setMode("login"); setError(""); }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => { setMode("register"); setError(""); }}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                minLength={mode === "register" ? 8 : undefined}
                required
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="auth-footer-note muted">
            Email verification is not required yet — we&apos;ll add it in a future update.
          </p>

          <Link to="/catalog" className="auth-back">← Continue browsing gift cards</Link>
        </div>
      </div>
    </div>
  );
}
