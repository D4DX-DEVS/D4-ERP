// ==================== Invoice discount clamping ====================
// The stored discount must be the same value the stored totals were computed
// with — otherwise a 150% typo saves fine (total clamped) but reloads as a
// discount larger than the subtotal.

export interface InvoiceDiscount {
  type: "fixed" | "percentage";
  value: number;
}

/** Discount amount in currency, clamped to [0, subtotal]. */
export function discountAmount(discount: InvoiceDiscount | null | undefined, subtotal: number): number {
  if (!discount) return 0;
  const raw = discount.type === "percentage" ? (subtotal * discount.value) / 100 : discount.value;
  return Math.min(subtotal, Math.max(0, raw));
}

/** The discount as it should be persisted: percentage in [0, 100], fixed in [0, subtotal]. */
export function clampDiscount(discount: InvoiceDiscount, subtotal: number): InvoiceDiscount {
  const cap = discount.type === "percentage" ? 100 : subtotal;
  return { type: discount.type, value: Math.min(cap, Math.max(0, discount.value)) };
}
