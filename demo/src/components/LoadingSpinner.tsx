export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size, display: "inline-block" }}
    />
  );
}
