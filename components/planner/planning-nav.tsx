import Link from "next/link";

const destinations = [
  { href: "/planner/today", label: "Today" },
  { href: "/planner", label: "Planner" },
  { href: "/calendar", label: "Calendar" },
  { href: "/goals", label: "Goals" },
] as const;

export function PlanningNav({ current }: { current: "today" | "planner" | "calendar" | "goals" }) {
  return <nav className="a2-planning-nav" aria-label="Planning workspace">
    {destinations.map((item) => {
      const key = item.label.toLowerCase();
      return <Link key={item.href} href={item.href} aria-current={key === current ? "page" : undefined}>{item.label}</Link>;
    })}
  </nav>;
}
