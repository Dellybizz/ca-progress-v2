import type { InputHTMLAttributes, ReactNode } from "react";

export function Input({ label, hint, error, leading, className = "", id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string; leading?: ReactNode }) {
  const controlId = id || props.name;
  const helpId = controlId ? `${controlId}-help` : undefined;
  return (
    <label className={`ui-field ${className}`}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <span className={`ui-input-wrap ${error ? "is-error" : ""}`}>
        {leading ? <span className="ui-input-leading">{leading}</span> : null}
        <input id={controlId} className="ui-input" aria-invalid={Boolean(error) || undefined} aria-describedby={(hint || error) ? helpId : undefined} {...props} />
      </span>
      {(hint || error) ? <span id={helpId} className={`ui-field__help ${error ? "is-error" : ""}`}>{error || hint}</span> : null}
    </label>
  );
}
