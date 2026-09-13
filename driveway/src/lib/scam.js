/**
 * Patterns behind the classic US private-party car scams. These run over offer
 * messages and surface a warning to the recipient — we never block a message,
 * we just make sure nobody gets caught out by a pattern they haven't seen.
 */
const PATTERNS = [
  {
    id: 'wire',
    re: /\b(wire transfer|western union|moneygram)\b/i,
    warning: 'Asks for a wire transfer — the most common car-sale scam. Wires are irreversible.'
  },
  {
    id: 'shipping_agent',
    re: /\b(shipping agent|freight forwarder|my agent will (pick|collect))/i,
    warning: 'Mentions a "shipping agent" collecting the car — a classic overpayment scam setup.'
  },
  {
    id: 'overpay',
    re: /\b(overpay|send (back )?the difference|check for more than)/i,
    warning: 'Overpayment pattern: they send too much, then ask for the difference back before the cheque bounces.'
  },
  {
    id: 'gift_crypto',
    re: /\b(gift card|bitcoin|crypto|usdt|zelle only)\b/i,
    warning: 'Wants payment in gift cards or crypto. There is no legitimate reason for this.'
  },
  {
    id: 'absent_buyer',
    re: /\b(out of (the )?(country|state)|deployed|on a rig)\b[\s\S]{0,80}\b(can'?t|cannot|unable to) (see|view|inspect|come)/i,
    warning: 'Claims to be away and unable to see the car — a standard setup for a fake payment.'
  },
  {
    id: 'offsite',
    re: /\b(text me at|whatsapp|telegram)\b[\s\S]{0,40}\d/i,
    warning: 'Pushes the conversation off-platform straight away, where nothing is recorded.'
  }
];

/** Returns the warnings triggered by a message. Empty array means nothing matched. */
export function scanMessage(text) {
  const body = String(text || '');
  if (!body.trim()) return [];
  return PATTERNS.filter((p) => p.re.test(body)).map((p) => ({ id: p.id, warning: p.warning }));
}

export const SCAM_PATTERN_IDS = PATTERNS.map((p) => p.id);
