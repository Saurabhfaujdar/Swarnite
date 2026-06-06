import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore, CartLabel } from '../../lib/cartStore';
import { jsPDF } from 'jspdf';
import bwipjs from 'bwip-js';
import { Download, Printer, ArrowLeft } from 'lucide-react';

// Label dimensions in mm
const LABEL_W = 38;
const LABEL_H = 25;

// Page layout (A4) — margins and grid
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 5;
const MARGIN_Y = 8;
const GAP_X = 2;
const GAP_Y = 2;

const COLS = Math.floor((PAGE_W - 2 * MARGIN_X + GAP_X) / (LABEL_W + GAP_X));
const ROWS = Math.floor((PAGE_H - 2 * MARGIN_Y + GAP_Y) / (LABEL_H + GAP_Y));

function buildBarcodeData(label: CartLabel): string {
  const name = label.itemName.length > 20 ? label.itemName.substring(0, 20) : label.itemName;
  const parts = [
    label.labelNo,
    `${label.grossWeight}g`,
    label.metalType || '',
    label.purityCode || '',
    name,
  ];
  return parts.join('|');
}

async function renderBarcode(text: string): Promise<string> {
  const canvas = document.createElement('canvas');
  bwipjs.toCanvas(canvas, {
    bcid: 'code128',
    text,
    scale: 3,
    height: 8,
    includetext: false,
  });
  return canvas.toDataURL('image/png');
}

async function generatePDF(labels: CartLabel[]): Promise<string> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let col = 0;
  let row = 0;

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && col === 0 && row === 0) {
      doc.addPage();
    }

    const label = labels[i];
    const x = MARGIN_X + col * (LABEL_W + GAP_X);
    const y = MARGIN_Y + row * (LABEL_H + GAP_Y);

    // Draw border (light gray)
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.rect(x, y, LABEL_W, LABEL_H);

    // Barcode
    const barcodeData = buildBarcodeData(label);
    try {
      const barcodeImg = await renderBarcode(barcodeData);
      doc.addImage(barcodeImg, 'PNG', x + 1, y + 1, LABEL_W - 2, 9);
    } catch {
      // If barcode fails (e.g. text too long), draw placeholder
      doc.setFontSize(5);
      doc.text('[barcode error]', x + 2, y + 6);
    }

    // Text area below barcode
    const textY = y + 11;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(label.labelNo, x + 1, textY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);

    // Item name (truncate if too long)
    const name = label.itemName.length > 28 ? label.itemName.substring(0, 27) + '…' : label.itemName;
    doc.text(name, x + 1, textY + 3);

    // Metal + Purity + Weight
    const meta = `${label.metalType || ''}  ${label.purityCode || ''}  ${label.grossWeight}g`;
    doc.text(meta, x + 1, textY + 6);

    // HUID if present
    if (label.huid) {
      doc.setFontSize(4.5);
      doc.text(`HUID: ${label.huid}`, x + 1, textY + 9);
    }

    // Advance to next position
    col++;
    if (col >= COLS) {
      col = 0;
      row++;
      if (row >= ROWS) {
        row = 0;
        // Next page will be added at the top of the loop
      }
    }
  }

  return doc.output('bloburl') as unknown as string;
}

export default function LabelPrint() {
  const navigate = useNavigate();
  const { items } = useCartStore();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (items.length === 0) return;
    setGenerating(true);
    generatePDF(items)
      .then(url => setPdfUrl(url))
      .finally(() => setGenerating(false));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">No labels selected. Go back and add labels to cart first.</p>
        <button onClick={() => navigate('/inventory/labels')}
          className="text-sm text-blue-600 flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Labels
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/labels')}
            className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold">Print Barcode Labels</h1>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {items.length} label{items.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (pdfUrl) {
                const a = document.createElement('a');
                a.href = pdfUrl;
                a.download = `labels-${new Date().toISOString().slice(0, 10)}.pdf`;
                a.click();
              }
            }}
            disabled={!pdfUrl}
            className="px-3 py-1.5 text-xs border rounded flex items-center gap-1 disabled:opacity-50"
          >
            <Download size={12} /> Download PDF
          </button>
          <button
            onClick={() => {
              iframeRef.current?.contentWindow?.print();
            }}
            disabled={!pdfUrl}
            className="px-4 py-1.5 text-xs bg-jewel-gold text-jewel-dark font-semibold rounded flex items-center gap-1 disabled:opacity-50"
          >
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      {/* Label summary table */}
      <div className="bg-white rounded shadow-sm p-3 text-xs max-h-40 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-2 py-1">Label No</th>
              <th className="text-left px-2 py-1">Item</th>
              <th className="text-left px-2 py-1">Metal</th>
              <th className="text-left px-2 py-1">Purity</th>
              <th className="text-right px-2 py-1">Gross (g)</th>
            </tr>
          </thead>
          <tbody>
            {items.map(l => (
              <tr key={l.id} className="border-t">
                <td className="px-2 py-1 font-medium">{l.labelNo}</td>
                <td className="px-2 py-1">{l.itemName}</td>
                <td className="px-2 py-1">{l.metalType}</td>
                <td className="px-2 py-1">{l.purityCode}</td>
                <td className="px-2 py-1 text-right">{l.grossWeight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PDF Preview */}
      <div className="bg-white rounded shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
        {generating && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Generating barcode labels…
          </div>
        )}
        {pdfUrl && (
          <iframe
            ref={iframeRef}
            src={pdfUrl}
            className="w-full h-full border-0"
            title="Label Preview"
          />
        )}
      </div>
    </div>
  );
}
