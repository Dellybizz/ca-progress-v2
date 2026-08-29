import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", interactive = false, children, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={`ui-card ${interactive ? "ui-card--interactive" : ""} ${className}`} {...props}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="ui-card__header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action ? <div>{action}</div> : null}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ui-card__body ${className}`}>{children}</div>;
}
