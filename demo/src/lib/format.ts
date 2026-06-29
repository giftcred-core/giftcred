export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(rupees);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateId(id: string, len = 8): string {
  if (id.length <= len * 2) return id;
  return `${id.slice(0, len)}…${id.slice(-4)}`;
}
