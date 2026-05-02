// PDF generation utilities using browser print API
// No external libraries required

interface InvoiceLineItem {
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface InvoiceData {
  companyName: string;
  companyAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  lines: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentTerms?: string;
}

interface PackingSlipLineItem {
  productName: string;
  sku: string;
  lotNumber: string | null;
  quantity: number;
}

interface PackingSlipData {
  companyName: string;
  companyAddress: string;
  shipmentNumber: string;
  shipmentDate: string;
  trackingNumber: string | null;
  customerName: string;
  customerAddress: string | null;
  lines: PackingSlipLineItem[];
}

const baseStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1a1a1a;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e5e7eb;
  }
  .company-name {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
  }
  .company-address {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
    white-space: pre-line;
  }
  .doc-info {
    text-align: right;
  }
  .doc-title {
    font-size: 20px;
    font-weight: 700;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .doc-meta {
    font-size: 13px;
    color: #6b7280;
    margin-top: 4px;
  }
  .doc-meta strong { color: #374151; }
  .address-section {
    margin-bottom: 28px;
  }
  .address-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #9ca3af;
    margin-bottom: 6px;
  }
  .address-name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
  }
  .address-detail {
    font-size: 13px;
    color: #4b5563;
    margin-top: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  thead th {
    background: #f9fafb;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid #e5e7eb;
  }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody td {
    padding: 10px 12px;
    font-size: 13px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }
  tbody td.right { text-align: right; }
  tbody td.center { text-align: center; }
  tbody td.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
  .totals {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 32px;
  }
  .totals-table {
    width: 260px;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
    color: #4b5563;
  }
  .totals-row.total {
    border-top: 2px solid #e5e7eb;
    margin-top: 4px;
    padding-top: 10px;
    font-size: 16px;
    font-weight: 700;
    color: #111827;
  }
  .footer {
    text-align: center;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: #9ca3af;
  }
  .checkbox {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #d1d5db;
    border-radius: 3px;
    vertical-align: middle;
  }
  @media print {
    body { padding: 20px; }
    @page { margin: 0.5in; }
  }
`;

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function openPrintWindow(html: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to print documents.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  // Wait for content to render before triggering print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

export function generateInvoicePDF(data: InvoiceData): void {
  const linesHtml = data.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.productName)}</td>
        <td class="mono">${escapeHtml(line.sku)}</td>
        <td class="center">${line.quantity}</td>
        <td class="right">${formatMoney(line.unitPrice)}</td>
        <td class="right">${formatMoney(line.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(data.companyName)}</div>
      <div class="company-address">${escapeHtml(data.companyAddress)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Invoice</div>
      <div class="doc-meta">
        <strong>#</strong> ${escapeHtml(data.invoiceNumber)}<br>
        <strong>Date:</strong> ${escapeHtml(data.invoiceDate)}
      </div>
    </div>
  </div>

  <div class="address-section">
    <div class="address-label">Bill To</div>
    <div class="address-name">${escapeHtml(data.customerName)}</div>
    ${data.customerEmail ? `<div class="address-detail">${escapeHtml(data.customerEmail)}</div>` : ''}
    ${data.customerPhone ? `<div class="address-detail">${escapeHtml(data.customerPhone)}</div>` : ''}
    ${data.customerAddress ? `<div class="address-detail">${escapeHtml(data.customerAddress)}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>SKU</th>
        <th class="center">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-table">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatMoney(data.subtotal)}</span>
      </div>
      ${data.tax > 0 ? `<div class="totals-row"><span>Tax</span><span>${formatMoney(data.tax)}</span></div>` : ''}
      <div class="totals-row total">
        <span>Total</span>
        <span>${formatMoney(data.total)}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    Thank you for your business!${data.paymentTerms ? `<br><strong>Payment Terms:</strong> ${escapeHtml(data.paymentTerms)}` : ''}
  </div>
</body>
</html>`;

  openPrintWindow(html);
}

export function generatePackingSlipPDF(data: PackingSlipData): void {
  const linesHtml = data.lines
    .map(
      (line) => `
      <tr>
        <td class="center"><span class="checkbox"></span></td>
        <td>${escapeHtml(line.productName)}</td>
        <td class="mono">${escapeHtml(line.sku)}</td>
        <td class="mono">${line.lotNumber ? escapeHtml(line.lotNumber) : '—'}</td>
        <td class="center">${line.quantity}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Packing Slip ${escapeHtml(data.shipmentNumber)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(data.companyName)}</div>
      <div class="company-address">${escapeHtml(data.companyAddress)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Packing Slip</div>
      <div class="doc-meta">
        <strong>#</strong> ${escapeHtml(data.shipmentNumber)}<br>
        <strong>Date:</strong> ${escapeHtml(data.shipmentDate)}
        ${data.trackingNumber ? `<br><strong>Tracking:</strong> ${escapeHtml(data.trackingNumber)}` : ''}
      </div>
    </div>
  </div>

  <div class="address-section">
    <div class="address-label">Ship To</div>
    <div class="address-name">${escapeHtml(data.customerName)}</div>
    ${data.customerAddress ? `<div class="address-detail">${escapeHtml(data.customerAddress)}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width:50px;">&#10003;</th>
        <th>Product</th>
        <th>SKU</th>
        <th>Lot #</th>
        <th class="center">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <div class="footer">
    Please inspect all items upon receipt.<br>
    If there are any discrepancies, contact us within 48 hours.
  </div>
</body>
</html>`;

  openPrintWindow(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
