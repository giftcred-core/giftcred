import { AlertTriangle } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner">
      <h4>⚠️ Failed to load data</h4>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function PermissionDenied() {
  return (
    <div className="permission-denied">
      <AlertTriangle size={48} style={{ margin: "0 auto 16px", opacity: 0.5 }} />
      <h3>🔒 Access Denied</h3>
      <p style={{ marginTop: 8 }}>You don&apos;t have the required privilege to view this page.</p>
    </div>
  );
}

export function EmptyState({ message = "No records found" }: { message?: string }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={99}>
            <div className="skeleton" style={{ height: 36, width: "100%" }} />
          </td>
        </tr>
      ))}
    </>
  );
}

export function StatSkeleton() {
  return <div className="skeleton stat-card" style={{ height: 80 }} />;
}
