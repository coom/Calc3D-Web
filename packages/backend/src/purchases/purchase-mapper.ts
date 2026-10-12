import type { Purchase } from '../../generated/prisma/index.js';
import type { FinancePurchaseRow, PurchaseBody, PurchaseCategory, PurchaseDto } from '@calc3d/common';

export function buildPurchaseData(userId: number, body: PurchaseBody) {
  return { userId, date: new Date(`${body.date}T00:00:00.000Z`), category: body.category, description: body.description, amount: body.amount, supplier: body.supplier, comment: body.comment };
}
export function toPurchaseDto(row: Purchase): PurchaseDto {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), category: row.category as PurchaseCategory, description: row.description, amount: row.amount, supplier: row.supplier, comment: row.comment, legacyId: row.legacyId, createdAt: row.createdAt.toISOString() };
}
export function toFinancePurchaseRow(row: Pick<Purchase, 'date' | 'category' | 'amount'>): FinancePurchaseRow {
  return { date: row.date.toISOString().slice(0, 10), category: row.category as PurchaseCategory, amount: row.amount };
}
