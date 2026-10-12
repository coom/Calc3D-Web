import { z } from 'zod';
import { PURCHASE_CATEGORIES } from '@calc3d/common';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, 'date must be a valid calendar date');

export const purchaseBodySchema = z.object({
  date: calendarDate,
  category: z.enum(PURCHASE_CATEGORIES),
  description: z.string().trim().min(1).max(200),
  amount: z.number().finite().gt(0).max(1_000_000),
  supplier: z.string().trim().max(200),
  comment: z.string().max(2000),
}).strict();
