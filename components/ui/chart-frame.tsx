import type { ReactNode } from "react";

export function ChartFrame({ title, summary, children, dataTable }: { title: string; summary: string; children: ReactNode; dataTable?: ReactNode }) {
  return <figure className="ui-chart-frame" aria-labelledby={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`}><header><h2 id={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`}>{title}</h2><p>{summary}</p></header><div aria-hidden={Boolean(dataTable)}>{children}</div>{dataTable ? <details className="ui-accordion"><summary>View chart data</summary><div className="ui-accordion__body">{dataTable}</div></details> : null}</figure>;
}
