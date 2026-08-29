import Link from "next/link";

export function MobileNavPlaceholder({ area }: { area: "student" | "admin" }) {
  const items = area === "admin"
    ? [["Admin", "/admin"], ["Members", "#"], ["System", "#"], ["Logs", "#"], ["More", "#"]]
    : [["Home", "/dashboard"], ["Plan", "#"], ["Progress", "#"], ["Study", "#"], ["More", "#"]];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation placeholder">
      {items.map(([label, href]) => href === "#" ? (
        <span key={label}><i className="nav-dot" aria-hidden="true" />{label}</span>
      ) : (
        <Link key={label} href={href}><i className="nav-dot" aria-hidden="true" />{label}</Link>
      ))}
    </nav>
  );
}
