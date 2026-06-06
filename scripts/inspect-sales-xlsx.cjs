const XLSX = require('xlsx');
const path = process.argv[2];
const wb = XLSX.readFile(path);
for (const n of wb.SheetNames) {
  console.log('=== Sheet:', n);
  const ws = wb.Sheets[n];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  console.log('rows:', rows.length);
  rows.slice(0, 60).forEach((r, i) => console.log(i, JSON.stringify(r)));
}
