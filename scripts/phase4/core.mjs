import { createHash } from "node:crypto";

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stableValue(v)]));
  return value;
}
export function stableStringify(value) { return JSON.stringify(stableValue(value)); }
export function sha256(value) {
  const hash=createHash("sha256");
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) hash.update(value);
  else hash.update(typeof value === "string" ? value : stableStringify(value));
  return hash.digest("hex");
}
export function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value) || typeof value === "object") return stableStringify(value);
  return value;
}
export function normalizeRow(row) { return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,normalizeValue(value)])); }
export function rowKey(row, pk) { return pk.map((key)=>`${key}=${String(row[key])}`).join("|"); }
export function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}
export function buildUpsert(table,row,pk) {
  const columns = Object.keys(row);
  if (!columns.length) throw new Error(`Cannot upsert empty row into ${table}`);
  const names = columns.map(quoteIdentifier).join(",");
  const placeholders = columns.map((_,index)=>`?${index+1}`).join(",");
  const updates = columns.filter((column)=>!pk.includes(column)).map((column)=>`${quoteIdentifier(column)}=excluded.${quoteIdentifier(column)}`).join(",");
  const conflict = pk.map(quoteIdentifier).join(",");
  const tail = updates ? ` DO UPDATE SET ${updates}` : " DO NOTHING";
  return { sql:`INSERT INTO ${quoteIdentifier(table)}(${names}) VALUES(${placeholders}) ON CONFLICT(${conflict})${tail}`, params:columns.map((column)=>row[column]) };
}
export function hashRows(rows,pk) {
  const sorted=[...rows].sort((a,b)=>rowKey(a,pk).localeCompare(rowKey(b,pk)));
  return sha256(sorted.map((row)=>stableStringify(row)).join("\n"));
}
export function splitSqlStatements(sql) {
  const output=[]; let current=""; let single=false; let double=false; let lineComment=false; let blockComment=false;
  for(let i=0;i<sql.length;i++){
    const ch=sql[i], next=sql[i+1];
    if(lineComment){ current+=ch; if(ch==="\n") lineComment=false; continue; }
    if(blockComment){ current+=ch; if(ch==="*"&&next==="/"){ current+=next; i++; blockComment=false; } continue; }
    if(!single&&!double&&ch==="-"&&next==="-"){ current+=ch+next; i++; lineComment=true; continue; }
    if(!single&&!double&&ch==="/"&&next==="*"){ current+=ch+next; i++; blockComment=true; continue; }
    if(ch==="'"&&!double){ current+=ch; if(single&&next==="'"){ current+=next; i++; } else single=!single; continue; }
    if(ch==='"'&&!single){ current+=ch; double=!double; continue; }
    if(ch===';'&&!single&&!double){ if(current.trim()) output.push(current.trim()); current=""; continue; }
    current+=ch;
  }
  if(current.trim()) output.push(current.trim());
  return output;
}
export function selectTargetColumns(sourceRow,targetColumns,table) {
  const allowed=new Set(targetColumns); const unknown=Object.keys(sourceRow).filter((key)=>!allowed.has(key));
  if(unknown.length) throw new Error(`${table} has source columns missing from D1: ${unknown.join(",")}`);
  return Object.fromEntries(Object.entries(sourceRow).filter(([key])=>allowed.has(key)));
}
