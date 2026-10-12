import type { Prisma, PrismaClient } from '../../generated/prisma/index.js';
import { DEFAULT_PRICING_SETTINGS, DESKTOP_CATEGORY, DESKTOP_KIND, DESKTOP_PRICING_MODE, DESKTOP_STATUS, unprotectCsvText, type DesktopImportBody, type DesktopImportReport, type FilamentLine, type ImportRejection, type PricingSettings } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { userSettingsSchema } from '../settings/settings.schema.js';
import { parseCsv, type CsvRow } from './csv.js';
import { zonedLocalToUtc } from './zoned-time.js';

type QuoteData = Omit<Prisma.QuoteUncheckedCreateInput, 'userId' | 'legacyId'>;
type PurchaseData = Omit<Prisma.PurchaseUncheckedCreateInput, 'userId' | 'legacyId'>;

/** Nombre au format du CSV bureau (culture fr : virgule décimale) ; vide → 0 ; invalide → NaN. */
const num = (s: string | undefined): number => { const t = (s ?? '').trim(); if (t === '') return 0; const n = Number(t.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const bool = (v: unknown): boolean => v === true || String(v).trim() === 'True' || String(v).trim() === '1';

/** Correspondance config.json → UserSettings (mêmes clés que la spec §4). Clé absente → valeur par défaut. */
function settingsFromConfig(cfg: Record<string, unknown>) {
  const n = (k: string, d: number) => { const v = Number(cfg[k]); return cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '' && Number.isFinite(v) ? v : d; };
  const D = DEFAULT_PRICING_SETTINGS;
  return {
    currencySymbol: typeof cfg.DeviseSymbole === 'string' && cfg.DeviseSymbole.trim() ? cfg.DeviseSymbole.trim().slice(0, 5) : D.currencySymbol,
    electricityPricePerKwh: n('PrixElectriciteKwh', D.electricityPricePerKwh), printerPowerW: n('PuissanceImprimanteW', D.printerPowerW), averageLoadPct: n('ChargeMoyennePct', D.averageLoadPct),
    hourlyRatePreparation: n('TarifHorairePreparation', D.hourlyRatePreparation), hourlyRatePostProcessing: n('TarifHorairePostTraitement', D.hourlyRatePostProcessing),
    hourlyRateDesign: n('TarifHoraireConception', D.hourlyRateDesign), hourlyRatePackaging: n('TarifHoraireEmballage', D.hourlyRatePackaging),
    pricingMode: DESKTOP_PRICING_MODE[String(cfg.ModeTarification)] ?? D.pricingMode, pricingPct: n('PourcentageTarification', D.pricingPct),
    contingencyPct: n('TauxAleasPct', D.contingencyPct), vatPct: n('TvaPct', D.vatPct),
    printerPurchasePrice: n('AmortissementPrixAchat', D.printerPurchasePrice), printerLifetimeHours: n('AmortissementDureeVieHeures', D.printerLifetimeHours),
    maintenancePct: n('MaintenancePct', D.maintenancePct), wearCostPerHour: n('UsureParHeureEUR', D.wearCostPerHour),
    defaultFixedCosts: n('AutresCoutsFixesDefaut', D.defaultFixedCosts), floorPrice: n('PrixPlancherEUR', D.floorPrice),
    roundToEuro: bool(cfg.ArrondirEuro), pdfShowCostBreakdown: cfg.PdfDetailCouts === undefined ? true : bool(cfg.PdfDetailCouts),
  };
}

/** Instantané des paramètres d'un devis depuis ses colonnes Cfg* (format 1.3 ; en 1.2 les colonnes absentes valent 0 / false, comme Get-ConfigDuDevis). */
function snapshotFromRow(get: (col: string) => string, currency: string): PricingSettings {
  const n = (col: string) => { const v = num(get(col)); return Number.isFinite(v) ? v : 0; };
  return {
    currencySymbol: currency,
    electricityPricePerKwh: n('CfgPrixElectriciteKwh'), printerPowerW: n('CfgPuissanceImprimanteW'), averageLoadPct: n('CfgChargeMoyennePct'),
    hourlyRatePreparation: n('CfgTarifHorairePreparation'), hourlyRatePostProcessing: n('CfgTarifHorairePostTraitement'),
    hourlyRateDesign: n('CfgTarifHoraireConception'), hourlyRatePackaging: n('CfgTarifHoraireEmballage'),
    pricingMode: DESKTOP_PRICING_MODE[get('ModeTarification')] ?? 'MARKUP', pricingPct: n('PourcentageTarification'),
    contingencyPct: n('CfgTauxAleasPct'), vatPct: n('TvaPct'),
    printerPurchasePrice: n('CfgAmortissementPrixAchat'), printerLifetimeHours: n('CfgAmortissementDureeVieHeures'), maintenancePct: n('CfgMaintenancePct'),
    wearCostPerHour: n('CfgUsureParHeureEUR'),
    // Pas de colonne Cfg pour ce défaut : il se déduit du montant utilisé moins la saisie (AutresCoutsFixes = Defaut + Consommables dans Invoke-Calcul).
    defaultFixedCosts: Math.max(0, Math.round((n('AutresCoutsFixesEUR') - n('ConsommablesInputEUR')) * 100) / 100),
    floorPrice: n('CfgPrixPlancherEUR'), roundToEuro: bool(get('CfgArrondirEuro')),
  };
}

const cellGetter = (row: CsvRow, header: string[]) => (col: string) => { const i = header.indexOf(col); return i >= 0 ? row.cells[i] : ''; };

function quoteFromRow(row: CsvRow, header: string[], currency: string, timeZone: string): { line: number; legacyId: string; data: QuoteData } | ImportRejection {
  const get = cellGetter(row, header);
  const legacyId = get('Id').trim();
  if (!legacyId) return { line: row.line, reason: 'missing Id' };
  const createdAt = zonedLocalToUtc(get('Date'), timeZone);
  if (Number.isNaN(createdAt.getTime())) return { line: row.line, reason: 'invalid Date' };
  const dueRaw = get('DateSouhaitee').trim();
  const dueDate = dueRaw ? zonedLocalToUtc(dueRaw.slice(0, 10), 'UTC') : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) return { line: row.line, reason: 'invalid DateSouhaitee' };
  const kind = DESKTOP_KIND[get('Type').trim() || 'Devis']; const status = DESKTOP_STATUS[get('Statut').trim() || 'En attente'];
  if (!kind) return { line: row.line, reason: 'unknown Type' };
  if (!status) return { line: row.line, reason: 'unknown Statut' };
  let lines: FilamentLine[] = [];
  const json = get('LignesFilamentJson').trim();
  if (json) {
    try {
      const parsed: unknown = JSON.parse(json);
      const items = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
      lines = items.filter((l) => l && typeof l === 'object').map((l) => ({ material: String(l.Matiere ?? 'PLA').slice(0, 60), weightG: Number(l.PoidsG) || 0, pricePerKg: Number(l.PrixKg) || 0, wastePct: Number(l.PertesPct) || 0 }));
    } catch { return { line: row.line, reason: 'invalid LignesFilamentJson' }; }
  }
  const n = (col: string) => num(get(col));
  const numeric = {
    quantity: Math.max(1, Math.round(n('Quantite') || 1)),
    printHours: Math.round(n('DureeHeuresInput')), printMinutes: Math.round(n('DureeMinutesInput')),
    prepHours: n('TempsPreparationH'), postHours: n('TempsPostTraitementH'), designHours: n('TempsConceptionH'), packagingHours: n('TempsEmballageH'),
    consumables: n('ConsommablesInputEUR'), discountPct: n('RemisePct'), shippingCost: n('FraisPortEUR'),
    filamentWeightG: n('PoidsFilamentG'), filamentCost: n('CoutFilamentEUR'), printTimeH: n('DureeImpressionH'),
    energyKwh: 0, electricityCost: n('CoutElecEUR'),
    laborPrep: n('MOPrepaEUR'), laborPost: n('MOPostEUR'), laborDesign: n('MOConceptionEUR'), laborPackaging: n('MOEmballageEUR'),
    depreciation: n('AmortissementEUR'), maintenance: n('MaintenanceEUR'), wear: n('UsureEUR'), fixedCosts: n('AutresCoutsFixesEUR'),
    subtotal: n('SousTotalEUR'), contingency: n('MajorationAleasEUR'), costAfterContingency: n('CoutApresMajorationEUR'),
    unitPriceExclTax: n('PrixVenteHTUnitaireEUR'), totalExclTax: n('PrixVenteHTTotalEUR'), discountAmount: n('RemiseEUR'), vatAmount: n('TvaEUR'),
    finalPrice: n('PrixFinalEUR'), pricePerGram: n('PrixParGrammeEUR'), pricePerHour: n('PrixParHeureEUR'), roundingAmount: n('ArrondiEUR'),
  };
  const bad = Object.entries(numeric).find(([, v]) => Number.isNaN(v));
  if (bad) return { line: row.line, reason: `invalid number in ${bad[0]}` };
  const snapshot = snapshotFromRow(get, currency);
  // Colonnes dérivées absentes du CSV : le prix avant plancher/arrondi est reconstitué depuis les montants enregistrés.
  const priceBeforeRounding = numeric.finalPrice - numeric.roundingAmount;
  const computedBeforeFloor = numeric.totalExclTax - numeric.discountAmount + numeric.shippingCost + numeric.vatAmount;
  const floorApplied = snapshot.floorPrice > 0 && computedBeforeFloor < snapshot.floorPrice && priceBeforeRounding >= snapshot.floorPrice - 0.005;
  const data: QuoteData = {
    createdAt, dueDate, kind, status, projectName: unprotectCsvText(get('Projet')), customer: unprotectCsvText(get('Client')), comment: unprotectCsvText(get('Commentaire')),
    filamentLines: JSON.stringify(lines), settingsSnapshot: JSON.stringify(snapshot),
    ...numeric, priceBeforeRounding, roundingApplied: numeric.roundingAmount > 0,
    priceBeforeFloor: floorApplied ? computedBeforeFloor : priceBeforeRounding, floorApplied,
  };
  return { line: row.line, legacyId, data };
}

function purchaseFromRow(row: CsvRow, header: string[]): { line: number; legacyId: string; data: PurchaseData } | ImportRejection {
  const get = cellGetter(row, header);
  const legacyId = get('Id').trim();
  if (!legacyId) return { line: row.line, reason: 'missing Id' };
  const date = zonedLocalToUtc(get('Date').trim().slice(0, 10), 'UTC');
  if (Number.isNaN(date.getTime())) return { line: row.line, reason: 'invalid Date' };
  const category = DESKTOP_CATEGORY[get('Categorie').trim()];
  if (!category) return { line: row.line, reason: 'unknown Categorie' };
  const amount = num(get('Montant'));
  if (!Number.isFinite(amount) || amount <= 0) return { line: row.line, reason: 'invalid Montant' };
  const description = unprotectCsvText(get('Description')).trim().slice(0, 200) || '(sans description)';
  return { line: row.line, legacyId, data: { date, category, amount, description, supplier: unprotectCsvText(get('Fournisseur')).trim().slice(0, 200), comment: unprotectCsvText(get('Commentaire')).slice(0, 2000) } };
}

const isRejection = (x: unknown): x is ImportRejection => typeof (x as ImportRejection).reason === 'string';

interface UpsertOps<D> {
  existingIds: () => Promise<{ id: number; legacyId: string | null }[]>;
  createMany: (rows: { legacyId: string; data: D }[]) => Promise<unknown>;
  updateMany: (rows: { id: number; data: D }[]) => Promise<unknown>;
  /** Taille des lots : SQLite limite le nombre de paramètres liés par requête (~32 000). */
  chunk: number;
}

/**
 * Création en lots des lignes inconnues et mise à jour unitaire (par transaction) des lignes déjà importées,
 * reconnues par leur Id bureau. Un Id présent deux fois dans le même fichier est rejeté à sa seconde occurrence.
 */
async function upsertByLegacyId<D>(parsed: ({ line: number; legacyId: string; data: D } | ImportRejection)[], rejected: ImportRejection[], ops: UpsertOps<D>): Promise<{ created: number; updated: number }> {
  const existing = new Map<string, number>();
  for (const e of await ops.existingIds()) if (e.legacyId !== null) existing.set(e.legacyId, e.id);
  const seen = new Set<string>();
  const creates: { legacyId: string; data: D }[] = []; const updates: { id: number; data: D }[] = [];
  for (const r of parsed) {
    if (isRejection(r)) { rejected.push(r); continue; }
    if (seen.has(r.legacyId)) { rejected.push({ line: r.line, reason: 'duplicate Id' }); continue; }
    seen.add(r.legacyId);
    const id = existing.get(r.legacyId);
    if (id !== undefined) updates.push({ id, data: r.data }); else creates.push(r);
  }
  for (let i = 0; i < creates.length; i += ops.chunk) await ops.createMany(creates.slice(i, i + ops.chunk));
  // Par transaction : séquentiel sur une seule connexion (SQLite n'a qu'un writer) et atomique par lot.
  for (let i = 0; i < updates.length; i += 100) await ops.updateMany(updates.slice(i, i + 100));
  return { created: creates.length, updated: updates.length };
}

/**
 * Import idempotent des fichiers de l'application bureau dans le compte `userId` (spec §8).
 * Les montants de l'historique sont repris tels quels (pas de recalcul) ; les devis et achats sont reconnus
 * par leur Id bureau (`legacyId`, unique par utilisateur) ; les paramètres et le catalogue sont remplacés.
 */
export async function importDesktopData(prisma: PrismaClient, userId: number, body: DesktopImportBody, timeZone: string): Promise<DesktopImportReport> {
  const report: DesktopImportReport = { settings: { imported: false, materials: 0 }, quotes: { created: 0, updated: 0, rejected: [] }, purchases: { created: 0, updated: 0, rejected: [] } };
  await getOrCreateSettings(prisma, userId);

  if (body.config !== undefined) {
    let cfg: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(body.config.replace(/^\uFEFF/, ''));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      cfg = parsed as Record<string, unknown>;
    } catch { throw new AppError(400, 'Invalid config.json', undefined, 'validation'); }
    // Mêmes bornes que PUT /api/settings : les paramètres pilotent tous les calculs futurs (spec §9), contrairement aux montants historiques repris tels quels.
    const checked = userSettingsSchema.safeParse(settingsFromConfig(cfg));
    if (!checked.success) throw new AppError(400, 'Invalid config.json', checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
    await prisma.userSettings.update({ where: { userId }, data: checked.data });
    report.settings.imported = true;
    const catalog = cfg.PrixParMatiere;
    if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
      const seen = new Set<string>();
      const entries = Object.entries(catalog as Record<string, unknown>)
        .map(([name, price]) => [name.trim().slice(0, 60), Number(price)] as const)
        .filter(([name, price]) => name && Number.isFinite(price) && price >= 0 && !seen.has(name) && seen.add(name));
      await prisma.$transaction([
        prisma.material.deleteMany({ where: { userId } }),
        prisma.material.createMany({ data: entries.map(([name, pricePerKg], i) => ({ userId, name, pricePerKg, sortOrder: i })) }),
      ]);
      report.settings.materials = entries.length;
    }
  }

  const currency = (await prisma.userSettings.findUnique({ where: { userId } }))?.currencySymbol ?? '€';

  if (body.historique !== undefined) {
    const csv = parseCsv(body.historique);
    report.quotes.rejected.push(...csv.errors);
    const parsed = csv.rows.map((row) => quoteFromRow(row, csv.header, currency, timeZone));
    const { created, updated } = await upsertByLegacyId(parsed, report.quotes.rejected, {
      existingIds: async () => prisma.quote.findMany({ where: { userId, legacyId: { not: null } }, select: { id: true, legacyId: true } }),
      createMany: (rows) => prisma.quote.createMany({ data: rows.map((r) => ({ userId, legacyId: r.legacyId, ...r.data })) }),
      updateMany: (rows) => prisma.$transaction(rows.map((u) => prisma.quote.update({ where: { id: u.id }, data: u.data }))),
      chunk: 300,
    });
    report.quotes.created = created; report.quotes.updated = updated;
  }

  if (body.achats !== undefined) {
    const csv = parseCsv(body.achats);
    report.purchases.rejected.push(...csv.errors);
    const parsed = csv.rows.map((row) => purchaseFromRow(row, csv.header));
    const { created, updated } = await upsertByLegacyId(parsed, report.purchases.rejected, {
      existingIds: async () => prisma.purchase.findMany({ where: { userId, legacyId: { not: null } }, select: { id: true, legacyId: true } }),
      createMany: (rows) => prisma.purchase.createMany({ data: rows.map((r) => ({ userId, legacyId: r.legacyId, ...r.data })) }),
      updateMany: (rows) => prisma.$transaction(rows.map((u) => prisma.purchase.update({ where: { id: u.id }, data: u.data }))),
      chunk: 2000,
    });
    report.purchases.created = created; report.purchases.updated = updated;
  }
  return report;
}
