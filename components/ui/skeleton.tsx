export function Skeleton({ width = "100%", height = 16, radius = 12, className = "" }: { width?: string | number; height?: string | number; radius?: number; className?: string }) {
  return <span className={`ui-skeleton ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
