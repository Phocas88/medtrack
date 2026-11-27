import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { escapeHtml } from './html';

export interface LotLabelData {
  productName: string;
  sku: string;
  lotNumber: string;
  expirationDate: string | null;
  location: string | null;
}

export function generateBarcodeSVG(
  value: string,
  options?: { format?: string; width?: number; height?: number; barsOnly?: boolean }
): string {
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svgElement, value, {
    format: options?.format || 'CODE128',
    width: options?.width || 2,
    height: options?.height || 40,
    displayValue: !options?.barsOnly,
    fontSize: 12,
    margin: options?.barsOnly ? 10 : 5,
  });
  if (options?.barsOnly) {
    svgElement.setAttribute('preserveAspectRatio', 'none');
    svgElement.setAttribute('role', 'img');
    svgElement.setAttribute('aria-label', 'Code 128 lot barcode');
  }
  return svgElement.outerHTML;
}

export async function generateQRCodeDataURL(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    width: 150,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

export function buildLotLabelContent(data: LotLabelData): string {
  const parts = [
    `SKU:${data.sku}`,
    `LOT:${data.lotNumber}`,
  ];
  if (data.expirationDate) {
    parts.push(`EXP:${data.expirationDate}`);
  }
  return parts.join('|');
}

export function printLotLabel(data: LotLabelData) {
  const barcode = generateBarcodeSVG(buildLotLabelContent(data), { width: 1, barsOnly: true });
  const fields = [
    ['SKU', data.sku],
    ['LOT', data.lotNumber],
    ['EXP', data.expirationDate],
    ['BIN', data.location],
  ];
  const details = fields.map(([name, value]) =>
    value ? `<div><strong>${name}:</strong> ${escapeHtml(value)}</div>` : '',
  ).join('');

  const printWindow = window.open('', '_blank', 'width=540,height=420');
  if (!printWindow) return false;

  printWindow.document.write(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Lot label</title>
      <style>
        @page { size: 4in 2in; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 0; color: #000; background: #fff; }
        .label { width: 4in; max-width: 100%; min-height: 2in; padding: .12in .15in; }
        h1 { margin: 0 0 .06in; font-size: 13pt; line-height: 1.15; overflow-wrap: anywhere; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: .04in .1in; font-size: 10pt; overflow-wrap: anywhere; }
        .barcode { margin-top: .08in; }
        .barcode svg { display: block; width: 100%; height: .58in; }
        .controls { padding: 12px; }
        @media screen { .label { border: 1px solid #aaa; } }
        @media print { .controls { display: none; } .label { break-inside: avoid; } }
      </style>
    </head>
    <body>
      <main class="label">
        <h1>${escapeHtml(data.productName)}</h1>
        <div class="details">${details}</div>
        <div class="barcode">${barcode}</div>
      </main>
      <div class="controls"><button type="button" id="print-label">Print label</button></div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.document.getElementById('print-label')?.addEventListener('click', () => printWindow.print());
  printWindow.requestAnimationFrame(() => {
    printWindow.focus();
    printWindow.print();
  });
  return true;
}
