// Shared validation for CSV and XLSX imports. Preview and commit use the same parser.
export const COLUMNS = {
  name: ['ime', 'ime in priimek', 'name'],
  email: ['email', 'e-pošta', 'e-posta', 'eposta', 'mail'],
  role: ['vloga', 'role', 'delovno mesto'],
  department: ['oddelek', 'department'],
  language: ['jezik', 'language'],
};

export function csvRows(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const first = source.split(/\r?\n/)[0];
  const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === sep || c === '\n')) {
      row.push(cell.trim()); cell = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (c !== '\r' || quoted) cell += c;
  }
  if (quoted) throw new Error('CSV vsebuje nezaključen narekovaj.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function previewImport(rows, mapping, existing = []) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 5001) throw new Error('Datoteka mora imeti glavo in od 1 do 5000 vrstic.');
  const headers = rows[0].map(String);
  const columns = mapping || Object.fromEntries(Object.entries(COLUMNS).map(([k, aliases]) => [k, headers.findIndex(h => aliases.includes(h.trim().toLowerCase()))]));
  const required = ['name', 'email', 'role', 'department'];
  const valid = k => Number.isInteger(columns[k]) && columns[k] >= 0 && columns[k] < headers.length;
  const missing = required.filter(k => !valid(k));
  const mapped = Object.keys(COLUMNS).filter(valid).map(k => columns[k]);
  const errors = missing.length ? [`Preslikajte obvezna polja: ${missing.map(k => COLUMNS[k][0]).join(', ')}.`] : [];
  if (new Set(mapped).size !== mapped.length) errors.push('Vsako polje mora biti povezano z drugim stolpcem.');
  const seen = new Set();
  const parsed = errors.length ? [] : rows.slice(1).map((cells, i) => {
    const record = Object.fromEntries(Object.keys(COLUMNS).map(k => [k, valid(k) ? String(cells[columns[k]] ?? '').trim() : '']));
    record.email = record.email.toLowerCase();
    record.language ||= 'sl';
    let problem = !record.name || !record.role || !record.department || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email) ? 'Manjka obvezen podatek ali e-naslov ni veljaven.' : null;
    if (!problem && seen.has(record.email)) problem = 'Podvojen e-naslov v datoteki; vrstica bo preskočena.';
    if (!problem) seen.add(record.email);
    return { row: i + 2, record, status: problem ? 'invalid' : existing.some(u => u.email.toLowerCase() === record.email) ? 'update' : 'new', problem };
  });
  return { headers, mapping: columns, errors, rows: parsed, added: parsed.filter(r => r.status === 'new').length, updated: parsed.filter(r => r.status === 'update').length, invalid: parsed.filter(r => r.status === 'invalid').length };
}
