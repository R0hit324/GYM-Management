/**
 * Receipt HTML template (Production Readiness Stage 2B, WS-4).
 *
 * expo-print renders this document to PDF on device, so the template is the
 * single source of truth for receipt content/formatting. It contains no
 * credentials, no environment values and only the minimum personal data
 * needed on a receipt: member name + business display id.
 */
import type { ReceiptViewModel } from './receipt';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function amountRow(label: string, value: string, emphasis = false): string {
  return `<tr${emphasis ? ' class="total"' : ''}><th>${escapeHtml(label)}</th><td>${escapeHtml(
    value,
  )}</td></tr>`;
}

export function renderReceiptHtml(view: ReceiptViewModel): string {
  const statusClass = view.status === 'verified' ? 'status-ok' : 'status-partial';
  const reversedRow = view.payment.reversedAmount
    ? amountRow('Less: verified reversal', `-${view.payment.reversedAmount}`)
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(view.receiptNumber)}</title>
<style>
  @page { size: A4; margin: 28px 32px; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #241c17;
    background: #ffffff;
    font-size: 12px;
    line-height: 1.45;
  }
  .sheet {
    border: 1px solid #e6ded8;
    border-radius: 10px;
    overflow: hidden;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 22px 24px 18px;
    border-bottom: 3px solid #b34511;
    background: #fdf9f6;
  }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: -0.4px; }
  .brand span { color: #b34511; }
  .tagline { margin-top: 3px; color: #7c6c62; font-size: 11px; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 15px; letter-spacing: 1.6px; text-transform: uppercase; }
  .doc-title .number { margin-top: 4px; font-family: "Courier New", monospace; font-size: 12px; color: #4b3b31; }
  .status {
    display: inline-block;
    margin-top: 8px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
  }
  .status-ok { background: #e4f4ea; color: #17603a; }
  .status-partial { background: #fdf0dd; color: #8a4a05; }
  .body { padding: 20px 24px 24px; }
  .grid { display: flex; gap: 24px; }
  .grid > section { flex: 1; min-width: 0; }
  h2 {
    margin: 0 0 7px;
    font-size: 10px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #8a776a;
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; vertical-align: top; padding: 5px 0; }
  th { width: 46%; font-weight: 500; color: #7c6c62; }
  td { font-weight: 600; color: #241c17; }
  .amounts { margin-top: 18px; border-top: 1px solid #eee6e0; padding-top: 8px; }
  .amounts th { width: 62%; }
  .amounts td { text-align: right; font-variant-numeric: tabular-nums; }
  .amounts tr.total th,
  .amounts tr.total td { border-top: 2px solid #241c17; padding-top: 8px; font-size: 14px; font-weight: 700; }
  .reversal-note {
    margin-top: 14px;
    padding: 9px 11px;
    border-radius: 6px;
    background: #fdf0dd;
    color: #8a4a05;
    font-size: 11px;
  }
  .footer {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid #eee6e0;
    color: #8a776a;
    font-size: 10px;
    line-height: 1.5;
  }
  .footer strong { color: #4b3b31; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">Pulse <span>Gym</span></div>
        <div class="tagline">${escapeHtml(view.gym.tagline)}</div>
      </div>
      <div class="doc-title">
        <h1>Payment receipt</h1>
        <div class="number">${escapeHtml(view.receiptNumber)}</div>
        <div class="status ${statusClass}">${escapeHtml(view.statusLabel)}</div>
      </div>
    </div>
    <div class="body">
      <div class="grid">
        <section>
          <h2>Member</h2>
          <table>
            ${row('Name', view.member.name)}
            ${row('Member ID', view.member.memberId)}
          </table>
        </section>
        <section>
          <h2>Membership</h2>
          <table>
            ${row('Plan', view.plan.name)}
            ${row('Validity', view.plan.validity)}
          </table>
        </section>
      </div>

      <div class="grid" style="margin-top: 16px;">
        <section>
          <h2>Payment</h2>
          <table>
            ${row('Method', view.payment.method)}
            ${row('Verified on', view.payment.verifiedOn)}
            ${row('Reference', view.payment.reference)}
          </table>
        </section>
        <section>
          <h2>Document</h2>
          <table>
            ${row('Receipt no.', view.receiptNumber)}
            ${row('Issued', view.issuedAt)}
            ${row('Receipt status', view.statusLabel)}
          </table>
        </section>
      </div>

      <table class="amounts">
        ${amountRow('Original amount', view.payment.originalAmount)}
        ${amountRow('Discount', view.payment.discount)}
        ${amountRow('Amount paid', view.payment.amountPaid)}
        ${reversedRow}
        ${amountRow('Net received', view.payment.netAmount, true)}
      </table>

      ${
        view.status === 'partially_reversed'
          ? `<div class="reversal-note">A verified reversal was recorded against this payment. The net amount shown is what remains after that reversal.</div>`
          : ''
      }

      <div class="footer">
        <strong>Verified payment only.</strong> This receipt reflects a payment the server verified;
        a pending or rejected entry can never produce one. Reversals are separate verified records.
        Keep this receipt for your records.
      </div>
    </div>
  </div>
</body>
</html>`;
}
