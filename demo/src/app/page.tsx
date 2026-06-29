"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTokens } from "@/lib/auth";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const { accessToken } = getTokens();
    router.replace(accessToken ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <LoadingSpinner size={32} />
    </div>
  );
}
