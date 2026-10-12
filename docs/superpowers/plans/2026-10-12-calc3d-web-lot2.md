# Calc3D-Web lot 2 : historique, commandes, achats, finances — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un utilisateur retrouve ses devis dans un historique groupé par mois avec filtres, recharge un devis dans la page Devis avec ses paramètres d'origine et le met à jour sans doublon, le convertit en commande, le supprime ; il tient un registre d'achats ; la page Finances reprend les cinq blocs de l'application bureau. Tout reste cloisonné par utilisateur.

**Architecture:** Les agrégats Finances sont une fonction pure `computeFinances` dans `@calc3d/common`, testée sans base, appelée par une route backend mince. Le routeur `quotes.routes.ts` du lot 1 gagne la liste paginée, la lecture, la mise à jour (recalcul avec l'instantané du devis, ou avec les paramètres courants sur demande), la conversion et la suppression. Un routeur `purchases.routes.ts` suit le même modèle que les matières. Côté frontend, la page Devis accepte `?quote=<id>` pour passer en mode « devis chargé », et trois nouvelles pages (Historique, Achats, Finances) remplacent les entrées de menu masquées au lot 1.

**Tech Stack:** identique au lot 1 (Express 4, Prisma 6/SQLite, zod 3, vitest 4, React 18, TanStack Query 5, i18next). Aucune nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-10-12-calc3d-web-design.md` (§6 routes du lot 2, §7 pages, §12 critères du lot 2)

## Global Constraints

- Toutes les contraintes du plan du lot 1 restent en vigueur (versions, `ownerScope` sur chaque requête métier, 404 pour autrui, aucun montant accepté du client, valeurs canoniques de `@calc3d/common`, i18n par fragments, pas de ressource externe, français dans les commentaires et commits).
- Toute route métier ajoutée a un test propriétaire / autre utilisateur / admin.
- Les montants d'un devis ne sont **jamais** recalculés côté historique ou finances : on lit les colonnes enregistrées (comme l'application bureau lit `historique.csv`).
- Le recalcul d'un devis existant utilise `settingsSnapshot` sauf si le client demande explicitement `useCurrentSettings=1`, auquel cas l'instantané est remplacé par les paramètres courants.
- Seuls les devis de type `ORDER` comptent dans les Finances (revenu et coûts) ; les achats comptent tous, filtrés par période sur leur `date` ; les devis sont filtrés par période sur `createdAt`.
- `pnpm lint && pnpm typecheck && pnpm test` au vert et un commit à la fin de chaque tâche.

## Review Focus

1. **Devis rechargé après un changement de tarifs** : le recalcul utilise l'instantané et redonne le prix enregistré au centime ; seul `useCurrentSettings=1` change le prix et remplace l'instantané. Test dans la tâche 2.
2. **Conversion répétée** : convertir une commande répond 409 `code: 'already_order'`, la ligne reste `ORDER`. Test dans la tâche 2.
3. **Finances** : un devis non converti n'entre ni dans le revenu ni dans les coûts ; un achat hors période est exclu ; les mois sans donnée n'apparaissent pas ; un revenu nul donne une marge à 0 % sans division par zéro. Tests dans la tâche 1.
4. **Recherche avec métacaractères** (`%`, `_`, `[`) dans l'historique et les achats : la recherche est littérale (Prisma échappe le LIKE), aucune erreur 500. Tests dans les tâches 2 et 3.
5. **Suppression d'une ressource d'autrui** (devis, achat) : 404 et la ligne reste intacte ; suppression d'un devis propriétaire : 204 et la ligne disparaît. Tests dans les tâches 2 et 3.

---

## Structure des fichiers

`packages/common/src/` :
- `types/quotes.ts` : ajoute `QuotePage`, `QuoteListQuery`.
- `types/purchases.ts` : `PurchaseDto`, `PurchaseBody`, `PurchasePage`.
- `finances/types.ts` : `FinancesPeriod`, `FINANCES_PERIODS`, `FinanceQuoteRow`, `FinancePurchaseRow`, `FinancesDto`, `COST_BREAKDOWN_KEYS`.
- `finances/compute-finances.ts` (+ test).
- `index.ts` : exports.

`packages/backend/src/` :
- `routes/quotes.routes.ts` : + `GET /`, `GET /:id`, `PUT /:id`, `POST /:id/convert`, `DELETE /:id` (+ test étendu).
- `quotes/quote-mapper.ts` : + `toFinanceRow`.
- `purchases/purchase.schema.ts`, `purchases/purchase-mapper.ts`, `routes/purchases.routes.ts` (+ test).
- `routes/finances.routes.ts` (+ test).
- `utils/paging.ts` : `parseListPage(query)` partagé (page, limit ≤ 200).
- `app.ts` : montage.

`packages/frontend/src/` :
- `api/quotes.api.ts` (étendu), `api/purchases.api.ts`, `api/finances.api.ts`.
- `lib/dates.ts` : `monthKey(iso)`, `monthLabel(key, locale)`, `formatDate(iso, locale)`, `todayIso()`.
- `components/shared/MonthGroups.tsx` : regroupement par mois repliable, générique.
- `components/quote/quote-form-state.ts` : + `quoteFormFromDto(dto)`.
- `pages/Quote.tsx` : mode devis chargé (`?quote=<id>`).
- `pages/History.tsx` (+ test), `pages/Purchases.tsx` (+ test), `pages/Finances.tsx` (+ test), `components/finances/BarRow.tsx`.
- `components/layout/Sidebar.tsx` : retire `comingSoon` ; test ajusté.
- `App.tsx` : routes.
- `scripts/i18n-fragments/{history,purchases,finances,quote-loaded}.json`.

Docs : `README.md`, `README.fr.md`, `CHANGELOG.md` (0.2.0), `CLAUDE.md`, spec §6 (route de langue, `PUT /quotes/:id/settings` reporté).

---

### Task 1: `@calc3d/common` — types du lot 2 et agrégats Finances `computeFinances`

**Files:**
- Create: `packages/common/src/types/purchases.ts`, `packages/common/src/finances/types.ts`, `packages/common/src/finances/compute-finances.ts`, `packages/common/src/finances/compute-finances.test.ts`
- Modify: `packages/common/src/types/quotes.ts`, `packages/common/src/index.ts`

**Interfaces:**
- Produces: `QuotePage { items: QuoteDto[]; total; page; limit }`, `QuoteListQuery { q?, kind?, status?, page, limit }` ; `PurchaseDto { id, date (yyyy-MM-dd), category, description, amount, supplier, comment, legacyId, createdAt }`, `PurchaseBody` (sans id/legacyId/createdAt), `PurchasePage` ; `FINANCES_PERIODS = ['all','12m','year','month']`, `FinancesPeriod` ; `FinanceQuoteRow`, `FinancePurchaseRow` ; `FinancesDto` ; `computeFinances(quotes, purchases, period, now): FinancesDto`.

- [ ] **Step 1: Types**

`packages/common/src/types/quotes.ts`, ajouter à la fin :
```ts
export interface QuoteListQuery { q?: string; kind?: QuoteKind; status?: QuoteStatus; page: number; limit: number }
export interface QuotePage { items: QuoteDto[]; total: number; page: number; limit: number }
```

`packages/common/src/types/purchases.ts` :
```ts
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
```

`packages/common/src/finances/types.ts` :
```ts
import type { PurchaseCategory, QuoteKind } from '../constants.js';

export const FINANCES_PERIODS = ['all', '12m', 'year', 'month'] as const;
export type FinancesPeriod = (typeof FINANCES_PERIODS)[number];

/** Colonnes d'un devis nécessaires aux agrégats (lues en base, jamais recalculées). */
export interface FinanceQuoteRow {
  kind: QuoteKind;
  /** ISO 8601 */
  createdAt: string;
  finalPrice: number;
  costAfterContingency: number;
  filamentCost: number;
  electricityCost: number;
  laborPrep: number; laborPost: number; laborDesign: number; laborPackaging: number;
  depreciation: number; maintenance: number; wear: number;
  fixedCosts: number;
  contingency: number;
}
export interface FinancePurchaseRow { date: string; category: PurchaseCategory; amount: number }

export const COST_BREAKDOWN_KEYS = ['filament', 'electricity', 'labor', 'printer', 'fixedCosts', 'contingency'] as const;
export type CostBreakdownKey = (typeof COST_BREAKDOWN_KEYS)[number];

export interface FinancesDto {
  period: FinancesPeriod;
  orders: { count: number; revenue: number; printingCost: number; netMargin: number; netMarginPct: number };
  purchases: { count: number; total: number; gapVsPrintingCost: number };
  /** Trié par montant décroissant, pct du coût d'impression total. */
  costBreakdown: { key: CostBreakdownKey; amount: number; pct: number }[];
  /** 12 derniers mois ayant une donnée, du plus récent au plus ancien, clé yyyy-MM. */
  monthly: { month: string; revenue: number; printingCost: number; purchases: number }[];
  /** Trié par montant décroissant, pct du total des achats. */
  purchasesByCategory: { category: PurchaseCategory; amount: number; pct: number }[];
  comparison: { modeledCost: number; actualPurchases: number };
}
```

`packages/common/src/index.ts`, ajouter :
```ts
export * from './types/purchases.js';
export * from './finances/types.js';
export * from './finances/compute-finances.js';
```

- [ ] **Step 2: Test de `computeFinances` (échoue)**

`packages/common/src/finances/compute-finances.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { computeFinances } from './compute-finances.js';
import type { FinanceQuoteRow, FinancePurchaseRow } from './types.js';

const NOW = new Date('2026-10-12T12:00:00Z');
const q = (over: Partial<FinanceQuoteRow>): FinanceQuoteRow => ({
  kind: 'ORDER', createdAt: '2026-10-01T10:00:00Z', finalPrice: 100, costAfterContingency: 60,
  filamentCost: 10, electricityCost: 5, laborPrep: 10, laborPost: 5, laborDesign: 0, laborPackaging: 5,
  depreciation: 4, maintenance: 1, wear: 2, fixedCosts: 8, contingency: 10, ...over,
});
const p = (over: Partial<FinancePurchaseRow>): FinancePurchaseRow => ({ date: '2026-10-05', category: 'FILAMENT', amount: 25, ...over });

describe('computeFinances', () => {
  it('ne compte que les commandes : revenu, coût, marge et pourcentage', () => {
    const r = computeFinances([q({}), q({ kind: 'QUOTE', finalPrice: 999 }), q({ finalPrice: 50, costAfterContingency: 40 })], [], 'all', NOW);
    expect(r.orders).toEqual({ count: 2, revenue: 150, printingCost: 100, netMargin: 50, netMarginPct: (50 / 150) * 100 });
  });
  it('répartit le coût par poste, trié décroissant, avec le pourcentage du coût total', () => {
    const r = computeFinances([q({})], [], 'all', NOW);
    expect(r.costBreakdown[0]).toEqual({ key: 'labor', amount: 20, pct: (20 / 60) * 100 });
    expect(r.costBreakdown.map((c) => c.key)).toEqual(['labor', 'filament', 'contingency', 'fixedCosts', 'printer', 'electricity']);
    expect(r.costBreakdown.find((c) => c.key === 'printer')?.amount).toBe(7);
  });
  it('filtre par période sur la date du devis et sur la date de l\'achat', () => {
    const quotes = [q({ createdAt: '2026-10-02T00:00:00Z' }), q({ createdAt: '2026-03-02T00:00:00Z' }), q({ createdAt: '2025-11-02T00:00:00Z' }), q({ createdAt: '2025-01-02T00:00:00Z' })];
    const purchases = [p({ date: '2026-10-05' }), p({ date: '2026-02-05' }), p({ date: '2025-06-05' })];
    expect(computeFinances(quotes, purchases, 'month', NOW).orders.count).toBe(1);
    expect(computeFinances(quotes, purchases, 'month', NOW).purchases.count).toBe(1);
    expect(computeFinances(quotes, purchases, 'year', NOW).orders.count).toBe(2);
    expect(computeFinances(quotes, purchases, 'year', NOW).purchases.count).toBe(2);
    expect(computeFinances(quotes, purchases, '12m', NOW).orders.count).toBe(3);
    expect(computeFinances(quotes, purchases, 'all', NOW).orders.count).toBe(4);
    expect(computeFinances(quotes, purchases, 'all', NOW).purchases.total).toBe(75);
  });
  it('évolution mensuelle : clés yyyy-MM, mois sans donnée absents, plus récent en premier, 12 mois maximum', () => {
    const quotes = Array.from({ length: 15 }, (_, i) => q({ createdAt: `${2025 + Math.floor((i + 6) / 12)}-${String(((i + 6) % 12) + 1).padStart(2, '0')}-10T00:00:00Z`, finalPrice: 10 }));
    const r = computeFinances(quotes, [p({ date: '2026-09-15', amount: 7 })], 'all', NOW);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[0].month).toBe('2026-09');
    expect(r.monthly[0]).toEqual({ month: '2026-09', revenue: 10, printingCost: 60, purchases: 7 });
    expect(r.monthly[11].month).toBe('2025-10');
  });
  it('achats par catégorie et comparatif coût modélisé / achats réels', () => {
    const r = computeFinances([q({})], [p({ amount: 30 }), p({ category: 'TOOLS', amount: 10 })], 'all', NOW);
    expect(r.purchasesByCategory).toEqual([{ category: 'FILAMENT', amount: 30, pct: 75 }, { category: 'TOOLS', amount: 10, pct: 25 }]);
    expect(r.comparison).toEqual({ modeledCost: 60, actualPurchases: 40 });
    expect(r.purchases.gapVsPrintingCost).toBe(-20);
  });
  it('sans commande : zéros partout, pas de NaN', () => {
    const r = computeFinances([], [], 'all', NOW);
    expect(r.orders).toEqual({ count: 0, revenue: 0, printingCost: 0, netMargin: 0, netMarginPct: 0 });
    expect(r.costBreakdown.every((c) => c.pct === 0)).toBe(true);
    expect(r.monthly).toEqual([]);
  });
});
```

Run: `pnpm --filter @calc3d/common exec vitest run src/finances/compute-finances.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter `computeFinances`**

`packages/common/src/finances/compute-finances.ts` :
```ts
import type { PurchaseCategory } from '../constants.js';
import { COST_BREAKDOWN_KEYS, type CostBreakdownKey, type FinancePurchaseRow, type FinanceQuoteRow, type FinancesDto, type FinancesPeriod } from './types.js';

/** Même règle que Filtrer-ParPeriode (application bureau) : 12m = date ≥ maintenant − 12 mois ; year/month = même année (et mois) que maintenant. */
function inPeriod(d: Date, period: FinancesPeriod, now: Date): boolean {
  if (period === 'all') return true;
  if (period === '12m') { const limit = new Date(now); limit.setMonth(limit.getMonth() - 12); return d >= limit; }
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/**
 * Agrégats de la page Finances, portage de Refresh-Finances (application bureau). Fonction pure :
 * les montants viennent des colonnes enregistrées des devis, jamais d'un recalcul.
 * Différence assumée : le poste « coûts fixes » lit `fixedCosts` seul (qui inclut déjà les consommables),
 * là où la version bureau additionnait consommables et coûts fixes, comptant les consommables deux fois.
 */
export function computeFinances(quotes: FinanceQuoteRow[], purchases: FinancePurchaseRow[], period: FinancesPeriod, now: Date): FinancesDto {
  const orders = quotes.filter((x) => x.kind === 'ORDER' && inPeriod(new Date(x.createdAt), period, now));
  const buys = purchases.filter((x) => inPeriod(new Date(`${x.date}T00:00:00`), period, now));

  const sum = (f: (o: FinanceQuoteRow) => number) => orders.reduce((acc, o) => acc + f(o), 0);
  const revenue = sum((o) => o.finalPrice);
  const printingCost = sum((o) => o.costAfterContingency);
  const totals: Record<CostBreakdownKey, number> = {
    filament: sum((o) => o.filamentCost),
    electricity: sum((o) => o.electricityCost),
    labor: sum((o) => o.laborPrep + o.laborPost + o.laborDesign + o.laborPackaging),
    printer: sum((o) => o.depreciation + o.maintenance + o.wear),
    fixedCosts: sum((o) => o.fixedCosts),
    contingency: sum((o) => o.contingency),
  };
  const purchasesTotal = buys.reduce((acc, b) => acc + b.amount, 0);

  const byMonth = new Map<string, { revenue: number; printingCost: number; purchases: number }>();
  const bucket = (key: string) => { let m = byMonth.get(key); if (!m) { m = { revenue: 0, printingCost: 0, purchases: 0 }; byMonth.set(key, m); } return m; };
  for (const o of orders) { const m = bucket(monthKey(new Date(o.createdAt))); m.revenue += o.finalPrice; m.printingCost += o.costAfterContingency; }
  for (const b of buys) bucket(monthKey(new Date(`${b.date}T00:00:00`))).purchases += b.amount;

  const byCategory = new Map<PurchaseCategory, number>();
  for (const b of buys) byCategory.set(b.category, (byCategory.get(b.category) ?? 0) + b.amount);

  return {
    period,
    orders: { count: orders.length, revenue, printingCost, netMargin: revenue - printingCost, netMarginPct: pctOf(revenue - printingCost, revenue) },
    purchases: { count: buys.length, total: purchasesTotal, gapVsPrintingCost: purchasesTotal - printingCost },
    costBreakdown: COST_BREAKDOWN_KEYS.map((key) => ({ key, amount: totals[key], pct: pctOf(totals[key], printingCost) })).sort((a, b) => b.amount - a.amount),
    monthly: [...byMonth.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 12).map(([month, v]) => ({ month, ...v })),
    purchasesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount, pct: pctOf(amount, purchasesTotal) })).sort((a, b) => b.amount - a.amount),
    comparison: { modeledCost: printingCost, actualPurchases: purchasesTotal },
  };
}
```

Run: `pnpm --filter @calc3d/common exec vitest run src/finances/compute-finances.test.ts`
Expected: PASS, 6 tests. Si le tri du cas « répartit le coût par poste » échoue sur l'ordre des ex æquo, vérifier les montants du fixture avant de toucher l'implémentation : labor 20, filament 10, contingency 10, fixedCosts 8, printer 7, electricity 5 ; `Array.prototype.sort` est stable, donc filament (déclaré avant contingency) précède contingency à égalité.

- [ ] **Step 4: Build, lint, commit**

Run: `pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck`
Expected: OK.

```bash
git add packages/common
git commit -m "Ajoute les types du lot 2 et les agrégats Finances computeFinances (common)"
```

---

### Task 2: Backend — historique des devis : liste, lecture, mise à jour, conversion, suppression

**Files:**
- Create: `packages/backend/src/utils/paging.ts`
- Modify: `packages/backend/src/routes/quotes.routes.ts`, `packages/backend/src/routes/quotes.routes.test.ts`, `packages/backend/src/quotes/quote-mapper.ts`

**Interfaces:**
- Consumes: `createQuoteSchema`, `buildQuoteData`, `toQuoteDto`, `getOrCreateSettings`, `ownerScope`, `QUOTE_KINDS`, `QUOTE_STATUSES`.
- Produces: `parseListPage(query): { page, limit, skip }` (défaut 1/50, limit ≤ 200, 400 sinon) ; `GET /api/quotes?q&kind&status&page&limit → QuotePage` ; `GET /api/quotes/:id → QuoteDto` ; `PUT /api/quotes/:id[?useCurrentSettings=1] → QuoteDto` ; `POST /api/quotes/:id/convert → QuoteDto` (409 `already_order`) ; `DELETE /api/quotes/:id → 204` ; `toFinanceRow(row): FinanceQuoteRow`.

- [ ] **Step 1: `utils/paging.ts`**

```ts
import { AppError } from '../middleware/error-handler.js';

/** page ≥ 1, limit 1..200 (défaut 50). 400 sur une valeur non entière. */
export function parseListPage(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new AppError(400, 'Invalid pagination');
  return { page, limit, skip: (page - 1) * limit };
}
```

- [ ] **Step 2: Tests des nouvelles routes (échouent)**

Ajouter à `packages/backend/src/routes/quotes.routes.test.ts` (après les tests existants, dans le même `describe`) :
```ts
  it('liste paginée, plus récent en premier, filtres q (littéral), kind, status ; cloisonnée', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const appA = appAs(prisma, a, '/api/quotes', quotesRoutes); const appB = appAs(prisma, b, '/api/quotes', quotesRoutes);
    await request(appA).post('/api/quotes').send({ ...body, projectName: 'Alpha 100%', customer: 'ACME' });
    await request(appA).post('/api/quotes').send({ ...body, projectName: 'Beta_2', customer: 'Zed', status: 'DONE' });
    const c = await request(appA).post('/api/quotes').send({ ...body, projectName: 'Gamma', customer: 'ACME' });
    await request(appA).post(`/api/quotes/${c.body.id}/convert`);
    await request(appB).post('/api/quotes').send({ ...body, projectName: 'Secret' });

    const all = await request(appA).get('/api/quotes');
    expect(all.status).toBe(200); expect(all.body.total).toBe(3);
    expect(all.body.items.map((x: { projectName: string }) => x.projectName)).toEqual(['Gamma', 'Beta_2', 'Alpha 100%']);
    expect(JSON.stringify(all.body)).not.toContain('Secret');
    expect((await request(appA).get('/api/quotes?q=acme')).body.total).toBe(2);
    expect((await request(appA).get('/api/quotes?q=100%25')).body.items.map((x: { projectName: string }) => x.projectName)).toEqual(['Alpha 100%']);
    expect((await request(appA).get('/api/quotes?q=a_2')).body.total).toBe(1);
    expect((await request(appA).get('/api/quotes?q=[')).status).toBe(200);
    expect((await request(appA).get('/api/quotes?kind=ORDER')).body.items.map((x: { projectName: string }) => x.projectName)).toEqual(['Gamma']);
    expect((await request(appA).get('/api/quotes?status=DONE')).body.total).toBe(1);
    expect((await request(appA).get('/api/quotes?status=FINI')).status).toBe(400);
    const p2 = await request(appA).get('/api/quotes?limit=2&page=2');
    expect(p2.body.items).toHaveLength(1); expect(p2.body.page).toBe(2);
    expect((await request(appA).get('/api/quotes?limit=500')).status).toBe(400);
  });
  it('lecture : propriétaire 200, autre utilisateur et admin 404, id invalide 400', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const id = (await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).post('/api/quotes').send(body)).body.id;
    expect((await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).get(`/api/quotes/${id}`)).body.projectName).toBe('Support');
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).get(`/api/quotes/${id}`)).status).toBe(404);
    expect((await request(appAs(prisma, admin, '/api/quotes', quotesRoutes)).get(`/api/quotes/${id}`)).status).toBe(404);
    expect((await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).get('/api/quotes/abc')).status).toBe(400);
  });
  it('mise à jour : recalcul avec l\'instantané d\'origine malgré de nouveaux tarifs, sauf useCurrentSettings=1', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const created = (await request(app).post('/api/quotes').send(body)).body;
    // Les tarifs changent après l'enregistrement
    await prisma.userSettings.update({ where: { userId: a.id }, data: { hourlyRatePreparation: 100 } });
    const same = await request(app).put(`/api/quotes/${created.id}`).send({ ...body, customer: 'ACME 2' });
    expect(same.status).toBe(200);
    expect(same.body.customer).toBe('ACME 2');
    expect(same.body.finalPrice).toBeCloseTo(created.finalPrice, 6);
    expect(same.body.settingsSnapshot.hourlyRatePreparation).toBe(DEFAULT_PRICING_SETTINGS.hourlyRatePreparation);
    const fresh = await request(app).put(`/api/quotes/${created.id}?useCurrentSettings=1`).send(body);
    expect(fresh.body.finalPrice).toBeGreaterThan(created.finalPrice);
    expect(fresh.body.settingsSnapshot.hourlyRatePreparation).toBe(100);
    expect(await prisma.quote.count({ where: { userId: a.id } })).toBe(1);
    expect((await request(app).put(`/api/quotes/${created.id}`).send({ ...body, finalPrice: 1 })).status).toBe(400);
    const b = await createTestUser(prisma, 'b');
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).put(`/api/quotes/${created.id}`).send(body)).status).toBe(404);
  });
  it('conversion en commande : une fois 200, deux fois 409 already_order, autrui 404', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const id = (await request(app).post('/api/quotes').send(body)).body.id;
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).post(`/api/quotes/${id}/convert`)).status).toBe(404);
    const r1 = await request(app).post(`/api/quotes/${id}/convert`);
    expect(r1.status).toBe(200); expect(r1.body.kind).toBe('ORDER');
    const r2 = await request(app).post(`/api/quotes/${id}/convert`);
    expect(r2.status).toBe(409); expect(r2.body.code).toBe('already_order');
    expect((await prisma.quote.findUnique({ where: { id } }))?.kind).toBe('ORDER');
  });
  it('suppression : autrui 404 et ligne intacte, propriétaire 204 et ligne disparue', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const id = (await request(app).post('/api/quotes').send(body)).body.id;
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).delete(`/api/quotes/${id}`)).status).toBe(404);
    expect((await request(appAs(prisma, admin, '/api/quotes', quotesRoutes)).delete(`/api/quotes/${id}`)).status).toBe(404);
    expect(await prisma.quote.count({ where: { id } })).toBe(1);
    expect((await request(app).delete(`/api/quotes/${id}`)).status).toBe(204);
    expect(await prisma.quote.count({ where: { id } })).toBe(0);
    expect((await request(app).delete(`/api/quotes/${id}`)).status).toBe(404);
  });
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/quotes.routes.test.ts`
Expected: FAIL (404 des routes inexistantes, assertions non satisfaites).

- [ ] **Step 3: Implémenter les routes**

Dans `packages/backend/src/routes/quotes.routes.ts`, ajouter les imports :
```ts
import { QUOTE_KINDS, QUOTE_STATUSES, type QuoteKind, type QuoteStatus } from '@calc3d/common';
import { parseListPage } from '../utils/paging.js';
```
et, après `POST /`, les handlers :
```ts
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Invalid id');
  return id;
}

/** Filtres de l'historique : q (projet ou client, contient, littéral), kind, status. Valeur inconnue = 400. */
function listFilters(query: Record<string, unknown>): Record<string, unknown> {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ projectName: { contains: q } }, { customer: { contains: q } }];
  if (query.kind !== undefined) {
    if (!QUOTE_KINDS.includes(query.kind as QuoteKind)) throw new AppError(400, 'Invalid kind');
    where.kind = query.kind;
  }
  if (query.status !== undefined) {
    if (!QUOTE_STATUSES.includes(query.status as QuoteStatus)) throw new AppError(400, 'Invalid status');
    where.status = query.status;
  }
  return where;
}

quotesRoutes.get('/', wrap(async (req, res) => {
  const { page, limit, skip } = parseListPage(req.query);
  const where = { ...ownerScope(req), ...listFilters(req.query) };
  const prisma = req.app.locals.prisma;
  const [total, rows] = await Promise.all([prisma.quote.count({ where }), prisma.quote.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: limit })]);
  res.json({ items: rows.map(toQuoteDto), total, page, limit });
}));

quotesRoutes.get('/:id', wrap(async (req, res) => {
  const row = await req.app.locals.prisma.quote.findFirst({ where: { id: parseId(req.params.id), ...ownerScope(req) } });
  if (!row) throw new AppError(404, 'Quote not found');
  res.json(toQuoteDto(row));
}));

/** Recalcul avec l'instantané du devis (tarifs de sa création) ; ?useCurrentSettings=1 remplace l'instantané par les paramètres courants. */
quotesRoutes.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid quote', issues(parsed.error), 'validation');
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.quote.findFirst({ where: { id, ...scope } });
  if (!existing) throw new AppError(404, 'Quote not found');
  const settings: PricingSettings = req.query.useCurrentSettings === '1' ? await currentPricingSettings(req) : (JSON.parse(existing.settingsSnapshot) as PricingSettings);
  const result = safeCompute(settings, parsed.data);
  const { userId: _keep, ...data } = buildQuoteData(scope.userId, parsed.data, settings, result);
  const row = await prisma.quote.update({ where: { id }, data });
  res.json(toQuoteDto(row));
}));

quotesRoutes.post('/:id/convert', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.quote.findFirst({ where: { id, ...ownerScope(req) } });
  if (!existing) throw new AppError(404, 'Quote not found');
  if (existing.kind === 'ORDER') throw new AppError(409, 'This quote is already an order', undefined, 'already_order');
  const row = await prisma.quote.update({ where: { id }, data: { kind: 'ORDER' } });
  res.json(toQuoteDto(row));
}));

quotesRoutes.delete('/:id', wrap(async (req, res) => {
  const r = await req.app.locals.prisma.quote.deleteMany({ where: { id: parseId(req.params.id), ...ownerScope(req) } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.status(204).send();
}));
```

Prisma échappe lui-même `%` et `_` dans `contains` (recherche littérale) : c'est ce que vérifie le test `q=100%25` / `q=a_2`.

Dans `quote-mapper.ts`, ajouter :
```ts
import type { FinanceQuoteRow } from '@calc3d/common';
/** Colonnes nécessaires aux agrégats Finances (jamais recalculées). */
export function toFinanceRow(row: Pick<Quote, 'kind' | 'createdAt' | 'finalPrice' | 'costAfterContingency' | 'filamentCost' | 'electricityCost' | 'laborPrep' | 'laborPost' | 'laborDesign' | 'laborPackaging' | 'depreciation' | 'maintenance' | 'wear' | 'fixedCosts' | 'contingency'>): FinanceQuoteRow {
  const { createdAt, kind, ...rest } = row;
  return { ...rest, kind: kind as QuoteKind, createdAt: createdAt.toISOString() };
}
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/quotes.routes.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 4: Vérifier, committer**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: au vert.

```bash
git add -A
git commit -m "Ajoute la liste, la lecture, la mise à jour, la conversion et la suppression des devis"
```

---

### Task 3: Backend — registre des achats

**Files:**
- Create: `packages/backend/src/purchases/purchase.schema.ts`, `packages/backend/src/purchases/purchase-mapper.ts`, `packages/backend/src/routes/purchases.routes.ts`, `packages/backend/src/routes/purchases.routes.test.ts`
- Modify: `packages/backend/src/app.ts`

**Interfaces:**
- Consumes: `PURCHASE_CATEGORIES`, `PurchaseBody`, `PurchaseDto`, `ownerScope`, `parseListPage`, `AppError`.
- Produces: `purchaseBodySchema` (zod strict) ; `toPurchaseDto(row)` ; `toFinancePurchaseRow(row)` ; routes `GET /api/purchases?q&category&page&limit → PurchasePage`, `POST /api/purchases → 201 PurchaseDto`, `PUT /api/purchases/:id → PurchaseDto`, `DELETE /api/purchases/:id → 204`.

- [ ] **Step 1: Schéma et mapper**

`src/purchases/purchase.schema.ts` :
```ts
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
```

`src/purchases/purchase-mapper.ts` :
```ts
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
```

- [ ] **Step 2: Test des routes (échoue)**

`src/routes/purchases.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { purchasesRoutes } from './purchases.routes.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const body = { date: '2026-10-05', category: 'FILAMENT', description: 'Bobine PLA 1 kg', amount: 18.9, supplier: 'Shop', comment: '' };

describe('/api/purchases', () => {
  it('crée, liste (plus récent en premier), filtre q littéral et catégorie, pagine ; cloisonné', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const appA = appAs(prisma, a, '/api/purchases', purchasesRoutes); const appB = appAs(prisma, b, '/api/purchases', purchasesRoutes);
    const c1 = await request(appA).post('/api/purchases').send(body);
    expect(c1.status).toBe(201); expect(c1.body).toMatchObject({ date: '2026-10-05', category: 'FILAMENT', amount: 18.9 });
    await request(appA).post('/api/purchases').send({ ...body, date: '2026-10-07', category: 'TOOLS', description: 'Buse 0.4 100%', supplier: 'Amazon' });
    await request(appA).post('/api/purchases').send({ ...body, date: '2026-09-01', description: 'Vieux' });
    await request(appB).post('/api/purchases').send({ ...body, description: 'Secret' });
    const all = await request(appA).get('/api/purchases');
    expect(all.body.total).toBe(3);
    expect(all.body.items.map((x: { description: string }) => x.description)).toEqual(['Buse 0.4 100%', 'Bobine PLA 1 kg', 'Vieux']);
    expect(JSON.stringify(all.body)).not.toContain('Secret');
    expect((await request(appA).get('/api/purchases?q=amazon')).body.total).toBe(1);
    expect((await request(appA).get('/api/purchases?q=100%25')).body.total).toBe(1);
    expect((await request(appA).get('/api/purchases?q=[')).status).toBe(200);
    expect((await request(appA).get('/api/purchases?category=TOOLS')).body.total).toBe(1);
    expect((await request(appA).get('/api/purchases?category=NOPE')).status).toBe(400);
    expect((await request(appA).get('/api/purchases?limit=2&page=2')).body.items).toHaveLength(1);
  });
  it('modifie et supprime : propriétaire OK, autrui et admin 404, ligne intacte', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const app = appAs(prisma, a, '/api/purchases', purchasesRoutes);
    const id = (await request(app).post('/api/purchases').send(body)).body.id;
    for (const other of [b, admin]) {
      const o = appAs(prisma, other, '/api/purchases', purchasesRoutes);
      expect((await request(o).put(`/api/purchases/${id}`).send({ ...body, amount: 1 })).status).toBe(404);
      expect((await request(o).delete(`/api/purchases/${id}`)).status).toBe(404);
    }
    expect((await prisma.purchase.findUnique({ where: { id } }))?.amount).toBe(18.9);
    expect((await request(app).put(`/api/purchases/${id}`).send({ ...body, amount: 20 })).body.amount).toBe(20);
    expect((await request(app).delete(`/api/purchases/${id}`)).status).toBe(204);
    expect(await prisma.purchase.count({ where: { id } })).toBe(0);
  });
  it('valide : montant ≤ 0, description vide, date hors calendrier, clé inconnue, id non numérique', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/purchases', purchasesRoutes);
    expect((await request(app).post('/api/purchases').send({ ...body, amount: 0 })).status).toBe(400);
    expect((await request(app).post('/api/purchases').send({ ...body, description: '  ' })).status).toBe(400);
    expect((await request(app).post('/api/purchases').send({ ...body, date: '2026-02-30' })).status).toBe(400);
    expect((await request(app).post('/api/purchases').send({ ...body, userId: 9 })).status).toBe(400);
    expect((await request(app).put('/api/purchases/x').send(body)).status).toBe(400);
    expect(await prisma.purchase.count()).toBe(0);
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/purchases.routes.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter les routes**

`src/routes/purchases.routes.ts` :
```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { PURCHASE_CATEGORIES, type PurchaseCategory } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseListPage } from '../utils/paging.js';
import { purchaseBodySchema } from '../purchases/purchase.schema.js';
import { buildPurchaseData, toPurchaseDto } from '../purchases/purchase-mapper.js';

export const purchasesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Invalid id');
  return id;
}

purchasesRoutes.get('/', wrap(async (req, res) => {
  const { page, limit, skip } = parseListPage(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where: Record<string, unknown> = { ...ownerScope(req) };
  if (q) where.OR = [{ description: { contains: q } }, { supplier: { contains: q } }];
  if (req.query.category !== undefined) {
    if (!PURCHASE_CATEGORIES.includes(req.query.category as PurchaseCategory)) throw new AppError(400, 'Invalid category');
    where.category = req.query.category;
  }
  const prisma = req.app.locals.prisma;
  const [total, rows] = await Promise.all([prisma.purchase.count({ where }), prisma.purchase.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip, take: limit })]);
  res.json({ items: rows.map(toPurchaseDto), total, page, limit });
}));

purchasesRoutes.post('/', wrap(async (req, res) => {
  const parsed = purchaseBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid purchase', issues(parsed.error), 'validation');
  const row = await req.app.locals.prisma.purchase.create({ data: buildPurchaseData(ownerScope(req).userId, parsed.data) });
  res.status(201).json(toPurchaseDto(row));
}));

purchasesRoutes.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = purchaseBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid purchase', issues(parsed.error), 'validation');
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.purchase.findFirst({ where: { id, ...scope } });
  if (!existing) throw new AppError(404, 'Purchase not found');
  const { userId: _keep, ...data } = buildPurchaseData(scope.userId, parsed.data);
  res.json(toPurchaseDto(await prisma.purchase.update({ where: { id }, data })));
}));

purchasesRoutes.delete('/:id', wrap(async (req, res) => {
  const r = await req.app.locals.prisma.purchase.deleteMany({ where: { id: parseId(req.params.id), ...ownerScope(req) } });
  if (r.count === 0) throw new AppError(404, 'Purchase not found');
  res.status(204).send();
}));
```

Dans `app.ts` : `import { purchasesRoutes } from './routes/purchases.routes.js';` et `app.use('/api/purchases', purchasesRoutes);` après les devis.

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/purchases.routes.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4: Vérifier, committer**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: au vert.

```bash
git add -A
git commit -m "Ajoute le registre des achats (API)"
```

---

### Task 4: Backend — route Finances

**Files:**
- Create: `packages/backend/src/routes/finances.routes.ts`, `packages/backend/src/routes/finances.routes.test.ts`
- Modify: `packages/backend/src/app.ts`

**Interfaces:**
- Consumes: `computeFinances`, `FINANCES_PERIODS`, `toFinanceRow`, `toFinancePurchaseRow`, `ownerScope`.
- Produces: `GET /api/finances?period=all|12m|year|month → FinancesDto` (défaut `all`, 400 sinon).

- [ ] **Step 1: Test (échoue)**

`src/routes/finances.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { financesRoutes } from './finances.routes.js';
import { quotesRoutes } from './quotes.routes.js';
import { purchasesRoutes } from './purchases.routes.js';
import type { CreateQuoteBody } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const quote: CreateQuoteBody = {
  projectName: 'P', customer: 'C', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
  printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 0, packagingHours: 0,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
};

describe('GET /api/finances', () => {
  it('agrège uniquement les commandes et les achats de l\'utilisateur', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const qa = appAs(prisma, a, '/api/quotes', quotesRoutes); const pa = appAs(prisma, a, '/api/purchases', purchasesRoutes);
    const created = (await request(qa).post('/api/quotes').send(quote)).body;
    await request(qa).post(`/api/quotes/${created.id}/convert`);
    await request(qa).post('/api/quotes').send(quote); // devis non converti : ignoré
    await request(pa).post('/api/purchases').send({ date: new Date().toISOString().slice(0, 10), category: 'FILAMENT', description: 'Bobine', amount: 20, supplier: '', comment: '' });
    const qb = appAs(prisma, b, '/api/quotes', quotesRoutes);
    const other = (await request(qb).post('/api/quotes').send({ ...quote, quantity: 50 })).body;
    await request(qb).post(`/api/quotes/${other.id}/convert`);

    const r = await request(appAs(prisma, a, '/api/finances', financesRoutes)).get('/api/finances?period=month');
    expect(r.status).toBe(200);
    expect(r.body.period).toBe('month');
    expect(r.body.orders.count).toBe(1);
    expect(r.body.orders.revenue).toBeCloseTo(created.finalPrice, 6);
    expect(r.body.orders.printingCost).toBeCloseTo(created.costAfterContingency, 6);
    expect(r.body.purchases).toEqual({ count: 1, total: 20, gapVsPrintingCost: 20 - created.costAfterContingency });
    expect(r.body.monthly).toHaveLength(1);
    expect(r.body.costBreakdown.find((c: { key: string }) => c.key === 'filament').amount).toBeCloseTo(created.filamentCost, 6);
    expect((await request(appAs(prisma, a, '/api/finances', financesRoutes)).get('/api/finances')).body.period).toBe('all');
    expect((await request(appAs(prisma, a, '/api/finances', financesRoutes)).get('/api/finances?period=week')).status).toBe(400);
    const empty = await request(appAs(prisma, await createTestUser(prisma, 'c'), '/api/finances', financesRoutes)).get('/api/finances');
    expect(empty.body.orders).toEqual({ count: 0, revenue: 0, printingCost: 0, netMargin: 0, netMarginPct: 0 });
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/finances.routes.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 2: Implémenter**

`src/routes/finances.routes.ts` :
```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeFinances, FINANCES_PERIODS, type FinancesPeriod } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { toFinanceRow } from '../quotes/quote-mapper.js';
import { toFinancePurchaseRow } from '../purchases/purchase-mapper.js';

export const financesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Les montants viennent des colonnes enregistrées des commandes ; le filtrage par période est fait par computeFinances. */
financesRoutes.get('/', wrap(async (req, res) => {
  const period = (req.query.period ?? 'all') as FinancesPeriod;
  if (!FINANCES_PERIODS.includes(period)) throw new AppError(400, 'Invalid period');
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const [quotes, purchases] = await Promise.all([
    prisma.quote.findMany({ where: { ...scope, kind: 'ORDER' }, select: { kind: true, createdAt: true, finalPrice: true, costAfterContingency: true, filamentCost: true, electricityCost: true, laborPrep: true, laborPost: true, laborDesign: true, laborPackaging: true, depreciation: true, maintenance: true, wear: true, fixedCosts: true, contingency: true } }),
    prisma.purchase.findMany({ where: scope, select: { date: true, category: true, amount: true } }),
  ]);
  res.json(computeFinances(quotes.map(toFinanceRow), purchases.map(toFinancePurchaseRow), period, new Date()));
}));
```

Dans `app.ts` : `import { financesRoutes } from './routes/finances.routes.js';` et `app.use('/api/finances', financesRoutes);`.

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/finances.routes.test.ts`
Expected: PASS.

- [ ] **Step 3: Vérifier, committer**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add -A
git commit -m "Ajoute la route Finances (agrégats des commandes et achats)"
```

---

### Task 5: Frontend — modules API, utilitaires de dates, page Historique, mode « devis chargé »

**Files:**
- Create: `packages/frontend/src/api/purchases.api.ts`, `src/api/finances.api.ts`, `src/lib/dates.ts`, `src/lib/dates.test.ts`, `src/components/shared/MonthGroups.tsx`, `src/pages/History.tsx`, `src/pages/History.test.tsx`, `scripts/i18n-fragments/history.json`, `scripts/i18n-fragments/quote-loaded.json`
- Modify: `src/api/quotes.api.ts`, `src/components/quote/quote-form-state.ts` (+ test), `src/pages/Quote.tsx`, `src/pages/Quote.test.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: routes des tâches 2 à 4 ; `QuoteDto`, `QuotePage`, `QuoteListQuery`, `PurchaseDto`, `PurchaseBody`, `PurchasePage`, `FinancesDto`, `FinancesPeriod`.
- Produces: `quotesApi.list/get/update/convert/remove` ; `purchasesApi.list/create/update/remove` ; `financesApi.get(period)` ; `monthKey(iso)`, `monthLabel(key, locale)`, `formatDate(iso, locale)`, `todayIso()` ; `<MonthGroups items keyOf renderMonth renderItem />` ; `quoteFormFromDto(dto): QuoteFormState` ; page `/history` ; page `/` avec `?quote=<id>`.

- [ ] **Step 1: Modules API**

`src/api/quotes.api.ts` (remplacer le contenu) :
```ts
import api from './client';
import type { CreateQuoteBody, PricingSettings, QuoteDto, QuoteInput, QuoteListQuery, QuotePage, QuoteResult } from '@calc3d/common';
export const quotesApi = {
  preview: (input: QuoteInput): Promise<{ result: QuoteResult; settings: PricingSettings }> => api.post('/quotes/preview', input).then((r) => r.data),
  create: (body: CreateQuoteBody): Promise<QuoteDto> => api.post('/quotes', body).then((r) => r.data),
  list: (q: QuoteListQuery): Promise<QuotePage> => api.get('/quotes', { params: q }).then((r) => r.data),
  get: (id: number): Promise<QuoteDto> => api.get(`/quotes/${id}`).then((r) => r.data),
  update: (id: number, body: CreateQuoteBody, useCurrentSettings = false): Promise<QuoteDto> => api.put(`/quotes/${id}`, body, { params: useCurrentSettings ? { useCurrentSettings: '1' } : {} }).then((r) => r.data),
  convert: (id: number): Promise<QuoteDto> => api.post(`/quotes/${id}/convert`).then((r) => r.data),
  remove: (id: number): Promise<void> => api.delete(`/quotes/${id}`).then(() => undefined),
};
```

`src/api/purchases.api.ts` :
```ts
import api from './client';
import type { PurchaseBody, PurchaseCategory, PurchaseDto, PurchasePage } from '@calc3d/common';
export interface PurchaseListQuery { q?: string; category?: PurchaseCategory; page: number; limit: number }
export const purchasesApi = {
  list: (q: PurchaseListQuery): Promise<PurchasePage> => api.get('/purchases', { params: q }).then((r) => r.data),
  create: (body: PurchaseBody): Promise<PurchaseDto> => api.post('/purchases', body).then((r) => r.data),
  update: (id: number, body: PurchaseBody): Promise<PurchaseDto> => api.put(`/purchases/${id}`, body).then((r) => r.data),
  remove: (id: number): Promise<void> => api.delete(`/purchases/${id}`).then(() => undefined),
};
```

`src/api/finances.api.ts` :
```ts
import api from './client';
import type { FinancesDto, FinancesPeriod } from '@calc3d/common';
export const financesApi = { get: (period: FinancesPeriod): Promise<FinancesDto> => api.get('/finances', { params: { period } }).then((r) => r.data) };
```

- [ ] **Step 2: Test des utilitaires de dates (échoue)**

`src/lib/dates.test.ts` :
```ts
import { monthKey, monthLabel, formatDate, todayIso } from './dates';

describe('dates', () => {
  it('monthKey extrait yyyy-MM en heure locale', () => {
    expect(monthKey('2026-10-12T10:00:00.000Z')).toMatch(/^2026-10$/);
    expect(monthKey('2026-03-05')).toBe('2026-03');
  });
  it('monthLabel : mois en toutes lettres avec majuscule initiale', () => {
    expect(monthLabel('2026-10', 'fr')).toBe('Octobre 2026');
    expect(monthLabel('2026-10', 'en')).toBe('October 2026');
  });
  it('formatDate : date courte localisée', () => {
    expect(formatDate('2026-10-05', 'fr')).toBe('05/10/2026');
    expect(formatDate('2026-10-05', 'en')).toBe('10/5/2026');
  });
  it('todayIso : yyyy-MM-dd', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/lib/dates.test.ts` → FAIL.

- [ ] **Step 3: Implémenter `lib/dates.ts`**

```ts
/** Date ISO (avec ou sans heure) → Date locale ; une date seule est interprétée à minuit local. */
export function toLocalDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
}
export function monthKey(iso: string): string {
  const d = toLocalDate(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** « Octobre 2026 » / « October 2026 » à partir d'une clé yyyy-MM. */
export function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale).format(toLocalDate(iso));
}
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/lib/dates.test.ts` → PASS. (jsdom embarque les données ICU de Node : « fr » et « en » sont disponibles.)

- [ ] **Step 4: `MonthGroups.tsx`**

```tsx
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { monthKey, monthLabel } from '@/lib/dates';

interface Props<T> { items: T[]; dateOf: (item: T) => string; renderItem: (item: T) => ReactNode; countLabel: (n: number) => string }

/** Regroupe des lignes par mois (clé yyyy-MM, plus récent en premier), chaque mois repliable. Même ergonomie que les pages Historique et Achats de l'application bureau. */
export function MonthGroups<T>({ items, dateOf, renderItem, countLabel }: Props<T>) {
  const { i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = new Map<string, T[]>();
  for (const it of items) { const k = monthKey(dateOf(it)); const g = groups.get(k); if (g) g.push(it); else groups.set(k, [it]); }
  const keys = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));
  const toggle = (k: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="space-y-3">
      {keys.map((k) => {
        const rows = groups.get(k)!; const open = !collapsed.has(k);
        return (
          <section key={k} className="rounded-md border border-border">
            <button type="button" onClick={() => toggle(k)} aria-expanded={open} className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2 text-left text-sm font-medium">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span>{monthLabel(k, i18n.language)}</span>
              <span className="ml-auto text-xs text-muted-foreground">{countLabel(rows.length)}</span>
            </button>
            {open && <div>{rows.map(renderItem)}</div>}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Fragments i18n**

`scripts/i18n-fragments/history.json` :
```json
{
  "namespace": "history",
  "keys": {
    "en": {
      "title": "History", "subtitle": "Your quotes and orders, grouped by month", "search": "Search (project / customer)", "allKinds": "All types", "allStatuses": "All statuses",
      "count": "{{count}} quote(s)", "empty": "No quote matches these filters.", "hint": "Double-click a row to load it into the Quote page.",
      "cols": { "date": "Date", "project": "Project", "customer": "Customer", "kind": "Type", "status": "Status", "quantity": "Qty", "price": "Final price" },
      "load": "Load into Quote", "convert": "Convert to order", "delete": "Delete", "converted": "Quote converted to order.", "alreadyOrder": "This row is already an order.",
      "deleteTitle": "Delete quote", "deleteDescription": "Permanently delete quote \"{{name}}\" from history?", "deleted": "Quote deleted.", "actionFailed": "The action failed."
    },
    "fr": {
      "title": "Historique", "subtitle": "Tes devis et commandes, groupés par mois", "search": "Recherche (projet / client)", "allKinds": "Tous les types", "allStatuses": "Tous les statuts",
      "count": "{{count}} devis", "empty": "Aucun devis ne correspond à ces filtres.", "hint": "Double-clique une ligne pour la charger dans la page Devis.",
      "cols": { "date": "Date", "project": "Projet", "customer": "Client", "kind": "Type", "status": "Statut", "quantity": "Qté", "price": "Prix final" },
      "load": "Charger dans Devis", "convert": "Convertir en commande", "delete": "Supprimer", "converted": "Devis converti en commande.", "alreadyOrder": "Cette ligne est déjà une commande.",
      "deleteTitle": "Supprimer le devis", "deleteDescription": "Supprimer définitivement le devis « {{name}} » de l'historique ?", "deleted": "Devis supprimé.", "actionFailed": "L'action a échoué."
    }
  }
}
```

`scripts/i18n-fragments/quote-loaded.json` :
```json
{
  "namespace": "quote",
  "keys": {
    "en": { "loaded": { "banner": "This quote uses the settings (rates, electricity, depreciation…) saved when it was created, not your current Settings.", "useCurrent": "Recalculate with my current settings", "update": "Update this quote", "updated": "Quote updated.", "notFound": "This quote does not exist or is not yours." } },
    "fr": { "loaded": { "banner": "Ce devis utilise les paramètres (tarifs, électricité, amortissement…) enregistrés au moment de sa création, pas tes Paramètres actuels.", "useCurrent": "Recalculer avec mes paramètres actuels", "update": "Mettre à jour ce devis", "updated": "Devis mis à jour.", "notFound": "Ce devis n'existe pas ou ne t'appartient pas." } }
  }
}
```

Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

- [ ] **Step 6: `quoteFormFromDto` (test puis implémentation)**

Ajouter à `src/components/quote/quote-form-state.test.ts` :
```ts
import { quoteFormFromDto } from './quote-form-state';
import type { QuoteDto } from '@calc3d/common';

it('quoteFormFromDto remplit le formulaire en texte depuis un devis, et l\'aller-retour redonne les mêmes entrées', () => {
  const dto = {
    id: 7, createdAt: '', updatedAt: '', legacyId: null, settingsSnapshot: {} as QuoteDto['settingsSnapshot'],
    projectName: 'Boîtier', customer: 'ACME', kind: 'ORDER', status: 'DONE', dueDate: '2026-11-01', comment: 'rush',
    filamentLines: [{ material: 'PETG', weightG: 42.5, pricePerKg: 20, wastePct: 5 }],
    printHours: 2, printMinutes: 45, prepHours: 0.25, postHours: 0, designHours: 0, packagingHours: 0.5,
    quantity: 3, consumables: 1.5, discountPct: 10, shippingCost: 6.5,
  } as unknown as QuoteDto;
  const f = quoteFormFromDto(dto);
  expect(f.lines[0]).toEqual({ material: 'PETG', weightG: '42.5', pricePerKg: '20', wastePct: '5' });
  expect(f.printMinutes).toBe('45'); expect(f.quantity).toBe('3'); expect(f.dueDate).toBe('2026-11-01'); expect(f.kind).toBe('ORDER');
  const body = toCreateBody(f);
  expect(body).toMatchObject({ projectName: 'Boîtier', customer: 'ACME', kind: 'ORDER', status: 'DONE', dueDate: '2026-11-01', comment: 'rush', printHours: 2, printMinutes: 45, prepHours: 0.25, packagingHours: 0.5, quantity: 3, consumables: 1.5, discountPct: 10, shippingCost: 6.5, filamentLines: dto.filamentLines });
});
```
(Déplacer l'import en tête de fichier avec les autres.) Run → FAIL. Puis ajouter à `quote-form-state.ts` :
```ts
import type { QuoteDto } from '@calc3d/common';
const s = (n: number) => String(n);
/** Formulaire (texte) à partir d'un devis enregistré ; `String(n)` garde le point décimal, accepté par parseLocaleNumber. */
export function quoteFormFromDto(q: QuoteDto): QuoteFormState {
  return {
    projectName: q.projectName, customer: q.customer, kind: q.kind, status: q.status, dueDate: q.dueDate ?? '', comment: q.comment,
    quantity: s(q.quantity), lines: q.filamentLines.map((l) => ({ material: l.material, weightG: s(l.weightG), pricePerKg: s(l.pricePerKg), wastePct: s(l.wastePct) })),
    printHours: s(q.printHours), printMinutes: s(q.printMinutes), prepHours: s(q.prepHours), postHours: s(q.postHours), designHours: s(q.designHours), packagingHours: s(q.packagingHours),
    consumables: s(q.consumables), discountPct: s(q.discountPct), shippingCost: s(q.shippingCost),
  };
}
```
(Fusionner l'import de `QuoteDto` avec l'import existant depuis `@calc3d/common`.) Run → PASS.

- [ ] **Step 7: Tests de la page Devis en mode chargé (échouent)**

Ajouter à `src/pages/Quote.test.tsx` : le mock de `quotesApi` devient `{ create, get, update }` et le rendu accepte une route initiale.
```ts
const create = vi.fn(); const get = vi.fn(); const update = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { create: (b: unknown) => create(b), get: (id: number) => get(id), update: (id: number, b: unknown, cur: boolean) => update(id, b, cur) } }));
```
```tsx
function renderPage(initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[initial]}><Routes><Route path="/" element={<Quote />} /></Routes></MemoryRouter></QueryClientProvider>);
}
```
(importer `Routes, Route` de react-router-dom) et ces cas :
```tsx
  const loaded = {
    id: 7, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', legacyId: null,
    projectName: 'Ancien', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '',
    filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
    printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25,
    quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
    // Instantané d'origine : tarifs d'alors (G1), différents des paramètres courants mockés (hourlyRateDesign 30 → ici 30 aussi mais wear 0 → 0.15 côté courant)
    settingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0, wearCostPerHour: 0 },
    filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.52704, laborPrep: 12.31, laborPost: 6.155, laborDesign: 60, laborPackaging: 2.5,
    depreciation: 2.264167, maintenance: 0.113208, wear: 0, fixedCosts: 0, subtotal: 85.849415, contingency: 8.584942, costAfterContingency: 94.434356, unitPriceExclTax: 113.321228, totalExclTax: 113.321228,
    discountAmount: 0, vatAmount: 0, priceBeforeFloor: 113.321228, floorApplied: false, priceBeforeRounding: 113.321228, roundingAmount: 0, roundingApplied: false, finalPrice: 113.321228, pricePerGram: 1.133212, pricePerHour: 22.664246,
  };
  it('charge un devis depuis ?quote=, calcule avec son instantané (sans usure) et met à jour via PUT', async () => {
    get.mockResolvedValue(loaded); update.mockResolvedValue({ ...loaded, customer: 'ACME 2' });
    renderPage('/?quote=7');
    expect(await screen.findByText(/paramètres .* enregistrés au moment de sa création/)).toBeInTheDocument();
    expect((screen.getByLabelText(/Nom du projet/) as HTMLInputElement).value).toBe('Ancien');
    // Prix avec l'instantané (usure 0) : 113,32 € et non 114,31 € (paramètres courants, usure 0,15)
    await waitFor(() => expect(screen.getByTestId('final-price').textContent?.replace(/\s/g, '')).toBe('113,32€'));
    type(/^Client$/, 'ACME 2');
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour ce devis/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ customer: 'ACME 2' }), false));
    expect(create).not.toHaveBeenCalled();
  });
  it('« Recalculer avec mes paramètres actuels » bascule le prix en direct et l\'envoi en useCurrentSettings', async () => {
    get.mockResolvedValue(loaded); update.mockResolvedValue(loaded);
    renderPage('/?quote=7');
    await screen.findByText(/paramètres .* enregistrés/);
    fireEvent.click(screen.getByRole('switch', { name: /Recalculer avec mes paramètres actuels/ }));
    await waitFor(() => expect(screen.getByTestId('final-price').textContent?.replace(/\s/g, '')).toBe('114,31€'));
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour ce devis/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(7, expect.anything(), true));
  });
```
Les trois tests existants passent `renderPage()` sans argument et restent inchangés.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/Quote.test.tsx` → FAIL (2 nouveaux).

- [ ] **Step 8: Mode « devis chargé » dans `pages/Quote.tsx`**

Modifier `Quote` (composant par défaut) :
```tsx
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { quoteFormFromDto } from '@/components/quote/quote-form-state';
import type { QuoteDto } from '@calc3d/common';

export default function Quote() {
  const [params] = useSearchParams();
  const quoteId = Number(params.get('quote')) || null;
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: materialsApi.list });
  const quoteQ = useQuery({ queryKey: ['quote', quoteId], queryFn: () => quotesApi.get(quoteId!), enabled: quoteId !== null });
  const { t } = useTranslation();
  if (settingsQ.isLoading || materialsQ.isLoading || !settingsQ.data || !materialsQ.data || (quoteId !== null && quoteQ.isLoading)) return <PageLoader />;
  if (quoteId !== null && !quoteQ.data) return <p className="text-sm text-destructive">{t('quote.loaded.notFound')}</p>;
  const first = materialsQ.data[0];
  return <QuoteEditor key={quoteQ.data?.id ?? `new-${first?.id ?? 'none'}`} settings={settingsQ.data} materials={materialsQ.data} defaultMaterial={first?.name ?? 'PLA'} defaultPrice={first ? String(first.pricePerKg) : ''} initial={quoteQ.data ?? null} />;
}
```
Dans `QuoteEditor` : prop `initial: QuoteDto | null` ; états `useState(() => initial ? quoteFormFromDto(initial) : emptyQuoteForm(...))`, `const [useCurrent, setUseCurrent] = useState(false)` ; `const pricing = initial && !useCurrent ? initial.settingsSnapshot : currentPricing` (où `currentPricing` est `settings` sans `pdfShowCostBreakdown`) ; dépendances du `useMemo` : `[form, pricing]`. Mutation :
```tsx
const save = useMutation({
  mutationFn: () => (initial ? quotesApi.update(initial.id, toCreateBody(form), useCurrent) : quotesApi.create(toCreateBody(form))),
  onSuccess: (q) => { setSavedId(q.id); qc.invalidateQueries({ queryKey: ['quotes'] }); toast.success(t(initial ? 'quote.loaded.updated' : 'quote.actions.saved')); },
  onError: () => toast.error(t('quote.actions.saveFailed')),
});
```
(`const qc = useQueryClient()`.) Bandeau, affiché sous le titre quand `initial` est défini :
```tsx
{initial && (
  <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
    <span className="flex-1 min-w-[16rem]">{t('quote.loaded.banner')}</span>
    <label className="flex items-center gap-2"><Switch checked={useCurrent} onCheckedChange={(v) => { setUseCurrent(v); setSavedId(null); }} aria-label={t('quote.loaded.useCurrent')} /><span>{t('quote.loaded.useCurrent')}</span></label>
  </div>
)}
```
Bouton principal : libellé `initial ? t('quote.loaded.update') : t('quote.actions.save')`. Bouton « Nouveau devis » : `const navigate = useNavigate();` et `onClick={() => { if (initial) navigate('/'); else { setForm(emptyQuoteForm(defaultMaterial, defaultPrice)); setSavedId(null); } }}` (la clé du composant change, le formulaire repart à vide).

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/Quote.test.tsx` → PASS, 5 tests.

- [ ] **Step 9: Test de la page Historique (échoue)**

`src/pages/History.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import History from './History';

const list = vi.fn(); const convert = vi.fn(); const remove = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { list: (q: unknown) => list(q), convert: (id: number) => convert(id), remove: (id: number) => remove(id) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ currencySymbol: '€' }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const item = (over: Record<string, unknown>) => ({ id: 1, createdAt: '2026-10-03T10:00:00Z', projectName: 'Boîtier', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', quantity: 2, finalPrice: 114.31, ...over });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/history']}><Routes><Route path="/history" element={<History />} /><Route path="/" element={<div>QUOTE PAGE</div>} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe('page Historique', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { list.mockReset(); convert.mockReset(); remove.mockReset(); list.mockResolvedValue({ total: 2, page: 1, limit: 50, items: [item({}), item({ id: 2, createdAt: '2026-09-15T10:00:00Z', projectName: 'Support', kind: 'ORDER', status: 'DONE' })] }); });

  it('groupe par mois, affiche les lignes, replie un mois', async () => {
    renderPage();
    expect(await screen.findByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Septembre 2026')).toBeInTheDocument();
    expect(screen.getByText('Boîtier')).toBeInTheDocument();
    expect(screen.getByText('Commande', { selector: 'div' })).toBeInTheDocument(); // le badge, pas l'option du filtre
    fireEvent.click(screen.getByRole('button', { name: /Septembre 2026/ }));
    expect(screen.queryByText('Support')).not.toBeInTheDocument();
  });
  it('les filtres relancent la requête avec q, kind et status', async () => {
    renderPage();
    await screen.findByText('Boîtier');
    fireEvent.change(screen.getByPlaceholderText(/Recherche/), { target: { value: 'acme' } });
    fireEvent.change(screen.getByLabelText(/^Type$/), { target: { value: 'ORDER' } });
    fireEvent.change(screen.getByLabelText(/^Statut$/), { target: { value: 'DONE' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'acme', kind: 'ORDER', status: 'DONE', page: 1 })));
  });
  it('charge un devis dans la page Devis, convertit, supprime après confirmation', async () => {
    convert.mockResolvedValue(item({ kind: 'ORDER' })); remove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Boîtier');
    fireEvent.click(screen.getAllByRole('button', { name: /Convertir en commande/ })[0]);
    await waitFor(() => expect(convert).toHaveBeenCalledWith(1));
    expect(screen.getAllByRole('button', { name: /Convertir en commande/ })[1]).toBeDisabled(); // ligne déjà commande
    fireEvent.click(screen.getAllByRole('button', { name: /^Supprimer$/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
    fireEvent.click(screen.getAllByRole('button', { name: /Charger dans Devis/ })[0]);
    expect(await screen.findByText('QUOTE PAGE')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/History.test.tsx` → FAIL.

- [ ] **Step 10: Implémenter `pages/History.tsx`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { QUOTE_KINDS, QUOTE_STATUSES, type QuoteDto, type QuoteKind, type QuoteStatus } from '@calc3d/common';
import { quotesApi } from '@/api/quotes.api';
import { settingsApi } from '@/api/settings.api';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { MonthGroups } from '@/components/shared/MonthGroups';

const LIMIT = 50;
const selectClass = 'flex h-8 rounded-md border border-input bg-background px-2 text-sm';

export default function History() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState(''); const [kind, setKind] = useState<QuoteKind | ''>(''); const [status, setStatus] = useState<QuoteStatus | ''>(''); const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<QuoteDto | null>(null);
  const params = { q: q || undefined, kind: kind || undefined, status: status || undefined, page, limit: LIMIT };
  const { data } = useQuery({ queryKey: ['quotes', params], queryFn: () => quotesApi.list(params) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const currency = settings?.currencySymbol ?? '€';
  const invalidate = () => qc.invalidateQueries({ queryKey: ['quotes'] });
  const convert = useMutation({ mutationFn: quotesApi.convert, onSuccess: () => { toast.success(t('history.converted')); invalidate(); }, onError: (e: { response?: { data?: { code?: string } } }) => toast.error(t(e?.response?.data?.code === 'already_order' ? 'history.alreadyOrder' : 'history.actionFailed')) });
  const remove = useMutation({ mutationFn: quotesApi.remove, onSuccess: () => { toast.success(t('history.deleted')); setToDelete(null); invalidate(); }, onError: () => toast.error(t('history.actionFailed')) });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));
  const reset = () => setPage(1);

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('history.title')}</h1><p className="text-sm text-muted-foreground">{t('history.subtitle')}</p></div>
      <div className="flex flex-wrap gap-2">
        <Input className="h-8 w-full sm:w-64" placeholder={t('history.search')} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
        <select aria-label={t('history.cols.kind')} className={selectClass} value={kind} onChange={(e) => { setKind(e.target.value as QuoteKind | ''); reset(); }}>
          <option value="">{t('history.allKinds')}</option>{QUOTE_KINDS.map((k) => <option key={k} value={k}>{t(`quote.kinds.${k}`)}</option>)}
        </select>
        <select aria-label={t('history.cols.status')} className={selectClass} value={status} onChange={(e) => { setStatus(e.target.value as QuoteStatus | ''); reset(); }}>
          <option value="">{t('history.allStatuses')}</option>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{t(`quote.statuses.${s}`)}</option>)}
        </select>
      </div>
      <Card><CardContent className="p-4">
        {data && data.items.length === 0 ? <EmptyState title={t('history.empty')} /> : (
          <MonthGroups items={data?.items ?? []} dateOf={(x) => x.createdAt} countLabel={(n) => t('history.count', { count: n })} renderItem={(x) => (
            <div key={x.id} onDoubleClick={() => navigate(`/?quote=${x.id}`)} className="grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_5rem_7rem_3rem_7rem_auto] items-center gap-2 border-t px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground">{formatDate(x.createdAt, i18n.language)}</span>
              <span className="truncate font-medium">{x.projectName || '—'}</span>
              <span className="truncate">{x.customer}</span>
              <Badge variant={x.kind === 'ORDER' ? 'default' : 'outline'}>{t(`quote.kinds.${x.kind}`)}</Badge>
              <span className="text-xs">{t(`quote.statuses.${x.status}`)}</span>
              <span className="text-xs text-right">{x.quantity}</span>
              <span className="text-right font-mono-data">{formatMoney(x.finalPrice, currency, i18n.language)}</span>
              <span className="flex gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('history.load')} title={t('history.load')} onClick={() => navigate(`/?quote=${x.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('history.convert')} title={t('history.convert')} disabled={x.kind === 'ORDER' || convert.isPending} onClick={() => convert.mutate(x.id)}><Repeat className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={t('history.delete')} title={t('history.delete')} onClick={() => setToDelete(x)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </span>
            </div>
          )} />
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t('history.hint')}</p>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
        </div>
      </CardContent></Card>
      <ConfirmDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)} title={t('history.deleteTitle')} description={t('history.deleteDescription', { name: toDelete?.projectName ?? '' })} destructive loading={remove.isPending} onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }} />
    </div>
  );
}
```

Le `renderItem` rend un bloc par ligne dans une grille CSS, enveloppé dans `overflow-x-auto` si besoin (la grille a une largeur minimale implicite d'environ 46 rem ; sur téléphone, `MonthGroups` peut être placé dans un `div.overflow-x-auto`). Dans `App.tsx` : `const History = lazy(() => import('@/pages/History'));` et `<Route path="/history" element={<History />} />`.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/History.test.tsx` → PASS, 3 tests.

- [ ] **Step 11: Vérifier, committer**

Run: `pnpm --filter @calc3d/frontend run typecheck && pnpm lint && pnpm --filter @calc3d/frontend run test`
Expected: au vert.

```bash
git add -A
git commit -m "Ajoute la page Historique et le mode devis chargé de la page Devis"
```

---

### Task 6: Frontend — page Achats

**Files:**
- Create: `packages/frontend/src/pages/Purchases.tsx`, `src/pages/Purchases.test.tsx`, `scripts/i18n-fragments/purchases.json`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `purchasesApi`, `PURCHASE_CATEGORIES`, `MonthGroups`, `parseLocaleNumber`, `formatMoney`, `formatDate`, `todayIso`.
- Produces: page `/purchases`.

- [ ] **Step 1: Fragment i18n**

`scripts/i18n-fragments/purchases.json` :
```json
{
  "namespace": "purchases",
  "keys": {
    "en": {
      "title": "Purchases", "subtitle": "Record your actual purchases (filament, parts, maintenance…)", "new": "New purchase",
      "date": "Date", "category": "Category", "description": "Description", "amount": "Amount", "supplier": "Supplier", "comment": "Comment", "save": "Save purchase",
      "categories": { "FILAMENT": "Filament / consumables", "SPARE_PARTS": "Spare parts", "MAINTENANCE": "Maintenance / repair", "HARDWARE": "Hardware / equipment", "TOOLS": "Tools", "OTHER": "Other" },
      "listTitle": "Purchase history", "search": "Search (description / supplier)", "allCategories": "All categories", "filterCategory": "Category filter", "count": "{{count}} purchase(s)", "empty": "No purchase matches these filters.",
      "delete": "Delete", "deleteTitle": "Delete purchase", "deleteDescription": "Permanently delete purchase \"{{name}}\"?", "saved": "Purchase saved.", "deleted": "Purchase deleted.", "failed": "The action failed.",
      "errors": { "description": "Enter a description.", "amount": "Amount must be greater than 0.", "date": "Enter a date." }
    },
    "fr": {
      "title": "Achats", "subtitle": "Enregistre tes achats réels (filament, pièces, maintenance…)", "new": "Nouvel achat",
      "date": "Date", "category": "Catégorie", "description": "Description", "amount": "Montant", "supplier": "Fournisseur", "comment": "Commentaire", "save": "Enregistrer l'achat",
      "categories": { "FILAMENT": "Filament / consommables", "SPARE_PARTS": "Pièces détachées", "MAINTENANCE": "Maintenance / réparation", "HARDWARE": "Matériel / équipement", "TOOLS": "Outillage", "OTHER": "Autre" },
      "listTitle": "Historique des achats", "search": "Recherche (description / fournisseur)", "allCategories": "Toutes les catégories", "filterCategory": "Filtre catégorie", "count": "{{count}} achat(s)", "empty": "Aucun achat ne correspond à ces filtres.",
      "delete": "Supprimer", "deleteTitle": "Supprimer l'achat", "deleteDescription": "Supprimer définitivement l'achat « {{name}} » ?", "saved": "Achat enregistré.", "deleted": "Achat supprimé.", "failed": "L'action a échoué.",
      "errors": { "description": "Renseigne une description.", "amount": "Le montant doit être supérieur à 0.", "date": "Renseigne une date." }
    }
  }
}
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

- [ ] **Step 2: Test (échoue)**

`src/pages/Purchases.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import Purchases from './Purchases';

const list = vi.fn(); const create = vi.fn(); const remove = vi.fn();
vi.mock('@/api/purchases.api', () => ({ purchasesApi: { list: (q: unknown) => list(q), create: (b: unknown) => create(b), remove: (id: number) => remove(id) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ currencySymbol: '€' }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Purchases /></QueryClientProvider>);
}

describe('page Achats', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { list.mockReset(); create.mockReset(); remove.mockReset(); list.mockResolvedValue({ total: 1, page: 1, limit: 50, items: [{ id: 1, date: '2026-10-05', category: 'FILAMENT', description: 'Bobine PLA', amount: 18.9, supplier: 'Shop', comment: '', legacyId: null, createdAt: '' }] }); });

  it('liste groupée par mois avec montant formaté et filtre par catégorie', async () => {
    renderPage();
    expect(await screen.findByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Bobine PLA')).toBeInTheDocument();
    expect(screen.getByText(/18,90/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Filtre catégorie/), { target: { value: 'TOOLS' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'TOOLS', page: 1 })));
  });
  it('refuse un montant nul, puis enregistre un achat saisi avec une virgule', async () => {
    create.mockResolvedValue({ id: 2 });
    renderPage();
    await screen.findByText('Bobine PLA');
    fireEvent.change(screen.getByLabelText(/^Description$/), { target: { value: 'Buse 0.4' } });
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l'achat/ }));
    expect(await screen.findByText(/supérieur à 0/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '12,5' } });
    fireEvent.change(screen.getByLabelText(/^Catégorie$/), { target: { value: 'SPARE_PARTS' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l'achat/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ description: 'Buse 0.4', amount: 12.5, category: 'SPARE_PARTS' })));
    expect(create.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('supprime après confirmation', async () => {
    remove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Bobine PLA');
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
});
```
Run → FAIL.

- [ ] **Step 3: Implémenter `pages/Purchases.tsx`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';
import { PURCHASE_CATEGORIES, type PurchaseCategory, type PurchaseDto } from '@calc3d/common';
import { purchasesApi } from '@/api/purchases.api';
import { settingsApi } from '@/api/settings.api';
import { formatDate, todayIso } from '@/lib/dates';
import { formatMoney, parseLocaleNumber } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { MonthGroups } from '@/components/shared/MonthGroups';

const LIMIT = 50;
const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
const emptyForm = () => ({ date: todayIso(), category: 'FILAMENT' as PurchaseCategory, description: '', amount: '', supplier: '', comment: '' });

export default function Purchases() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<{ description?: string; amount?: string; date?: string }>({});
  const [q, setQ] = useState(''); const [category, setCategory] = useState<PurchaseCategory | ''>(''); const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<PurchaseDto | null>(null);
  const params = { q: q || undefined, category: category || undefined, page, limit: LIMIT };
  const { data } = useQuery({ queryKey: ['purchases', params], queryFn: () => purchasesApi.list(params) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const currency = settings?.currencySymbol ?? '€';
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['finances'] }); };
  const create = useMutation({ mutationFn: purchasesApi.create, onSuccess: () => { toast.success(t('purchases.saved')); setForm(emptyForm()); invalidate(); }, onError: () => toast.error(t('purchases.failed')) });
  const remove = useMutation({ mutationFn: purchasesApi.remove, onSuccess: () => { toast.success(t('purchases.deleted')); setToDelete(null); invalidate(); }, onError: () => toast.error(t('purchases.failed')) });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseLocaleNumber(form.amount);
    const errs: typeof errors = {};
    if (!form.description.trim()) errs.description = t('purchases.errors.description');
    if (amount === null || amount <= 0) errs.amount = t('purchases.errors.amount');
    if (!form.date) errs.date = t('purchases.errors.date');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate({ date: form.date, category: form.category, description: form.description.trim(), amount: amount!, supplier: form.supplier.trim(), comment: form.comment });
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('purchases.title')}</h1><p className="text-sm text-muted-foreground">{t('purchases.subtitle')}</p></div>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">{t('purchases.new')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="p-date" className="text-xs">{t('purchases.date')}</Label><Input id="p-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-invalid={!!errors.date} />{errors.date && <p className="text-xs text-destructive">{errors.date}</p>}</div>
            <div className="space-y-1"><Label htmlFor="p-category" className="text-xs">{t('purchases.category')}</Label>
              <select id="p-category" className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PurchaseCategory })}>{PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`purchases.categories.${c}`)}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="p-amount" className="text-xs">{t('purchases.amount')} ({currency})</Label><Input id="p-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-invalid={!!errors.amount} />{errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}</div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="p-description" className="text-xs">{t('purchases.description')}</Label><Input id="p-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-invalid={!!errors.description} />{errors.description && <p className="text-xs text-destructive">{errors.description}</p>}</div>
            <div className="space-y-1"><Label htmlFor="p-supplier" className="text-xs">{t('purchases.supplier')}</Label><Input id="p-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-3"><Label htmlFor="p-comment" className="text-xs">{t('purchases.comment')}</Label><Textarea id="p-comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
            <div className="sm:col-span-3"><Button type="submit" disabled={create.isPending}><Save className="mr-1 h-4 w-4" />{t('purchases.save')}</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">{t('purchases.listTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input className="h-8 w-full sm:w-64" placeholder={t('purchases.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <select aria-label={t('purchases.filterCategory')} className="flex h-8 rounded-md border border-input bg-background px-2 text-sm" value={category} onChange={(e) => { setCategory(e.target.value as PurchaseCategory | ''); setPage(1); }}>
              <option value="">{t('purchases.allCategories')}</option>{PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`purchases.categories.${c}`)}</option>)}
            </select>
          </div>
          {data && data.items.length === 0 ? <EmptyState title={t('purchases.empty')} /> : (
            <MonthGroups items={data?.items ?? []} dateOf={(x) => x.date} countLabel={(n) => t('purchases.count', { count: n })} renderItem={(x) => (
              <div key={x.id} className="grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_auto] items-center gap-2 border-t px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">{formatDate(x.date, i18n.language)}</span>
                <span className="text-xs">{t(`purchases.categories.${x.category}`)}</span>
                <span className="truncate font-medium" title={x.comment || undefined}>{x.description}</span>
                <span className="truncate text-xs">{x.supplier}</span>
                <span className="text-right font-mono-data">{formatMoney(x.amount, currency, i18n.language)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={t('purchases.delete')} title={t('purchases.delete')} onClick={() => setToDelete(x)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            )} />
          )}
          <div className="flex items-center justify-end gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)} title={t('purchases.deleteTitle')} description={t('purchases.deleteDescription', { name: toDelete?.description ?? '' })} destructive loading={remove.isPending} onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }} />
    </div>
  );
}
```

Dans `App.tsx` : `const Purchases = lazy(() => import('@/pages/Purchases'));` et `<Route path="/purchases" element={<Purchases />} />`.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/Purchases.test.tsx` → PASS, 3 tests.

- [ ] **Step 4: Vérifier, committer**

Run: `pnpm --filter @calc3d/frontend run typecheck && pnpm lint && pnpm --filter @calc3d/frontend run test`

```bash
git add -A
git commit -m "Ajoute la page Achats"
```

---

### Task 7: Frontend — page Finances

**Files:**
- Create: `packages/frontend/src/pages/Finances.tsx`, `src/pages/Finances.test.tsx`, `src/components/finances/BarRow.tsx`, `scripts/i18n-fragments/finances.json`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `financesApi.get(period)`, `FinancesDto`, `FINANCES_PERIODS`, `COST_BREAKDOWN_KEYS`, `formatMoney`, `formatNumber`, `monthLabel`.
- Produces: page `/finances` ; `<BarRow label value max currency color />`.

- [ ] **Step 1: Fragment i18n**

`scripts/i18n-fragments/finances.json` :
```json
{
  "namespace": "finances",
  "keys": {
    "en": {
      "title": "Finances", "subtitle": "Revenue, expenses and margin on confirmed orders", "period": "Period",
      "periods": { "all": "All", "12m": "Last 12 months", "year": "This year", "month": "This month" },
      "kpi": { "revenue": "TOTAL REVENUE", "orders": "{{count}} order(s)", "printingCost": "PRINTING COSTS", "printingCostSub": "Filament, electricity, labor, depreciation…", "margin": "NET MARGIN (after printing costs)", "marginSub": "{{pct}} % of revenue", "purchases": "ACTUAL PURCHASES", "purchasesSub": "{{count}} purchase(s) · gap vs printing costs: {{gap}}" },
      "breakdown": { "title": "Printing cost breakdown by item (orders)", "empty": "No order in the selected period.", "filament": "Filament", "electricity": "Electricity", "labor": "Labor (all tasks)", "printer": "Printer depreciation, maintenance and wear", "fixedCosts": "Consumables / other fixed costs", "contingency": "Contingency / failure surcharge" },
      "monthly": { "title": "Monthly trend: revenue vs costs vs purchases", "empty": "No order or purchase in the selected period.", "revenue": "Revenue", "printingCost": "Printing cost", "purchases": "Actual purchases" },
      "categories": { "title": "Actual purchases by category", "empty": "No purchase recorded in the selected period." },
      "comparison": { "title": "Modeled printing cost (quotes) vs actual purchases", "modeled": "Modeled printing cost (quotes)", "actual": "Actual purchases" }
    },
    "fr": {
      "title": "Finances", "subtitle": "Revenu généré, dépenses et marge sur les commandes confirmées", "period": "Période",
      "periods": { "all": "Tout", "12m": "12 derniers mois", "year": "Cette année", "month": "Ce mois-ci" },
      "kpi": { "revenue": "REVENU TOTAL", "orders": "{{count}} commande(s)", "printingCost": "COÛTS D'IMPRESSION", "printingCostSub": "Filament, élec, MO, amortissement…", "margin": "MARGE NETTE (après coûts d'impression)", "marginSub": "{{pct}} % du revenu", "purchases": "ACHATS RÉELS", "purchasesSub": "{{count}} achat(s) · écart vs coûts d'impression : {{gap}}" },
      "breakdown": { "title": "Répartition du coût d'impression par poste (commandes)", "empty": "Aucune commande sur la période sélectionnée.", "filament": "Filament", "electricity": "Électricité", "labor": "Main d'œuvre (toutes tâches)", "printer": "Amortissement, maintenance et usure imprimante", "fixedCosts": "Consommables / autres coûts fixes", "contingency": "Majoration aléas / échec" },
      "monthly": { "title": "Évolution mensuelle : revenu vs coûts vs achats", "empty": "Aucune commande ou aucun achat sur la période sélectionnée.", "revenue": "Revenu", "printingCost": "Coût d'impression", "purchases": "Achats réels" },
      "categories": { "title": "Répartition des achats réels par catégorie", "empty": "Aucun achat enregistré sur la période sélectionnée." },
      "comparison": { "title": "Coût d'impression modélisé (devis) vs achats réels", "modeled": "Coût d'impression modélisé (devis)", "actual": "Achats réels" }
    }
  }
}
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

- [ ] **Step 2: Test (échoue)**

`src/pages/Finances.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import Finances from './Finances';
import type { FinancesDto } from '@calc3d/common';

const get = vi.fn();
vi.mock('@/api/finances.api', () => ({ financesApi: { get: (p: string) => get(p) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ currencySymbol: '€' }) } }));

const dto: FinancesDto = {
  period: 'all',
  orders: { count: 2, revenue: 150, printingCost: 100, netMargin: 50, netMarginPct: 33.333 },
  purchases: { count: 1, total: 40, gapVsPrintingCost: -60 },
  costBreakdown: [{ key: 'labor', amount: 40, pct: 40 }, { key: 'filament', amount: 30, pct: 30 }, { key: 'contingency', amount: 10, pct: 10 }, { key: 'fixedCosts', amount: 8, pct: 8 }, { key: 'printer', amount: 7, pct: 7 }, { key: 'electricity', amount: 5, pct: 5 }],
  monthly: [{ month: '2026-10', revenue: 100, printingCost: 60, purchases: 40 }, { month: '2026-09', revenue: 50, printingCost: 40, purchases: 0 }],
  purchasesByCategory: [{ category: 'FILAMENT', amount: 40, pct: 100 }],
  comparison: { modeledCost: 100, actualPurchases: 40 },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Finances /></QueryClientProvider>);
}

describe('page Finances', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); get.mockResolvedValue(dto); });

  it('affiche les indicateurs, la répartition triée, les mois et le comparatif', async () => {
    renderPage();
    expect(await screen.findByText('150,00 €')).toBeInTheDocument();
    expect(screen.getByText('2 commande(s)')).toBeInTheDocument();
    expect(screen.getByText(/33,3 % du revenu/)).toBeInTheDocument();
    expect(screen.getByText(/1 achat\(s\) · écart vs coûts d'impression : -60,00 €/)).toBeInTheDocument();
    const bars = screen.getAllByTestId('bar-label').map((e) => e.textContent);
    expect(bars[0]).toMatch(/Main d'œuvre \(toutes tâches\) \(40 %\)/);
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Septembre 2026')).toBeInTheDocument();
    expect(screen.getByText(/Filament \/ consommables \(100 %\)/)).toBeInTheDocument();
    expect(screen.getByText(/Coût d'impression modélisé/)).toBeInTheDocument();
  });
  it('changer la période relance la requête', async () => {
    renderPage();
    await screen.findByText('150,00 €');
    fireEvent.change(screen.getByLabelText(/Période/), { target: { value: 'year' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('year'));
  });
  it('sans commande : messages vides, pas de NaN', async () => {
    get.mockResolvedValue({ ...dto, orders: { count: 0, revenue: 0, printingCost: 0, netMargin: 0, netMarginPct: 0 }, costBreakdown: dto.costBreakdown.map((c) => ({ ...c, amount: 0, pct: 0 })), monthly: [], purchasesByCategory: [], purchases: { count: 0, total: 0, gapVsPrintingCost: 0 } });
    renderPage();
    expect(await screen.findByText(/Aucune commande sur la période/)).toBeInTheDocument();
    expect(screen.getByText(/Aucune commande ou aucun achat/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun achat enregistré/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});
```
Run → FAIL.

- [ ] **Step 3: `BarRow.tsx` et `pages/Finances.tsx`**

`src/components/finances/BarRow.tsx` :
```tsx
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/number';

interface Props { label: string; value: number; max: number; currency: string; color: string }

/** Barre horizontale proportionnelle, équivalent de New-LigneBarre (application bureau). */
export function BarRow({ label, value, max, currency, color }: Props) {
  const { i18n } = useTranslation();
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="py-1">
      <div className="flex justify-between gap-4 text-xs"><span data-testid="bar-label">{label}</span><span className="font-mono-data tabular-nums">{formatMoney(value, currency, i18n.language)}</span></div>
      <div className="mt-1 h-2 w-full rounded bg-muted"><div className="h-2 rounded" style={{ width: `${width}%`, backgroundColor: color }} /></div>
    </div>
  );
}
```

`src/pages/Finances.tsx` :
```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FINANCES_PERIODS, type FinancesPeriod } from '@calc3d/common';
import { financesApi } from '@/api/finances.api';
import { settingsApi } from '@/api/settings.api';
import { formatMoney, formatNumber } from '@/lib/number';
import { monthLabel } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { BarRow } from '@/components/finances/BarRow';

const COLORS = { revenue: '#4F46E5', cost: '#F59E0B', purchases: '#DC2626' };

// Déclarés au niveau module : la règle react-hooks refuse les composants créés pendant le rendu.
const Empty = ({ text }: { text: string }) => <p className="text-xs text-muted-foreground">{text}</p>;
const Kpi = ({ title, value, sub }: { title: string; value: string; sub: string }) => (
  <Card><CardContent className="p-4"><p className="text-[10px] font-semibold tracking-widest text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold font-mono-data">{value}</p><p className="text-xs text-muted-foreground">{sub}</p></CardContent></Card>
);

export default function Finances() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<FinancesPeriod>('all');
  const { data } = useQuery({ queryKey: ['finances', period], queryFn: () => financesApi.get(period) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const cur = settings?.currencySymbol ?? '€';
  const loc = i18n.language;
  const money = (v: number) => formatMoney(v, cur, loc);
  if (!data) return <PageLoader />;
  const maxMonthly = Math.max(0, ...data.monthly.flatMap((m) => [m.revenue, m.printingCost, m.purchases]));
  const maxCost = Math.max(0, ...data.costBreakdown.map((c) => c.amount));
  const maxCat = Math.max(0, ...data.purchasesByCategory.map((c) => c.amount));
  const maxCmp = Math.max(data.comparison.modeledCost, data.comparison.actualPurchases);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><h1 className="text-xl font-semibold">{t('finances.title')}</h1><p className="text-sm text-muted-foreground">{t('finances.subtitle')}</p></div>
        <label className="text-xs">{t('finances.period')}
          <select aria-label={t('finances.period')} className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value as FinancesPeriod)}>
            {FINANCES_PERIODS.map((p) => <option key={p} value={p}>{t(`finances.periods.${p}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title={t('finances.kpi.revenue')} value={money(data.orders.revenue)} sub={t('finances.kpi.orders', { count: data.orders.count })} />
        <Kpi title={t('finances.kpi.printingCost')} value={money(data.orders.printingCost)} sub={t('finances.kpi.printingCostSub')} />
        <Kpi title={t('finances.kpi.margin')} value={money(data.orders.netMargin)} sub={t('finances.kpi.marginSub', { pct: formatNumber(data.orders.netMarginPct, loc, 1) })} />
        <Kpi title={t('finances.kpi.purchases')} value={money(data.purchases.total)} sub={t('finances.kpi.purchasesSub', { count: data.purchases.count, gap: money(data.purchases.gapVsPrintingCost) })} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.breakdown.title')}</CardTitle></CardHeader><CardContent>
          {data.orders.printingCost <= 0 ? <Empty text={t('finances.breakdown.empty')} /> : data.costBreakdown.map((c) => <BarRow key={c.key} label={`${t(`finances.breakdown.${c.key}`)} (${formatNumber(c.pct, loc, 0)} %)`} value={c.amount} max={maxCost} currency={cur} color={COLORS.cost} />)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.monthly.title')}</CardTitle></CardHeader><CardContent>
          {data.monthly.length === 0 ? <Empty text={t('finances.monthly.empty')} /> : data.monthly.map((m) => (
            <div key={m.month} className="mb-3"><p className="text-xs font-semibold">{monthLabel(m.month, loc)}</p>
              <BarRow label={t('finances.monthly.revenue')} value={m.revenue} max={maxMonthly} currency={cur} color={COLORS.revenue} />
              <BarRow label={t('finances.monthly.printingCost')} value={m.printingCost} max={maxMonthly} currency={cur} color={COLORS.cost} />
              <BarRow label={t('finances.monthly.purchases')} value={m.purchases} max={maxMonthly} currency={cur} color={COLORS.purchases} />
            </div>
          ))}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.categories.title')}</CardTitle></CardHeader><CardContent>
          {data.purchasesByCategory.length === 0 ? <Empty text={t('finances.categories.empty')} /> : data.purchasesByCategory.map((c) => <BarRow key={c.category} label={`${t(`purchases.categories.${c.category}`)} (${formatNumber(c.pct, loc, 0)} %)`} value={c.amount} max={maxCat} currency={cur} color={COLORS.purchases} />)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.comparison.title')}</CardTitle></CardHeader><CardContent>
          <BarRow label={t('finances.comparison.modeled')} value={data.comparison.modeledCost} max={maxCmp} currency={cur} color={COLORS.cost} />
          <BarRow label={t('finances.comparison.actual')} value={data.comparison.actualPurchases} max={maxCmp} currency={cur} color={COLORS.purchases} />
        </CardContent></Card>
      </div>
    </div>
  );
}
```
Dans `App.tsx` : `const Finances = lazy(() => import('@/pages/Finances'));` et `<Route path="/finances" element={<Finances />} />`.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/Finances.test.tsx` → PASS, 3 tests.

- [ ] **Step 4: Vérifier, committer**

Run: `pnpm --filter @calc3d/frontend run typecheck && pnpm lint && pnpm --filter @calc3d/frontend run test`

```bash
git add -A
git commit -m "Ajoute la page Finances"
```

---

### Task 8: Menu, documentation, spec, vérification visuelle et de bout en bout

**Files:**
- Modify: `packages/frontend/src/components/layout/Sidebar.tsx`, `Sidebar.test.tsx`, `README.md`, `README.fr.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-12-calc3d-web-design.md`

- [ ] **Step 1: Menu**

Dans `Sidebar.tsx`, retirer `comingSoon: true` des trois entrées et le commentaire « Lot 2 » ; conserver le champ `comingSoon?` du type et le filtre (utile pour les lots suivants). Dans `Sidebar.test.tsx`, remplacer le cas « does not list pages that do not exist yet » par :
```tsx
  it('lists the four workshop pages', () => {
    setViewportWidth(1280);
    setup();
    for (const name of ['Quote', 'History', 'Purchases', 'Finances']) expect(screen.getByRole('link', { name })).toBeInTheDocument();
  });
```
Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/layout/Sidebar.test.tsx` → PASS.

- [ ] **Step 2: Documentation**

- `CHANGELOG.md` : section `## [0.2.0] - <date> — lot 2` sous `[Non publié]` : Historique (liste groupée par mois, filtres, chargement avec paramètres d'origine, mise à jour sans doublon, recalcul avec les paramètres actuels sur demande, conversion en commande, suppression), Achats, Finances (cinq blocs), API correspondante ; note « Différence assumée avec la version bureau : le poste coûts fixes ne compte plus les consommables deux fois ».
- `README.md` / `README.fr.md` : section Fonctionnalités : remplacer « À venir : lot 2 … » par les trois pages, garder « À venir : lot 3 ».
- `CLAUDE.md` : routes ajoutées, `computeFinances` dans `common`, `MonthGroups`, mode `?quote=<id>`, la règle « jamais de recalcul côté historique/finances ».
- Spec §6 : remplacer `GET/PUT /me/language` par `PUT /api/auth/language (héritée de MC Manager)` ; marquer `PUT /quotes/:id/settings` « reporté : couvert par `?useCurrentSettings=1` ; une édition de l'instantané champ par champ sera ajoutée si le besoin apparaît » ; cocher le lot 2 comme implémenté dans §12.

- [ ] **Step 3: Chaîne CI locale**

Run: `pnpm install --frozen-lockfile && pnpm audit --audit-level high && pnpm db:generate && pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: au vert.

- [ ] **Step 4: Vérification dans le navigateur (Chrome, extension connectée)**

Démarrer `pnpm dev`. Dans Chrome, parcourir : Devis → saisir le cas G1 → Enregistrer ; Historique → la ligne apparaît dans le mois courant, filtres, Charger dans Devis (bandeau ambre, prix identique), modifier le client, Mettre à jour (pas de doublon dans l'historique), Convertir en commande ; Achats → saisir un achat, le voir groupé par mois ; Finances → revenu = prix du devis converti, achats = montant saisi, barres visibles ; vérifier l'absence d'erreur dans la console. Prendre une capture de chaque page pour le compte rendu.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Affiche les pages du lot 2 dans le menu, met à jour la documentation et la spec"
```

---

## Notes

- `PUT /quotes/:id/settings` (spec §6) n'est pas implémenté : l'interrupteur « Recalculer avec mes paramètres actuels » couvre le besoin réel (reprendre un vieux devis aux tarifs d'aujourd'hui). La spec est mise à jour à la tâche 8.
- Les montants d'historique et de finances sont lus tels qu'enregistrés ; un devis antérieur à un changement de formule garde son prix, comme dans l'application bureau.
- Lot 3 à suivre : import G-code dans le navigateur, page d'impression `/quotes/:id/print` (réutilise `QuoteResultPanel` en mode client), import des données bureau. Le bouton Exporter de la page Devis reste désactivé jusque-là.
