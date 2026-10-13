import { z } from 'zod';
import { PRICING_MODES } from '@calc3d/common';

const money = z.number().finite().min(0).max(1_000_000);
const pct = z.number().finite().min(0).max(100);

/** Corps de PUT /api/settings : tous les champs obligatoires, clés inconnues rejetées. */
export const userSettingsSchema = z.object({
  currencySymbol: z.string().trim().min(1).max(5),
  electricityPricePerKwh: money,
  printerPowerW: z.number().finite().min(0).max(100_000),
  averageLoadPct: pct,
  hourlyRatePreparation: money,
  hourlyRatePostProcessing: money,
  hourlyRateDesign: money,
  hourlyRatePackaging: money,
  pricingMode: z.enum(PRICING_MODES),
  pricingPct: z.number().finite().min(0).max(1000),
  contingencyPct: pct,
  vatPct: pct,
  printerPurchasePrice: money,
  printerLifetimeHours: z.number().finite().min(0).max(1_000_000),
  maintenancePct: pct,
  wearCostPerHour: money,
  defaultFixedCosts: money,
  floorPrice: money,
  roundToEuro: z.boolean(),
  pdfShowCostBreakdown: z.boolean(),
}).strict().superRefine((v, ctx) => {
  if (v.pricingMode === 'TARGET_MARGIN' && v.pricingPct >= 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pricingPct'], message: 'pricingPct must be below 100 in TARGET_MARGIN mode' });
  }
});
export type UserSettingsBody = z.infer<typeof userSettingsSchema>;

/**
 * Corps de PUT /api/settings/paypal. Pseudo PayPal.Me : lettres et chiffres seulement (il entre dans une URL) ;
 * adresse vide ou valide, en minuscules. Activer exige au moins l'un des deux ; désactiver conserve les coordonnées.
 */
export const paypalSettingsSchema = z.object({
  paypalEnabled: z.boolean(),
  paypalHandle: z.string().trim().max(50).regex(/^[A-Za-z0-9]*$/, 'letters and digits only'),
  paypalEmail: z.string().trim().max(200).toLowerCase().refine((v) => v === '' || z.string().email().safeParse(v).success, 'invalid email'),
}).strict().superRefine((v, ctx) => {
  if (v.paypalEnabled && !v.paypalHandle && !v.paypalEmail) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paypalEnabled'], message: 'a PayPal.Me handle or an e-mail address is required to enable PayPal' });
  }
});
export type PaypalSettingsBody = z.infer<typeof paypalSettingsSchema>;

export const materialBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  pricePerKg: money,
}).strict();
