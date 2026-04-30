import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export interface LotLabelData {
  productName: string;
  sku: string;
  lotNumber: string;
  expirationDate: string | null;
  location: string | null;
}

export function generateBarcodeSVG(
  value: string,
  options?: { format?: string; width?: number; height?: number }
): string {
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svgElement, value, {
    format: options?.format || 'CODE128',
    width: options?.width || 2,
    height: options?.height || 40,
    displayValue: true,
    fontSize: 12,
    margin: 5,
  });
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

export function printLabel(htmlContent: string) {
  const printWindow = window.open('', '_blank', 'width=400,height=300');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lot Label</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
        .label { text-align: center; border: 1px dashed #ccc; padding: 10px; max-width: 300px; margin: auto; }
        .product-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
        .detail { font-size: 11px; margin: 2px 0; }
        .barcode { margin: 8px 0; }
        @media print { .label { border: none; } }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>window.onload = function() { window.print(); window.close(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
