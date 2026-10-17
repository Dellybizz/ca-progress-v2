// Wrangler's splitter recognises compound SQL keywords only at whitespace
// boundaries. Preserve strings/comments and add insignificant keyword spacing.
export function d1TransportSql(sql){return String(sql).replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|\b(?:CASE|END|BEGIN)\b/gi,token=>/^(CASE|END|BEGIN)$/i.test(token)?' '+token+' ':token);}
