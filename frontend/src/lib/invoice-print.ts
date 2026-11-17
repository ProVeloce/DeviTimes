import type { Invoice, ShopSettings } from '@/types';
import { formatCurrency, formatDateTime } from './utils';
import { resolveReceiptLogoSrc } from './brand-logo';
import invoiceTemplate from '../../../invoice.html?raw';
import headerImageUrl from '../../../assets/billing-image-header.avif';
import logoImageUrl from '../../../assets/dtc-logo.png';
import stampImageUrl from '../../../assets/stamp.png';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : parseFloat(String(v)) || 0;
}

export function buildLegacyInvoiceHtml(invoice: Invoice, settings: ShopSettings): string {
  const symbol = settings.currencySymbol || '₹';
  const items = invoice.items ?? [];
  const logoUrl = resolveReceiptLogoSrc(settings.logoUrl);
  const customer = invoice.customer;
  const contactDetails = [
    settings.phone?.trim() && `Phone: ${settings.phone}`,
    settings.email?.trim() && settings.email,
    settings.gstin?.trim() && `GSTIN: ${settings.gstin}`,
  ]
    .filter(Boolean)
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join('');
  const customerDetails = [
    customer?.phone && `<div>${escapeHtml(customer.phone)}</div>`,
    customer?.email && `<div>${escapeHtml(customer.email)}</div>`,
    customer?.address && `<div class="multiline">${escapeHtml(customer.address)}</div>`,
    customer?.gstin && `<div>GSTIN: ${escapeHtml(customer.gstin)}</div>`,
  ]
    .filter(Boolean)
    .join('');
  const rows = items
    .map(
      (item, index) => `
        <tr>
          <td class="item-number">${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.itemName)}</strong>
            <span class="item-code">${escapeHtml(item.itemCode)}</span>
            ${item.description ? `<span class="item-description">${escapeHtml(item.description)}</span>` : ''}
            ${num(item.discount) > 0 ? `<span class="item-description">Discount: ${escapeHtml(formatCurrency(num(item.discount), symbol))}</span>` : ''}
          </td>
          <td class="number">${escapeHtml(item.quantity)}</td>
          <td class="number">${escapeHtml(formatCurrency(num(item.unitPrice), symbol))}</td>
          <td class="number">${item.gstPercent == null ? '—' : `${escapeHtml(item.gstPercent)}%`}<span class="item-code">${escapeHtml(formatCurrency(num(item.gstAmount), symbol))}</span></td>
          <td class="number amount">${escapeHtml(formatCurrency(num(item.lineTotal), symbol))}</td>
        </tr>`
    )
    .join('');
  const paymentModes = (invoice.payments ?? [])
    .map(
      (payment) =>
        `${escapeHtml(payment.mode)} · ${escapeHtml(formatCurrency(num(payment.amount), symbol))}`
    )
    .join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(invoice.invoiceNumber)} · ${escapeHtml(settings.shopName)}</title>
  <style>
    :root { color-scheme: light; --ink: #17212b; --muted: #64717c; --gold: #a47b45; --line: #e3e7ea; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #eef1f3; color: var(--ink); font: 13px/1.55 'Segoe UI', Arial, sans-serif; }
    .invoice { position: relative; isolation: isolate; overflow: hidden; width: min(100%, 900px); min-height: 1080px; margin: 0 auto; padding: 46px 54px; background: #fff; box-shadow: 0 12px 36px rgba(24, 35, 45, .12); }
    .watermark { position: absolute; z-index: -1; top: 50%; left: 50%; width: min(58%, 430px); height: auto; max-height: 480px; aspect-ratio: 1; transform: translate(-50%, -50%); opacity: .045; pointer-events: none; }
    .brand-header { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding-bottom: 24px; border-bottom: 3px solid var(--gold); }
    .brand { display: flex; align-items: center; gap: 18px; min-width: 0; }
    .logo { width: 72px; height: 72px; object-fit: contain; }
    .shop-name { margin: 0; font-size: 27px; line-height: 1.2; letter-spacing: 1.5px; font-weight: 700; }
    .tagline { margin-top: 4px; color: var(--muted); font-size: 12px; }
    .shop-contact { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 8px; color: var(--muted); font-size: 10px; }
    .brand-slogan { flex: 0 0 auto; padding-left: 20px; border-left: 1px solid var(--gold); color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: 1.6px; line-height: 1.8; text-align: right; }
    .document-heading { flex: 0 0 auto; text-align: right; }
    .document-heading h2 { margin: 0; color: var(--gold); font-size: 24px; letter-spacing: 4px; }
    .document-heading p { margin: 4px 0 0; color: var(--muted); font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
    .meta-card, .customer-card { padding: 14px 16px; border: 1px solid var(--line); border-radius: 5px; background: rgba(250, 251, 252, .9); }
    .label { display: block; color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .value { display: block; margin-top: 3px; overflow-wrap: anywhere; font-weight: 600; }
    .section-title { margin: 26px 0 10px; color: var(--muted); font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; }
    .customer-card { min-height: 84px; }
    .customer-card strong { display: block; margin-bottom: 3px; font-size: 14px; }
    .customer-card div { color: var(--muted); }
    .multiline { white-space: pre-line; }
    table { width: 100%; border-collapse: collapse; }
    .items th { padding: 11px 9px; background: #17232c; color: #fff; font-size: 9px; letter-spacing: .6px; text-align: left; text-transform: uppercase; }
    .items td { padding: 12px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .items tbody tr:nth-child(even) { background: rgba(248, 249, 250, .8); }
    .items .item-number { width: 34px; color: var(--muted); }
    .item-code, .item-description { display: block; color: var(--muted); font-size: 10px; }
    .number { text-align: right !important; white-space: nowrap; }
    .amount { font-weight: 600; }
    .summary { display: flex; justify-content: flex-end; margin-top: 20px; }
    .totals { width: min(100%, 350px); }
    .totals td { padding: 6px 4px; }
    .totals td:last-child { text-align: right; white-space: nowrap; }
    .grand-total td { padding-top: 12px; border-top: 2px solid var(--gold); font-size: 16px; font-weight: 700; }
    .invoice-notes { margin-top: 24px; padding: 13px 16px; border-left: 3px solid var(--gold); background: #faf8f4; }
    .invoice-notes strong { display: block; margin-bottom: 3px; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; }
    .payment { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 28px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .footer { margin-top: 34px; color: var(--muted); font-size: 10px; text-align: center; }
    .footer:empty { display: none; }
    @media (max-width: 640px) {
      body { padding: 0; }
      .invoice { min-height: 100vh; padding: 25px 18px; }
      .brand-header { align-items: flex-start; gap: 16px; }
      .brand { gap: 10px; }
      .logo { width: 48px; height: 48px; }
      .shop-name { font-size: 19px; }
      .document-heading h2 { font-size: 18px; letter-spacing: 2px; }
      .brand-slogan { padding-left: 10px; font-size: 8px; letter-spacing: .8px; }
      .meta-grid { grid-template-columns: 1fr 1fr; }
      .items th, .items td { padding: 8px 5px; font-size: 10px; }
      .items th { font-size: 8px; }
      .watermark { width: 78%; }
    }
    @page { size: A4; margin: 12mm; }
    @media print {
      body { padding: 0; background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .invoice { width: 100%; min-height: 0; margin: 0; padding: 8mm; box-shadow: none; }
      .items tr { break-inside: avoid; }
      .invoice-notes, .payment, .customer-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="invoice">
    <svg class="watermark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="none" stroke="#17212b" stroke-width=".7"/>
      <circle cx="50" cy="50" r="43" fill="none" stroke="#17212b" stroke-width=".35"/>
      <g stroke="#17212b" stroke-width="1.2" stroke-linecap="round">
        <line x1="50" y1="4" x2="50" y2="10"/><line x1="50" y1="90" x2="50" y2="96"/>
        <line x1="4" y1="50" x2="10" y2="50"/><line x1="90" y1="50" x2="96" y2="50"/>
        <line x1="50" y1="50" x2="50" y2="20" stroke-width="1.5"/>
        <line x1="50" y1="50" x2="72" y2="59" stroke-width="2"/>
      </g>
      <circle cx="50" cy="50" r="2" fill="#17212b"/>
      <g fill="#17212b" font-family="Georgia,serif" font-size="6" text-anchor="middle">
        <text x="50" y="17">XII</text><text x="50" y="88">VI</text>
        <text x="15" y="52">IX</text><text x="85" y="52">III</text>
      </g>
    </svg>
    <header class="brand-header">
      <div class="brand">
        ${settings.showLogoOnInvoice !== false ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt=""/>` : ''}
        <div>
          <h1 class="shop-name">${escapeHtml(settings.shopName)}</h1>
          ${settings.shopTagline?.trim() ? `<div class="tagline">${escapeHtml(settings.shopTagline)}</div>` : ''}
          ${settings.address?.trim() ? `<div class="tagline">${escapeHtml(settings.address)}</div>` : ''}
          <div class="shop-contact">${contactDetails}</div>
        </div>
      </div>
      <div class="brand-slogan">TIME<br/>FOR A<br/>BETTER<br/>TOMORROW</div>
      <div class="document-heading"><h2>INVOICE</h2><p>${escapeHtml(invoice.status)}</p></div>
    </header>
    <section class="meta-grid" aria-label="Invoice details">
      <div class="meta-card"><span class="label">Invoice number</span><span class="value">${escapeHtml(invoice.invoiceNumber)}</span></div>
      <div class="meta-card"><span class="label">Invoice date</span><span class="value">${escapeHtml(formatDateTime(invoice.createdAt))}</span></div>
      <div class="meta-card"><span class="label">Sales representative</span><span class="value">${escapeHtml(invoice.user?.name || '—')}</span></div>
    </section>
    <h3 class="section-title">Bill to</h3>
    <section class="customer-card">
      <strong>${escapeHtml(customer?.name || 'Walk-in customer')}</strong>
      ${customerDetails}
    </section>
    <h3 class="section-title">Items and services</h3>
    <table class="items">
      <thead><tr><th>#</th><th>Description</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">GST</th><th class="number">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="summary">
      <table class="totals">
        <tr><td>Subtotal</td><td>${escapeHtml(formatCurrency(num(invoice.subtotal), symbol))}</td></tr>
        <tr><td>Discount</td><td>${escapeHtml(formatCurrency(num(invoice.discount), symbol))}</td></tr>
        <tr><td>GST</td><td>${escapeHtml(formatCurrency(num(invoice.gstAmount), symbol))}</td></tr>
        <tr class="grand-total"><td>Total due</td><td>${escapeHtml(formatCurrency(num(invoice.grandTotal), symbol))}</td></tr>
      </table>
    </section>
    ${invoice.notes?.trim() ? `<section class="invoice-notes"><strong>Notes</strong><div>${escapeHtml(invoice.notes)}</div></section>` : ''}
    <section class="payment">
      <strong>Payment method</strong><span>${paymentModes || '—'}</span>
    </section>
    <footer class="footer">${escapeHtml(settings.invoiceFooter?.trim() || '')}</footer>
  </main>
</body>
</html>`;
}

const smallNumberWords = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const tensWords = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function underThousandInWords(value: number): string {
  const words: string[] = [];
  if (value >= 100) {
    words.push(`${smallNumberWords[Math.floor(value / 100)]} Hundred`);
    value %= 100;
  }
  if (value >= 20) {
    words.push(tensWords[Math.floor(value / 10)]);
    value %= 10;
  }
  if (value > 0) words.push(smallNumberWords[value]);
  return words.join(' ');
}

function indianNumberInWords(value: number): string {
  if (value === 0) return 'Zero';
  const units = ['', 'Thousand', 'Lakh', 'Crore'];
  const groups: number[] = [];
  groups.push(value % 1000);
  value = Math.floor(value / 1000);
  while (value > 0) {
    groups.push(value % 100);
    value = Math.floor(value / 100);
  }
  return groups
    .map((group, index) => {
      if (group === 0) return '';
      const unit = units[index] ?? 'Crore';
      return `${underThousandInWords(group)}${unit ? ` ${unit}` : ''}`;
    })
    .filter(Boolean)
    .reverse()
    .join(' ');
}

function amountInWords(amount: number): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const parts = [`Rupees ${indianNumberInWords(rupees)}`];
  if (paise > 0) parts.push(`${indianNumberInWords(paise)} Paise`);
  return `${amount < 0 ? 'Minus ' : ''}${parts.join(' and ')} Only`;
}

function requiredField<T extends Element>(document: Document, name: string): T {
  const field = document.querySelector<T>(`[data-invoice="${name}"]`);
  if (!field) throw new Error(`Invoice template is missing the "${name}" field`);
  return field;
}

function setField(document: Document, name: string, value: string, hideWhenEmpty = false): void {
  const field = requiredField<HTMLElement>(document, name);
  field.textContent = value;
  if (hideWhenEmpty && !value.trim()) field.closest('.contact-item')?.setAttribute('hidden', '');
}

export function buildInvoiceHtml(invoice: Invoice, settings: ShopSettings): string {
  const appBaseUrl = new URL('.', window.location.href);
  const template = invoiceTemplate.replace(
    "url('assets/billing-image-header.avif')",
    `url("${new URL(headerImageUrl, appBaseUrl).href}")`
  );
  const document = new DOMParser().parseFromString(template, 'text/html');
  const base = document.createElement('base');
  base.href = appBaseUrl.href;
  document.head.prepend(base);

  const shopNameParts = settings.shopName.trim().split(/\s+/);
  const firstNamePart = shopNameParts.shift() ?? '';
  const remainingName = shopNameParts.join(' ');
  setField(document, 'shop-name-first', firstNamePart);
  setField(document, 'shop-name-rest', remainingName);
  if (!remainingName) requiredField<HTMLElement>(document, 'shop-name-rest').hidden = true;
  setField(document, 'shop-tagline', settings.shopTagline ?? '');
  if (!settings.shopTagline?.trim()) requiredField<HTMLElement>(document, 'shop-tagline').hidden = true;
  setField(document, 'shop-address', settings.address ?? '', true);
  setField(document, 'shop-phone', settings.phone ?? '', true);
  setField(document, 'shop-email', settings.email ?? '', true);
  setField(document, 'shop-gstin', settings.gstin ?? '', true);

  const title = document.querySelector('title');
  if (title) title.textContent = `${invoice.invoiceNumber} - ${settings.shopName}`;
  const logo = document.querySelector<HTMLImageElement>('.brand-logo-img');
  if (logo) {
    if (settings.showLogoOnInvoice === false) {
      logo.hidden = true;
    } else if (settings.logoUrl?.trim()) {
      logo.src = new URL(settings.logoUrl, appBaseUrl).href;
    } else {
      logo.src = new URL(logoImageUrl, appBaseUrl).href;
    }
  }
  const stamp = requiredField<HTMLImageElement>(document, 'stamp');
  stamp.src = new URL(stampImageUrl, appBaseUrl).href;

  setField(document, 'invoice-number', invoice.invoiceNumber);
  setField(document, 'invoice-date', formatDateTime(invoice.createdAt));
  setField(
    document,
    'invoice-type',
    (invoice.payments ?? []).map((payment) => payment.mode).filter(Boolean).join(', ') || '—'
  );
  setField(document, 'sales-person', invoice.user?.name ?? '—');

  const customer = invoice.customer;
  setField(document, 'customer-name', customer?.name || 'Walk-in customer');
  const customerDetails = requiredField<HTMLElement>(document, 'customer-details');
  customerDetails.replaceChildren();
  const customerLines = [
    customer?.address,
    customer?.phone ? `Phone: ${customer.phone}` : '',
    customer?.email,
    customer?.gstin ? `GSTIN: ${customer.gstin}` : '',
  ].filter((line): line is string => Boolean(line?.trim()));
  customerLines.forEach((line, index) => {
    if (index) customerDetails.append(document.createElement('br'));
    customerDetails.append(document.createTextNode(line));
  });

  const itemBody = requiredField<HTMLTableSectionElement>(document, 'items');
  const templateRow = itemBody.querySelector('tr');
  if (!templateRow) throw new Error('Invoice template is missing its item row');
  itemBody.replaceChildren();
  (invoice.items ?? []).forEach((item, index) => {
    const row = templateRow.cloneNode(true) as HTMLTableRowElement;
    const cells = row.cells;
    cells[0].textContent = String(index + 1);
    cells[1].textContent = item.itemName;
    if (item.description?.trim()) {
      cells[1].append(document.createElement('br'), document.createTextNode(item.description));
    }
    cells[2].textContent = item.itemCode;
    cells[3].textContent = String(item.quantity);
    cells[4].textContent = formatCurrency(num(item.unitPrice), settings.currencySymbol);
    cells[5].textContent = formatCurrency(num(item.lineTotal), settings.currencySymbol);
    itemBody.append(row);
  });

  setField(document, 'subtotal', formatCurrency(num(invoice.subtotal), settings.currencySymbol));
  setField(document, 'discount', formatCurrency(num(invoice.discount), settings.currencySymbol));
  setField(document, 'gst-amount', formatCurrency(num(invoice.gstAmount), settings.currencySymbol));
  setField(document, 'grand-total', formatCurrency(num(invoice.grandTotal), settings.currencySymbol));
  setField(document, 'amount-words', amountInWords(num(invoice.grandTotal)));

  const paymentMode = requiredField<HTMLLabelElement>(document, 'payment-mode');
  const paymentInput = paymentMode.querySelector<HTMLInputElement>('input');
  paymentMode.replaceChildren();
  if ((invoice.payments ?? []).length) {
    for (const payment of invoice.payments ?? []) {
      const entry = document.createElement('span');
      entry.textContent = `${payment.mode}: ${formatCurrency(num(payment.amount), settings.currencySymbol)}`;
      paymentMode.append(entry);
    }
  } else {
    paymentMode.textContent = '—';
  }
  if (paymentInput && (invoice.payments ?? []).length) {
    paymentInput.checked = true;
    paymentMode.prepend(paymentInput);
  }

  const notesSection = document.querySelector('.terms');
  const notes = invoice.notes?.trim() ?? '';
  if (notesSection) {
    if (notes) {
      const heading = notesSection.querySelector('strong');
      if (heading) heading.textContent = 'Invoice Notes';
      setField(document, 'notes', notes);
    } else {
      notesSection.remove();
    }
  }
  setField(document, 'signature-name', `For ${settings.shopName}`);
  const footer = requiredField<HTMLElement>(document, 'invoice-footer');
  if (settings.invoiceFooter?.trim()) {
    footer.textContent = settings.invoiceFooter;
  } else {
    footer.closest('.thankyou-text')?.querySelector('p')?.remove();
  }

  document.querySelector('.template-notice')?.remove();
  document.querySelector('.footer-icons')?.remove();
  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
}

export function buildThermalReceiptHtml(
  invoice: Invoice,
  settings: ShopSettings,
  widthMm = 80
): string {
  const items = invoice.items ?? [];
  const symbol = settings.currencySymbol ?? '₹';

  const rows = items
    .map(
      (item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.itemName}<br/><small>${item.itemCode}</small></td>
      <td align="right">${item.quantity}</td>
      <td align="right">${formatCurrency(num(item.lineTotal), symbol)}</td>
    </tr>`
    )
    .join('');

  const logoBlock =
    settings.showLogoOnInvoice !== false
      ? `<div class="center logo"><img src="${resolveReceiptLogoSrc(settings.logoUrl)}" alt="" /></div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: ${widthMm}mm auto; margin: 2mm; }
    body { font-family: 'Courier New', monospace; font-size: 11px; margin: 0; padding: 4px; width: ${widthMm - 4}mm; }
    .center { text-align: center; }
    .logo img { height: 36px; max-width: 100%; object-fit: contain; margin-bottom: 4px; }
    .bold { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 2px 0; vertical-align: top; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .totals td { padding: 1px 0; }
  </style>
</head>
<body>
  ${logoBlock}
  <div class="center bold" style="font-size:13px">${settings.shopName}</div>
  <div class="center">${settings.shopTagline ?? ''}</div>
  <div class="center" style="font-size:10px">${settings.address}</div>
  <div class="center" style="font-size:10px">GSTIN: ${settings.gstin} | ${settings.phone}</div>
  <hr/>
  <div>Bill: <span class="bold">${invoice.invoiceNumber}</span></div>
  <div>Date: ${formatDateTime(invoice.createdAt)}</div>
  ${invoice.customer ? `<div>Customer: ${invoice.customer.name}</div>` : ''}
  <hr/>
  <table>
    <thead><tr><th>#</th><th>Item</th><th>Qty</th><th align="right">Amt</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr/>
  <table class="totals" style="width:100%">
    <tr><td>Subtotal</td><td align="right">${formatCurrency(num(invoice.subtotal), symbol)}</td></tr>
    <tr><td>GST</td><td align="right">${formatCurrency(num(invoice.gstAmount), symbol)}</td></tr>
    <tr><td>Discount</td><td align="right">${formatCurrency(num(invoice.discount), symbol)}</td></tr>
    <tr class="bold"><td>GRAND TOTAL</td><td align="right">${formatCurrency(num(invoice.grandTotal), symbol)}</td></tr>
  </table>
  <div style="margin-top:4px">Payment: ${invoice.payments?.map((p) => p.mode).join(', ') ?? '-'}</div>
  <hr/>
  <div class="center">${settings.invoiceFooter ?? 'Thank you!'}</div>
</body>
</html>`;
}

export function openPrintWindow(): Window | null {
  return window.open('', '_blank', 'width=900,height=800');
}

export function printHtml(html: string, targetWindow = openPrintWindow()): boolean {
  if (!targetWindow) return false;
  const win = targetWindow;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
  return true;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { electronAPI?: unknown }).electronAPI;
}
