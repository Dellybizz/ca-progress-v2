import type { SelectHTMLAttributes } from "react";

export function Select({ label, hint, error, className = "", children, id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string }) {
  const controlId = id || props.name;
  const helpId = controlId ? `${controlId}-help` : undefined;
  return (
    <label className={`ui-field ${className}`}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <select id={controlId} className={`ui-select ${error ? "is-error" : ""}`} aria-invalid={Boolean(error) || undefined} aria-describedby={(hint || error) ? helpId : undefined} {...props}>{children}</select>
      {(hint || error) ? <span id={helpId} className={`ui-field__help ${error ? "is-error" : ""}`}>{error || hint}</span> : null}
    </label>
  );
}
