import type { PrismaClient, UserSettings } from '../../generated/prisma/index.js';
import { DEFAULT_MATERIALS, type PricingSettings, type UserSettingsDto, type PricingMode } from '@calc3d/common';

export function toPricingSettings(row: UserSettings): PricingSettings {
  return {
    currencySymbol: row.currencySymbol, electricityPricePerKwh: row.electricityPricePerKwh, printerPowerW: row.printerPowerW,
    averageLoadPct: row.averageLoadPct, hourlyRatePreparation: row.hourlyRatePreparation, hourlyRatePostProcessing: row.hourlyRatePostProcessing,
    hourlyRateDesign: row.hourlyRateDesign, hourlyRatePackaging: row.hourlyRatePackaging, pricingMode: row.pricingMode as PricingMode,
    pricingPct: row.pricingPct, contingencyPct: row.contingencyPct, vatPct: row.vatPct, printerPurchasePrice: row.printerPurchasePrice,
    printerLifetimeHours: row.printerLifetimeHours, maintenancePct: row.maintenancePct, wearCostPerHour: row.wearCostPerHour,
    defaultFixedCosts: row.defaultFixedCosts, floorPrice: row.floorPrice, roundToEuro: row.roundToEuro,
  };
}

export function toSettingsDto(row: UserSettings): UserSettingsDto {
  return { ...toPricingSettings(row), pdfShowCostBreakdown: row.pdfShowCostBreakdown };
}

/** Lit les paramètres de l'utilisateur ; au premier accès, crée la ligne par défaut et le catalogue de matières. */
export async function getOrCreateSettings(prisma: PrismaClient, userId: number): Promise<UserSettingsDto> {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });
  if (existing) return toSettingsDto(existing);
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.userSettings.create({ data: { userId } });
    if ((await tx.material.count({ where: { userId } })) === 0) {
      await tx.material.createMany({ data: DEFAULT_MATERIALS.map((m, i) => ({ userId, name: m.name, pricePerKg: m.pricePerKg, sortOrder: i })) });
    }
    return row;
  });
  return toSettingsDto(created);
}
