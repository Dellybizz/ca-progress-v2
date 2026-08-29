import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function Button({ variant = "primary", size = "md", isLoading = false, className = "", disabled, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; isLoading?: boolean }) {
  return (
    <button className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} disabled={disabled || isLoading} aria-busy={isLoading || undefined} {...props}>
      {isLoading ? <span className="ui-button__spinner" aria-hidden="true" /> : null}
      <span>{isLoading ? "Working…" : children}</span>
    </button>
  );
}
