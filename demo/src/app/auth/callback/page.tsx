"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setTokens, setUser, api } from "@/lib/auth";
import { LoadingSpinner } from "@/components/LoadingSpinner";

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    if (!accessToken || !refreshToken) {
      router.replace("/login?error=sso");
      return;
    }
    (async () => {
      setTokens(accessToken, refreshToken);
      const res = await api.get("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
      router.replace("/dashboard");
    })();
  }, [params, router]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <LoadingSpinner size={32} />
      <span style={{ marginLeft: 12, color: "var(--text-2)" }}>Completing sign in…</span>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner size={32} />}>
      <CallbackHandler />
    </Suspense>
  );
}
