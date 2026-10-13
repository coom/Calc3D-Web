import { Prisma, type PrismaClient, type UserSettings } from '../../generated/prisma/index.js';
import { DEFAULT_MATERIALS, type PricingSettings, type UserSettingsDto, type PricingMode, type PaypalSettingsDto, type PublicPaypalInfo } from '@calc3d/common';

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

export function toPaypalDto(row: UserSettings): PaypalSettingsDto {
  return { paypalEnabled: row.paypalEnabled, paypalHandle: row.paypalHandle, paypalEmail: row.paypalEmail };
}

/** Coordonnées PayPal exposées au client : seulement si le propriétaire a activé le paiement PayPal, sinon null. */
export function toPublicPaypal(row: Pick<UserSettings, 'paypalEnabled' | 'paypalHandle' | 'paypalEmail'>): PublicPaypalInfo | null {
  return row.paypalEnabled ? { handle: row.paypalHandle, email: row.paypalEmail } : null;
}

/** Ligne Prisma complète (crée les défauts au besoin) pour les lecteurs qui ont besoin des colonnes hors tarification. */
export async function getOrCreateSettingsRow(prisma: PrismaClient, userId: number): Promise<UserSettings> {
  await getOrCreateSettings(prisma, userId);
  return (await prisma.userSettings.findUnique({ where: { userId } }))!;
}

/**
 * Lit les paramètres de l'utilisateur ; au premier accès, crée la ligne par défaut et le catalogue de matières.
 * Idempotent sous concurrence : la page Devis appelle GET /settings et GET /materials en parallèle, donc deux
 * premiers accès simultanés sont la norme pour un nouveau compte. Pas de transaction interactive : sur SQLite
 * elles se sérialisent et s'attendent (délai dépassé en CI) ; on s'appuie sur l'upsert et sur la contrainte
 * unique (userId, name) du catalogue, dont la violation signifie simplement « déjà créé par l'appel voisin ».
 */
export async function getOrCreateSettings(prisma: PrismaClient, userId: number): Promise<UserSettingsDto> {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });
  if (existing) return toSettingsDto(existing);
  const row = await prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  if ((await prisma.material.count({ where: { userId } })) === 0) {
    try {
      await prisma.material.createMany({ data: DEFAULT_MATERIALS.map((m, i) => ({ userId, name: m.name, pricePerKg: m.pricePerKg, sortOrder: i })) });
    } catch (err) {
      const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!duplicate) throw err;
    }
  }
  return toSettingsDto(row);
}
