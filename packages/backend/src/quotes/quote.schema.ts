import { z } from 'zod';
import { QUOTE_KINDS, QUOTE_STATUSES } from '@calc3d/common';

const hours = z.number().finite().min(0).max(10_000);
const money = z.number().finite().min(0).max(1_000_000);

export const filamentLineSchema = z.object({
  material: z.string().trim().max(60),
  weightG: z.number().finite().min(0).max(1_000_000),
  pricePerKg: money,
  wastePct: z.number().finite().min(0).max(1000),
}).strict();

/** Entrées du calcul. Non strict : POST /preview reçoit le formulaire complet, champs projet compris. */
export const quoteInputSchema = z.object({
  filamentLines: z.array(filamentLineSchema).max(50),
  printHours: z.number().int().min(0).max(100_000),
  printMinutes: z.number().int().min(0).max(59),
  prepHours: hours, postHours: hours, designHours: hours, packagingHours: hours,
  quantity: z.number().int().min(1).max(1_000_000),
  consumables: money,
  discountPct: z.number().finite().min(0).max(100),
  shippingCost: money,
});

/** Corps de POST /quotes : strict, ce qui rejette tout montant calculé envoyé par le client. */
export const createQuoteSchema = quoteInputSchema.extend({
  projectName: z.string().trim().max(200),
  customer: z.string().trim().max(200),
  kind: z.enum(QUOTE_KINDS),
  status: z.enum(QUOTE_STATUSES),
  // Date de calendrier réelle : « 2026-02-30 » est refusée (JavaScript la décalerait silencieusement au 2 mars).
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'dueDate must be a valid calendar date').nullable(),
  comment: z.string().max(2000),
  // Data URL JPEG préparée par le navigateur (≤ 400 Ko → ≤ ~547 Ko encodée) ; validée en profondeur par parseImageDataUrl.
  image: z.string().max(600_000).nullable().optional(),
}).strict();
