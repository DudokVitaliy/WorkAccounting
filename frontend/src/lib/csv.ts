export function csv(rows: object[], name: string) {
  if (!rows.length)
    return; const columns = Object.keys(rows[0]); const data = [columns.join(';'), ...rows.map(r => columns.map(c => '"' + String((r as Record<string, unknown>)[c] ?? '').replaceAll('"', '""') + '"').join(';'))].join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + data], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
