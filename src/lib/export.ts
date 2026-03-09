import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportFormat = 'xlsx' | 'xls' | 'pdf' | 'csv' | 'html' | 'txt';

interface ExportOptions {
  filename: string;
  title?: string;
  headers: string[];
  data: any[][];
  format: ExportFormat;
}

export function exportData({ filename, title, headers, data, format }: ExportOptions) {
  switch (format) {
    case 'xlsx':
    case 'xls':
      _exportToExcel({ filename, title, headers, data, format });
      break;
    case 'pdf':
      _exportToPDF({ filename, title, headers, data, format });
      break;
    case 'csv':
      exportToCSV({ filename, headers, data });
      break;
    case 'html':
      exportToHTML({ filename, title, headers, data, format });
      break;
    case 'txt':
      exportToText({ filename, headers, data });
      break;
  }
}

function _exportToExcel({ filename, title, headers, data }: ExportOptions) {
  const wsData = title ? [[title], [], headers, ...data] : [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function _exportToPDF({ filename, title, headers, data }: ExportOptions) {
  const doc = new jsPDF('landscape');

  if (title) {
    doc.setFontSize(16);
    doc.text(title, 14, 15);
  }

  autoTable(doc, {
    head: [headers],
    body: data,
    startY: title ? 25 : 10,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 98, 255] },
  });

  doc.save(`${filename}.pdf`);
}

function exportToCSV({ filename, headers, data }: { filename: string; headers: string[]; data: any[][] }) {
  const csvContent = [headers, ...data]
    .map((row) => row.map((cell: any) => `"${cell}"`).join(','))
    .join('\n');

  downloadFile(`${filename}.csv`, csvContent, 'text/csv');
}

function exportToHTML({ filename, title, headers, data }: ExportOptions) {
  let html = `<!DOCTYPE html><html><head><title>${title || filename}</title>
    <style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;text-align:left}
    th{background-color:#4472C4;color:white}tr:nth-child(even){background-color:#f2f2f2}
    h2{font-family:Arial;color:#333}</style></head><body>`;

  if (title) html += `<h2>${title}</h2>`;
  html += '<table><thead><tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  html += data.map((row) => '<tr>' + row.map((cell: any) => `<td>${cell}</td>`).join('') + '</tr>').join('');
  html += '</tbody></table></body></html>';

  downloadFile(`${filename}.html`, html, 'text/html');
}

function exportToText({ filename, headers, data }: { filename: string; headers: string[]; data: any[][] }) {
  const text = [headers.join('\t'), ...data.map((row) => row.join('\t'))].join('\n');
  downloadFile(`${filename}.txt`, text, 'text/plain');
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8;` });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Simple helper exports for direct use in pages
export function exportToExcel(rows: Record<string, any>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(title: string, headers: string[], data: any[][], filename: string) {
  const doc = new jsPDF('landscape');
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  autoTable(doc, {
    head: [headers],
    body: data,
    startY: 25,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 98, 255] },
  });
  doc.save(`${filename}.pdf`);
}
