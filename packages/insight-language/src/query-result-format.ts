import type { QueryCell, QueryTableResult } from "./query-engine.js";

export function formatQueryTableCsv(result: QueryTableResult): string {
  const rows = [
    result.columns.map((column) => csvField(column.name)),
    ...result.rows.map((row) => row.map((cell) => csvField(queryCellText(cell)))),
  ];
  return `${rows.map((row) => row.join(",")).join("\r\n")}\r\n`;
}

export function formatQueryTableText(result: QueryTableResult): string {
  const rows = [
    result.columns.map((column) => column.name),
    ...result.rows.map((row) => row.map(queryCellText)),
  ];
  const widths = result.columns.map((_, index) => Math.max(...rows.map((row) => row[index]?.length ?? 0)));
  const line = (row: readonly string[]): string => row.map((value, index) => value.padEnd(widths[index] ?? 0)).join("  ").trimEnd();
  if (result.rows.length === 0) return `${line(rows[0] ?? [])}\n0 rows\n`;
  return `${line(rows[0] ?? [])}\n${widths.map((width) => "-".repeat(width)).join("  ")}\n${rows.slice(1).map(line).join("\n")}\n${result.rows.length} rows\n`;
}

export function queryCellText(cell: QueryCell): string {
  if (cell === null) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  return JSON.stringify(cell);
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
