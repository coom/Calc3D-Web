# Calc3D-Web lot 4 — lien client, réponse au devis, SMTP : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le propriétaire d'un devis génère un lien unique, le client consulte le devis en lecture seule et l'accepte ou le refuse, la réponse apparaît dans l'application, et un SMTP configurable envoie le lien au client et la notification au propriétaire.

**Architecture:** Jeton aléatoire stocké haché sur `Quote`, routes propriétaire sous `/api/quotes` (cloisonnées), routes publiques sous `/api/public` (sans auth, limiteur dédié), DTO public construit par une fonction pure de `@calc3d/common` partagée par l'API et par la page d'impression. Page publique `/q/:token` et page d'impression partagent un composant `QuoteDocument`. SMTP en base (mot de passe chiffré), `nodemailer` derrière un module `mailer.ts` injectable pour les tests.

**Tech Stack:** pnpm monorepo, Express 4 + Prisma 6/SQLite, zod, nodemailer, React 18 + Vite + Tailwind/shadcn, TanStack Query, i18next, vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-calc3d-web-lot4-partage-design.md` (et la spec générale `2026-10-12-calc3d-web-design.md` §9 pour les invariants).

## Global Constraints

- Cloisonnement : toute requête Prisma sur `Quote` passe par `ownerScope(req)` ; une ressource d'autrui répond 404 ; l'admin n'a aucun passe-droit (spec générale §3).
- Routes publiques : montées sous `/api/public` **avant** `authMiddleware`, limiteur 30 requêtes / 15 min / IP, corps JSON ≤ 16 ko, 404 pour tout jeton inconnu (spec lot 4 §4, §8).
- Jeton : `randomBytes(32).toString('base64url')`, stocké SHA-256 hex dans `shareTokenHash` (`@unique`) ; jamais stocké ni renvoyé en clair après la génération (§3, §8).
- DTO public : jamais `settingsSnapshot`, `pricingMode`, `pricingPct`, `userId`, `legacyId`, e-mail du propriétaire ; `costLines` seulement si `pdfShowCostBreakdown` (§4).
- Montants enregistrés, jamais recalculés (spec générale §6).
- Valeurs canoniques : `clientResponse` ∈ `ACCEPTED` | `REFUSED` | `null` ; traduction côté frontend uniquement.
- Seul appel réseau sortant autorisé : SMTP vers l'hôte configuré par l'admin ; aucun test n'ouvre de connexion réseau (§7).
- Mot de passe SMTP chiffré avec `utils/crypto.encrypt`, jamais renvoyé ; chaîne vide en `PUT` = inchangé (§6).
- i18n : fragments dans `packages/frontend/scripts/i18n-fragments/` puis `node packages/frontend/scripts/merge-i18n.mjs` ; jamais éditer `fr.json` / `en.json` à la main.
- Messages HTTP en anglais avec `code` stable ; le frontend traduit par code.
- Attention outil d'écriture : les séquences `\uXXXX`, et via le shell `\n` / `\r`, sont converties en caractères littéraux ; écrire les fichiers qui en contiennent avec un script Python et `chr()`.
- `FRONTEND_URL` sert de base aux liens ; jamais l'en-tête `Host`.

## Review Focus

1. Jeton révoqué puis régénéré : l'ancien lien doit répondre 404 et la réponse précédente doit être effacée (test Task 1, `POST /share` deux fois).
2. Client qui répond deux fois (double clic, deux onglets) : 409 `already_answered`, la première réponse reste (test Task 2).
3. Devis supprimé ou converti après partage : lien 404 après suppression ; après conversion la page publique affiche « Commande » et reste consultable (test Task 2).
4. Commentaire client hostile (`<script>`, 5 000 caractères, caractères de contrôle) : stocké tronqué à 2 000, échappé dans la page et dans l'e-mail (tests Task 2 et Task 4 `templates`).
5. SMTP activé mais injoignable : `POST /share/email` répond 502 `smtp_failed` avec le message du transport, rien n'est marqué envoyé ; la réponse d'un client est enregistrée même si la notification échoue (tests Task 4).

---

## Structure des fichiers

`packages/common/src/` :
- `constants.ts` (+ `CLIENT_RESPONSES`), `types/quotes.ts` (champs partage sur `QuoteDto`, `QuoteListQuery.response`), `types/public-quote.ts` (`PublicQuoteDto`), `quotes/to-public-quote.ts` (+ test) : `toPublicQuoteDto(quote, opts)`, `types/smtp.ts` (`SmtpSettingsDto`, `SmtpSettingsBody`), `types/audit.ts` (+ `'smtp.update'`), `index.ts`.

`packages/backend/` :
- `prisma/schema.prisma` : champs `Quote`, `User.email`, modèle `SmtpSettings`.
- `src/quotes/share-service.ts` (+ test) : `newShareToken()`, `hashShareToken(token)`, `shareUrl(token)`.
- `src/routes/quote-share.routes.ts` (+ test) : routes propriétaire (`/unseen-count`, `/:id/share`, `/:id/share/email`, `/:id/response/seen`).
- `src/routes/quotes.routes.ts` : filtre `response` dans `listFilters`.
- `src/quotes/quote-mapper.ts` : `toQuoteDto` étendu.
- `src/routes/public.routes.ts` (+ test) : `GET /quotes/:token`, `POST /quotes/:token/respond`.
- `src/mail/mailer.ts` (+ test), `src/mail/templates.ts` (+ test), `src/mail/smtp.schema.ts`, `src/routes/smtp.routes.ts` (+ test).
- `src/routes/auth.routes.ts` : `email` dans `/me`, `PUT /email`.
- `src/app.ts` : montages.

`packages/frontend/src/` :
- `api/quotes.api.ts` (+ partage), `api/public.api.ts`, `api/smtp.api.ts`, `api/auth.api.ts` (+ `updateEmail`).
- `components/quote/QuoteDocument.tsx` (extrait de `pages/QuotePrint.tsx`), `pages/PublicQuote.tsx` (+ test), `components/quote/ClientShareCard.tsx` (+ test), `components/quote/ResponseBadge.tsx`.
- `pages/History.tsx` (badge, filtre, pastille), `hooks/use-unseen-responses.ts`, `components/layout/Sidebar.tsx` (compteur).
- `components/settings/SmtpSettingsCard.tsx` (+ test), `components/settings/EmailCard.tsx`, `pages/Settings.tsx` (onglets), `App.tsx` (route `/q/:token`).
- `scripts/i18n-fragments/share.json`, `public-quote.json`, `smtp.json`, `account-email.json`.

Docs : `README.md`, `README.fr.md`, `CHANGELOG.md` (0.4.0), `CLAUDE.md`, `.env.example` (rien de nouveau : SMTP en base), spec générale §9 (invariant amendé).

---

### Task 1: Modèle, common, jeton de partage et routes propriétaire

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`, `packages/common/src/constants.ts`, `packages/common/src/types/quotes.ts`, `packages/common/src/types/audit.ts`, `packages/common/src/index.ts`, `packages/backend/src/quotes/quote-mapper.ts`, `packages/backend/src/routes/quotes.routes.ts`, `packages/backend/src/app.ts`, `packages/backend/src/routes/auth.routes.ts`
- Create: `packages/common/src/types/public-quote.ts`, `packages/common/src/types/smtp.ts`, `packages/common/src/quotes/to-public-quote.ts` (+ test), `packages/backend/src/quotes/share-service.ts` (+ test), `packages/backend/src/routes/quote-share.routes.ts` (+ test)

**Interfaces:**
- Produces (common) : `CLIENT_RESPONSES = ['ACCEPTED','REFUSED'] as const`, `ClientResponse`, `QuoteShareFields { shared: boolean; sharedAt: string | null; clientResponse: ClientResponse | null; clientRespondedAt: string | null; clientComment: string; responseSeenAt: string | null; clientEmail: string }` (inclus dans `QuoteDto`), `QuoteListQuery.response?: 'ACCEPTED' | 'REFUSED' | 'PENDING' | 'NONE'`, `PublicQuoteDto`, `PublicQuoteOptions { showCostBreakdown: boolean; currencySymbol: string; ownerDisplayName: string }`, `toPublicQuoteDto(quote: QuoteDto, opts: PublicQuoteOptions): PublicQuoteDto`, `SmtpSettingsDto`, `SmtpSettingsBody`, `AuditAction` + `'smtp.update'`.
- Produces (backend) : `newShareToken(): { token: string; hash: string }`, `hashShareToken(token: string): string`, `shareUrl(token: string): string` ; routes `GET /api/quotes/unseen-count`, `POST /api/quotes/:id/share` → `{ url }`, `DELETE /api/quotes/:id/share` → 204, `POST /api/quotes/:id/response/seen` → `QuoteDto`, `GET /api/quotes?response=` ; `GET /api/auth/me` renvoie `email`, `PUT /api/auth/email { email }`.
- Note : `POST /:id/share/email` est ajouté à ce routeur en Task 4 (il dépend du mailer).

- [ ] **Step 1: Schéma Prisma**

Dans `packages/backend/prisma/schema.prisma`, modèle `User` : ajouter `email String @default("")` après `language`. Modèle `Quote` : ajouter après `legacyId` :
```prisma
  shareTokenHash     String?   @unique
  sharedAt           DateTime?
  clientResponse     String?
  clientRespondedAt  DateTime?
  clientComment      String    @default("")
  responseSeenAt     DateTime?
  clientEmail        String    @default("")
```
et l'index `@@index([userId, clientResponse])` à côté des autres. Nouveau modèle en fin de fichier :
```prisma
model SmtpSettings {
  id          Int      @id @default(1)
  host        String   @default("")
  port        Int      @default(587)
  secure      Boolean  @default(false)
  username    String   @default("")
  passwordEnc String   @default("")
  fromAddress String   @default("")
  fromName    String   @default("")
  enabled     Boolean  @default(false)
  updatedAt   DateTime @updatedAt
}
```
Run: `pnpm db:generate` → `Generated Prisma Client`. (`testPrisma()` fait `db push` sur une base temporaire : rien d'autre à faire pour les tests.)

- [ ] **Step 2: Common — constantes, types, `toPublicQuoteDto` (test puis code)**

`packages/common/src/constants.ts`, ajouter :
```ts
export const CLIENT_RESPONSES = ['ACCEPTED', 'REFUSED'] as const;
export type ClientResponse = (typeof CLIENT_RESPONSES)[number];
export const RESPONSE_FILTERS = ['ACCEPTED', 'REFUSED', 'PENDING', 'NONE'] as const;
export type ResponseFilter = (typeof RESPONSE_FILTERS)[number];
```
`packages/common/src/types/quotes.ts` :
```ts
import type { ClientResponse, ResponseFilter } from '../constants.js';
export interface QuoteShareFields {
  shared: boolean; sharedAt: string | null;
  clientResponse: ClientResponse | null; clientRespondedAt: string | null; clientComment: string;
  responseSeenAt: string | null; clientEmail: string;
}
export interface QuoteDto extends QuoteProjectFields, QuoteInput, QuoteResult, QuoteShareFields { /* inchangé */ }
export interface QuoteListQuery { q?: string; kind?: QuoteKind; status?: QuoteStatus; response?: ResponseFilter; page: number; limit: number }
```
`packages/common/src/types/public-quote.ts` :
```ts
import type { ClientResponse, QuoteKind, QuoteStatus } from '../constants.js';
import type { FilamentLine } from '../pricing/types.js';

/** Ligne du détail du coût de revient, déjà libellée par une clé i18n côté client. */
export interface PublicCostLine { key: 'filament' | 'electricity' | 'laborPrep' | 'laborPost' | 'laborDesign' | 'laborPackaging' | 'depreciation' | 'maintenance' | 'wear' | 'fixedCosts' | 'contingency'; amount: number }

/** Ce que voit le client : strictement ce que montre le PDF. Jamais l'instantané, le mode ni le pourcentage de tarification. */
export interface PublicQuoteDto {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus; dueDate: string | null; quantity: number; comment: string;
  filamentLines: FilamentLine[]; printTimeH: number; energyKwh: number; contingencyPct: number;
  laborTotal: number; fixedCosts: number;
  costLines: PublicCostLine[] | null; costAfterContingency: number | null;
  unitPriceExclTax: number; totalExclTax: number; discountPct: number; discountAmount: number; shippingCost: number;
  vatPct: number; vatAmount: number; roundingApplied: boolean; roundingAmount: number; floorApplied: boolean; priceBeforeFloor: number; finalPrice: number;
  currencySymbol: string; ownerDisplayName: string;
  clientResponse: ClientResponse | null; clientRespondedAt: string | null;
}
export interface PublicQuoteOptions { showCostBreakdown: boolean; currencySymbol: string; ownerDisplayName: string }
export interface PublicRespondBody { decision: ClientResponse; comment?: string }
```
`packages/common/src/types/smtp.ts` :
```ts
export interface SmtpSettingsDto { host: string; port: number; secure: boolean; username: string; hasPassword: boolean; fromAddress: string; fromName: string; enabled: boolean }
/** `password` vide ou absent = inchangé. */
export interface SmtpSettingsBody { host: string; port: number; secure: boolean; username: string; password?: string; fromAddress: string; fromName: string; enabled: boolean }
```
`packages/common/src/types/audit.ts` : `| 'smtp.update'` ajouté à `AuditAction`.

Test `packages/common/src/quotes/to-public-quote.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { toPublicQuoteDto } from './to-public-quote.js';
import { DEFAULT_PRICING_SETTINGS, type QuoteDto } from '../index.js';

const quote: QuoteDto = {
  id: 7, createdAt: '2026-10-01T10:00:00Z', updatedAt: '', legacyId: 'abc', projectName: 'Boîtier', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: '2026-11-15', comment: 'Fragile',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 2, packagingHours: 0.25, quantity: 2, consumables: 1.5, discountPct: 10, shippingCost: 6.5,
  settingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, contingencyPct: 10, vatPct: 20, pricingMode: 'TARGET_MARGIN', pricingPct: 30 },
  filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05,
  unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26,
  shared: true, sharedAt: '2026-10-02T00:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-03T00:00:00Z', clientComment: 'ok', responseSeenAt: null, clientEmail: 'c@x.fr',
};
const FORBIDDEN = ['settingsSnapshot', 'pricingMode', 'pricingPct', 'userId', 'legacyId', 'id', 'clientEmail', 'responseSeenAt', 'clientComment', 'pricePerGram', 'pricePerHour', 'subtotal', 'contingency', 'priceBeforeRounding'];

describe('toPublicQuoteDto', () => {
  it('avec détail : lignes non nulles, coût de revient, TVA, arrondi ; jamais les clés internes', () => {
    const d = toPublicQuoteDto(quote, { showCostBreakdown: true, currencySymbol: '€', ownerDisplayName: 'Guillaume' });
    expect(d.costLines?.map((l) => l.key)).toEqual(['filament', 'electricity', 'laborPrep', 'laborDesign', 'laborPackaging', 'depreciation', 'maintenance', 'wear', 'fixedCosts', 'contingency']);
    expect(d.costAfterContingency).toBe(91.05); expect(d.contingencyPct).toBe(10); expect(d.vatPct).toBe(20); expect(d.laborTotal).toBeCloseTo(75.39, 6);
    expect(d.clientResponse).toBe('ACCEPTED'); expect(d.ownerDisplayName).toBe('Guillaume'); expect(d.currencySymbol).toBe('€');
    for (const k of FORBIDDEN) expect(d).not.toHaveProperty(k);
    expect(JSON.stringify(d)).not.toMatch(/TARGET_MARGIN|"30"|c@x\.fr/);
  });
  it('sans détail : costLines et costAfterContingency à null, main d\'œuvre totale et consommables seulement', () => {
    const d = toPublicQuoteDto(quote, { showCostBreakdown: false, currencySymbol: '€', ownerDisplayName: 'G' });
    expect(d.costLines).toBeNull(); expect(d.costAfterContingency).toBeNull(); expect(d.laborTotal).toBeCloseTo(75.39, 6); expect(d.fixedCosts).toBe(1.5);
  });
});
```
Run: `pnpm --filter @calc3d/common exec vitest run src/quotes` → FAIL (module introuvable).

`packages/common/src/quotes/to-public-quote.ts` :
```ts
import type { QuoteDto } from '../types/quotes.js';
import type { PublicCostLine, PublicQuoteDto, PublicQuoteOptions } from '../types/public-quote.js';

/** Vue client d'un devis : les mêmes sections que le PDF (Export-DevisHtml), rien d'interne. Fonction pure partagée par l'API publique et la page d'impression. */
export function toPublicQuoteDto(q: QuoteDto, opts: PublicQuoteOptions): PublicQuoteDto {
  const all: PublicCostLine[] = [
    { key: 'filament', amount: q.filamentCost }, { key: 'electricity', amount: q.electricityCost },
    { key: 'laborPrep', amount: q.laborPrep }, { key: 'laborPost', amount: q.laborPost }, { key: 'laborDesign', amount: q.laborDesign }, { key: 'laborPackaging', amount: q.laborPackaging },
    { key: 'depreciation', amount: q.depreciation }, { key: 'maintenance', amount: q.maintenance }, { key: 'wear', amount: q.wear },
    { key: 'fixedCosts', amount: q.fixedCosts }, { key: 'contingency', amount: q.contingency },
  ];
  return {
    projectName: q.projectName, customer: q.customer, kind: q.kind, status: q.status, dueDate: q.dueDate, quantity: q.quantity, comment: q.comment,
    filamentLines: q.filamentLines, printTimeH: q.printTimeH, energyKwh: q.energyKwh, contingencyPct: q.settingsSnapshot.contingencyPct,
    laborTotal: q.laborPrep + q.laborPost + q.laborDesign + q.laborPackaging, fixedCosts: q.fixedCosts,
    costLines: opts.showCostBreakdown ? all.filter((l) => l.amount > 0) : null,
    costAfterContingency: opts.showCostBreakdown ? q.costAfterContingency : null,
    unitPriceExclTax: q.unitPriceExclTax, totalExclTax: q.totalExclTax, discountPct: q.discountPct, discountAmount: q.discountAmount, shippingCost: q.shippingCost,
    vatPct: q.settingsSnapshot.vatPct, vatAmount: q.vatAmount, roundingApplied: q.roundingApplied, roundingAmount: q.roundingAmount, floorApplied: q.floorApplied, priceBeforeFloor: q.priceBeforeFloor, finalPrice: q.finalPrice,
    currencySymbol: opts.currencySymbol, ownerDisplayName: opts.ownerDisplayName,
    clientResponse: q.clientResponse, clientRespondedAt: q.clientRespondedAt,
  };
}
```
`index.ts` : `export * from './types/public-quote.js'; export * from './types/smtp.js'; export * from './quotes/to-public-quote.js';`.

Run: `pnpm --filter @calc3d/common run test` → PASS. Puis `pnpm --filter @calc3d/common run build` (le backend consomme `dist`).

- [ ] **Step 3: Mapper et mise à jour des fixtures**

`packages/backend/src/quotes/quote-mapper.ts`, `toQuoteDto` :
```ts
export function toQuoteDto(row: Quote): QuoteDto {
  const { userId: _userId, filamentLines, settingsSnapshot, dueDate, createdAt, updatedAt, kind, status, shareTokenHash, sharedAt, clientResponse, clientRespondedAt, responseSeenAt, ...rest } = row;
  return {
    ...rest,
    kind: kind as QuoteKind, status: status as QuoteStatus,
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    filamentLines: JSON.parse(filamentLines) as FilamentLine[],
    settingsSnapshot: JSON.parse(settingsSnapshot) as PricingSettings,
    shared: shareTokenHash !== null, sharedAt: sharedAt?.toISOString() ?? null,
    clientResponse: (clientResponse as ClientResponse | null) ?? null, clientRespondedAt: clientRespondedAt?.toISOString() ?? null,
    responseSeenAt: responseSeenAt?.toISOString() ?? null,
  };
}
```
(importer `ClientResponse` depuis `@calc3d/common`). Run `pnpm typecheck` : les tests frontend qui construisent un `QuoteDto` littéral (`Quote.test.tsx` `loaded`, `QuotePrint.test.tsx` `quote`) doivent recevoir les sept champs `shared: false, sharedAt: null, clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null, clientEmail: ''` ; les corriger.

- [ ] **Step 4: Service de jeton (test puis code)**

`packages/backend/src/quotes/share-service.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { newShareToken, hashShareToken, shareUrl } from './share-service.js';

describe('share-service', () => {
  it('jeton base64url de 43 caractères, hash SHA-256 hex stable, deux jetons différents', () => {
    const a = newShareToken(); const b = newShareToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(a.token)).toBe(a.hash);
    expect(a.token).not.toBe(b.token);
  });
  it('URL publique basée sur FRONTEND_URL, sans double barre', () => {
    expect(shareUrl('abc')).toMatch(/^https?:\/\/[^/]+\/q\/abc$/);
  });
});
```
Run → FAIL. `packages/backend/src/quotes/share-service.ts` :
```ts
import { createHash, randomBytes } from 'crypto';
import { config } from '../config.js';

/** Jeton de partage : 32 octets aléatoires ; seul le SHA-256 est stocké (spec lot 4 §8). */
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashShareToken(token) };
}
export function hashShareToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function shareUrl(token: string): string { return `${config.frontendUrl.replace(/\/+$/, '')}/q/${token}`; }
```
Run → PASS.

- [ ] **Step 5: Routes propriétaire (test puis code)**

`packages/backend/src/routes/quote-share.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { errorHandler } from '../middleware/error-handler.js';
import { quoteShareRoutes } from './quote-share.routes.js';
import { quotesRoutes } from './quotes.routes.js';
import { hashShareToken } from '../quotes/share-service.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

async function seedQuote(userId: number, extra: Record<string, unknown> = {}) {
  const zeros = { filamentWeightG: 0, filamentCost: 0, printTimeH: 0, energyKwh: 0, electricityCost: 0, laborPrep: 0, laborPost: 0, laborDesign: 0, laborPackaging: 0, depreciation: 0, maintenance: 0, wear: 0, fixedCosts: 0, subtotal: 0, contingency: 0, costAfterContingency: 0, unitPriceExclTax: 0, totalExclTax: 0, discountAmount: 0, vatAmount: 0, priceBeforeFloor: 0, floorApplied: false, priceBeforeRounding: 0, roundingAmount: 0, roundingApplied: false, finalPrice: 0, pricePerGram: 0, pricePerHour: 0 };
  return prisma.quote.create({ data: { userId, projectName: 'P', customer: 'C', kind: 'QUOTE', status: 'PENDING', quantity: 1, comment: '', filamentLines: '[]', printHours: 0, printMinutes: 0, prepHours: 0, postHours: 0, designHours: 0, packagingHours: 0, consumables: 0, discountPct: 0, shippingCost: 0, settingsSnapshot: JSON.stringify(DEFAULT_PRICING_SETTINGS), ...zeros, ...extra } });
}
/** Les deux routeurs montés comme dans app.ts : partage avant devis (sinon /unseen-count tombe sur /:id), errorHandler en dernier. */
function app(user: { id: number; username: string; role: string }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = { typ: 'access', id: user.id, username: user.username, role: user.role as 'admin' | 'user' }; next(); });
  a.locals.prisma = prisma;
  a.use('/api/quotes', quoteShareRoutes);
  a.use('/api/quotes', quotesRoutes);
  a.use(errorHandler);
  return a;
}

describe('routes de partage (propriétaire)', () => {
  it('génère un lien, le régénérer invalide l\'ancien et efface la réponse, révoquer retire le lien', async () => {
    const u = await createTestUser(prisma, 'alice');
    const q = await seedQuote(u.id);
    const r1 = await request(app(u)).post(`/api/quotes/${q.id}/share`);
    expect(r1.status).toBe(200); expect(r1.body.url).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);
    const token1 = r1.body.url.split('/q/')[1];
    const row1 = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row1?.shareTokenHash).toBe(hashShareToken(token1)); expect(row1?.sharedAt).not.toBeNull();
    await prisma.quote.update({ where: { id: q.id }, data: { clientResponse: 'REFUSED', clientRespondedAt: new Date(), clientComment: 'non' } });
    const r2 = await request(app(u)).post(`/api/quotes/${q.id}/share`);
    const row2 = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row2?.shareTokenHash).not.toBe(hashShareToken(token1)); expect(row2?.clientResponse).toBeNull(); expect(row2?.clientComment).toBe('');
    expect(r2.body.url).not.toBe(r1.body.url);
    expect((await request(app(u)).delete(`/api/quotes/${q.id}/share`)).status).toBe(204);
    expect((await prisma.quote.findUnique({ where: { id: q.id } }))?.shareTokenHash).toBeNull();
    const dto = (await request(app(u)).get(`/api/quotes/${q.id}`)).body;
    expect(dto.shared).toBe(false); expect(dto).not.toHaveProperty('shareTokenHash');
  });
  it('autre utilisateur et admin : 404 sur share, delete et seen', async () => {
    const u = await createTestUser(prisma, 'alice'); const v = await createTestUser(prisma, 'bob'); const adm = await createTestUser(prisma, 'root', 'admin');
    const q = await seedQuote(u.id);
    for (const other of [v, adm]) {
      expect((await request(app(other)).post(`/api/quotes/${q.id}/share`)).status).toBe(404);
      expect((await request(app(other)).delete(`/api/quotes/${q.id}/share`)).status).toBe(404);
      expect((await request(app(other)).post(`/api/quotes/${q.id}/response/seen`)).status).toBe(404);
    }
  });
  it('compteur de non-lus, marquage vu, filtre response', async () => {
    const u = await createTestUser(prisma, 'alice');
    const a = await seedQuote(u.id, { shareTokenHash: 'h1', sharedAt: new Date(), clientResponse: 'ACCEPTED', clientRespondedAt: new Date() });
    await seedQuote(u.id, { shareTokenHash: 'h2', sharedAt: new Date(), clientResponse: 'REFUSED', clientRespondedAt: new Date(), responseSeenAt: new Date() });
    const p = await seedQuote(u.id, { shareTokenHash: 'h3', sharedAt: new Date() });
    const n = await seedQuote(u.id);
    expect((await request(app(u)).get('/api/quotes/unseen-count')).body).toEqual({ count: 1 });
    const seen = await request(app(u)).post(`/api/quotes/${a.id}/response/seen`);
    expect(seen.status).toBe(200); expect(seen.body.responseSeenAt).not.toBeNull();
    expect((await request(app(u)).get('/api/quotes/unseen-count')).body).toEqual({ count: 0 });
    const ids = async (f: string) => (await request(app(u)).get(`/api/quotes?response=${f}`)).body.items.map((x: { id: number }) => x.id).sort();
    expect(await ids('ACCEPTED')).toEqual([a.id]);
    expect(await ids('PENDING')).toEqual([p.id]);
    expect(await ids('NONE')).toEqual([n.id]);
    expect((await request(app(u)).get('/api/quotes?response=MAYBE')).status).toBe(400);
  });
});
```
Run → FAIL.

`packages/backend/src/routes/quote-share.routes.ts` :
```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseId } from '../utils/paging.js';
import { toQuoteDto } from '../quotes/quote-mapper.js';
import { newShareToken, shareUrl } from '../quotes/share-service.js';

export const quoteShareRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Monté sur /api/quotes AVANT quotesRoutes (sinon /unseen-count serait capturé par /:id). */
quoteShareRoutes.get('/unseen-count', wrap(async (req, res) => {
  const count = await req.app.locals.prisma.quote.count({ where: { ...ownerScope(req), clientResponse: { not: null }, responseSeenAt: null } });
  res.json({ count });
}));

/** Génère (ou régénère) le lien : l'ancien jeton meurt, la réponse précédente est effacée (réouverture). Le jeton en clair n'est renvoyé qu'ici. */
quoteShareRoutes.post('/:id/share', wrap(async (req, res) => {
  const id = parseId(req.params.id); const scope = ownerScope(req);
  const { token, hash } = newShareToken();
  const r = await req.app.locals.prisma.quote.updateMany({ where: { id, ...scope }, data: { shareTokenHash: hash, sharedAt: new Date(), clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.json({ url: shareUrl(token) });
}));

quoteShareRoutes.delete('/:id/share', wrap(async (req, res) => {
  const r = await req.app.locals.prisma.quote.updateMany({ where: { id: parseId(req.params.id), ...ownerScope(req) }, data: { shareTokenHash: null } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.status(204).send();
}));

quoteShareRoutes.post('/:id/response/seen', wrap(async (req, res) => {
  const id = parseId(req.params.id); const scope = ownerScope(req); const prisma = req.app.locals.prisma;
  const r = await prisma.quote.updateMany({ where: { id, ...scope }, data: { responseSeenAt: new Date() } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.json(toQuoteDto((await prisma.quote.findFirst({ where: { id, ...scope } }))!));
}));
```
Dans `quotes.routes.ts`, `listFilters` : importer `RESPONSE_FILTERS, type ResponseFilter` et ajouter
```ts
  if (query.response !== undefined) {
    if (!RESPONSE_FILTERS.includes(query.response as ResponseFilter)) throw new AppError(400, 'Invalid response filter');
    const f = query.response as ResponseFilter;
    if (f === 'NONE') where.shareTokenHash = null;
    else if (f === 'PENDING') { where.shareTokenHash = { not: null }; where.clientResponse = null; }
    else where.clientResponse = f;
  }
```
Dans `app.ts` : `import { quoteShareRoutes } from './routes/quote-share.routes.js';` et `app.use('/api/quotes', quoteShareRoutes);` **juste avant** `app.use('/api/quotes', quotesRoutes);`, avec un commentaire sur l'ordre.

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/quote-share.routes.test.ts src/routes/quotes.routes.test.ts` → PASS.

- [ ] **Step 6: E-mail du compte (`/me`, `PUT /email`) — test puis code**

Dans `packages/backend/src/routes/auth.routes.test.ts` (ou un nouveau `auth-email.routes.test.ts` s'il n'existe pas de test unitaire simple sur `/me`), ajouter, avec `appAs(prisma, u, '/api/auth', authRoutes)` :
```ts
  it('PUT /api/auth/email enregistre une adresse valide ou vide, refuse une adresse invalide, /me la renvoie', async () => {
    const u = await createTestUser(prisma, 'alice');
    expect((await request(appAs(prisma, u, '/api/auth', authRoutes)).put('/api/auth/email').send({ email: 'pas-un-mail' })).status).toBe(400);
    expect((await request(appAs(prisma, u, '/api/auth', authRoutes)).put('/api/auth/email').send({ email: ' Alice@Example.com ' })).status).toBe(200);
    expect((await request(appAs(prisma, u, '/api/auth', authRoutes)).get('/api/auth/me')).body.user.email).toBe('alice@example.com');
    expect((await request(appAs(prisma, u, '/api/auth', authRoutes)).put('/api/auth/email').send({ email: '' })).status).toBe(200);
    expect((await request(appAs(prisma, u, '/api/auth', authRoutes)).get('/api/auth/me')).body.user.email).toBe('');
  });
```
Run → FAIL. Dans `auth.routes.ts` : ajouter `email: user.email` au JSON de `/me`, et après la route `/language` :
```ts
// PUT /api/auth/email — adresse de notification du compte (vide = aucune)
const emailSchema = z.object({ email: z.string().trim().max(200).refine((v) => v === '' || z.string().email().safeParse(v).success, 'invalid email') }).strict();
authRoutes.put('/email', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid email', undefined, 'validation');
    await req.app.locals.prisma.user.update({ where: { id: req.user!.id }, data: { email: parsed.data.email.toLowerCase() } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```
(`z` est déjà importé dans ce fichier ; sinon l'ajouter.) Côté common, `UserInfo` / DTO utilisateur de `types/auth.ts` : ajouter `email?: string`. Run → PASS.

- [ ] **Step 7: Vérifier, committer**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "Ajoute le lien de partage des devis et les routes propriétaire (API)"
```

---

### Task 2: Routes publiques, DTO public, page client `/q/:token`

**Files:**
- Create: `packages/backend/src/routes/public.routes.ts` (+ test), `packages/frontend/src/api/public.api.ts`, `packages/frontend/src/components/quote/QuoteDocument.tsx`, `packages/frontend/src/pages/PublicQuote.tsx` (+ test), `packages/frontend/scripts/i18n-fragments/public-quote.json`
- Modify: `packages/backend/src/app.ts`, `packages/frontend/src/pages/QuotePrint.tsx`, `packages/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `hashShareToken`, `toQuoteDto`, `toPublicQuoteDto`, `PublicQuoteDto`, `PublicRespondBody`, `getOrCreateSettings`.
- Produces: `GET /api/public/quotes/:token` → `PublicQuoteDto` ; `POST /api/public/quotes/:token/respond` → `PublicQuoteDto` (409 `already_answered`) ; `publicApi.get(token)`, `publicApi.respond(token, body)` ; `<QuoteDocument data={PublicQuoteDto} generatedAt={Date} />` ; route `/q/:token`.

- [ ] **Step 1: Routes publiques (test puis code)**

`packages/backend/src/routes/public.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { publicRoutes } from './public.routes.js';
import { errorHandler } from '../middleware/error-handler.js';
import { hashShareToken } from '../quotes/share-service.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.userSettings.deleteMany(); });

function app() { const a = express(); a.locals.prisma = prisma; a.use('/api/public', publicRoutes); a.use(errorHandler); return a; }
const TOKEN = 'a'.repeat(43);
async function seedShared(userId: number, extra: Record<string, unknown> = {}) {
  const zeros = { filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05, unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26 };
  return prisma.quote.create({ data: { userId, projectName: 'Boîtier <b>', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', quantity: 2, comment: 'Fragile', filamentLines: JSON.stringify([{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }]), printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 2, packagingHours: 0.25, consumables: 1.5, discountPct: 10, shippingCost: 6.5, settingsSnapshot: JSON.stringify({ ...DEFAULT_PRICING_SETTINGS, pricingMode: 'TARGET_MARGIN', pricingPct: 30, vatPct: 20 }), shareTokenHash: hashShareToken(TOKEN), sharedAt: new Date(), ...zeros, ...extra } });
}

describe('API publique du devis', () => {
  it('lecture par jeton : DTO client sans donnée interne ; jeton inconnu ou révoqué → 404', async () => {
    const u = await createTestUser(prisma, 'alice');
    await prisma.userSettings.create({ data: { userId: u.id, pdfShowCostBreakdown: false, currencySymbol: '$' } });
    const q = await seedShared(u.id);
    const r = await request(app()).get(`/api/public/quotes/${TOKEN}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ projectName: 'Boîtier <b>', finalPrice: 289, currencySymbol: '$', ownerDisplayName: 'alice', costLines: null, vatPct: 20, clientResponse: null });
    for (const k of ['settingsSnapshot', 'pricingMode', 'pricingPct', 'userId', 'legacyId', 'id', 'clientEmail']) expect(r.body).not.toHaveProperty(k);
    expect(JSON.stringify(r.body)).not.toMatch(/TARGET_MARGIN/);
    expect((await request(app()).get(`/api/public/quotes/${'b'.repeat(43)}`)).status).toBe(404);
    expect((await request(app()).get('/api/public/quotes/x')).status).toBe(404);
    await prisma.quote.update({ where: { id: q.id }, data: { shareTokenHash: null } });
    expect((await request(app()).get(`/api/public/quotes/${TOKEN}`)).status).toBe(404);
  });
  it('réponse : enregistrée une seule fois (409 ensuite), commentaire tronqué à 2000 et stocké brut, non-lu pour le propriétaire', async () => {
    const u = await createTestUser(prisma, 'alice');
    const q = await seedShared(u.id, { responseSeenAt: new Date() });
    const bad = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'MAYBE' });
    expect(bad.status).toBe(400);
    const comment = '<script>x</script>' + 'y'.repeat(3000);
    const r = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED', comment });
    expect(r.status).toBe(200); expect(r.body.clientResponse).toBe('ACCEPTED'); expect(r.body.clientRespondedAt).not.toBeNull();
    const row = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row?.clientComment.length).toBe(2000); expect(row?.clientComment.startsWith('<script>')).toBe(true); expect(row?.responseSeenAt).toBeNull();
    const again = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'REFUSED' });
    expect(again.status).toBe(409); expect(again.body.code).toBe('already_answered');
    expect((await prisma.quote.findUnique({ where: { id: q.id } }))?.clientResponse).toBe('ACCEPTED');
  });
  it('devis converti en commande : toujours consultable, kind ORDER ; devis supprimé : 404', async () => {
    const u = await createTestUser(prisma, 'alice');
    const q = await seedShared(u.id, { kind: 'ORDER' });
    expect((await request(app()).get(`/api/public/quotes/${TOKEN}`)).body.kind).toBe('ORDER');
    await prisma.quote.delete({ where: { id: q.id } });
    expect((await request(app()).get(`/api/public/quotes/${TOKEN}`)).status).toBe(404);
  });
  it('corps de plus de 16 ko refusé (413)', async () => {
    const u = await createTestUser(prisma, 'alice'); await seedShared(u.id);
    const r = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED', comment: 'z'.repeat(20_000) });
    expect(r.status).toBe(413);
  });
});
```
Run → FAIL.

`packages/backend/src/routes/public.routes.ts` :
```ts
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CLIENT_RESPONSES, toPublicQuoteDto, type PublicQuoteDto } from '@calc3d/common';
import type { PrismaClient, Quote } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { hashShareToken } from '../quotes/share-service.js';
import { toQuoteDto } from '../quotes/quote-mapper.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { logger } from '../utils/logger.js';

export const publicRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Routes sans authentification : limiteur propre (30 / 15 min / IP) et corps ≤ 16 ko (spec lot 4 §8). */
publicRoutes.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } }));
publicRoutes.use(express.json({ limit: '16kb' }));

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const respondSchema = z.object({ decision: z.enum(CLIENT_RESPONSES), comment: z.string().max(10_000).optional() }).strict();

/** Jeton → devis partagé, ou 404 sans distinguer « inconnu » de « révoqué ». */
async function findShared(prisma: PrismaClient, token: string): Promise<Quote> {
  if (!TOKEN_RE.test(token)) throw new AppError(404, 'Quote not found');
  const row = await prisma.quote.findUnique({ where: { shareTokenHash: hashShareToken(token) } });
  if (!row) throw new AppError(404, 'Quote not found');
  return row;
}

async function publicDto(prisma: PrismaClient, row: Quote): Promise<PublicQuoteDto> {
  const [settings, owner] = await Promise.all([getOrCreateSettings(prisma, row.userId), prisma.user.findUnique({ where: { id: row.userId }, select: { displayName: true } })]);
  return toPublicQuoteDto(toQuoteDto(row), { showCostBreakdown: settings.pdfShowCostBreakdown, currencySymbol: settings.currencySymbol, ownerDisplayName: owner?.displayName ?? '' });
}

publicRoutes.get('/quotes/:token', wrap(async (req, res) => {
  const prisma = req.app.locals.prisma;
  res.json(await publicDto(prisma, await findShared(prisma, req.params.token)));
}));

/** Une seule réponse par lien ; le commentaire est stocké brut (tronqué) et échappé à l'affichage. La notification (Task 4) est en meilleur effort. */
publicRoutes.post('/quotes/:token/respond', wrap(async (req, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid response', undefined, 'validation');
  const prisma = req.app.locals.prisma;
  const row = await findShared(prisma, req.params.token);
  if (row.clientResponse !== null) throw new AppError(409, 'This quote has already been answered', undefined, 'already_answered');
  const comment = (parsed.data.comment ?? '').slice(0, 2000);
  const updated = await prisma.quote.update({ where: { id: row.id }, data: { clientResponse: parsed.data.decision, clientRespondedAt: new Date(), clientComment: comment, responseSeenAt: null } });
  const notify = req.app.locals.notifyOwnerOfResponse as ((prisma: PrismaClient, quote: Quote) => Promise<void>) | undefined;
  if (notify) notify(prisma, updated).catch((err: unknown) => logger.error({ err, quoteId: updated.id }, 'owner notification failed'));
  res.json(await publicDto(prisma, updated));
}));
```
(`app.locals.notifyOwnerOfResponse` est branché en Task 4 ; absent, aucune notification.) Dans `app.ts` : `import { publicRoutes } from './routes/public.routes.js';` et `app.use('/api/public', publicRoutes);` **à côté des routes publiques** (`/api/setup`, `/api/auth`), avant `authMiddleware`. Le contournement JSON global (`/api/import/`) doit aussi laisser passer `/api/public/` (la route porte son propre `express.json` 16 ko) : `if (req.path.startsWith('/api/import/') || req.path.startsWith('/api/public/')) next();`.

Run → PASS (le 413 vient de l'`errorHandler` du lot 3).

- [ ] **Step 2: Fragment i18n et client API**

`scripts/i18n-fragments/public-quote.json` :
```json
{
  "namespace": "publicQuote",
  "keys": {
    "en": { "from": "Quote from {{name}}", "invalid": "This link is no longer valid.", "intro": "Please review the quote below. You can accept or decline it; your answer is sent to {{name}}.",
      "accept": "Accept the quote", "refuse": "Decline the quote", "commentLabel": "Comment (optional)", "confirmAccept": "Confirm that you accept this quote?", "confirmRefuse": "Confirm that you decline this quote?", "confirm": "Confirm", "cancel": "Cancel", "sending": "Sending…",
      "answered": { "ACCEPTED": "You accepted this quote on {{date}}.", "REFUSED": "You declined this quote on {{date}}." }, "already": "This quote has already been answered.", "failed": "Could not send your answer. Please try again.", "print": "Print" },
    "fr": { "from": "Devis de {{name}}", "invalid": "Ce lien n'est plus valide.", "intro": "Merci de vérifier le devis ci-dessous. Vous pouvez l'accepter ou le refuser ; votre réponse est transmise à {{name}}.",
      "accept": "Accepter le devis", "refuse": "Refuser le devis", "commentLabel": "Commentaire (facultatif)", "confirmAccept": "Confirmer l'acceptation de ce devis ?", "confirmRefuse": "Confirmer le refus de ce devis ?", "confirm": "Confirmer", "cancel": "Annuler", "sending": "Envoi…",
      "answered": { "ACCEPTED": "Vous avez accepté ce devis le {{date}}.", "REFUSED": "Vous avez refusé ce devis le {{date}}." }, "already": "Ce devis a déjà reçu une réponse.", "failed": "Impossible d'envoyer votre réponse. Réessayez.", "print": "Imprimer" }
  }
}
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

`src/api/public.api.ts` (instance axios **sans** intercepteur d'authentification : le client n'a pas de jeton et ne doit pas déclencher le rafraîchissement) :
```ts
import axios from 'axios';
import type { PublicQuoteDto, PublicRespondBody } from '@calc3d/common';
const publicClient = axios.create({ baseURL: '/api/public', timeout: 15000, headers: { 'Content-Type': 'application/json' } });
export const publicApi = {
  get: (token: string): Promise<PublicQuoteDto> => publicClient.get(`/quotes/${encodeURIComponent(token)}`).then((r) => r.data),
  respond: (token: string, body: PublicRespondBody): Promise<PublicQuoteDto> => publicClient.post(`/quotes/${encodeURIComponent(token)}/respond`, body).then((r) => r.data),
};
```

- [ ] **Step 3: Extraire `QuoteDocument` de `QuotePrint` (les tests de `QuotePrint` doivent rester verts)**

`src/components/quote/QuoteDocument.tsx` : déplacer `PRINT_CSS`, `Row` et le JSX du document depuis `pages/QuotePrint.tsx`, alimentés par un `PublicQuoteDto` :
```tsx
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { PublicCostLine, PublicQuoteDto } from '@calc3d/common';
import { formatDate } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/number';

export const DOCUMENT_CSS = `/* contenu de PRINT_CSS de QuotePrint.tsx, déplacé tel quel */`;
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) { /* déplacé tel quel depuis QuotePrint.tsx */ }

/** Document devis destiné au client : page d'impression et page publique partagent ce rendu. Les montants viennent du DTO, jamais recalculés. */
export function QuoteDocument({ data, generatedAt, toolbar }: { data: PublicQuoteDto; generatedAt?: Date; toolbar?: ReactNode }) {
  const { t, i18n } = useTranslation(); const loc = i18n.language; const q = data;
  const money = (v: number) => formatMoney(v, q.currencySymbol, loc);
  const lineLabel = (l: PublicCostLine) => l.key === 'electricity' ? t('print.lines.electricity', { hours: formatNumber(q.printTimeH, loc, 2), kwh: formatNumber(q.energyKwh, loc, 3) }) : l.key === 'contingency' ? t('print.lines.contingency', { pct: formatNumber(q.contingencyPct, loc, 0) }) : t(`print.lines.${l.key}`);
  return (
    <div className="print-page">
      <style>{DOCUMENT_CSS}</style>
      {toolbar && <div className="toolbar">{toolbar}</div>}
      <h1>{t('print.title', { name: q.projectName })}</h1>
      {generatedAt && <p className="sous-titre">{t('print.generated', { date: generatedAt.toLocaleString(loc) })}</p>}
      {/* tableau infos, matières (identiques à QuotePrint), puis : */}
      {q.costLines ? (
        <>
          <h3>{t('print.costBreakdown')}</h3>
          <table><tbody>{q.costLines.map((l) => <Row key={l.key} label={lineLabel(l)} value={money(l.amount)} />)}<Row label={t('print.costPrice')} value={money(q.costAfterContingency ?? 0)} strong /></tbody></table>
        </>
      ) : (q.laborTotal > 0 || q.fixedCosts > 0) && (
        <table><tbody>{q.laborTotal > 0 && <Row label={t('print.labor')} value={money(q.laborTotal)} />}{q.fixedCosts > 0 && <Row label={t('print.consumables')} value={money(q.fixedCosts)} />}</tbody></table>
      )}
      {/* tarification, prix final, note plancher, commentaire : identiques à QuotePrint, avec q.vatPct et q.currencySymbol */}
    </div>
  );
}
```
`pages/QuotePrint.tsx` devient :
```tsx
const q = quoteQ.data!; const s = settingsQ.data!;
const data = useMemo(() => toPublicQuoteDto(q, { showCostBreakdown: s.pdfShowCostBreakdown, currencySymbol: s.currencySymbol, ownerDisplayName: '' }), [q, s]);
return <QuoteDocument data={data} generatedAt={new Date()} toolbar={<button type="button" onClick={() => window.print()}>{t('print.print')}</button>} />;
```
(garder les gardes `notFound` / `PageLoader` et l'effet `window.print`, et poser `document.title = t('print.title', { name })` dans un `useEffect` : finition M4 du lot 3, gratuite ici).

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/QuotePrint.test.tsx` → PASS (3 tests, inchangés).

- [ ] **Step 4: Page publique (test puis code)**

`src/pages/PublicQuote.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import PublicQuote from './PublicQuote';
import type { PublicQuoteDto } from '@calc3d/common';

const get = vi.fn(); const respond = vi.fn();
vi.mock('@/api/public.api', () => ({ publicApi: { get: (t: string) => get(t), respond: (t: string, b: unknown) => respond(t, b) } }));

const dto: PublicQuoteDto = { projectName: 'Boîtier <b>', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, quantity: 1, comment: '', filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printTimeH: 5, energyKwh: 2.7, contingencyPct: 10, laborTotal: 12.31, fixedCosts: 0, costLines: null, costAfterContingency: null, unitPriceExclTax: 20, totalExclTax: 20, discountPct: 0, discountAmount: 0, shippingCost: 0, vatPct: 0, vatAmount: 0, roundingApplied: false, roundingAmount: 0, floorApplied: false, priceBeforeFloor: 20, finalPrice: 20, currencySymbol: '€', ownerDisplayName: 'Guillaume', clientResponse: null, clientRespondedAt: null };
function renderPage(token = 'tok') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/q/${token}`]}><Routes><Route path="/q/:token" element={<PublicQuote />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe('page publique du devis', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); respond.mockReset(); });

  it('affiche le devis et accepte après confirmation, avec commentaire', async () => {
    get.mockResolvedValue(dto); respond.mockResolvedValue({ ...dto, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    renderPage();
    expect(await screen.findByText('Devis de Guillaume')).toBeInTheDocument();
    expect(screen.getByText('Devis - Boîtier <b>')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Marge|Markup|Tarification\s*:/);
    fireEvent.change(screen.getByLabelText(/Commentaire/), { target: { value: 'Parfait' } });
    fireEvent.click(screen.getByRole('button', { name: /Accepter le devis/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Confirmer$/ }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('tok', { decision: 'ACCEPTED', comment: 'Parfait' }));
    expect(await screen.findByText(/Vous avez accepté ce devis le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accepter le devis/ })).not.toBeInTheDocument();
  });
  it('déjà répondu : état affiché, pas de boutons ; lien invalide : message', async () => {
    get.mockResolvedValue({ ...dto, clientResponse: 'REFUSED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    renderPage();
    expect(await screen.findByText(/Vous avez refusé ce devis le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refuser le devis/ })).not.toBeInTheDocument();
    get.mockRejectedValue({ response: { status: 404 } });
    renderPage('dead');
    expect(await screen.findByText(/Ce lien n'est plus valide/)).toBeInTheDocument();
  });
  it('409 pendant l\'envoi : message « déjà répondu » et rechargement', async () => {
    get.mockResolvedValueOnce(dto).mockResolvedValueOnce({ ...dto, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    respond.mockRejectedValue({ response: { status: 409, data: { code: 'already_answered' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Refuser le devis/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Confirmer$/ }));
    expect(await screen.findByText(/déjà reçu une réponse/)).toBeInTheDocument();
    expect(await screen.findByText(/Vous avez accepté ce devis le/)).toBeInTheDocument();
  });
});
```
Run → FAIL.

`src/pages/PublicQuote.tsx` :
```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClientResponse } from '@calc3d/common';
import { publicApi } from '@/api/public.api';
import { QuoteDocument } from '@/components/quote/QuoteDocument';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Page client, sans compte : lecture seule du devis (même rendu que l'impression) et réponse unique. Langue du navigateur. */
export default function PublicQuote() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['public-quote', token], queryFn: () => publicApi.get(token), retry: false });
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<ClientResponse | null>(null);
  const [error, setError] = useState('');
  const respond = useMutation({
    mutationFn: (decision: ClientResponse) => publicApi.respond(token, { decision, comment: comment.trim() }),
    onSuccess: (d) => { qc.setQueryData(['public-quote', token], d); setPending(null); setError(''); },
    onError: (e: { response?: { status?: number } }) => { setPending(null); if (e?.response?.status === 409) { setError(t('publicQuote.already')); void qc.invalidateQueries({ queryKey: ['public-quote', token] }); } else setError(t('publicQuote.failed')); },
  });
  useEffect(() => { if (q.data) document.title = t('print.title', { name: q.data.projectName }); }, [q.data, t]);
  if (q.isError) return <p style={{ fontFamily: 'sans-serif', padding: 40 }}>{t('publicQuote.invalid')}</p>;
  if (!q.data) return <PageLoader />;
  const d = q.data;
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <QuoteDocument data={d} toolbar={<><strong>{t('publicQuote.from', { name: d.ownerDisplayName })}</strong> <button type="button" onClick={() => window.print()}>{t('publicQuote.print')}</button></>} />
      <div className="print-page" style={{ marginTop: 0 }}>
        {d.clientResponse ? (
          <p className="note" style={{ fontSize: 14 }}>{t(`publicQuote.answered.${d.clientResponse}`, { date: new Date(d.clientRespondedAt ?? '').toLocaleDateString(i18n.language) })}</p>
        ) : (
          <div className="space-y-3">
            <p>{t('publicQuote.intro', { name: d.ownerDisplayName })}</p>
            <div className="space-y-1"><Label htmlFor="pq-comment">{t('publicQuote.commentLabel')}</Label><Textarea id="pq-comment" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} /></div>
            <div className="flex gap-2"><Button onClick={() => setPending('ACCEPTED')}>{t('publicQuote.accept')}</Button><Button variant="outline" onClick={() => setPending('REFUSED')}>{t('publicQuote.refuse')}</Button></div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t(pending === 'ACCEPTED' ? 'publicQuote.confirmAccept' : 'publicQuote.confirmRefuse')}</DialogTitle></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setPending(null)}>{t('publicQuote.cancel')}</Button><Button disabled={respond.isPending} onClick={() => { if (pending) respond.mutate(pending); }}>{respond.isPending ? t('publicQuote.sending') : t('publicQuote.confirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```
`App.tsx` : `const PublicQuote = lazy(() => import('@/pages/PublicQuote'));` et `<Route path="/q/:token" element={<PublicQuote />} />` à côté de `/login` (sans `RequireAuth`). Vérifier que `AppLayout`/`Header` ne s'appliquent pas et que le thème sombre ne colore pas le fond (le `div` racine force `#fff`).

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages` → PASS.

- [ ] **Step 5: Vérifier, committer**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "Ajoute la page publique du devis et les routes client (lecture, acceptation, refus)"
```

---

### Task 3: Suivi côté propriétaire — carte Client, Historique, compteur

**Files:**
- Create: `packages/frontend/src/components/quote/ClientShareCard.tsx` (+ test), `packages/frontend/src/components/quote/ResponseBadge.tsx`, `packages/frontend/src/hooks/use-unseen-responses.ts`, `packages/frontend/scripts/i18n-fragments/share.json`
- Modify: `packages/frontend/src/api/quotes.api.ts`, `packages/frontend/src/pages/Quote.tsx`, `packages/frontend/src/pages/History.tsx` (+ test), `packages/frontend/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: routes de Task 1, `QuoteShareFields`, `ResponseFilter`.
- Produces: `quotesApi.share(id) → { url }`, `quotesApi.unshare(id)`, `quotesApi.markSeen(id) → QuoteDto`, `quotesApi.unseenCount() → { count }`, `quotesApi.shareByEmail(id, { to, message })` (route Task 4 ; le client est déclaré ici, le bouton est désactivé tant que `smtpEnabled` est faux) ; `<ClientShareCard quote onChanged smtpEnabled />` ; `<ResponseBadge quote />` ; `useUnseenResponses(): number`.

- [ ] **Step 1: Fragment i18n et client API**

`scripts/i18n-fragments/share.json` :
```json
{
  "namespace": "share",
  "keys": {
    "en": { "title": "Customer", "notShared": "Not shared yet.", "sharedSince": "Link active since {{date}}.", "generate": "Generate the link", "regenerate": "Regenerate the link", "revoke": "Revoke the link", "copy": "Copy", "copied": "Link copied.", "showOnce": "This link is shown only once. Copy it now; regenerate it if you lose it.",
      "regenerateConfirm": "Regenerate the link? The current link stops working and any answer already received is cleared.", "revokeConfirm": "Revoke the link? The customer will no longer be able to open the quote.",
      "email": "Send by e-mail", "emailTo": "Customer e-mail", "emailMessage": "Message (optional)", "emailSend": "Send", "emailSent": "E-mail sent to {{to}}.", "emailDisabled": "No SMTP server configured (ask an administrator).", "emailFailed": "E-mail not sent: {{reason}}",
      "response": { "title": "Customer answer", "none": "No answer yet.", "ACCEPTED": "Accepted", "REFUSED": "Declined", "PENDING": "Awaiting answer", "on": "on {{date}}", "comment": "Comment:", "convert": "Convert to order", "unseen": "New" },
      "filter": { "label": "Customer answer", "all": "All", "ACCEPTED": "Accepted", "REFUSED": "Declined", "PENDING": "Awaiting answer", "NONE": "Not shared" } },
    "fr": { "title": "Client", "notShared": "Pas encore partagé.", "sharedSince": "Lien actif depuis le {{date}}.", "generate": "Générer le lien", "regenerate": "Régénérer le lien", "revoke": "Révoquer le lien", "copy": "Copier", "copied": "Lien copié.", "showOnce": "Ce lien n'est affiché qu'une seule fois. Copie-le maintenant ; régénère-le si tu le perds.",
      "regenerateConfirm": "Régénérer le lien ? Le lien actuel cesse de fonctionner et la réponse déjà reçue est effacée.", "revokeConfirm": "Révoquer le lien ? Le client ne pourra plus ouvrir le devis.",
      "email": "Envoyer par e-mail", "emailTo": "E-mail du client", "emailMessage": "Message (facultatif)", "emailSend": "Envoyer", "emailSent": "E-mail envoyé à {{to}}.", "emailDisabled": "Aucun serveur SMTP configuré (demande à un administrateur).", "emailFailed": "E-mail non envoyé : {{reason}}",
      "response": { "title": "Réponse du client", "none": "Pas encore de réponse.", "ACCEPTED": "Accepté", "REFUSED": "Refusé", "PENDING": "En attente de réponse", "on": "le {{date}}", "comment": "Commentaire :", "convert": "Convertir en commande", "unseen": "Nouveau" },
      "filter": { "label": "Réponse client", "all": "Toutes", "ACCEPTED": "Acceptés", "REFUSED": "Refusés", "PENDING": "En attente de réponse", "NONE": "Non partagés" } }
  }
}
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

`src/api/quotes.api.ts`, ajouter :
```ts
  share: (id: number): Promise<{ url: string }> => api.post(`/quotes/${id}/share`).then((r) => r.data),
  unshare: (id: number): Promise<void> => api.delete(`/quotes/${id}/share`).then(() => undefined),
  shareByEmail: (id: number, body: { to: string; message: string }): Promise<{ url: string }> => api.post(`/quotes/${id}/share/email`, body).then((r) => r.data),
  markSeen: (id: number): Promise<QuoteDto> => api.post(`/quotes/${id}/response/seen`).then((r) => r.data),
  unseenCount: (): Promise<{ count: number }> => api.get('/quotes/unseen-count').then((r) => r.data),
```
`src/api/smtp.api.ts` (utilisé ici pour savoir si l'e-mail est possible ; les routes arrivent en Task 4, le composant tolère un 403/404 en considérant SMTP désactivé) :
```ts
import api from './client';
import type { SmtpSettingsDto, SmtpSettingsBody } from '@calc3d/common';
export const smtpApi = {
  /** Visible de tous : seulement « activé ou non » (pas de détail). */
  status: (): Promise<{ enabled: boolean }> => api.get('/smtp/status').then((r) => r.data),
  get: (): Promise<SmtpSettingsDto> => api.get('/smtp').then((r) => r.data),
  update: (body: SmtpSettingsBody): Promise<SmtpSettingsDto> => api.put('/smtp', body).then((r) => r.data),
  test: (to: string): Promise<{ ok: true }> => api.post('/smtp/test', { to }).then((r) => r.data),
};
```

- [ ] **Step 2: `ResponseBadge` et hook de non-lus**

`src/components/quote/ResponseBadge.tsx` :
```tsx
import { useTranslation } from 'react-i18next';
import type { QuoteShareFields } from '@calc3d/common';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Badge de réponse client : accepté (vert) / refusé (rouge) / en attente (ambre) ; rien si non partagé. Pastille « Nouveau » tant que non lu. */
export function ResponseBadge({ quote, className }: { quote: QuoteShareFields; className?: string }) {
  const { t } = useTranslation();
  if (!quote.shared && !quote.clientResponse) return null;
  const state = quote.clientResponse ?? 'PENDING';
  const color = state === 'ACCEPTED' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : state === 'REFUSED' ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Badge variant="outline" className={color}>{t(`share.response.${state}`)}</Badge>
      {quote.clientResponse && !quote.responseSeenAt && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground" title={t('share.response.unseen')}>{t('share.response.unseen')}</span>}
    </span>
  );
}
```
`src/hooks/use-unseen-responses.ts` :
```ts
import { useQuery } from '@tanstack/react-query';
import { quotesApi } from '@/api/quotes.api';
/** Nombre de réponses client non lues ; clé ['quotes', 'unseen'] invalidée avec ['quotes']. */
export function useUnseenResponses(): number {
  const q = useQuery({ queryKey: ['quotes', 'unseen'], queryFn: quotesApi.unseenCount, refetchInterval: 60_000, staleTime: 30_000 });
  return q.data?.count ?? 0;
}
```
`Sidebar.tsx` : dans le rendu de chaque `NavItem`, si `item.to === '/history'` et `unseen > 0`, afficher `<span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground" data-testid="unseen-badge">{unseen}</span>` (masqué en mode replié : afficher la pastille sans chiffre). `const unseen = useUnseenResponses();` en haut du composant. Le test `Sidebar.test.tsx` existant mocke-t-il l'API ? S'il rend sans `QueryClientProvider`, ajouter un mock `vi.mock('@/hooks/use-unseen-responses', () => ({ useUnseenResponses: () => 0 }))` et un cas `useUnseenResponses: () => 2` → `getByTestId('unseen-badge')` affiche `2`.

- [ ] **Step 3: `ClientShareCard` (test puis code)**

`src/components/quote/ClientShareCard.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { ClientShareCard } from './ClientShareCard';
import type { QuoteDto } from '@calc3d/common';

const share = vi.fn(); const unshare = vi.fn(); const shareByEmail = vi.fn(); const convert = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { share: (id: number) => share(id), unshare: (id: number) => unshare(id), shareByEmail: (id: number, b: unknown) => shareByEmail(id, b), convert: (id: number) => convert(id) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const base = { id: 7, shared: false, sharedAt: null, clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null, clientEmail: '', kind: 'QUOTE', projectName: 'P' } as unknown as QuoteDto;
function setup(quote: QuoteDto, smtpEnabled = false) {
  const onChanged = vi.fn(); const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><ClientShareCard quote={quote} smtpEnabled={smtpEnabled} onChanged={onChanged} /></QueryClientProvider>);
  return onChanged;
}

describe('ClientShareCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }); });
  beforeEach(() => { share.mockReset(); unshare.mockReset(); shareByEmail.mockReset(); convert.mockReset(); });

  it('génère le lien, l\'affiche une seule fois avec Copier, puis propose régénérer / révoquer', async () => {
    share.mockResolvedValue({ url: 'http://x/q/abc' });
    const onChanged = setup(base);
    expect(screen.getByText(/Pas encore partagé/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Générer le lien/ }));
    expect(await screen.findByDisplayValue('http://x/q/abc')).toBeInTheDocument();
    expect(screen.getByText(/affiché qu'une seule fois/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Copier$/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/q/abc'));
    expect(onChanged).toHaveBeenCalled();
  });
  it('devis partagé : régénérer demande confirmation ; e-mail désactivé sans SMTP', async () => {
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z' });
    expect(screen.getByText(/Lien actif depuis/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Régénérer le lien/ }));
    expect(await screen.findByText(/la réponse déjà reçue est effacée/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envoyer par e-mail/ })).toBeDisabled();
  });
  it('réponse acceptée : badge, date, commentaire, bouton Convertir ; refusée : pas de conversion', async () => {
    convert.mockResolvedValue({});
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-11T10:00:00Z', clientComment: 'Allez-y' });
    expect(screen.getByText('Accepté')).toBeInTheDocument();
    expect(screen.getByText('Allez-y')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Convertir en commande/ }));
    await waitFor(() => expect(convert).toHaveBeenCalledWith(7));
  });
  it('envoi par e-mail avec SMTP : adresse préremplie, appel API, confirmation', async () => {
    shareByEmail.mockResolvedValue({ url: 'http://x/q/abc' });
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z', clientEmail: 'c@x.fr' }, true);
    fireEvent.click(screen.getByRole('button', { name: /Envoyer par e-mail/ }));
    expect(await screen.findByDisplayValue('c@x.fr')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/ }));
    await waitFor(() => expect(shareByEmail).toHaveBeenCalledWith(7, { to: 'c@x.fr', message: 'Bonjour' }));
  });
});
```
Run → FAIL.

`src/components/quote/ClientShareCard.tsx` :
```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link2, Mail, RefreshCw, Ban, Copy, Repeat } from 'lucide-react';
import type { QuoteDto } from '@calc3d/common';
import { quotesApi } from '@/api/quotes.api';
import { formatDate } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponseBadge } from './ResponseBadge';

interface Props { quote: QuoteDto; smtpEnabled: boolean; onChanged: () => void }
type ApiError = { response?: { data?: { error?: string; details?: string; code?: string } }; message?: string };

/** Carte « Client » d'un devis chargé : lien de partage (affiché une seule fois), envoi par e-mail, réponse du client, conversion. */
export function ClientShareCard({ quote, smtpEnabled, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'regenerate' | 'revoke' | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [to, setTo] = useState(quote.clientEmail); const [message, setMessage] = useState('');
  const fail = (e: ApiError) => toast.error(e?.response?.data?.details || e?.response?.data?.error || e?.message || '?');
  const share = useMutation({ mutationFn: () => quotesApi.share(quote.id), onSuccess: (r) => { setFreshUrl(r.url); setConfirm(null); onChanged(); }, onError: fail });
  const unshare = useMutation({ mutationFn: () => quotesApi.unshare(quote.id), onSuccess: () => { setFreshUrl(null); setConfirm(null); onChanged(); }, onError: fail });
  const email = useMutation({ mutationFn: () => quotesApi.shareByEmail(quote.id, { to: to.trim(), message: message.trim() }), onSuccess: () => { toast.success(t('share.emailSent', { to: to.trim() })); setMailOpen(false); onChanged(); }, onError: (e: ApiError) => toast.error(t(e?.response?.data?.code === 'smtp_disabled' ? 'share.emailDisabled' : 'share.emailFailed', { reason: e?.response?.data?.details || e?.response?.data?.error || '?' })) });
  const convert = useMutation({ mutationFn: () => quotesApi.convert(quote.id), onSuccess: () => { toast.success(t('history.converted')); onChanged(); }, onError: fail });
  const copy = async () => { if (freshUrl) { await navigator.clipboard.writeText(freshUrl); toast.success(t('share.copied')); } };
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2">{t('share.title')} <ResponseBadge quote={quote} /></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{quote.shared ? t('share.sharedSince', { date: formatDate(quote.sharedAt ?? '', i18n.language) }) : t('share.notShared')}</p>
        {freshUrl && (
          <div className="space-y-1">
            <div className="flex gap-2"><Input readOnly value={freshUrl} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="sm" onClick={() => void copy()}><Copy className="mr-1 h-4 w-4" />{t('share.copy')}</Button></div>
            <p className="text-xs text-amber-700 dark:text-amber-300">{t('share.showOnce')}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!quote.shared && <Button size="sm" disabled={share.isPending} onClick={() => share.mutate()}><Link2 className="mr-1 h-4 w-4" />{t('share.generate')}</Button>}
          {quote.shared && <Button size="sm" variant="outline" onClick={() => setConfirm('regenerate')}><RefreshCw className="mr-1 h-4 w-4" />{t('share.regenerate')}</Button>}
          {quote.shared && <Button size="sm" variant="outline" onClick={() => setConfirm('revoke')}><Ban className="mr-1 h-4 w-4" />{t('share.revoke')}</Button>}
          <Button size="sm" variant="outline" disabled={!smtpEnabled} title={smtpEnabled ? undefined : t('share.emailDisabled')} onClick={() => setMailOpen(true)}><Mail className="mr-1 h-4 w-4" />{t('share.email')}</Button>
        </div>
        <div className="rounded-md border border-border p-3 space-y-1">
          <p className="font-medium">{t('share.response.title')}</p>
          {quote.clientResponse ? (
            <>
              <p>{t(`share.response.${quote.clientResponse}`)} {t('share.response.on', { date: formatDate(quote.clientRespondedAt ?? '', i18n.language) })}</p>
              {quote.clientComment && <p className="whitespace-pre-wrap text-muted-foreground"><span className="font-medium">{t('share.response.comment')}</span> {quote.clientComment}</p>}
              {quote.clientResponse === 'ACCEPTED' && quote.kind === 'QUOTE' && <Button size="sm" disabled={convert.isPending} onClick={() => convert.mutate()}><Repeat className="mr-1 h-4 w-4" />{t('share.response.convert')}</Button>}
            </>
          ) : <p className="text-muted-foreground">{t('share.response.none')}</p>}
        </div>
      </CardContent>
      <ConfirmDialog open={confirm !== null} onOpenChange={() => setConfirm(null)} title={t(confirm === 'revoke' ? 'share.revoke' : 'share.regenerate')} description={t(confirm === 'revoke' ? 'share.revokeConfirm' : 'share.regenerateConfirm')} destructive={confirm === 'revoke'} loading={share.isPending || unshare.isPending} onConfirm={() => (confirm === 'revoke' ? unshare.mutate() : share.mutate())} />
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('share.email')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="share-to">{t('share.emailTo')}</Label><Input id="share-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="share-msg">{t('share.emailMessage')}</Label><Textarea id="share-msg" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} /></div>
          </div>
          <DialogFooter><Button disabled={email.isPending || !to.trim()} onClick={() => email.mutate()}>{t('share.emailSend')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```
Dans `pages/Quote.tsx` (`QuoteEditor`), sous le bandeau, quand `initial` : `<ClientShareCard quote={initial} smtpEnabled={smtp.data?.enabled ?? false} onChanged={() => { qc.invalidateQueries({ queryKey: ['quote', initial.id] }); qc.invalidateQueries({ queryKey: ['quotes'] }); }} />` avec `const smtp = useQuery({ queryKey: ['smtp-status'], queryFn: smtpApi.status, retry: false, staleTime: 300_000 });` (une erreur = désactivé). Dans `Quote` (page), à l'affichage d'un devis chargé dont `clientResponse` est renseigné et `responseSeenAt` vide : `useEffect` qui appelle `quotesApi.markSeen(id)` puis invalide `['quotes', 'unseen']` et `['quote', id]`. Dans `Quote.test.tsx`, ajouter `vi.mock('@/api/smtp.api', () => ({ smtpApi: { status: () => Promise.resolve({ enabled: false }) } }))` et étendre le mock de `quotesApi` avec `markSeen`, `share`, `unshare`, `shareByEmail`, `convert` (fonctions `vi.fn()`).

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/quote src/pages/Quote.test.tsx` → PASS.

- [ ] **Step 4: Historique — badge, filtre, pastille (test puis code)**

Dans `src/pages/History.test.tsx`, ajouter au mock des devis un élément `{ ..., shared: true, sharedAt: '…', clientResponse: 'ACCEPTED', clientRespondedAt: '…', clientComment: '', responseSeenAt: null, clientEmail: '' }` et :
```tsx
  it('affiche le badge de réponse et filtre par réponse client', async () => {
    renderPage();
    expect(await screen.findByText('Accepté')).toBeInTheDocument();
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Réponse client/), { target: { value: 'REFUSED' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ response: 'REFUSED', page: 1 })));
  });
```
Run → FAIL. Dans `History.tsx` : état `response` (`ResponseFilter | ''`), `params.response = response || undefined`, un `<select aria-label={t('share.filter.label')}>` avec `all` + `RESPONSE_FILTERS`, et dans la ligne, après le statut, `<ResponseBadge quote={x} />` (ajuster la grille : `grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_7rem_9rem_3rem_7rem_auto]`, `min-w-[56rem]`). Run → PASS.

- [ ] **Step 5: Vérifier, committer**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @calc3d/frontend run test
git add -A
git commit -m "Ajoute la carte Client, le badge de réponse et le compteur de réponses non lues"
```

---

### Task 4: SMTP, e-mails, onglet admin, e-mail du compte, documentation

**Files:**
- Create: `packages/backend/src/mail/templates.ts` (+ test), `packages/backend/src/mail/mailer.ts` (+ test), `packages/backend/src/mail/smtp.schema.ts`, `packages/backend/src/routes/smtp.routes.ts` (+ test), `packages/frontend/src/components/settings/SmtpSettingsCard.tsx` (+ test), `packages/frontend/src/components/settings/EmailCard.tsx`, `packages/frontend/scripts/i18n-fragments/smtp.json`, `packages/frontend/scripts/i18n-fragments/account-email.json`
- Modify: `packages/backend/package.json` (`nodemailer`, `@types/nodemailer`), `packages/backend/src/routes/quote-share.routes.ts` (+ `/share/email`), `packages/backend/src/index.ts`, `packages/backend/src/app.ts`, `packages/frontend/src/pages/Settings.tsx`, `packages/frontend/src/api/auth.api.ts`, docs.

**Interfaces:**
- Consumes: `SmtpSettingsBody/Dto`, `encrypt/decrypt`, `audit`, `shareUrl`, `quotesApi.shareByEmail`, `smtpApi`.
- Produces: `MailMessage { to; subject; text; html }`, `TransportFactory`, `sendMail(prisma, msg, factory?)`, `isSmtpEnabled(prisma)`, `quoteEmail(lang, { projectName, ownerName, url, message })`, `responseEmail(lang, { projectName, customer, decision, comment, quoteUrl })`, `notifyOwnerOfResponse(prisma, quote, factory?)` ; routes `GET /api/smtp/status` (tous), `GET/PUT /api/smtp`, `POST /api/smtp/test` (admin), `POST /api/quotes/:id/share/email`.

- [ ] **Step 1: Dépendance et gabarits (test puis code)**

Run: `pnpm --filter @calc3d/backend add nodemailer && pnpm --filter @calc3d/backend add -D @types/nodemailer` ; vérifier `pnpm audit --audit-level high` (ajouter un `ignoreGhsas` seulement pour un avis sans correctif, documenté dans `package.json`).

`src/mail/templates.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { quoteEmail, responseEmail } from './templates.js';

describe('gabarits d\'e-mail', () => {
  it('e-mail devis : objet, lien, message échappé en HTML mais brut en texte', () => {
    const m = quoteEmail('fr', { projectName: 'Boîtier <b>', ownerName: 'Guillaume', url: 'http://x/q/abc', message: 'Bonjour <script>' });
    expect(m.subject).toBe('Devis Boîtier <b> – Guillaume');
    expect(m.html).toContain('Bo&icirc;tier &lt;b&gt;'.replace('&icirc;', 'î')); expect(m.html).toContain('&lt;script&gt;'); expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('href="http://x/q/abc"'); expect(m.text).toContain('http://x/q/abc'); expect(m.text).toContain('Bonjour <script>');
    expect(quoteEmail('en', { projectName: 'P', ownerName: 'G', url: 'u', message: '' }).subject).toBe('Quote P – G');
  });
  it('e-mail réponse : objet selon la décision, commentaire échappé, lien vers le devis', () => {
    const m = responseEmail('fr', { projectName: 'P', customer: 'ACME', decision: 'REFUSED', comment: 'a < b', quoteUrl: 'http://x/?quote=7' });
    expect(m.subject).toBe('Devis P : refusé par ACME');
    expect(m.html).toContain('a &lt; b'); expect(m.html).toContain('http://x/?quote=7');
    expect(responseEmail('en', { projectName: 'P', customer: 'ACME', decision: 'ACCEPTED', comment: '', quoteUrl: 'u' }).subject).toBe('Quote P: accepted by ACME');
  });
});
```
Run → FAIL. `src/mail/templates.ts` :
```ts
import type { ClientResponse } from '@calc3d/common';
export interface MailContent { subject: string; text: string; html: string }
type Lang = 'fr' | 'en';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const lang = (l: string | null | undefined): Lang => (l === 'fr' ? 'fr' : 'en');
const wrap = (title: string, body: string) => `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#111827"><h2 style="font-size:18px">${title}</h2>${body}<p style="color:#6B7280;font-size:12px">Calc3D</p></body></html>`;

const T = {
  fr: { quoteSubject: (p: string, o: string) => `Devis ${p} – ${o}`, quoteIntro: (o: string) => `${o} vous a envoyé un devis.`, open: 'Consulter le devis et répondre', personal: 'Ce lien est personnel : ne le transmettez pas.',
        respSubject: (p: string, d: ClientResponse, c: string) => `Devis ${p} : ${d === 'ACCEPTED' ? 'accepté' : 'refusé'} par ${c || 'le client'}`, respIntro: (c: string, d: ClientResponse) => `${c || 'Le client'} a ${d === 'ACCEPTED' ? 'accepté' : 'refusé'} le devis.`, comment: 'Commentaire :', openQuote: 'Ouvrir le devis' },
  en: { quoteSubject: (p: string, o: string) => `Quote ${p} – ${o}`, quoteIntro: (o: string) => `${o} sent you a quote.`, open: 'View the quote and answer', personal: 'This link is personal: please do not forward it.',
        respSubject: (p: string, d: ClientResponse, c: string) => `Quote ${p}: ${d === 'ACCEPTED' ? 'accepted' : 'declined'} by ${c || 'the customer'}`, respIntro: (c: string, d: ClientResponse) => `${c || 'The customer'} ${d === 'ACCEPTED' ? 'accepted' : 'declined'} the quote.`, comment: 'Comment:', openQuote: 'Open the quote' },
};

/** E-mail envoyé au client avec le lien de partage. Champs libres encodés HTML ; version texte brute. */
export function quoteEmail(l: string | null | undefined, p: { projectName: string; ownerName: string; url: string; message: string }): MailContent {
  const s = T[lang(l)];
  const subject = s.quoteSubject(p.projectName, p.ownerName);
  const text = [s.quoteIntro(p.ownerName), p.message ? `\n${p.message}\n` : '', `${s.open} : ${p.url}`, s.personal].filter(Boolean).join('\n');
  const html = wrap(esc(subject), `<p>${esc(s.quoteIntro(p.ownerName))}</p>${p.message ? `<p style="white-space:pre-wrap">${esc(p.message)}</p>` : ''}<p><a href="${esc(p.url)}">${esc(s.open)}</a></p><p style="color:#6B7280">${esc(s.personal)}</p>`);
  return { subject, text, html };
}

/** Notification au propriétaire après la réponse du client. */
export function responseEmail(l: string | null | undefined, p: { projectName: string; customer: string; decision: ClientResponse; comment: string; quoteUrl: string }): MailContent {
  const s = T[lang(l)];
  const subject = s.respSubject(p.projectName, p.decision, p.customer);
  const text = [s.respIntro(p.customer, p.decision), p.comment ? `${s.comment}\n${p.comment}` : '', `${s.openQuote} : ${p.quoteUrl}`].filter(Boolean).join('\n\n');
  const html = wrap(esc(subject), `<p>${esc(s.respIntro(p.customer, p.decision))}</p>${p.comment ? `<p><strong>${esc(s.comment)}</strong></p><p style="white-space:pre-wrap">${esc(p.comment)}</p>` : ''}<p><a href="${esc(p.quoteUrl)}">${esc(s.openQuote)}</a></p>`);
  return { subject, text, html };
}
```
(Ajuster le premier `expect` HTML du test sur `Boîtier &lt;b&gt;` : `esc` ne touche pas aux accents.) Run → PASS.

- [ ] **Step 2: Mailer injectable (test puis code)**

`src/mail/mailer.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { testPrisma } from '../test-db.js';
import { isSmtpEnabled, sendMail, type TransportFactory } from './mailer.js';
import { encrypt } from '../utils/crypto.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.smtpSettings.deleteMany(); });
const msg = { to: 'c@x.fr', subject: 'S', text: 't', html: '<p>t</p>' };

describe('mailer', () => {
  it('SMTP absent ou désactivé : isSmtpEnabled false, sendMail → 409 smtp_disabled, aucun transport créé', async () => {
    const factory = vi.fn();
    expect(await isSmtpEnabled(prisma)).toBe(false);
    await expect(sendMail(prisma, msg, factory as unknown as TransportFactory)).rejects.toMatchObject({ statusCode: 409, code: 'smtp_disabled' });
    await prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', enabled: false } });
    await expect(sendMail(prisma, msg, factory as unknown as TransportFactory)).rejects.toMatchObject({ code: 'smtp_disabled' });
    expect(factory).not.toHaveBeenCalled();
  });
  it('SMTP activé : transport créé avec le mot de passe déchiffré, message envoyé avec l\'expéditeur ; échec du transport → 502 smtp_failed', async () => {
    await prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', port: 465, secure: true, username: 'u', passwordEnc: encrypt('p4ss'), fromAddress: 'calc@x.fr', fromName: 'Calc3D', enabled: true } });
    const sent: unknown[] = []; const opts: unknown[] = [];
    const factory: TransportFactory = (o) => { opts.push(o); return { sendMail: async (m) => { sent.push(m); } }; };
    await sendMail(prisma, msg, factory);
    expect(opts[0]).toEqual({ host: 'smtp.x', port: 465, secure: true, auth: { user: 'u', pass: 'p4ss' } });
    expect(sent[0]).toMatchObject({ from: '"Calc3D" <calc@x.fr>', to: 'c@x.fr', subject: 'S' });
    const failing: TransportFactory = () => ({ sendMail: async () => { throw new Error('ECONNREFUSED 1.2.3.4:465'); } });
    await expect(sendMail(prisma, msg, failing)).rejects.toMatchObject({ statusCode: 502, code: 'smtp_failed', details: 'ECONNREFUSED 1.2.3.4:465' });
  });
});
```
Run → FAIL. `src/mail/mailer.ts` :
```ts
import nodemailer from 'nodemailer';
import type { PrismaClient, SmtpSettings } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { decrypt } from '../utils/crypto.js';

export interface MailMessage { to: string; subject: string; text: string; html: string }
export interface SmtpTransportOptions { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } }
export interface MailTransport { sendMail(m: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown> }
export type TransportFactory = (opts: SmtpTransportOptions) => MailTransport;

/** Seul appel réseau sortant du backend : SMTP vers l'hôte configuré par l'admin (spec lot 4 §7). */
const nodemailerFactory: TransportFactory = (opts) => nodemailer.createTransport(opts);

export async function getSmtpSettings(prisma: PrismaClient): Promise<SmtpSettings | null> { return prisma.smtpSettings.findUnique({ where: { id: 1 } }); }
export async function isSmtpEnabled(prisma: PrismaClient): Promise<boolean> { const s = await getSmtpSettings(prisma); return !!s && s.enabled && s.host !== ''; }

export function transportOptions(s: SmtpSettings): SmtpTransportOptions {
  return { host: s.host, port: s.port, secure: s.secure, ...(s.username ? { auth: { user: s.username, pass: s.passwordEnc ? decrypt(s.passwordEnc) : '' } } : {}) };
}

/** 409 smtp_disabled si non configuré ; 502 smtp_failed (message du transport en `details`) si l'envoi échoue. */
export async function sendMail(prisma: PrismaClient, msg: MailMessage, factory: TransportFactory = nodemailerFactory): Promise<void> {
  const s = await getSmtpSettings(prisma);
  if (!s || !s.enabled || !s.host) throw new AppError(409, 'SMTP is not configured', undefined, 'smtp_disabled');
  const from = s.fromName ? `"${s.fromName.replace(/"/g, '')}" <${s.fromAddress}>` : s.fromAddress;
  try { await factory(transportOptions(s)).sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }); }
  catch (err) { throw new AppError(502, 'E-mail could not be sent', err instanceof Error ? err.message : String(err), 'smtp_failed'); }
}
```
Run → PASS.

- [ ] **Step 3: Notification du propriétaire et envoi au client (tests puis code)**

`src/mail/notify.ts` :
```ts
import type { PrismaClient, Quote } from '../../generated/prisma/index.js';
import type { ClientResponse } from '@calc3d/common';
import { config } from '../config.js';
import { isSmtpEnabled, sendMail, type TransportFactory } from './mailer.js';
import { responseEmail } from './templates.js';

/** Après une réponse client : e-mail au propriétaire s'il a une adresse et si SMTP est actif. Meilleur effort (l'appelant journalise). */
export async function notifyOwnerOfResponse(prisma: PrismaClient, quote: Quote, factory?: TransportFactory): Promise<void> {
  if (!quote.clientResponse || !(await isSmtpEnabled(prisma))) return;
  const owner = await prisma.user.findUnique({ where: { id: quote.userId }, select: { email: true, language: true } });
  if (!owner?.email) return;
  const content = responseEmail(owner.language, { projectName: quote.projectName, customer: quote.customer, decision: quote.clientResponse as ClientResponse, comment: quote.clientComment, quoteUrl: `${config.frontendUrl.replace(/\/+$/, '')}/?quote=${quote.id}` });
  await sendMail(prisma, { to: owner.email, ...content }, factory);
}
```
Dans `index.ts` (création de l'app) : `app.locals.notifyOwnerOfResponse = notifyOwnerOfResponse;` — et dans `public.routes.test.ts`, ajouter un cas :
```ts
  it('la réponse est enregistrée même si la notification échoue ; la notification reçoit le devis', async () => {
    const u = await createTestUser(prisma, 'alice'); await seedShared(u.id);
    const a = app(); const calls: number[] = [];
    a.locals.notifyOwnerOfResponse = async (_p: unknown, q: { id: number }) => { calls.push(q.id); throw new Error('smtp down'); };
    const r = await request(a).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED' });
    expect(r.status).toBe(200); expect(calls).toHaveLength(1);
  });
```
(`app()` du test doit monter `publicRoutes` sur une instance dont on peut poser `locals` : c'est déjà le cas.)

Route `POST /:id/share/email` dans `quote-share.routes.ts`, test à ajouter dans `quote-share.routes.test.ts` :
```ts
  it('envoi par e-mail : lien conservé s\'il existe, créé sinon ; clientEmail enregistré ; 409 sans SMTP ; 502 si le transport échoue', async () => {
    const u = await createTestUser(prisma, 'alice'); await prisma.user.update({ where: { id: u.id }, data: { language: 'fr' } });
    const q = await seedQuote(u.id);
    const a = app(u);
    expect((await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: '' })).status).toBe(409);
    await prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', fromAddress: 'calc@x.fr', enabled: true } });
    const sent: { to: string; subject: string; text: string }[] = [];
    a.locals.mailFactory = () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => { sent.push(m); } });
    const r1 = await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: 'Bonjour' });
    expect(r1.status).toBe(200); expect(r1.body.url).toMatch(/\/q\//);
    expect(sent[0]).toMatchObject({ to: 'c@x.fr', subject: 'Devis P – alice' }); expect(sent[0].text).toContain(r1.body.url); expect(sent[0].text).toContain('Bonjour');
    const hash1 = (await prisma.quote.findUnique({ where: { id: q.id } }))?.shareTokenHash;
    // Second envoi : le jeton n'étant jamais stocké en clair, le lien est régénéré (l'ancien meurt, le dernier e-mail fait foi).
    const r2 = await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'd@x.fr', message: '' });
    expect(r2.status).toBe(200); expect(r2.body.url).not.toBe(r1.body.url);
    const row2 = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row2?.shareTokenHash).not.toBe(hash1); expect(row2?.clientEmail).toBe('d@x.fr');
    expect((await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'pas-un-mail', message: '' })).status).toBe(400);
    a.locals.mailFactory = () => ({ sendMail: async () => { throw new Error('ECONNREFUSED'); } });
    const r3 = await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: '' });
    expect(r3.status).toBe(502); expect(r3.body.code).toBe('smtp_failed'); expect(r3.body.details).toBe('ECONNREFUSED');
    expect((await prisma.quote.findUnique({ where: { id: q.id } }))?.shareTokenHash).toBe(row2?.shareTokenHash); // échec d'envoi : lien inchangé
    await prisma.quote.update({ where: { id: q.id }, data: { clientResponse: 'ACCEPTED', clientRespondedAt: new Date() } });
    expect((await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: '' })).body.code).toBe('already_answered');
  });
```
**Décision (écart avec la spec §3, reportée en Step 6)** : le jeton n'est jamais stocké en clair, donc un e-mail ne peut pas réutiliser un lien existant. `POST /share/email` régénère le jeton à chaque envoi, **sauf** si une réponse a déjà été reçue (409 `already_answered` : régénérer effacerait la réponse ; le propriétaire régénère explicitement s'il le veut). L'envoi précède l'écriture en base : si le transport échoue, l'ancien lien reste valide.

Code dans `quote-share.routes.ts` :
```ts
import { z } from 'zod';
import { sendMail, type TransportFactory } from '../mail/mailer.js';
import { quoteEmail } from '../mail/templates.js';
const emailSchema = z.object({ to: z.string().trim().email().max(200), message: z.string().max(1000).default('') }).strict();

/** Envoie le lien au client : régénère le jeton (le jeton en clair n'est jamais stocké) sauf si une réponse existe déjà. */
quoteShareRoutes.post('/:id/share/email', wrap(async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid e-mail request', undefined, 'validation');
  const id = parseId(req.params.id); const scope = ownerScope(req); const prisma = req.app.locals.prisma;
  const existing = await prisma.quote.findFirst({ where: { id, ...scope } });
  if (!existing) throw new AppError(404, 'Quote not found');
  if (existing.clientResponse !== null) throw new AppError(409, 'This quote has already been answered; regenerate the link first', undefined, 'already_answered');
  if (!(await isSmtpEnabled(prisma))) throw new AppError(409, 'SMTP is not configured', undefined, 'smtp_disabled');
  const owner = await prisma.user.findUnique({ where: { id: scope.userId }, select: { displayName: true, language: true } });
  const { token, hash } = newShareToken(); const url = shareUrl(token);
  await sendMail(prisma, { to: parsed.data.to, ...quoteEmail(owner?.language, { projectName: existing.projectName, ownerName: owner?.displayName ?? '', url, message: parsed.data.message }) }, req.app.locals.mailFactory as TransportFactory | undefined);
  await prisma.quote.update({ where: { id }, data: { shareTokenHash: hash, sharedAt: new Date(), clientEmail: parsed.data.to.toLowerCase(), clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null } });
  res.json({ url });
}));
```
(importer `isSmtpEnabled`). L'envoi précède l'écriture : si le transport échoue, l'ancien lien reste valide. Run : `pnpm --filter @calc3d/backend exec vitest run src/routes/quote-share.routes.test.ts src/routes/public.routes.test.ts src/mail` → PASS.

- [ ] **Step 4: Routes SMTP admin (test puis code)**

`src/mail/smtp.schema.ts` :
```ts
import { z } from 'zod';
export const smtpBodySchema = z.object({
  host: z.string().trim().max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(), username: z.string().trim().max(255),
  password: z.string().max(255).optional(), fromAddress: z.string().trim().max(200).refine((v) => v === '' || z.string().email().safeParse(v).success, 'invalid e-mail'), fromName: z.string().trim().max(100), enabled: z.boolean(),
}).strict().superRefine((v, ctx) => { if (v.enabled && (!v.host || !v.fromAddress)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['enabled'], message: 'host and fromAddress are required to enable SMTP' }); });
export const smtpTestSchema = z.object({ to: z.string().trim().email().max(200) }).strict();
```
`src/routes/smtp.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { smtpRoutes } from './smtp.routes.js';
import { decrypt } from '../utils/crypto.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.smtpSettings.deleteMany(); await prisma.auditLog.deleteMany(); });
const body = { host: 'smtp.x', port: 587, secure: false, username: 'u', password: 's3cret', fromAddress: 'calc@x.fr', fromName: 'Calc3D', enabled: true };

describe('routes SMTP', () => {
  it('admin : lecture sans mot de passe, écriture chiffrée, vide = inchangé, audit ; utilisateur : 403 sauf /status', async () => {
    const adm = await createTestUser(prisma, 'root', 'admin'); const u = await createTestUser(prisma, 'bob');
    expect((await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).get('/api/smtp')).body).toMatchObject({ host: '', port: 587, enabled: false, hasPassword: false });
    const w = await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).put('/api/smtp').send(body);
    expect(w.status).toBe(200); expect(w.body).toMatchObject({ host: 'smtp.x', hasPassword: true, enabled: true }); expect(w.body).not.toHaveProperty('password'); expect(w.body).not.toHaveProperty('passwordEnc');
    const row = await prisma.smtpSettings.findUnique({ where: { id: 1 } });
    expect(row?.passwordEnc.startsWith('enc:')).toBe(true); expect(decrypt(row!.passwordEnc)).toBe('s3cret');
    await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).put('/api/smtp').send({ ...body, password: '' });
    expect(decrypt((await prisma.smtpSettings.findUnique({ where: { id: 1 } }))!.passwordEnc)).toBe('s3cret');
    expect((await prisma.auditLog.findMany()).map((a) => a.action)).toEqual(['smtp.update', 'smtp.update']);
    expect((await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).put('/api/smtp').send({ ...body, host: '', enabled: true })).status).toBe(400);
    expect((await request(appAs(prisma, u, '/api/smtp', smtpRoutes)).get('/api/smtp')).status).toBe(403);
    expect((await request(appAs(prisma, u, '/api/smtp', smtpRoutes)).put('/api/smtp').send(body)).status).toBe(403);
    expect((await request(appAs(prisma, u, '/api/smtp', smtpRoutes)).get('/api/smtp/status')).body).toEqual({ enabled: true });
  });
  it('e-mail de test : utilise la configuration enregistrée ; 502 si le transport échoue', async () => {
    const adm = await createTestUser(prisma, 'root', 'admin');
    const a = appAs(prisma, adm, '/api/smtp', smtpRoutes);
    expect((await request(a).post('/api/smtp/test').send({ to: 'me@x.fr' })).status).toBe(409);
    await request(a).put('/api/smtp').send(body);
    const sent: { to: string }[] = [];
    a.locals.mailFactory = () => ({ sendMail: async (m: { to: string }) => { sent.push(m); } });
    expect((await request(a).post('/api/smtp/test').send({ to: 'me@x.fr' })).status).toBe(200); expect(sent[0].to).toBe('me@x.fr');
    a.locals.mailFactory = () => ({ sendMail: async () => { throw new Error('auth failed'); } });
    const r = await request(a).post('/api/smtp/test').send({ to: 'me@x.fr' });
    expect(r.status).toBe(502); expect(r.body.details).toBe('auth failed');
  });
});
```
Run → FAIL. `src/routes/smtp.routes.ts` :
```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SmtpSettingsDto } from '@calc3d/common';
import type { SmtpSettings } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../audit/audit.js';
import { encrypt } from '../utils/crypto.js';
import { getSmtpSettings, isSmtpEnabled, sendMail, type TransportFactory } from '../mail/mailer.js';
import { smtpBodySchema, smtpTestSchema } from '../mail/smtp.schema.js';

export const smtpRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const toDto = (s: SmtpSettings | null): SmtpSettingsDto => ({ host: s?.host ?? '', port: s?.port ?? 587, secure: s?.secure ?? false, username: s?.username ?? '', hasPassword: !!s?.passwordEnc, fromAddress: s?.fromAddress ?? '', fromName: s?.fromName ?? '', enabled: s?.enabled ?? false });

/** Visible de tout utilisateur connecté : juste « activé ou non », pour les boutons d'envoi. */
smtpRoutes.get('/status', wrap(async (req, res) => { res.json({ enabled: await isSmtpEnabled(req.app.locals.prisma) }); }));

smtpRoutes.use(requireRole('admin'));
smtpRoutes.get('/', wrap(async (req, res) => { res.json(toDto(await getSmtpSettings(req.app.locals.prisma))); }));

/** Le mot de passe n'est jamais renvoyé ; vide ou absent en écriture = inchangé. */
smtpRoutes.put('/', wrap(async (req, res) => {
  const parsed = smtpBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid SMTP settings', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const { password, ...rest } = parsed.data;
  const data = { ...rest, ...(password ? { passwordEnc: encrypt(password) } : {}) };
  const row = await req.app.locals.prisma.smtpSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await audit(req, 'smtp.update', `${row.host}:${row.port} enabled=${row.enabled}`);
  res.json(toDto(row));
}));

smtpRoutes.post('/test', wrap(async (req, res) => {
  const parsed = smtpTestSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid recipient', undefined, 'validation');
  await sendMail(req.app.locals.prisma, { to: parsed.data.to, subject: 'Calc3D – test SMTP', text: 'Calc3D : la configuration SMTP fonctionne.', html: '<p>Calc3D : la configuration SMTP fonctionne.</p>' }, req.app.locals.mailFactory as TransportFactory | undefined);
  res.json({ ok: true });
}));
```
`app.ts` : `app.use('/api/smtp', smtpRoutes);` après `/api/import`. Run → PASS.

- [ ] **Step 5: Frontend — onglet E-mail (admin), carte e-mail du compte**

`scripts/i18n-fragments/smtp.json` :
```json
{
  "namespace": "smtp",
  "keys": {
    "en": { "tab": "E-mail", "title": "Outgoing e-mail (SMTP)", "intro": "Used to send quotes to customers and to notify you of their answers. The password is stored encrypted and never shown again.",
      "host": "SMTP host", "port": "Port", "secure": "Implicit TLS (port 465)", "username": "Username", "password": "Password", "passwordKeep": "Leave empty to keep the current password.", "fromAddress": "Sender address", "fromName": "Sender name", "enabled": "Enabled",
      "save": "Save", "saved": "SMTP settings saved.", "failed": "Could not save: {{reason}}", "testTo": "Send a test e-mail to", "test": "Send test", "testOk": "Test e-mail sent.", "testFailed": "Test failed: {{reason}}", "testSaveFirst": "Save the settings first." },
    "fr": { "tab": "E-mail", "title": "E-mail sortant (SMTP)", "intro": "Sert à envoyer les devis aux clients et à te notifier de leurs réponses. Le mot de passe est stocké chiffré et n'est jamais réaffiché.",
      "host": "Hôte SMTP", "port": "Port", "secure": "TLS implicite (port 465)", "username": "Identifiant", "password": "Mot de passe", "passwordKeep": "Laisser vide pour conserver le mot de passe actuel.", "fromAddress": "Adresse d'expédition", "fromName": "Nom d'expéditeur", "enabled": "Activé",
      "save": "Enregistrer", "saved": "Paramètres SMTP enregistrés.", "failed": "Enregistrement impossible : {{reason}}", "testTo": "Envoyer un e-mail de test à", "test": "Envoyer le test", "testOk": "E-mail de test envoyé.", "testFailed": "Test échoué : {{reason}}", "testSaveFirst": "Enregistre d'abord les paramètres." }
  }
}
```
`scripts/i18n-fragments/account-email.json` :
```json
{ "namespace": "accountEmail", "keys": {
  "en": { "title": "Notification e-mail", "intro": "Where to send the notification when a customer answers a quote. Leave empty for none.", "label": "E-mail address", "save": "Save", "saved": "E-mail address saved.", "invalid": "Invalid e-mail address." },
  "fr": { "title": "E-mail de notification", "intro": "Adresse qui reçoit la notification quand un client répond à un devis. Vide : aucune notification.", "label": "Adresse e-mail", "save": "Enregistrer", "saved": "Adresse enregistrée.", "invalid": "Adresse e-mail invalide." } } }
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

`src/api/auth.api.ts` : `updateEmail: (email: string) => api.put('/auth/email', { email }).then((r) => r.data),`. `UserInfo` (store) : `email?: string` ; `applyUserLanguage`/`me` inchangés (le champ transite).

`src/components/settings/SmtpSettingsCard.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { SmtpSettingsCard } from './SmtpSettingsCard';

const get = vi.fn(); const update = vi.fn(); const test = vi.fn();
vi.mock('@/api/smtp.api', () => ({ smtpApi: { get: () => get(), update: (b: unknown) => update(b), test: (to: string) => test(to) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const dto = { host: 'smtp.x', port: 587, secure: false, username: 'u', hasPassword: true, fromAddress: 'calc@x.fr', fromName: 'Calc3D', enabled: true };
function setup() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={qc}><SmtpSettingsCard /></QueryClientProvider>); }

describe('SmtpSettingsCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); update.mockReset(); test.mockReset(); get.mockResolvedValue(dto); });

  it('charge la configuration (mot de passe vide avec mention « conserver »), enregistre sans mot de passe si le champ est vide', async () => {
    update.mockResolvedValue(dto);
    setup();
    expect(await screen.findByDisplayValue('smtp.x')).toBeInTheDocument();
    expect((screen.getByLabelText(/^Mot de passe$/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Laisser vide pour conserver/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Port$/), { target: { value: '465' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.x', port: 465, enabled: true })));
    expect(update.mock.calls[0][0]).not.toHaveProperty('password');
  });
  it('e-mail de test : appel avec l\'adresse, erreur affichée avec le détail', async () => {
    test.mockRejectedValue({ response: { status: 502, data: { details: 'auth failed' } } });
    setup();
    await screen.findByDisplayValue('smtp.x');
    fireEvent.change(screen.getByLabelText(/e-mail de test/), { target: { value: 'me@x.fr' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le test/ }));
    await waitFor(() => expect(test).toHaveBeenCalledWith('me@x.fr'));
    expect(await screen.findByText(/Test échoué : auth failed/)).toBeInTheDocument();
  });
});
```
Run → FAIL. `src/components/settings/SmtpSettingsCard.tsx` :
```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { SmtpSettingsBody, SmtpSettingsDto } from '@calc3d/common';
import { smtpApi } from '@/api/smtp.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ApiError = { response?: { data?: { error?: string; details?: string } }; message?: string };
const reason = (e: ApiError) => e?.response?.data?.details || e?.response?.data?.error || e?.message || '?';

/** Configuration SMTP de l'instance (admin). Le mot de passe n'est jamais relu : champ vide = inchangé. */
export function SmtpSettingsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['smtp'], queryFn: smtpApi.get });
  const [form, setForm] = useState<SmtpSettingsBody>({ host: '', port: 587, secure: false, username: '', password: '', fromAddress: '', fromName: '', enabled: false });
  const [testTo, setTestTo] = useState(''); const [testError, setTestError] = useState('');
  useEffect(() => { if (q.data) setForm({ host: q.data.host, port: q.data.port, secure: q.data.secure, username: q.data.username, password: '', fromAddress: q.data.fromAddress, fromName: q.data.fromName, enabled: q.data.enabled }); }, [q.data]);
  const save = useMutation({ mutationFn: () => { const { password, ...rest } = form; return smtpApi.update(password ? { ...rest, password } : rest); }, onSuccess: (d: SmtpSettingsDto) => { qc.setQueryData(['smtp'], d); void qc.invalidateQueries({ queryKey: ['smtp-status'] }); toast.success(t('smtp.saved')); }, onError: (e: ApiError) => toast.error(t('smtp.failed', { reason: reason(e) })) });
  const test = useMutation({ mutationFn: () => smtpApi.test(testTo.trim()), onSuccess: () => { setTestError(''); toast.success(t('smtp.testOk')); }, onError: (e: ApiError) => setTestError(t('smtp.testFailed', { reason: reason(e) })) });
  const field = (k: keyof SmtpSettingsBody, label: string, type = 'text') => (
    <div className="space-y-1"><Label htmlFor={`smtp-${k}`} className="text-xs">{label}</Label><Input id={`smtp-${k}`} type={type} value={String(form[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: type === 'number' ? Number(e.target.value) : e.target.value })} /></div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('smtp.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('smtp.intro')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('host', t('smtp.host'))}{field('port', t('smtp.port'), 'number')}
          {field('username', t('smtp.username'))}
          <div className="space-y-1"><Label htmlFor="smtp-password" className="text-xs">{t('smtp.password')}</Label><Input id="smtp-password" type="password" autoComplete="new-password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />{q.data?.hasPassword && <p className="text-xs text-muted-foreground">{t('smtp.passwordKeep')}</p>}</div>
          {field('fromAddress', t('smtp.fromAddress'), 'email')}{field('fromName', t('smtp.fromName'))}
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.secure} onCheckedChange={(v) => setForm({ ...form, secure: v })} aria-label={t('smtp.secure')} />{t('smtp.secure')}</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} aria-label={t('smtp.enabled')} />{t('smtp.enabled')}</label>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{t('smtp.save')}</Button>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="space-y-1"><Label htmlFor="smtp-test" className="text-xs">{t('smtp.testTo')}</Label><Input id="smtp-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
          <Button size="sm" variant="outline" disabled={test.isPending || !testTo.trim()} onClick={() => test.mutate()}>{t('smtp.test')}</Button>
        </div>
        {testError && <p className="text-xs text-destructive">{testError}</p>}
      </CardContent>
    </Card>
  );
}
```
`src/components/settings/EmailCard.tsx` (carte du compte, pas de test dédié : logique triviale, couverte par le test backend) :
```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function EmailCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user); const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState(user?.email ?? '');
  const save = useMutation({ mutationFn: () => authApi.updateEmail(email.trim()), onSuccess: () => { if (user) setUser({ ...user, email: email.trim().toLowerCase() }); toast.success(t('accountEmail.saved')); }, onError: () => toast.error(t('accountEmail.invalid')) });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('accountEmail.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('accountEmail.intro')}</p>
        <div className="space-y-1"><Label htmlFor="account-email" className="text-xs">{t('accountEmail.label')}</Label><Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{t('accountEmail.save')}</Button>
      </CardContent>
    </Card>
  );
}
```
(si `auth.store` n'a pas de `setUser`, l'ajouter : `setUser: (user) => set({ user })`.) `Settings.tsx` : `EmailCard` en tête de l'onglet Compte ; onglet `smtp` (icône `Mail`, admin seulement, clé `smtp.tab`) contenant `<SmtpSettingsCard />`.

Run: `pnpm --filter @calc3d/frontend run test` → PASS.

- [ ] **Step 6: Documentation, spec, versions**

- `CHANGELOG.md` : `## [0.4.0] - <date> — lot 4` : lien client (`/q/<jeton>`, jeton haché, régénération/révocation), page publique (acceptation/refus avec commentaire, une réponse par lien), suivi (badge, filtre, compteur, carte Client, conversion), SMTP (onglet admin, mot de passe chiffré, test), e-mails (envoi au client, notification au propriétaire, adresse de compte), corrigé : titre de la page d'impression.
- README fr/en : section Fonctionnalités (trois points), Installation : « Paramètres → E-mail (admin) pour configurer le SMTP ; Paramètres → Compte pour ton adresse de notification ».
- `CLAUDE.md` : routes `/api/public` (sans auth, limiteur dédié), `/api/smtp`, `quote-share.routes.ts` monté avant `quotes.routes.ts`, `mail/` (mailer injectable via `app.locals.mailFactory`, `notifyOwnerOfResponse` via `app.locals`), invariant réseau amendé, `toPublicQuoteDto` partagé, `QuoteDocument`.
- Spec lot 4 §3 : « `POST /share/email` régénère le jeton (jamais stocké en clair) sauf si une réponse a été reçue (409 `already_answered`) » ; spec générale §9 : invariant réseau amendé (SMTP).
- Versions `0.4.0` dans les trois `package.json`.

- [ ] **Step 7: Chaîne CI locale, parcours de bout en bout, commit**

Run: `pnpm install --frozen-lockfile && pnpm audit --audit-level high && pnpm db:generate && pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck && pnpm test && pnpm build` → au vert.

Parcours sur la stack de dev (`pnpm dev`, script HTTP dans le scratchpad + Chrome) : créer un devis (bob), générer le lien, l'ouvrir **sans jeton d'authentification** (`publicApi` / fenêtre privée), accepter avec commentaire, vérifier badge + compteur + carte Client chez bob, 404 chez admin, régénérer → ancien lien 404, configurer un SMTP factice (hôte inexistant) → test 502 avec message, bouton e-mail actif, envoi 502.

```bash
git add -A
git commit -m "Ajoute la configuration SMTP, les e-mails et la documentation du lot 4"
```

---

## Notes

- Le jeton n'est jamais stocké en clair : l'envoi par e-mail régénère donc le lien (sauf réponse déjà reçue). Si le partenaire préfère réafficher un lien existant, il faudra stocker le jeton en clair (décision de spec, hors de ce plan).
- `app.locals.mailFactory` et `app.locals.notifyOwnerOfResponse` sont les seuls points d'injection : en production ils sont posés dans `index.ts` ; en test ils sont remplacés par des factices. Aucun test n'ouvre de connexion réseau.
- Le limiteur de `/api/public` est distinct du limiteur global `/api` (300/min) ; les deux s'appliquent.
- Après ce lot, un client sans compte peut consulter et répondre à un devis ; l'application reste cloisonnée par propriétaire.
