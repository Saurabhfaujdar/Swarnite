import { useState, useCallback } from 'react';
import { formatIndianNumber } from '../lib/utils';

const SHOP_NAME = 'JAIGURU JEWELS LLP';

// ============================================================
// Message Templates
// ============================================================
interface MessageTemplate {
  key: string;
  label: string;
  icon: string;
  description: string;
  buildMessage: (ctx: MessageContext) => string;
  /** Fields the user can customize before sending */
  editableFields?: { key: string; label: string; placeholder: string; multiline?: boolean }[];
}

interface MessageContext {
  customerName: string;
  mobile: string;
  /** Extra fields filled in by the user */
  fields: Record<string, string>;
}

const TEMPLATES: MessageTemplate[] = [
  {
    key: 'invoice',
    label: 'Send Invoice',
    icon: '🧾',
    description: 'Share invoice / bill details',
    editableFields: [
      { key: 'voucherNo', label: 'Invoice No', placeholder: 'e.g. JGI/1115' },
      { key: 'amount', label: 'Amount (₹)', placeholder: 'e.g. 45000' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `Your invoice ${ctx.fields.voucherNo || ''} for ₹${ctx.fields.amount || '___'} has been generated at ${SHOP_NAME}.\n\n` +
      `Thank you for your purchase! 🙏`,
  },
  {
    key: 'birthday',
    label: 'Birthday Wishes',
    icon: '🎂',
    description: 'Send birthday greeting with special offer',
    editableFields: [
      { key: 'offer', label: 'Special Offer (optional)', placeholder: 'e.g. 10% off on making charges' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `🎉 Wishing you a very Happy Birthday! May this year bring you joy and prosperity.\n\n` +
      (ctx.fields.offer
        ? `As a birthday treat, we have a special offer for you: *${ctx.fields.offer}*\n\n`
        : '') +
      `Visit us at ${SHOP_NAME} — we'd love to make your special day even more beautiful! ✨`,
  },
  {
    key: 'payment_reminder',
    label: 'Payment Reminder',
    icon: '💰',
    description: 'Remind about pending payment / outstanding balance',
    editableFields: [
      { key: 'amount', label: 'Outstanding Amount (₹)', placeholder: 'e.g. 25000' },
      { key: 'dueDate', label: 'Due Date (optional)', placeholder: 'e.g. 30 Apr 2026' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `This is a friendly reminder regarding your pending balance of *₹${ctx.fields.amount || '___'}*` +
      (ctx.fields.dueDate ? ` due by ${ctx.fields.dueDate}` : '') +
      ` at ${SHOP_NAME}.\n\n` +
      `Kindly arrange the payment at your earliest convenience. For any queries, feel free to contact us.\n\n` +
      `Thank you! 🙏`,
  },
  {
    key: 'layaway_reminder',
    label: 'Layaway Reminder',
    icon: '📦',
    description: 'Remind about layaway installment or pickup',
    editableFields: [
      { key: 'itemDesc', label: 'Item Description', placeholder: 'e.g. Gold Necklace 22K' },
      { key: 'amount', label: 'Installment Amount (₹)', placeholder: 'e.g. 10000' },
      { key: 'dueDate', label: 'Due Date', placeholder: 'e.g. 5 May 2026' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `This is a reminder for your layaway reservation` +
      (ctx.fields.itemDesc ? ` for *${ctx.fields.itemDesc}*` : '') +
      ` at ${SHOP_NAME}.\n\n` +
      (ctx.fields.amount ? `Next installment: *₹${ctx.fields.amount}*\n` : '') +
      (ctx.fields.dueDate ? `Due date: *${ctx.fields.dueDate}*\n\n` : '\n') +
      `Please visit us to continue your reservation. Thank you! 🙏`,
  },
  {
    key: 'new_catalog',
    label: 'New Design Catalog',
    icon: '💍',
    description: 'Share info about new jewelry designs / arrivals',
    editableFields: [
      { key: 'collection', label: 'Collection Name', placeholder: 'e.g. Bridal Gold Collection 2026' },
      { key: 'details', label: 'Details', placeholder: 'e.g. 200+ new designs in 22K gold', multiline: true },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `✨ *New Arrivals at ${SHOP_NAME}!* ✨\n\n` +
      (ctx.fields.collection ? `*${ctx.fields.collection}*\n` : '') +
      (ctx.fields.details ? `${ctx.fields.details}\n\n` : '\n') +
      `Visit our showroom to explore the latest designs. We look forward to seeing you! 💎`,
  },
  {
    key: 'repair_ready',
    label: 'Repair Ready',
    icon: '🔧',
    description: 'Notify that repaired item is ready for pickup',
    editableFields: [
      { key: 'itemDesc', label: 'Item Description', placeholder: 'e.g. Gold Ring resizing' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `Your item` +
      (ctx.fields.itemDesc ? ` (*${ctx.fields.itemDesc}*)` : '') +
      ` is ready for pickup at ${SHOP_NAME}! ✅\n\n` +
      `Please visit us at your convenience to collect it.\n\n` +
      `Thank you! 🙏`,
  },
  {
    key: 'festival_offer',
    label: 'Festival Offer',
    icon: '🎊',
    description: 'Share festival / seasonal special offers',
    editableFields: [
      { key: 'festival', label: 'Festival / Occasion', placeholder: 'e.g. Dhanteras, Akshaya Tritiya' },
      { key: 'offer', label: 'Offer Details', placeholder: 'e.g. Flat 20% off on making charges', multiline: true },
      { key: 'validity', label: 'Valid Till', placeholder: 'e.g. 15 Nov 2026' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `🎊 *${ctx.fields.festival || 'Festival'} Special at ${SHOP_NAME}!* 🎊\n\n` +
      (ctx.fields.offer ? `${ctx.fields.offer}\n\n` : '') +
      (ctx.fields.validity ? `*Offer valid till: ${ctx.fields.validity}*\n\n` : '') +
      `Don't miss this limited-time offer. Visit us today! ✨`,
  },
  {
    key: 'gold_rate',
    label: 'Gold Rate Update',
    icon: '📊',
    description: 'Share today\'s gold / silver rates',
    editableFields: [
      { key: 'gold24k', label: 'Gold 24K (₹/gm)', placeholder: 'e.g. 7850' },
      { key: 'gold22k', label: 'Gold 22K (₹/gm)', placeholder: 'e.g. 7200' },
      { key: 'silver', label: 'Silver (₹/gm)', placeholder: 'e.g. 95' },
    ],
    buildMessage: (ctx) =>
      `Dear ${ctx.customerName},\n\n` +
      `📊 *Today's Rates at ${SHOP_NAME}:*\n\n` +
      (ctx.fields.gold24k ? `🥇 Gold 24K: ₹${ctx.fields.gold24k}/gm\n` : '') +
      (ctx.fields.gold22k ? `🥇 Gold 22K: ₹${ctx.fields.gold22k}/gm\n` : '') +
      (ctx.fields.silver ? `🥈 Silver: ₹${ctx.fields.silver}/gm\n` : '') +
      `\nVisit us for the best rates and finest jewelry! ✨`,
  },
];

// ============================================================
// Utility
// ============================================================
function openWhatsApp(mobile: string, message: string) {
  const phone = mobile.replace(/\D/g, '');
  const encoded = encodeURIComponent(message);
  const url = phone
    ? `https://wa.me/91${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

// ============================================================
// Full Panel (for Account Master tab)
// ============================================================
interface WhatsAppPanelProps {
  customerName: string;
  mobile: string;
  /** Pre-fill outstanding amount for payment reminder */
  outstandingAmount?: number;
}

export function WhatsAppPanel({ customerName, mobile, outstandingAmount }: WhatsAppPanelProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const template = TEMPLATES.find((t) => t.key === selectedTemplate);

  const handleSelect = useCallback((key: string) => {
    setSelectedTemplate(key);
    // Pre-fill known fields
    const initial: Record<string, string> = {};
    if (key === 'payment_reminder' && outstandingAmount && outstandingAmount > 0) {
      initial.amount = formatIndianNumber(outstandingAmount);
    }
    setFields(initial);
  }, [outstandingAmount]);

  const handleSend = useCallback(() => {
    if (!template) return;
    const message = template.buildMessage({ customerName, mobile, fields });
    openWhatsApp(mobile, message);
  }, [template, customerName, mobile, fields]);

  return (
    <div className="space-y-3">
      {!mobile && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded px-3 py-2 text-xs">
          ⚠️ No mobile number saved for this customer. Add a mobile number first to send WhatsApp messages.
        </div>
      )}

      {/* Template Grid */}
      <div className="grid grid-cols-4 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => handleSelect(t.key)}
            className={`text-left p-2.5 rounded border text-xs transition-all ${
              selectedTemplate === t.key
                ? 'border-green-500 bg-green-50 ring-1 ring-green-400'
                : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
            }`}
          >
            <div className="text-base mb-1">{t.icon}</div>
            <div className="font-semibold text-gray-800">{t.label}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t.description}</div>
          </button>
        ))}
      </div>

      {/* Compose Area */}
      {template && (
        <div className="border border-gray-200 rounded bg-gray-50 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-green-700">
            <span className="text-base">{template.icon}</span>
            {template.label}
          </div>

          {/* Editable Fields */}
          {template.editableFields && template.editableFields.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {template.editableFields.map((f) => (
                <div key={f.key} className={f.multiline ? 'col-span-2' : ''}>
                  <label className="text-[10px] font-semibold text-gray-600 block mb-0.5">{f.label}</label>
                  {f.multiline ? (
                    <textarea
                      className="form-input w-full text-xs"
                      rows={2}
                      placeholder={f.placeholder}
                      value={fields[f.key] || ''}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      type="text"
                      className="form-input w-full text-xs"
                      placeholder={f.placeholder}
                      value={fields[f.key] || ''}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          <div>
            <label className="text-[10px] font-semibold text-gray-600 block mb-0.5">Preview</label>
            <div className="bg-white border border-gray-200 rounded p-2 text-xs whitespace-pre-wrap text-gray-700 max-h-40 overflow-auto">
              {template.buildMessage({ customerName, mobile, fields })}
            </div>
          </div>

          {/* Send */}
          <div className="flex justify-end">
            <button
              onClick={handleSend}
              disabled={!mobile}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-semibold px-5 py-2 rounded flex items-center gap-1.5 transition-colors"
            >
              💬 Send via WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Compact Dropdown (for Sales Entry customer info strip)
// ============================================================
interface WhatsAppDropdownProps {
  customerName: string;
  mobile: string;
  outstandingAmount?: number;
}

export function WhatsAppDropdown({ customerName, mobile, outstandingAmount }: WhatsAppDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleQuickSend = useCallback((templateKey: string) => {
    const template = TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    const fields: Record<string, string> = {};
    if (templateKey === 'payment_reminder' && outstandingAmount && outstandingAmount > 0) {
      fields.amount = formatIndianNumber(outstandingAmount);
    }
    const message = template.buildMessage({ customerName, mobile, fields });
    openWhatsApp(mobile, message);
    setOpen(false);
  }, [customerName, mobile, outstandingAmount]);

  if (!mobile) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-green-600 hover:text-green-800 text-[11px] font-semibold flex items-center gap-0.5"
        title="Send WhatsApp message"
      >
        💬 WhatsApp
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded shadow-lg py-1 w-52">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => handleQuickSend(t.key)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-green-50 flex items-center gap-2"
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
