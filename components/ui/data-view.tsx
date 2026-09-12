import type { Key, ReactNode } from "react";
export type DataColumn<Row> = { key: string; label: string; render: (row: Row) => ReactNode; priority?: "primary" | "secondary" };
export function DataList({ children, label }: { children: ReactNode; label: string }) { return <div className="ui-data-list" role="list" aria-label={label}>{children}</div>; }
export function DataListItem({ children }: { children: ReactNode }) { return <div className="ui-data-list__item" role="listitem">{children}</div>; }
export function DataTable<Row>({ caption, rows, columns, rowKey, empty }: { caption: string; rows: readonly Row[]; columns: readonly DataColumn<Row>[]; rowKey: (row: Row) => Key; empty?: ReactNode }) {
  if (!rows.length) return <>{empty ?? null}</>;
  return <div className="ui-data-view">
    <div className="ui-data-table-wrap"><table className="ui-data-table"><caption>{caption}</caption><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
    <div className="ui-data-cards" role="list" aria-label={caption}>{rows.map(row => <article className="ui-data-card" role="listitem" key={rowKey(row)}>{columns.map(column => <div className={column.priority === "primary" ? "is-primary" : ""} key={column.key}><span>{column.label}</span><div>{column.render(row)}</div></div>)}</article>)}</div>
  </div>;
}

