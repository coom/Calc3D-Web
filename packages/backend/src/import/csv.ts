export interface CsvRow { line: number; cells: string[] }
export interface CsvResult { header: string[]; rows: CsvRow[]; errors: { line: number; reason: string }[] }

/** Parseur strict du format Export-Csv de PowerShell (RFC 4180) : en-tête obligatoire, guillemets doublés, CRLF ou LF, BOM toléré. */
export function parseCsv(text: string): CsvResult {
  const src = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = []; let cell = ''; let quoted = false; let line = 1; let recordLine = 1; let i = 0;
  const endCell = () => { cells.push(cell); cell = ''; };
  const endRecord = () => { endCell(); if (cells.length > 1 || cells[0] !== '') records.push({ line: recordLine, cells }); cells = []; recordLine = line; };
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i++; continue; }
      if (c === '\n') line++;
      cell += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { endCell(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { line++; endRecord(); i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || cells.length > 0) { endRecord(); }
  if (records.length === 0) return { header: [], rows: [], errors: [{ line: 1, reason: 'empty file' }] };
  const header = records[0].cells.map((h) => h.trim());
  const rows: CsvRow[] = []; const errors: { line: number; reason: string }[] = [];
  for (const r of records.slice(1)) {
    if (r.cells.length !== header.length) errors.push({ line: r.line, reason: `expected ${header.length} columns, got ${r.cells.length}` });
    else rows.push(r);
  }
  return { header, rows, errors };
}
