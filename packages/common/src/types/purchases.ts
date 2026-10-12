import type { PurchaseCategory } from '../constants.js';

export interface PurchaseBody {
  /** yyyy-MM-dd */
  date: string;
  category: PurchaseCategory;
  description: string;
  amount: number;
  supplier: string;
  comment: string;
}
export interface PurchaseDto extends PurchaseBody { id: number; legacyId: string | null; createdAt: string }
export interface PurchasePage { items: PurchaseDto[]; total: number; page: number; limit: number }
