interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="card card-static stat-card">
      <div className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        {label}
      </div>
      <div className="value grad-text">{value}</div>
    </div>
  );
}
