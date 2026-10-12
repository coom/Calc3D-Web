import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { importDesktopData } from './desktop-import.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const config = JSON.stringify({ Langue: 'fr', DeviseSymbole: '€', PrixElectriciteKwh: 0.2, PuissanceImprimanteW: 1000, ChargeMoyennePct: 50, TarifHorairePreparation: 15, TarifHorairePostTraitement: 12, TarifHoraireConception: 30, TarifHoraireEmballage: 10, ModeTarification: 'MargeCible', PourcentageTarification: 30, TauxAleasPct: 5, TvaPct: 20, AmortissementPrixAchat: 1000, AmortissementDureeVieHeures: 5000, MaintenancePct: 2, UsureParHeureEUR: 0.15, AutresCoutsFixesDefaut: 1, PrixPlancherEUR: 8, ArrondirEuro: true, PdfDetailCouts: false, PrixParMatiere: { PLA: 19, 'PLA Silk': 24 } });

// Format 1.2 (sans les colonnes 1.3) + protection CSV + valeur française + Type vide
const historique = `"Id","Date","DateSouhaitee","Projet","Client","Statut","Type","Quantite","LignesFilamentJson","PoidsFilamentG","CoutFilamentEUR","DureeHeuresInput","DureeMinutesInput","DureeImpressionH","CoutElecEUR","TempsPreparationH","MOPrepaEUR","TempsPostTraitementH","MOPostEUR","AmortissementEUR","MaintenanceEUR","ConsommablesInputEUR","AutresCoutsFixesEUR","SousTotalEUR","MajorationAleasEUR","CoutApresMajorationEUR","ModeTarification","PourcentageTarification","PrixVenteHTUnitaireEUR","PrixVenteHTTotalEUR","RemisePct","RemiseEUR","FraisPortEUR","TvaPct","TvaEUR","PrixFinalEUR","PrixParGrammeEUR","PrixParHeureEUR","Commentaire","CfgPrixElectriciteKwh","CfgPuissanceImprimanteW","CfgChargeMoyennePct","CfgTarifHorairePreparation","CfgTarifHorairePostTraitement","CfgTauxAleasPct","CfgAmortissementPrixAchat","CfgAmortissementDureeVieHeures","CfgMaintenancePct","CfgPrixPlancherEUR"
"11111111-1111-1111-1111-111111111111","2026-09-01 10:00","2026-09-10","'=Piège","Client A","Termine","Commande","2","[{""Matiere"":""PLA"",""PoidsG"":100,""PrixKg"":18,""PertesPct"":10}]","100","1,98","5","0","5","0,53","1","12,31","0,5","6,16","2,26","0,11","0","0","23,35","2,34","25,69","Markup","20","30,82","61,64","0","0","0","0","0","61,64","0,3082","6,16","","0,1952","1350","40","12,31","12,31","10","2717","6000","5","5"
"22222222-2222-2222-2222-222222222222","2026-09-02 11:00","","Sans type","","En attente","","1","[]","0","0","0","0","0","0","0","0","0","0","0","0","0,5","1,5","0","0","0","Markup","20","0","0","0","0","0","0","0","5","0","0","note","0,1952","1350","40","12,31","12,31","10","2717","6000","5","5"
"33333333-3333-3333-3333-333333333333","pas une date","","Date invalide","","En attente","Devis","1","[]","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","Markup","20","0","0","0","0","0","0","0","5","0","0","","0,1952","1350","40","12,31","12,31","10","2717","6000","5","5"
`;
const achats = `"Id","Date","Categorie","Description","Montant","Fournisseur","Commentaire"
"a1","2026-09-05","Pieces detachees","Buse 0.4","12,5","'-Amazon","ok"
"a2","2026-09-06","Categorie inconnue","X","1","",""
"a3","2026-09-07","Outillage","Montant nul","0","",""
`;

describe('importDesktopData', () => {
  it('importe config, catalogue, devis (format 1.2, montants repris tels quels) et achats, avec rapport', async () => {
    const u = await createTestUser(prisma, 'alice');
    const r = await importDesktopData(prisma, u.id, { config, historique, achats }, 'Europe/Paris');
    expect(r.settings).toEqual({ imported: true, materials: 2 });
    expect(r.quotes.created).toBe(2); expect(r.quotes.updated).toBe(0);
    expect(r.quotes.rejected).toEqual([{ line: 4, reason: 'invalid Date' }]);
    expect(r.purchases.created).toBe(1);
    expect(r.purchases.rejected).toEqual([{ line: 3, reason: 'unknown Categorie' }, { line: 4, reason: 'invalid Montant' }]);
    const s = await prisma.userSettings.findUnique({ where: { userId: u.id } });
    expect(s).toMatchObject({ pricingMode: 'TARGET_MARGIN', pricingPct: 30, wearCostPerHour: 0.15, roundToEuro: true, pdfShowCostBreakdown: false, currencySymbol: '€' });
    expect((await prisma.material.findMany({ where: { userId: u.id }, orderBy: { sortOrder: 'asc' } })).map((m) => [m.name, m.pricePerKg])).toEqual([['PLA', 19], ['PLA Silk', 24]]);
    const q1 = await prisma.quote.findFirst({ where: { userId: u.id, legacyId: '11111111-1111-1111-1111-111111111111' } });
    expect(q1).toMatchObject({ projectName: '=Piège', customer: 'Client A', kind: 'ORDER', status: 'DONE', quantity: 2, finalPrice: 61.64, laborPrep: 12.31, filamentWeightG: 100, wear: 0, laborDesign: 0, roundingAmount: 0, roundingApplied: false });
    expect(q1?.createdAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(q1?.dueDate?.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(JSON.parse(q1!.filamentLines)).toEqual([{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }]);
    const snap = JSON.parse(q1!.settingsSnapshot);
    expect(snap).toMatchObject({ hourlyRatePreparation: 12.31, pricingMode: 'MARKUP', pricingPct: 20, vatPct: 0, wearCostPerHour: 0, hourlyRateDesign: 0, roundToEuro: false, currencySymbol: '€' });
    const q2 = await prisma.quote.findFirst({ where: { userId: u.id, legacyId: '22222222-2222-2222-2222-222222222222' } });
    expect(q2).toMatchObject({ kind: 'QUOTE', dueDate: null, comment: 'note' });
    // Le CSV ne stocke pas CfgAutresCoutsFixesDefaut : il se déduit de AutresCoutsFixesEUR − ConsommablesInputEUR (fidélité du recalcul).
    expect(q2).toMatchObject({ consumables: 0.5, fixedCosts: 1.5 });
    expect(JSON.parse(q2!.settingsSnapshot).defaultFixedCosts).toBe(1);
    const p = await prisma.purchase.findFirst({ where: { userId: u.id, legacyId: 'a1' } });
    expect(p).toMatchObject({ category: 'SPARE_PARTS', amount: 12.5, supplier: '-Amazon', description: 'Buse 0.4' });
    expect(p?.date.toISOString().slice(0, 10)).toBe('2026-09-05');
  });
  it('un second import met à jour sans doublon et ne touche pas aux autres comptes', async () => {
    const u = await createTestUser(prisma, 'alice'); const v = await createTestUser(prisma, 'bob');
    await importDesktopData(prisma, u.id, { historique, achats }, 'UTC');
    await importDesktopData(prisma, v.id, { historique }, 'UTC');
    const r = await importDesktopData(prisma, u.id, { historique: historique.replace('"Client A"', '"Client B"'), achats }, 'UTC');
    expect(r.quotes).toMatchObject({ created: 0, updated: 2 }); expect(r.purchases).toMatchObject({ created: 0, updated: 1 });
    expect(await prisma.quote.count({ where: { userId: u.id } })).toBe(2);
    expect((await prisma.quote.findFirst({ where: { userId: u.id, legacyId: '11111111-1111-1111-1111-111111111111' } }))?.customer).toBe('Client B');
    expect(await prisma.quote.count({ where: { userId: v.id } })).toBe(2);
    expect(r.settings).toEqual({ imported: false, materials: 0 });
  });
  it('config.json invalide ou incomplet : rejeté proprement, les autres fichiers passent', async () => {
    const u = await createTestUser(prisma, 'alice');
    await expect(importDesktopData(prisma, u.id, { config: '{ pas du json' }, 'UTC')).rejects.toThrow(/config/);
    const r = await importDesktopData(prisma, u.id, { config: JSON.stringify({ DeviseSymbole: '$' }), achats }, 'UTC');
    expect(r.settings.imported).toBe(true);
    expect((await prisma.userSettings.findUnique({ where: { userId: u.id } }))).toMatchObject({ currencySymbol: '$', pricingMode: 'MARKUP', wearCostPerHour: 0 });
  });
  it('un Id présent deux fois dans le même fichier : la seconde occurrence est rejetée', async () => {
    const u = await createTestUser(prisma, 'alice');
    const twice = achats + '"a1","2026-09-08","Outillage","Doublon","3","",""' + String.fromCharCode(10);
    const r = await importDesktopData(prisma, u.id, { achats: twice }, 'UTC');
    expect(r.purchases.created).toBe(1);
    expect(r.purchases.rejected).toContainEqual({ line: 5, reason: 'duplicate Id' });
    expect((await prisma.purchase.findFirst({ where: { userId: u.id, legacyId: 'a1' } }))?.description).toBe('Buse 0.4');
  });
});
