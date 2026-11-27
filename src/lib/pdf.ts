import { BRAND_COLOR, BRAND_PALETTE, PRODUCT_NAME } from '@/lib/brand';

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
    color: ${BRAND_COLOR};
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
    color: ${BRAND_PALETTE.mutedGray};
    margin-bottom: 6px;
  }
  .address-name {
    font-size: 15px;
    font-weight: 600;
    color: ${BRAND_COLOR};
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
    color: ${BRAND_COLOR};
  }
  .footer {
    text-align: center;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: ${BRAND_PALETTE.mutedGray};
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
  const footer = `<footer class="print-platform" style="margin-top:24px;border-top:1px solid ${BRAND_PALETTE.borderGray};padding-top:8px;color:${BRAND_COLOR};font-size:11px">${PRODUCT_NAME}</footer>`;
  printWindow.document.write(html.replace('</body>', footer + '</body>'));
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

// ============================================================
// PURCHASE ORDER PDF
// ============================================================

interface POLineItem {
  productName: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseOrderData {
  companyName: string;
  companyAddress: string;
  poNumber: string;
  poDate: string;
  expectedDate: string | null;
  status: string;
  supplierName: string;
  supplierContact: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  supplierAddress: string | null;
  deliverToLocation: string | null;
  lines: POLineItem[];
  subtotal: number;
  notes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedDate: string | null;
}

export function generatePurchaseOrderPDF(data: PurchaseOrderData): void {
  const linesHtml = data.lines
    .map(
      (line, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(line.productName)}</td>
        <td class="mono">${escapeHtml(line.sku)}</td>
        <td class="center">${line.quantityOrdered}</td>
        <td class="right">${formatMoney(line.unitCost)}</td>
        <td class="right">${formatMoney(line.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const statusColor = {
    draft: '#6b7280',
    pending_approval: '#d97706',
    approved: '#059669',
    sent: '#2563eb',
    partial: '#d97706',
    received: '#059669',
    cancelled: '#dc2626',
  }[data.status] || '#6b7280';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Purchase Order ${escapeHtml(data.poNumber)}</title>
  <style>
    ${baseStyles}
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: white;
      background: ${statusColor};
    }
    .two-col {
      display: flex;
      gap: 40px;
      margin-bottom: 28px;
    }
    .two-col > div { flex: 1; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 24px;
      margin-bottom: 24px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .info-item label {
      display: block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: ${BRAND_PALETTE.mutedGray};
      margin-bottom: 2px;
    }
    .info-item span {
      font-size: 13px;
      color: ${BRAND_COLOR};
      font-weight: 500;
    }
    .notes-section {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
    }
    .notes-section .notes-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #92400e;
      margin-bottom: 4px;
    }
    .notes-section .notes-text {
      font-size: 13px;
      color: #78350f;
      white-space: pre-line;
    }
    .signatures {
      display: flex;
      gap: 60px;
      margin-top: 48px;
      padding-top: 24px;
    }
    .sig-block {
      flex: 1;
    }
    .sig-line {
      border-top: 1px solid #d1d5db;
      padding-top: 8px;
      margin-top: 40px;
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(data.companyName)}</div>
      <div class="company-address">${escapeHtml(data.companyAddress)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Purchase Order</div>
      <div class="doc-meta">
        <strong>#</strong> ${escapeHtml(data.poNumber)}<br>
        <span class="status-badge">${escapeHtml(data.status.replace('_', ' '))}</span>
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <label>Order Date</label>
      <span>${escapeHtml(data.poDate)}</span>
    </div>
    <div class="info-item">
      <label>Expected Delivery</label>
      <span>${data.expectedDate ? escapeHtml(data.expectedDate) : 'TBD'}</span>
    </div>
    <div class="info-item">
      <label>Created By</label>
      <span>${data.createdBy ? escapeHtml(data.createdBy) : '—'}</span>
    </div>
    <div class="info-item">
      <label>Deliver To</label>
      <span>${data.deliverToLocation ? escapeHtml(data.deliverToLocation) : '—'}</span>
    </div>
    ${data.approvedBy ? `
    <div class="info-item">
      <label>Approved By</label>
      <span>${escapeHtml(data.approvedBy)}</span>
    </div>
    <div class="info-item">
      <label>Approved Date</label>
      <span>${data.approvedDate ? escapeHtml(data.approvedDate) : '—'}</span>
    </div>
    ` : ''}
  </div>

  <div class="two-col">
    <div>
      <div class="address-label">Order From (Supplier)</div>
      <div class="address-name">${escapeHtml(data.supplierName)}</div>
      ${data.supplierContact ? `<div class="address-detail">${escapeHtml(data.supplierContact)}</div>` : ''}
      ${data.supplierEmail ? `<div class="address-detail">${escapeHtml(data.supplierEmail)}</div>` : ''}
      ${data.supplierPhone ? `<div class="address-detail">${escapeHtml(data.supplierPhone)}</div>` : ''}
      ${data.supplierAddress ? `<div class="address-detail">${escapeHtml(data.supplierAddress)}</div>` : ''}
    </div>
    <div>
      <div class="address-label">Ship To</div>
      <div class="address-name">${escapeHtml(data.companyName)}</div>
      <div class="address-detail">${escapeHtml(data.companyAddress)}</div>
      ${data.deliverToLocation ? `<div class="address-detail"><strong>Location:</strong> ${escapeHtml(data.deliverToLocation)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width:40px;">#</th>
        <th>Product</th>
        <th>SKU</th>
        <th class="center">Qty</th>
        <th class="right">Unit Cost</th>
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
        <span>Total Items</span>
        <span>${data.lines.reduce((s, l) => s + l.quantityOrdered, 0)}</span>
      </div>
      <div class="totals-row total">
        <span>Order Total</span>
        <span>${formatMoney(data.subtotal)}</span>
      </div>
    </div>
  </div>

  ${data.notes ? `
  <div class="notes-section">
    <div class="notes-label">Notes / Special Instructions</div>
    <div class="notes-text">${escapeHtml(data.notes)}</div>
  </div>
  ` : ''}

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line">Authorized Signature / Date</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">Supplier Acknowledgment / Date</div>
    </div>
  </div>

  <div class="footer" style="margin-top:32px;">
    This Purchase Order is subject to the terms and conditions of the buyer.<br>
    Please confirm receipt and expected delivery date.
  </div>
</body>
</html>`;

  openPrintWindow(html);
}

// ============================================================
// RECEIVING DOCUMENT PDF
// ============================================================

interface ReceivingLineItem {
  productName: string;
  sku: string;
  lotNumber: string;
  expirationDate: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  quantityThisReceipt: number;
  unitCost: number;
  condition: string;
}

interface ReceivingDocumentData {
  companyName: string;
  companyAddress: string;
  poNumber: string;
  receivingNumber: string;
  receivingDate: string;
  receivingLocation: string;
  supplierName: string;
  supplierContact: string | null;
  receivedBy: string;
  lines: ReceivingLineItem[];
  totalItemsReceived: number;
  totalValue: number;
  notes: string | null;
  putAwayTasksGenerated: number;
}

export function generateReceivingDocumentPDF(data: ReceivingDocumentData): void {
  const linesHtml = data.lines
    .map(
      (line, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(line.productName)}</td>
        <td class="mono">${escapeHtml(line.sku)}</td>
        <td class="mono">${escapeHtml(line.lotNumber)}</td>
        <td class="center">${line.expirationDate ? escapeHtml(line.expirationDate) : '—'}</td>
        <td class="center">${line.quantityOrdered}</td>
        <td class="center" style="font-weight:600;">${line.quantityThisReceipt}</td>
        <td class="right">${formatMoney(line.unitCost)}</td>
        <td class="right">${formatMoney(line.quantityThisReceipt * line.unitCost)}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receiving Document ${escapeHtml(data.receivingNumber)}</title>
  <style>
    ${baseStyles}
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px 24px;
      margin-bottom: 24px;
      padding: 16px;
      background: #f0fdf4;
      border-radius: 8px;
      border: 1px solid #bbf7d0;
    }
    .info-item label {
      display: block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 2px;
    }
    .info-item span {
      font-size: 13px;
      color: ${BRAND_COLOR};
      font-weight: 500;
    }
    .highlight-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .highlight-stat {
      text-align: center;
    }
    .highlight-stat .value {
      font-size: 24px;
      font-weight: 700;
      color: #1e40af;
    }
    .highlight-stat .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #3b82f6;
      font-weight: 600;
    }
    .condition-ok { color: #059669; font-weight: 600; }
    .condition-damaged { color: #dc2626; font-weight: 600; }
    .notes-section {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
    }
    .notes-section .notes-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #92400e;
      margin-bottom: 4px;
    }
    .notes-section .notes-text {
      font-size: 13px;
      color: #78350f;
      white-space: pre-line;
    }
    .signatures {
      display: flex;
      gap: 40px;
      margin-top: 40px;
    }
    .sig-block { flex: 1; }
    .sig-line {
      border-top: 1px solid #d1d5db;
      padding-top: 8px;
      margin-top: 40px;
      font-size: 11px;
      color: #6b7280;
    }
    table { font-size: 12px; }
    thead th { font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(data.companyName)}</div>
      <div class="company-address">${escapeHtml(data.companyAddress)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Receiving Report</div>
      <div class="doc-meta">
        <strong>Receipt #:</strong> ${escapeHtml(data.receivingNumber)}<br>
        <strong>PO:</strong> ${escapeHtml(data.poNumber)}
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <label>Date Received</label>
      <span>${escapeHtml(data.receivingDate)}</span>
    </div>
    <div class="info-item">
      <label>Supplier</label>
      <span>${escapeHtml(data.supplierName)}</span>
    </div>
    <div class="info-item">
      <label>Supplier Contact</label>
      <span>${data.supplierContact ? escapeHtml(data.supplierContact) : '—'}</span>
    </div>
    <div class="info-item">
      <label>Received By</label>
      <span>${escapeHtml(data.receivedBy)}</span>
    </div>
    <div class="info-item">
      <label>Receiving Location</label>
      <span>${escapeHtml(data.receivingLocation)}</span>
    </div>
    <div class="info-item">
      <label>Put-Away Tasks</label>
      <span>${data.putAwayTasksGenerated} tasks generated</span>
    </div>
  </div>

  <div class="highlight-box">
    <div class="highlight-stat">
      <div class="value">${data.lines.length}</div>
      <div class="label">Line Items</div>
    </div>
    <div class="highlight-stat">
      <div class="value">${data.totalItemsReceived}</div>
      <div class="label">Units Received</div>
    </div>
    <div class="highlight-stat">
      <div class="value">${formatMoney(data.totalValue)}</div>
      <div class="label">Total Value</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width:30px;">#</th>
        <th>Product</th>
        <th>SKU</th>
        <th>Lot #</th>
        <th class="center">Expires</th>
        <th class="center">Ordered</th>
        <th class="center">Received</th>
        <th class="right">Unit Cost</th>
        <th class="right">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-table">
      <div class="totals-row">
        <span>Total Units</span>
        <span>${data.totalItemsReceived}</span>
      </div>
      <div class="totals-row total">
        <span>Total Value</span>
        <span>${formatMoney(data.totalValue)}</span>
      </div>
    </div>
  </div>

  ${data.notes ? `
  <div class="notes-section">
    <div class="notes-label">Receiving Notes</div>
    <div class="notes-text">${escapeHtml(data.notes)}</div>
  </div>
  ` : ''}

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line">Receiver Signature / Date</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">Warehouse Manager / Date</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">Quality Check / Date</div>
    </div>
  </div>

  <div class="footer" style="margin-top:24px;">
    Items received to staging area pending put-away.<br>
    All discrepancies must be reported within 24 hours.
  </div>
</body>
</html>`;

  openPrintWindow(html);
}

// ── Work Order Invoice ──

interface WorkOrderInvoiceData {
  companyName: string;
  companyAddress: string;
  orderNumber: string;
  date: string;
  customerName: string;
  assetInfo: string | null;
  lines: { description: string; lineType: string; quantity: number; unitPrice: number; lineTotal: number }[];
  partsTotal: number;
  laborTotal: number;
  tax: number;
  grandTotal: number;
  technicianName: string | null;
  notes: string | null;
}

export function generateWorkOrderInvoicePDF(data: WorkOrderInvoiceData): void {
  const linesHtml = data.lines.map((l) => `
    <tr>
      <td><span class="badge ${l.lineType === 'service' ? 'badge-labor' : 'badge-part'}">${l.lineType === 'service' ? 'Labor' : 'Part'}</span></td>
      <td>${escapeHtml(l.description)}</td>
      <td class="center">${l.quantity}</td>
      <td class="right">${formatMoney(l.unitPrice)}</td>
      <td class="right">${formatMoney(l.lineTotal)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Work Order Invoice ${escapeHtml(data.orderNumber)}</title>
  <style>
    ${baseStyles}
    .badge { padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .badge-labor { background: #dbeafe; color: #1e40af; }
    .badge-part { background: #f0fdf4; color: #166534; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; font-size: 13px; }
    .info-grid dt { color: #6b7280; }
    .info-grid dd { font-weight: 600; margin: 0; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(data.companyName)}</div>
      <div class="company-address">${escapeHtml(data.companyAddress)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Work Order Invoice</div>
      <div class="doc-meta">
        <strong>#</strong> ${escapeHtml(data.orderNumber)}<br>
        <strong>Date:</strong> ${escapeHtml(data.date)}
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div><dt>Customer</dt><dd>${escapeHtml(data.customerName)}</dd></div>
    ${data.assetInfo ? `<div><dt>Vehicle / Asset</dt><dd>${escapeHtml(data.assetInfo)}</dd></div>` : ''}
    ${data.technicianName ? `<div><dt>Technician</dt><dd>${escapeHtml(data.technicianName)}</dd></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:60px">Type</th>
        <th>Description</th>
        <th class="center">Qty</th>
        <th class="right">Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div class="totals-table">
      <div class="totals-row"><span>Parts</span><span>${formatMoney(data.partsTotal)}</span></div>
      <div class="totals-row"><span>Labor</span><span>${formatMoney(data.laborTotal)}</span></div>
      ${data.tax > 0 ? `<div class="totals-row"><span>Tax</span><span>${formatMoney(data.tax)}</span></div>` : ''}
      <div class="totals-row total"><span>Total Due</span><span>${formatMoney(data.grandTotal)}</span></div>
    </div>
  </div>

  ${data.notes ? `<div style="margin-top:16px;padding:10px;background:#f9fafb;border-radius:6px;font-size:13px;color:#4b5563"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>` : ''}

  <div class="footer">Thank you for your business!</div>
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
