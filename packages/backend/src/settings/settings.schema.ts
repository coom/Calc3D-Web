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

export const materialBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  pricePerKg: money,
}).strict();
