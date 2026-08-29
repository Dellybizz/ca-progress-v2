export function Progress({ value, max = 100, label, showValue = false, size = "md" }: { value: number; max?: number; label?: string; showValue?: boolean; size?: "sm" | "md" | "lg" }) {
  const safe = Math.max(0, Math.min(value, max));
  const percent = max > 0 ? Math.round((safe / max) * 100) : 0;
  return (
    <div className="ui-progress-group">
      {(label || showValue) ? <div className="ui-progress-meta"><span>{label}</span>{showValue ? <strong>{percent}%</strong> : null}</div> : null}
      <div className={`ui-progress ui-progress--${size}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={safe} aria-label={label || "Progress"}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
