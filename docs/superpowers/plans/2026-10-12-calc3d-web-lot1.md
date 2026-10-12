# Calc3D-Web lot 1 : socle, comptes, paramètres, devis — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un monorepo `calc3d-web` qui démarre (local et Docker), avec installation du premier admin, authentification complète reprise de MC Manager, rôles `admin`/`user`, paramètres et catalogue par utilisateur, et une page Devis qui calcule en direct et enregistre un devis dont le prix est identique au centime à celui de l'application bureau.

**Architecture:** Monorepo pnpm à trois packages. `@calc3d/common` porte les types, les constantes (statuts, catégories, modes) et le moteur de calcul pur `computeQuote`, utilisé par le navigateur (résultat en direct) et par le serveur (valeur enregistrée, qui fait foi). `@calc3d/backend` (Express + Prisma/SQLite) reprend le module d'authentification de `../Minecraft` (fichiers copiés puis adaptés) et ajoute les routes métier, toutes filtrées par `ownerScope(req)`. `@calc3d/frontend` (React 18 / Vite / Tailwind / shadcn) reprend la coquille applicative de MC Manager et ajoute les pages Paramètres et Devis.

**Tech Stack:** Node 22, pnpm 9, TypeScript 5.9, Express 4, Prisma 6 (SQLite), zod 3, vitest 4, supertest, React 18.3, Vite 6, Tailwind 3.4, shadcn (Radix), TanStack Query 5, zustand 5, i18next, react-router 6, axios, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-12-calc3d-web-design.md`

## Global Constraints

- Versions : Node 22 (CI et Docker), pnpm 9, TypeScript ^5.9.3, Express ^4.22.2, Prisma ^6.19.3, zod ^3.25.76, vitest ^4.1.8, React ^18.3.1, Vite ^6.4.3, Tailwind ^3.4.19. Copier les versions exactes des `package.json` de `../Minecraft`.
- Noms npm : `@calc3d/common`, `@calc3d/backend`, `@calc3d/frontend`. Nom de code `calc3d-web`. Tout `@mc/` copié devient `@calc3d/`.
- Secrets : `JWT_SECRET` et `ENCRYPTION_KEY` obligatoires, 32 caractères minimum, différents ; aucun défaut publié (`config.ts` fait `process.exit(1)`).
- Rôles : `admin` et `user` uniquement. Le mot `viewer` ne doit apparaître nulle part dans le code final.
- Cloisonnement : chaque requête Prisma sur `UserSettings`, `Material`, `Quote` passe par `ownerScope(req)`. Ressource d'autrui → 404. Aucune route n'accepte un `userId` en paramètre.
- Valeurs canoniques (clés anglaises stables, définies dans `@calc3d/common`) : `QUOTE_KINDS = ['QUOTE','ORDER']`, `QUOTE_STATUSES = ['PENDING','SCHEDULED','IN_PROGRESS','DONE','ON_HOLD']`, `PRICING_MODES = ['MARKUP','TARGET_MARGIN']`, `PURCHASE_CATEGORIES = ['FILAMENT','SPARE_PARTS','MAINTENANCE','HARDWARE','TOOLS','OTHER']`.
- Moteur de calcul : `computeQuote` reproduit `Invoke-Calcul` de `../CalculateurPrix/Calculateur3D.ps1` ; les cas dorés passent avec une tolérance de `1e-4`.
- Frontend : jamais de `dangerouslySetInnerHTML` ; aucune ressource externe chargée (retirer l'`@import` Google Fonts de `globals.css`) ; textes via i18next, fragments dans `scripts/i18n-fragments/` puis `node scripts/merge-i18n.mjs`.
- Langue du code : commentaires et messages de commit en français ; identifiants en anglais. Les messages d'erreur HTTP restent en anglais comme dans MC Manager (le frontend les traduit par `code` quand il y en a un).
- Fichiers de données personnels (`*.db`, `.env`, `packages/backend/data/`) jamais commités.
- Chaque tâche se termine par `pnpm lint && pnpm typecheck && pnpm test` au vert et un commit.

## Review Focus

Entrées que la spec implique sans les nommer, et le comportement attendu ; chacune a son test dans la tâche indiquée.

1. **Virgule décimale** (`1,5` saisi dans un champ numérique par un utilisateur francophone) : accepté et interprété comme `1.5`, jamais `NaN` ni `15`. Tests dans la tâche 7 (`parseLocaleNumber`) et la tâche 8 (`toQuoteInput`).
2. **Marge cible ≥ 100 %** : le serveur répond 400 et le formulaire affiche une erreur ; le prix ne devient jamais `Infinity` ni négatif. Tests dans les tâches 4 (`computeQuote` lève) et 5 (`PUT /settings` → 400).
3. **Quantité 0, négative ou décimale** : le serveur répond 400 ; le client force un entier ≥ 1. Tests dans les tâches 6 et 8.
4. **Nom de matière en doublon à la casse ou aux espaces près** (`pla`, ` PLA `) : 409 avec `code: 'duplicate'`, nom stocké sans espaces de bord. Test dans la tâche 5.
5. **Suppression d'un compte** : ses paramètres, matières et devis disparaissent en cascade, ceux des autres restent. Test dans la tâche 5.

---

## Structure des fichiers

Racine (copiée de `../Minecraft`, adaptée) : `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `.dockerignore`, `.env.example`, `.github/workflows/ci.yml`, `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `README.md`, `README.fr.md`, `CHANGELOG.md`, `CLAUDE.md`.

`packages/common/src/` :
- `index.ts` : ré-exporte tout.
- `types/auth.ts`, `types/audit.ts`, `types/journal.ts` : copiés de MC Manager et réduits (voir tâche 1).
- `constants.ts` : `QUOTE_KINDS`, `QUOTE_STATUSES`, `PRICING_MODES`, `PURCHASE_CATEGORIES`, `DEFAULT_MATERIALS`, `DEFAULT_PRICING_SETTINGS`.
- `pricing/types.ts` : `PricingSettings`, `FilamentLine`, `QuoteInput`, `QuoteResult`.
- `pricing/compute-quote.ts` : `computeQuote(settings, input)`.
- `pricing/compute-quote.test.ts` : cas dorés.
- `types/settings.ts` : `UserSettingsDto`, `MaterialDto`.
- `types/quotes.ts` : `QuoteDto`, `CreateQuoteBody`.

`packages/backend/src/` :
- Copiés de MC Manager sans changement : `utils/{crypto,mfa,trusted-device,trusted-device-service,validate-password,logger,pagination,geo}.ts` (+ tests), `middleware/{auth,rbac,error-handler}.ts` (+ tests), `audit/audit.ts`, `auth/{session,web-login-journal}.ts` (+ test), `routes/{setup,auth,audit}.routes.ts`, `test-db.ts`.
- Copiés et adaptés : `config.ts` (plus de `McConfig`), `app.ts`, `index.ts`, `test-setup.ts`, `routes/users.routes.ts` (`viewer` → `user`), `routes/journal.routes.ts` (seulement `/web` et `/retention`), `journal/retention.ts` (ex `players/retention.ts`).
- Nouveaux : `owner-scope.ts`, `settings/settings-service.ts` (+ test), `settings/settings.schema.ts`, `routes/settings.routes.ts` (+ test), `routes/materials.routes.ts` (+ test), `quotes/quote-mapper.ts`, `quotes/quote.schema.ts`, `routes/quotes.routes.ts` (+ test).
- `prisma/schema.prisma` : modèles auth copiés + `UserSettings`, `Material`, `Quote`, `Purchase`.

`packages/frontend/src/` :
- Copiés sans changement : `components/ui/*`, `components/shared/{ConfirmDialog,LanguageSwitcher,ThemeToggle,LoadingSpinner,EmptyState}.tsx`, `hooks/{use-media-query,use-sidebar,use-auth}.ts`, `api/{client,token-refresh,auth.api,users.api,audit.api}.ts`, `pages/{Login,SetupPage,Audit,NotFound}.tsx`, `lib/utils.ts`, `test-setup.ts`, `test-utils/viewport.ts`, `styles/globals.css`, `scripts/merge-i18n.mjs`.
- Copiés et adaptés : `stores/{auth,ui}.store.ts` (clés de stockage, rôle), `components/layout/{AppLayout,Header,Sidebar}.tsx` (plus de WebSocket, navigation Calc3D), `pages/Settings.tsx` (onglets), `pages/Journal.tsx` (onglet web seul), `api/journal.api.ts`, `i18n/index.ts`, `i18n/locales/{fr,en}.json` (namespaces conservés : `common`, `shared`, `nav`, `notFound`, `login`, `setup`, `settings`, `audit`, `journal`), `App.tsx`, `index.html`.
- Nouveaux : `api/settings.api.ts`, `api/materials.api.ts`, `api/quotes.api.ts`, `lib/number.ts` (+ test), `components/settings/PricingSettingsForm.tsx` (+ test), `components/settings/MaterialsCard.tsx` (+ test), `components/quote/{QuoteForm,FilamentGrid,QuoteResultPanel}.tsx`, `pages/Quote.tsx` (+ test), `scripts/i18n-fragments/{calc3d-nav,settings-pricing,quote}.json`.

---

### Task 1: Racine du monorepo, package `common` vide de métier, CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `.dockerignore`, `.env.example`, `.github/workflows/ci.yml`
- Create: `packages/common/package.json`, `packages/common/tsconfig.json`, `packages/common/src/index.ts`, `packages/common/src/types/auth.ts`, `packages/common/src/types/audit.ts`, `packages/common/src/types/journal.ts`

**Interfaces:**
- Produces: `UserRole = 'admin' | 'user'`, `JwtPayload`, `TokenType`, `AuditAction`, `AuditEntry`, `AuditPage`, `Page<T>`, `WebLoginReason`, `WebLoginEntry`, `JournalRetention` exportés par `@calc3d/common`.

- [ ] **Step 1: Copier les fichiers racine depuis MC Manager**

```bash
cd /c/Workspace/Calc3D-Web
SRC=/c/Workspace/Minecraft
cp "$SRC/pnpm-workspace.yaml" "$SRC/tsconfig.base.json" "$SRC/eslint.config.mjs" "$SRC/.dockerignore" .
mkdir -p .github/workflows packages/common/src/types
cp "$SRC/.github/workflows/ci.yml" .github/workflows/ci.yml
cp "$SRC/packages/common/tsconfig.json" packages/common/tsconfig.json
cp "$SRC/packages/common/src/types/auth.ts" "$SRC/packages/common/src/types/audit.ts" "$SRC/packages/common/src/types/journal.ts" packages/common/src/types/
```

- [ ] **Step 2: Écrire `package.json` racine**

```json
{
  "name": "calc3d-web",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel -r run dev",
    "dev:backend": "pnpm --filter @calc3d/backend run dev",
    "dev:frontend": "pnpm --filter @calc3d/frontend run dev",
    "build": "pnpm -r run build",
    "db:generate": "pnpm --filter @calc3d/backend exec prisma generate",
    "db:push": "pnpm --filter @calc3d/backend exec prisma db push",
    "lint": "eslint .",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.4.1",
    "eslint-plugin-react-hooks": "^7.1.1",
    "globals": "^17.6.0",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.61.0"
  },
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" }
}
```

Ne pas reprendre le bloc `pnpm.auditConfig` de MC Manager : il n'y a pas encore d'avis à ignorer. Si `pnpm audit --audit-level high` échoue plus tard sur un avis sans correctif amont, l'ajouter à ce moment-là avec un commentaire dans `CLAUDE.md`.

- [ ] **Step 3: Écrire `.gitignore` et `.env.example`**

`.gitignore` :
```
node_modules/
dist/
*.tsbuildinfo
.env
*.db
*.db-journal
*.log
.DS_Store
.vscode/
.idea/
packages/backend/generated/
packages/backend/data/
packages/backend/prisma/migrations/
.superpowers/
.claude/
```

`.env.example` :
```
NODE_ENV=development
PORT=3001
DATABASE_URL="file:./data/calc3d.db"
# Obligatoires, 32 caractères minimum, différents l'un de l'autre : openssl rand -hex 32
JWT_SECRET=change-this-to-a-random-string-at-least-32-chars
ENCRYPTION_KEY=change-this-to-a-different-random-string
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
# Origine exacte utilisée par le navigateur (valeur CORS)
FRONTEND_URL=http://localhost:5173
FRONTEND_PORT=3000
```

- [ ] **Step 4: Adapter `ci.yml`**

Dans `.github/workflows/ci.yml` : remplacer `branches: [master]` par `branches: [main]`, et `pnpm --filter @mc/common run build` par `pnpm --filter @calc3d/common run build`. Le reste est inchangé (install, audit, db:generate, build common, lint, typecheck, test, build, puis build des deux Dockerfiles).

- [ ] **Step 5: Écrire le package `common`**

`packages/common/package.json` :
```json
{
  "name": "@calc3d/common",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": { "typescript": "^5.9.3", "vitest": "^4.1.8" }
}
```

`packages/common/tsconfig.json` : ajouter `"exclude": ["src/**/*.test.ts"]` au niveau racine pour que les tests de la tâche 4 ne soient pas compilés dans `dist/`.

`packages/common/src/types/auth.ts` : remplacer `export type UserRole = 'admin' | 'viewer';` par `export type UserRole = 'admin' | 'user';`.

`packages/common/src/types/audit.ts` : remplacer l'union `AuditAction` par :
```ts
export type AuditAction =
  | 'user.create' | 'user.update' | 'user.delete'
  | 'journal.retention';
```

`packages/common/src/types/journal.ts` : ne garder que `Page<T>`, `WebLoginReason`, `WebLoginEntry`, `JournalRetention` (supprimer `LoginFailureReason` et `PlayerLoginFailureEntry`).

`packages/common/src/index.ts` :
```ts
export * from './types/auth.js';
export * from './types/audit.js';
export * from './types/journal.js';
```

- [ ] **Step 6: Installer et vérifier**

Run: `cd /c/Workspace/Calc3D-Web && pnpm install && pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck`
Expected: `pnpm install` crée `pnpm-lock.yaml` ; build, lint et typecheck sans erreur (`common` n'a pas encore de test, `vitest run` sans fichier sort en code 0 avec `--passWithNoTests` : ajouter `"test": "vitest run --passWithNoTests"` si vitest 4 sort en erreur).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Initialise le monorepo calc3d-web (racine, common, CI)"
```

---

### Task 2: Backend, socle d'authentification repris de MC Manager

**Files:**
- Create: `packages/backend/package.json`, `tsconfig.json`, `vitest.config.ts`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/seed.ts`
- Copy (sans changement) : `src/utils/{crypto,mfa,trusted-device,trusted-device-service,validate-password,logger,pagination,geo}.ts` et leurs `*.test.ts`, `src/middleware/{auth,rbac,error-handler}.ts` et tests, `src/audit/audit.ts`, `src/auth/{session,web-login-journal}.ts` et `web-login-journal.test.ts`, `src/routes/{setup,auth,audit}.routes.ts`, `src/routes/auth.routes.login-journal.test.ts`, `src/routes/audit.routes.test.ts`, `src/test-db.ts`
- Copy (adaptés) : `src/config.ts`, `src/app.ts`, `src/index.ts`, `src/test-setup.ts`, `src/routes/users.routes.ts` (+ test), `src/routes/journal.routes.ts` (+ test), `src/journal/retention.ts`

**Interfaces:**
- Produces: `createApp(): Express` ; `authMiddleware` ; `requireRole(...roles)` ; `AppError(statusCode, message, details?, code?)` ; `audit(req, action, detail?)` ; `testPrisma(): PrismaClient` ; `req.user: { id, username, role }`.

- [ ] **Step 1: Copier l'arborescence**

```bash
cd /c/Workspace/Calc3D-Web
SRC=/c/Workspace/Minecraft/packages/backend
mkdir -p packages/backend/src/{utils,middleware,audit,auth,routes,journal} packages/backend/prisma
cp "$SRC/tsconfig.json" "$SRC/vitest.config.ts" "$SRC/prisma.config.ts" packages/backend/
cp "$SRC/src/test-db.ts" packages/backend/src/
for f in crypto mfa trusted-device trusted-device-service validate-password logger pagination geo; do
  cp "$SRC/src/utils/$f.ts" packages/backend/src/utils/
  [ -f "$SRC/src/utils/$f.test.ts" ] && cp "$SRC/src/utils/$f.test.ts" packages/backend/src/utils/
done
cp "$SRC"/src/middleware/*.ts packages/backend/src/middleware/
cp "$SRC/src/audit/audit.ts" packages/backend/src/audit/
cp "$SRC"/src/auth/*.ts packages/backend/src/auth/
cp "$SRC/src/routes/setup.routes.ts" "$SRC/src/routes/auth.routes.ts" "$SRC/src/routes/audit.routes.ts" "$SRC/src/routes/users.routes.ts" "$SRC/src/routes/journal.routes.ts" packages/backend/src/routes/
cp "$SRC/src/routes/auth.routes.login-journal.test.ts" "$SRC/src/routes/audit.routes.test.ts" "$SRC/src/routes/users.routes.test.ts" "$SRC/src/routes/journal.routes.test.ts" packages/backend/src/routes/
cp "$SRC/src/players/retention.ts" packages/backend/src/journal/retention.ts
cp "$SRC/src/config.ts" "$SRC/src/app.ts" "$SRC/src/index.ts" "$SRC/src/test-setup.ts" packages/backend/src/
grep -rl "@mc/common" packages/backend/src | xargs sed -i 's#@mc/common#@calc3d/common#g'
```

- [ ] **Step 2: `package.json` du backend**

```json
{
  "name": "@calc3d/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@calc3d/common": "workspace:*",
    "@prisma/client": "^6.19.3",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^16.6.1",
    "express": "^4.22.2",
    "express-rate-limit": "^7.5.1",
    "geoip-lite": "2.0.2",
    "helmet": "^8.2.0",
    "jsonwebtoken": "^9.0.3",
    "nanoid": "^5.1.11",
    "otplib": "^12.0.1",
    "pino": "^9.14.0",
    "pino-pretty": "^11.3.0",
    "qrcode": "^1.5.4",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/geoip-lite": "^1.4.4",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "^22.19.21",
    "@types/qrcode": "^1.5.6",
    "@types/supertest": "^6.0.3",
    "prisma": "^6.19.3",
    "supertest": "^7.1.4",
    "tsx": "^4.22.4",
    "typescript": "^5.9.3",
    "vitest": "^4.1.8"
  }
}
```

`geoip-lite` est épinglé en `2.0.2` sans caret pour la même raison que dans MC Manager (les 2.x déclarent `engines.node >= 24`, pnpm n'émet qu'un avertissement).

- [ ] **Step 3: `schema.prisma` (auth seulement pour l'instant)**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id                 Int       @id @default(autoincrement())
  username           String    @unique
  passwordHash       String?
  displayName        String
  role               String    @default("user")
  enabled            Boolean   @default(true)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  lastLoginAt        DateTime?
  mfaEnabled         Boolean   @default(false)
  mfaSecret          String?
  mfaPendingSecret   String?
  mfaRecoveryCodes   String?
  mfaRequired        Boolean   @default(false)
  mustChangePassword Boolean   @default(false)
  language           String?

  refreshTokens  RefreshToken[]
  trustedDevices TrustedDevice[]
}

model RefreshToken {
  id         Int      @id @default(autoincrement())
  token      String   @unique
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  family     String?
  replacedBy String?
}

model TrustedDevice {
  id           Int      @id @default(autoincrement())
  userId       Int
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  selector     String   @unique
  verifierHash String
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())
  userAgent    String?
  ipAddress    String?
}

model AppSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}

model AuditLog {
  id       Int      @id @default(autoincrement())
  at       DateTime @default(now())
  userId   Int
  username String
  action   String
  detail   String?
  ip       String?

  @@index([at])
}

model WebLogin {
  id        Int      @id @default(autoincrement())
  username  String
  userId    Int?
  ip        String
  country   String?
  success   Boolean
  reason    String?
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([username, createdAt])
}
```

`prisma/seed.ts` :
```ts
// Aucun jeu de données initial : le premier admin est créé par la page d'installation.
export {};
```

- [ ] **Step 4: Adapter `config.ts`**

Supprimer `McConfig`, `buildMcConfig`, `loadMc` et la clé `mc` de `config`. Remplacer `'file:./data/mc-manager.db'` par `'file:./data/calc3d.db'`. Le fichier final :

```ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Secret obligatoire. On refuse de démarrer plutôt que de retomber sur une valeur
 * par défaut publiée : JWT_SECRET signe toutes les sessions, ENCRYPTION_KEY protège
 * les secrets stockés (TOTP...).
 */
function requireSecret(name: 'JWT_SECRET' | 'ENCRYPTION_KEY'): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`[FATAL] ${name} is not set. Generate one with: openssl rand -hex 32`);
    process.exit(1);
  }
  if (value.length < 32) {
    console.error(`[FATAL] ${name} is too short (${value.length} chars). Use at least 32; generate one with: openssl rand -hex 32`);
    process.exit(1);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./data/calc3d.db',
  jwtSecret: requireSecret('JWT_SECRET'),
  encryptionKey: requireSecret('ENCRYPTION_KEY'),
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};
```

`src/test-setup.ts` : supprimer les deux lignes `MC_CONTAINER` et `MC_BACKUP_CONTAINER`.

- [ ] **Step 5: Adapter `users.routes.ts` et son test**

Dans `src/routes/users.routes.ts` : `const VALID_ROLES = ['admin', 'user'];` ; `const assignedRole = role || 'user';` ; `const isDemoting = data.enabled === false || data.role === 'user';`. Dans `users.routes.test.ts`, remplacer toutes les occurrences de `'viewer'` par `'user'`.

Dans `src/routes/audit.routes.ts`, remplacer le commentaire et la logique de masquage par un simple passage : la route est déjà réservée à l'admin par le montage (voir `app.ts`), donc :

```ts
const entries = rows.map((r: { at: Date }) => ({ ...r, at: r.at.toISOString() }));
```

et retirer la variable `isAdmin`. Dans `audit.routes.test.ts`, supprimer le cas qui vérifie le masquage des IP pour un viewer, s'il existe, et remplacer `'viewer'` par `'user'` ailleurs.

- [ ] **Step 6: Réduire `journal.routes.ts` au journal web**

```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { audit } from '../audit/audit.js';
import { parsePage } from '../utils/pagination.js';
import { loadRetentionDays, saveRetentionDays, MAX_RETENTION_DAYS } from '../journal/retention.js';

export const journalRoutes: Router = Router();
journalRoutes.use(requireRole('admin'));

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

function parseDate(v: unknown, label: string): Date | undefined {
  if (v === undefined || v === '') return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError(400, `Invalid ${label} date`);
  return d;
}

/** Filtres : q (contient, insensible à la casse via SQLite), from/to sur createdAt. */
function filters(req: Request): Record<string, unknown> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to');
  return {
    ...(q ? { username: { contains: q } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
}

journalRoutes.get('/web', wrap(async (req, res) => {
  const { page, limit, skip } = parsePage(req.query);
  const where = filters(req);
  const prisma = req.app.locals.prisma;
  const [total, rows] = await Promise.all([prisma.webLogin.count({ where }), prisma.webLogin.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit })]);
  res.json({ items: rows.map((r: { createdAt: Date }) => ({ ...r, createdAt: r.createdAt.toISOString() })), total, page, limit });
}));

journalRoutes.get('/retention', wrap(async (req, res) => { res.json({ days: await loadRetentionDays(req.app.locals.prisma) }); }));

journalRoutes.put('/retention', wrap(async (req, res) => {
  const days = req.body?.days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > MAX_RETENTION_DAYS) throw new AppError(400, `days must be an integer between 0 and ${MAX_RETENTION_DAYS}`);
  await saveRetentionDays(req.app.locals.prisma, days);
  await audit(req, 'journal.retention', String(days));
  res.json({ days });
}));
```

Ajouter dans `src/journal/retention.ts` une fonction de purge (celle de MC Manager vit dans `PlayerJournal`) :

```ts
/** Supprime les connexions web plus anciennes que la rétention ; 0 = illimité. */
export async function purgeWebLogins(prisma: PrismaClient): Promise<number> {
  const days = await loadRetentionDays(prisma);
  if (days === 0) return 0;
  const before = new Date(Date.now() - days * 86_400_000);
  const r = await prisma.webLogin.deleteMany({ where: { createdAt: { lt: before } } });
  return r.count;
}
```

Dans `journal.routes.test.ts`, ne garder que les cas qui touchent `/web` et `/retention` (supprimer ceux de `/players` et `/failures`, et les imports de `player-sheet`). Remplacer `'viewer'` par `'user'`.

- [ ] **Step 7: Écrire `app.ts`**

```ts
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { requireRole } from './middleware/rbac.js';
import { authRoutes } from './routes/auth.routes.js';
import { setupRoutes } from './routes/setup.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { journalRoutes } from './routes/journal.routes.js';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString() }); });

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, please try again later' } });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api/setup/init', authLimiter);
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } }));

  // Routes publiques, puis authMiddleware, puis les routes protégées (les tâches 5 et 6 ajoutent les routes métier ici).
  app.use('/api/setup', setupRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api', authMiddleware);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', requireRole('admin'), auditRoutes);
  app.use('/api/journal', journalRoutes);

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 8: Écrire `index.ts`**

```ts
import { createServer } from 'http';
import { PrismaClient } from '../generated/prisma/index.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { purgeWebLogins } from './journal/retention.js';

process.on('uncaughtException', (err) => logger.error({ err }, 'uncaught exception (kept alive)'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection (kept alive)'));

async function main() {
  if (config.encryptionKey === config.jwtSecret) {
    logger.fatal('ENCRYPTION_KEY must be different from JWT_SECRET');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const app = createApp();
  app.locals.prisma = prisma;
  const server = createServer(app);

  // Purge quotidienne du journal de connexions selon la rétention configurée.
  const purge = () => purgeWebLogins(prisma).catch((err) => logger.warn({ err }, 'journal purge failed'));
  void purge();
  const purgeTimer = setInterval(() => void purge(), 86_400_000);

  server.listen(config.port, () => logger.info(`Calc3D-Web backend on http://localhost:${config.port}`));

  const shutdown = async () => {
    logger.info('shutting down');
    clearInterval(purgeTimer);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => { logger.fatal({ err }, 'failed to start'); process.exit(1); });
```

- [ ] **Step 9: Installer, générer Prisma et lancer les tests copiés**

Run: `cd /c/Workspace/Calc3D-Web && pnpm install && pnpm db:generate && pnpm --filter @calc3d/common run build && pnpm --filter @calc3d/backend run typecheck && pnpm --filter @calc3d/backend run test`
Expected: typecheck sans erreur ; tous les tests copiés passent (crypto, mfa, trusted-device, validate-password, geo, auth middleware, error-handler, web-login-journal, auth login-journal, audit, users, journal web). Corriger uniquement les imports cassés par la copie (par exemple un test qui importerait `players/`), jamais la logique.

- [ ] **Step 10: Vérifier le démarrage réel**

```bash
cp .env.example .env
sed -i 's/^JWT_SECRET=.*/JWT_SECRET=dev-jwt-secret-0123456789abcdef0123456789/; s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=dev-encryption-key-fedcba9876543210fedcba/' .env
pnpm db:push
(pnpm dev:backend > /tmp/backend.log 2>&1 &) ; sleep 6
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/setup/status
```
Expected: `{"status":"ok",...}` puis `{"needsSetup":true}`. Arrêter le processus `tsx` ensuite.

- [ ] **Step 11: Lint complet puis commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: tout au vert.

```bash
git add -A
git commit -m "Reprend le socle d'authentification de MC Manager (backend)"
```

---

### Task 3: Frontend, coquille applicative et pages d'authentification reprises de MC Manager

**Files:**
- Create: `packages/frontend/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,tailwind.config.ts,postcss.config.js,components.json,index.html}`
- Copy (sans changement) : `src/components/ui/*`, `src/components/shared/{ConfirmDialog,LanguageSwitcher,ThemeToggle,LoadingSpinner,EmptyState}.tsx`, `src/hooks/{use-media-query,use-sidebar,use-auth}.ts`, `src/api/{client,token-refresh,auth.api,users.api,audit.api}.ts`, `src/pages/{Login,SetupPage,Audit,NotFound}.tsx` et `Login.test.tsx`, `Audit.test.tsx`, `src/lib/utils.ts`, `src/test-setup.ts`, `src/test-utils/viewport.ts`, `src/styles/globals.css`, `src/main.tsx`, `scripts/merge-i18n.mjs`
- Copy (adaptés) : `src/stores/{auth,ui}.store.ts`, `src/components/layout/{AppLayout,Header,Sidebar}.tsx` et `Header.test.tsx`, `Sidebar.test.tsx`, `src/pages/Settings.tsx`, `src/pages/Journal.tsx` et `Journal.test.tsx`, `src/api/journal.api.ts`, `src/i18n/index.ts`, `src/i18n/locales/{fr,en}.json`, `src/App.tsx`
- Create: `scripts/i18n-fragments/calc3d-nav.json`

**Interfaces:**
- Consumes: routes `/api/setup`, `/api/auth/*`, `/api/users`, `/api/audit`, `/api/journal/web`, `/api/journal/retention` de la tâche 2.
- Produces: `api` (axios, `baseURL: '/api'`, jeton Bearer et rafraîchissement automatiques) exporté par `src/api/client.ts` ; `useAuthStore` avec `user.role: 'admin' | 'user'`, `isAdmin()` ; `AppLayout` avec `<Outlet />` ; page `Settings` à onglets où les tâches 7 et 8 ajoutent les leurs.

- [ ] **Step 1: Copier l'arborescence**

```bash
cd /c/Workspace/Calc3D-Web
SRC=/c/Workspace/Minecraft/packages/frontend
mkdir -p packages/frontend/src/{components/{ui,shared,layout},hooks,api,pages,lib,stores,styles,i18n/locales,test-utils} packages/frontend/scripts/i18n-fragments
cp "$SRC"/{tsconfig.json,vite.config.ts,vitest.config.ts,tailwind.config.ts,postcss.config.js,components.json,index.html} packages/frontend/
cp "$SRC"/src/components/ui/*.tsx packages/frontend/src/components/ui/
cp "$SRC"/src/components/shared/{ConfirmDialog,LanguageSwitcher,ThemeToggle,LoadingSpinner,EmptyState}.tsx packages/frontend/src/components/shared/
cp "$SRC"/src/components/layout/*.tsx packages/frontend/src/components/layout/
cp "$SRC"/src/hooks/{use-media-query,use-sidebar,use-auth}.ts packages/frontend/src/hooks/
cp "$SRC"/src/api/{client,token-refresh,auth.api,users.api,audit.api,journal.api}.ts packages/frontend/src/api/
cp "$SRC"/src/pages/{Login,SetupPage,Audit,NotFound,Settings,Journal}.tsx "$SRC"/src/pages/{Login,Audit,Journal}.test.tsx packages/frontend/src/pages/
cp "$SRC"/src/lib/utils.ts packages/frontend/src/lib/
cp "$SRC"/src/stores/{auth,ui}.store.ts packages/frontend/src/stores/
cp "$SRC"/src/styles/globals.css packages/frontend/src/styles/
cp "$SRC"/src/i18n/index.ts packages/frontend/src/i18n/
cp "$SRC"/src/i18n/locales/*.json packages/frontend/src/i18n/locales/
cp "$SRC"/src/{main.tsx,App.tsx,test-setup.ts} packages/frontend/src/
cp "$SRC"/src/test-utils/viewport.ts packages/frontend/src/test-utils/
cp "$SRC"/scripts/merge-i18n.mjs packages/frontend/scripts/
grep -rl "@mc/common" packages/frontend | xargs sed -i 's#@mc/common#@calc3d/common#g'
```

- [ ] **Step 2: `package.json` du frontend**

Reprendre celui de MC Manager en renommant `@mc/frontend` → `@calc3d/frontend`, `@mc/common` → `@calc3d/common`, et en retirant `@tanstack/react-table`, `recharts`, `date-fns` et `minecraft-data` (non utilisés dans ce lot ; `@tanstack/react-table` et `date-fns` seront réévalués au lot 2). Conserver toutes les autres dépendances et versions, et les scripts `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `test`, `i18n:merge`.

- [ ] **Step 3: Renommer les clés de stockage et les libellés produit**

- `src/stores/auth.store.ts` : `role: 'admin' | 'viewer'` → `role: 'admin' | 'user'` ; `name: 'mc-auth'` → `name: 'calc3d-auth'` ; supprimer `canWrite` (un `user` écrit ses propres données ; le droit se juge par route, pas par rôle global).
- `src/api/token-refresh.ts` : `PERSIST_KEY = 'calc3d-auth'`, `LOCK_NAME = 'calc3d-auth-refresh'`.
- `src/stores/ui.store.ts` : `name: 'calc3d-ui'`.
- `src/i18n/index.ts` : `lookupLocalStorage: 'calc3d_lang'` et `localStorage.setItem('calc3d_lang', code)`.
- `index.html` : `<title>Calc3D</title>`, `localStorage.getItem('calc3d-ui')`, `lang="fr"`.
- `src/pages/Login.tsx` et `SetupPage.tsx` : remplacer le logo texte `MC` par `3D`, `MC Manager` par `Calc3D`, le pied `MC MANAGER v1.0.0` par `CALC3D v0.1.0`, et `navigate('/dashboard')` par `navigate('/')` (deux occurrences dans Login : `finish` et le `<Navigate>`).
- `src/hooks/use-auth.ts` : `navigate('/dashboard')` → `navigate('/')`.
- `src/pages/NotFound.tsx` : le lien de retour pointe vers `/`.
- `src/api/users.api.ts` : `role: 'admin' | 'viewer'` → `role: 'admin' | 'user'`.
- `src/styles/globals.css` : supprimer la première ligne `@import url('https://fonts.googleapis.com/...')` et remplacer `font-family: 'Outfit', system-ui, sans-serif;` par `font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;` et toute référence à `'JetBrains Mono'` par `ui-monospace, 'Cascadia Mono', Consolas, monospace` (aucune ressource externe).

- [ ] **Step 4: Adapter `AppLayout.tsx` et `Header.tsx`**

`AppLayout.tsx` : supprimer `import { useWebSocket } ...` et l'appel `useWebSocket();`. Le reste (requête `['me']`, redirection `/login`, `Toaster`) reste.

`Header.tsx` : remplacer `<span className="truncate text-sm font-semibold">MC<span ...>Manager</span></span>` par `<span className="truncate text-sm font-semibold">Calc3D</span>`, et `{user?.role}` par `{t(`settings.users.role${user?.role === 'admin' ? 'Admin' : 'User'}`)}`.

- [ ] **Step 5: Réécrire la navigation de `Sidebar.tsx`**

Remplacer `navSections` et retirer la requête `map` :

```tsx
import { FileText, History, ShoppingCart, PieChart, BookOpenText, Settings, ChevronLeft, ChevronRight, X } from 'lucide-react';

type NavItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string; adminOnly?: boolean };
const navSections: { label: string; adminOnly?: boolean; items: NavItem[] }[] = [
  { label: 'nav.work', items: [
    { to: '/', icon: FileText, label: 'nav.quote' },
    { to: '/history', icon: History, label: 'nav.history' },
    { to: '/purchases', icon: ShoppingCart, label: 'nav.purchases' },
    { to: '/finances', icon: PieChart, label: 'nav.finances' },
  ] },
  { label: 'nav.admin', adminOnly: true, items: [
    { to: '/journal', icon: BookOpenText, label: 'nav.journal', adminOnly: true },
    { to: '/audit', icon: History, label: 'nav.audit', adminOnly: true },
  ] },
];
```

Supprimer `useQuery`, `mapApi`, `hasMap` et la condition `requiresMap`. Le logo : `<span className="text-primary font-bold text-xs font-mono-data">3D</span>` et `<span className="text-sm font-semibold text-sidebar-accent-foreground">Calc3D</span>` sans second span. La détection de lien actif pour `/` doit être exacte : remplacer `const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');` par `const isActive = item.to === '/' ? location.pathname === '/' : location.pathname === item.to || location.pathname.startsWith(item.to + '/');`. Les pages `/history`, `/purchases`, `/finances` n'existent pas encore : `App.tsx` les fait pointer vers `NotFound` jusqu'au lot 2 (voir étape 8).

Dans `Sidebar.test.tsx` et `Header.test.tsx`, adapter les libellés attendus (`Quote`, `History`...) et supprimer les cas liés à la carte (`map`).

- [ ] **Step 6: Adapter `Settings.tsx`, `Journal.tsx`, `journal.api.ts`**

`Settings.tsx` :
- Supprimer les imports et usages de `JournalRetentionCard` et `MapUrlCard` dans `UsersTab` (la rétention revient dans une carte locale, voir ci-dessous).
- Dans les deux `<Select>` de rôle : `<SelectItem value="user">{t('settings.users.roleUser')}</SelectItem>` à la place de `viewer`/`roleViewer` ; `emptyForm.role = 'user'`.
- Onglets : `account` (inchangé), `users` (admin). Les onglets `pricing` et `materials` sont ajoutés par la tâche 7 ; laisser ce commentaire dans le composant : `{/* Tâche 7 : onglets Paramètres et Catalogue */}`.
- Ajouter dans ce fichier la carte de rétention (copie de `components/settings/JournalRetentionCard.tsx` de MC Manager, placée dans `src/components/settings/JournalRetentionCard.tsx`, qui utilise `journalApi.retention` / `journalApi.setRetention`) et la rendre dans `UsersTab` sous `PasswordPolicyCard`.

`api/journal.api.ts` :
```ts
import api from './client';
import type { JournalRetention, Page, WebLoginEntry } from '@calc3d/common';

export interface JournalQuery { q?: string; from?: string; to?: string; page: number; limit: number }

export const journalApi = {
  web: (p: JournalQuery): Promise<Page<WebLoginEntry>> => api.get('/journal/web', { params: p }).then((r) => r.data),
  retention: (): Promise<JournalRetention> => api.get('/journal/retention').then((r) => r.data),
  setRetention: (days: number): Promise<JournalRetention> => api.put('/journal/retention', { days }).then((r) => r.data),
};
```

`Journal.tsx` : supprimer l'état `tab`, les `Tabs`, les requêtes `players` et `failures`, l'import `CountryFlag` (remplacer la cellule pays par `{w.country ?? '—'}`) et `formatDuration` ; ne garder que le tableau `web` avec ses filtres et sa pagination ; `if (!isAdmin) return <Navigate to="/" replace />;`. Adapter `Journal.test.tsx` en conséquence (ne garder que les cas du journal web).

- [ ] **Step 7: Réduire les locales et ajouter le fragment de navigation**

Script ponctuel (à exécuter puis supprimer) pour ne garder que les namespaces utiles :
```bash
cd packages/frontend
node -e '
const fs=require("fs");
for (const l of ["fr","en"]) {
  const p=`src/i18n/locales/${l}.json`; const d=JSON.parse(fs.readFileSync(p,"utf8"));
  const keep=["common","shared","nav","notFound","login","setup","settings","audit","journal"];
  const out={}; for (const k of keep) if (d[k]) out[k]=d[k];
  fs.writeFileSync(p, JSON.stringify(out,null,2)+"\n");
}'
```

Fragment `scripts/i18n-fragments/calc3d-nav.json` :
```json
{
  "namespace": "nav",
  "keys": {
    "en": { "work": "Workshop", "admin": "Administration", "quote": "Quote", "history": "History", "purchases": "Purchases", "finances": "Finances", "journal": "Login journal", "audit": "Audit log", "settings": "Settings", "logout": "Sign out", "collapse": "Collapse", "expand": "Expand", "openMenu": "Open menu", "closeMenu": "Close menu", "mainMenu": "Main menu" },
    "fr": { "work": "Atelier", "admin": "Administration", "quote": "Devis", "history": "Historique", "purchases": "Achats", "finances": "Finances", "journal": "Journal de connexions", "audit": "Journal d'audit", "settings": "Paramètres", "logout": "Se déconnecter", "collapse": "Replier", "expand": "Déplier", "openMenu": "Ouvrir le menu", "closeMenu": "Fermer le menu", "mainMenu": "Menu principal" }
  }
}
```

Fragment `scripts/i18n-fragments/calc3d-settings-users.json` (rôle `user`, et textes produit) :
```json
{
  "namespace": "settings",
  "keys": {
    "en": { "users": { "roleUser": "User" }, "tabs": { "account": "Account", "users": "Users" } },
    "fr": { "users": { "roleUser": "Utilisateur" }, "tabs": { "account": "Compte", "users": "Utilisateurs" } }
  }
}
```

Puis, dans les deux locales, supprimer à la main les clés `nav.server`, `nav.data`, `nav.dashboard`, `nav.console`, `nav.backups`, `nav.players`, `nav.config`, `nav.mods`, `nav.world`, `nav.map`, `settings.users.roleViewer`, `journal.tabs`, `journal.reconciled`, `journal.ongoing`, `journal.duration`, et remplacer `audit.actions` par `{ "all": "...", "user": "...", "journal": "..." }` (traduits dans chaque langue). Dans `Audit.tsx`, `const ACTIONS = ['', 'user', 'journal'];`. Dans `login.appSubtitle` (fr/en) : « Calculateur de prix impression 3D » / « 3D printing price calculator ». Dans `setup.*`, remplacer toute mention de « MC Manager » par « Calc3D ».

Run: `node scripts/merge-i18n.mjs`
Expected: `OK — N keys across 2 locales` (parité fr/en).

- [ ] **Step 8: Écrire `App.tsx`**

```tsx
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/stores/auth.store';
import { applyUserLanguage } from '@/hooks/use-auth';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });

const Login = lazy(() => import('@/pages/Login'));
const SetupPage = lazy(() => import('@/pages/SetupPage'));
const Journal = lazy(() => import('@/pages/Journal'));
const Audit = lazy(() => import('@/pages/Audit'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));
// Tâche 8 : const Quote = lazy(() => import('@/pages/Quote')); et <Route path="/" element={<Quote />} />
// Lot 2 : /history, /purchases, /finances

export function App() {
  useEffect(() => { applyUserLanguage(useAuthStore.getState().user); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<NotFound />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 9: Installer, typecheck, tests, lint**

Run: `cd /c/Workspace/Calc3D-Web && pnpm install && pnpm --filter @calc3d/common run build && pnpm --filter @calc3d/frontend run typecheck && pnpm --filter @calc3d/frontend run test && pnpm lint`
Expected: aucune erreur ; tests `Login`, `Audit`, `Journal`, `Header`, `Sidebar` au vert. `tsc --noEmit` avec `noUnusedLocals` signale tout import devenu inutile après les suppressions : les retirer.

- [ ] **Step 10: Vérifier en vrai le parcours installation → login → paramètres**

Démarrer backend et frontend (`pnpm dev`), ouvrir `http://localhost:5173`, vérifier : redirection vers `/setup`, création du premier admin, login, en-tête « Calc3D », menu Atelier / Administration, page Paramètres avec onglets Compte et Utilisateurs, création d'un second compte avec le rôle « Utilisateur », connexion avec ce compte : menu sans section Administration. Arrêter les serveurs.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Reprend la coquille applicative et les pages d'authentification de MC Manager (frontend)"
```

---

### Task 4: `@calc3d/common` — constantes, types et moteur de calcul `computeQuote`

**Files:**
- Create: `packages/common/src/constants.ts`, `packages/common/src/pricing/types.ts`, `packages/common/src/pricing/compute-quote.ts`, `packages/common/src/pricing/compute-quote.test.ts`, `packages/common/src/types/settings.ts`, `packages/common/src/types/quotes.ts`
- Modify: `packages/common/src/index.ts`

**Interfaces:**
- Produces: `computeQuote(settings: PricingSettings, input: QuoteInput): QuoteResult` ; `PricingSettings` (18 champs, voir ci-dessous) ; `FilamentLine { material, weightG, pricePerKg, wastePct }` ; `QuoteInput` ; `QuoteResult` (30 champs, mêmes noms que les colonnes `Quote` de la tâche 5) ; `DEFAULT_PRICING_SETTINGS` ; `DEFAULT_MATERIALS` ; `QUOTE_KINDS`, `QUOTE_STATUSES`, `PRICING_MODES`, `PURCHASE_CATEGORIES` et leurs types `QuoteKind`, `QuoteStatus`, `PricingMode`, `PurchaseCategory` ; `UserSettingsDto = PricingSettings & { pdfShowCostBreakdown: boolean }` ; `MaterialDto { id, name, pricePerKg, sortOrder }` ; `CreateQuoteBody` ; `QuoteDto`.

- [ ] **Step 1: Constantes et types**

`packages/common/src/constants.ts` :
```ts
export const QUOTE_KINDS = ['QUOTE', 'ORDER'] as const;
export type QuoteKind = (typeof QUOTE_KINDS)[number];

export const QUOTE_STATUSES = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'DONE', 'ON_HOLD'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const PRICING_MODES = ['MARKUP', 'TARGET_MARGIN'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const PURCHASE_CATEGORIES = ['FILAMENT', 'SPARE_PARTS', 'MAINTENANCE', 'HARDWARE', 'TOOLS', 'OTHER'] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

/** Catalogue créé avec les paramètres d'un nouvel utilisateur (même liste que Get-DefaultCatalogueMatieres). */
export const DEFAULT_MATERIALS: ReadonlyArray<{ name: string; pricePerKg: number }> = [
  { name: 'PLA', pricePerKg: 18 }, { name: 'PETG', pricePerKg: 20 }, { name: 'ABS', pricePerKg: 19 },
  { name: 'ASA', pricePerKg: 22 }, { name: 'TPU', pricePerKg: 25 }, { name: 'Nylon (PA)', pricePerKg: 35 },
  { name: 'PA-CF', pricePerKg: 45 }, { name: 'PETG-CF', pricePerKg: 30 }, { name: 'PC', pricePerKg: 35 },
  { name: 'PVB', pricePerKg: 20 }, { name: 'Autre', pricePerKg: 20 },
];
```

`packages/common/src/pricing/types.ts` :
```ts
import type { PricingMode } from '../constants.js';

/** Paramètres qui influencent le prix (transposition de config.json, sans Langue ni PdfDetailCouts). */
export interface PricingSettings {
  currencySymbol: string;
  electricityPricePerKwh: number;
  printerPowerW: number;
  averageLoadPct: number;
  hourlyRatePreparation: number;
  hourlyRatePostProcessing: number;
  hourlyRateDesign: number;
  hourlyRatePackaging: number;
  pricingMode: PricingMode;
  pricingPct: number;
  contingencyPct: number;
  vatPct: number;
  printerPurchasePrice: number;
  printerLifetimeHours: number;
  maintenancePct: number;
  wearCostPerHour: number;
  defaultFixedCosts: number;
  floorPrice: number;
  roundToEuro: boolean;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  currencySymbol: '€', electricityPricePerKwh: 0.1952, printerPowerW: 1350, averageLoadPct: 40,
  hourlyRatePreparation: 12.31, hourlyRatePostProcessing: 12.31, hourlyRateDesign: 12.31, hourlyRatePackaging: 12.31,
  pricingMode: 'MARKUP', pricingPct: 20, contingencyPct: 10, vatPct: 0,
  printerPurchasePrice: 2717, printerLifetimeHours: 6000, maintenancePct: 5, wearCostPerHour: 0,
  defaultFixedCosts: 0, floorPrice: 5, roundToEuro: false,
};

export interface FilamentLine { material: string; weightG: number; pricePerKg: number; wastePct: number }

export interface QuoteInput {
  filamentLines: FilamentLine[];
  printHours: number;
  printMinutes: number;
  prepHours: number;
  postHours: number;
  designHours: number;
  packagingHours: number;
  quantity: number;
  consumables: number;
  discountPct: number;
  shippingCost: number;
}

export interface QuoteResult {
  filamentWeightG: number; filamentCost: number;
  printTimeH: number; energyKwh: number; electricityCost: number;
  laborPrep: number; laborPost: number; laborDesign: number; laborPackaging: number;
  depreciation: number; maintenance: number; wear: number; fixedCosts: number;
  subtotal: number; contingency: number; costAfterContingency: number;
  unitPriceExclTax: number; totalExclTax: number; discountAmount: number; shippingCost: number; vatAmount: number;
  priceBeforeFloor: number; floorApplied: boolean;
  priceBeforeRounding: number; roundingAmount: number; roundingApplied: boolean;
  finalPrice: number; pricePerGram: number; pricePerHour: number;
}
```

`packages/common/src/types/settings.ts` :
```ts
import type { PricingSettings } from '../pricing/types.js';
export interface UserSettingsDto extends PricingSettings { pdfShowCostBreakdown: boolean }
export interface MaterialDto { id: number; name: string; pricePerKg: number; sortOrder: number }
```

`packages/common/src/types/quotes.ts` :
```ts
import type { QuoteKind, QuoteStatus } from '../constants.js';
import type { QuoteInput, QuoteResult, PricingSettings } from '../pricing/types.js';

export interface QuoteProjectFields {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus;
  /** ISO yyyy-MM-dd ou null. */
  dueDate: string | null; comment: string;
}
export type CreateQuoteBody = QuoteProjectFields & QuoteInput;
export interface QuoteDto extends QuoteProjectFields, QuoteInput, QuoteResult {
  id: number; createdAt: string; updatedAt: string; legacyId: string | null;
  settingsSnapshot: PricingSettings;
}
```

`packages/common/src/index.ts` :
```ts
export * from './types/auth.js';
export * from './types/audit.js';
export * from './types/journal.js';
export * from './constants.js';
export * from './pricing/types.js';
export * from './pricing/compute-quote.js';
export * from './types/settings.js';
export * from './types/quotes.js';
```

- [ ] **Step 2: Écrire le test des cas dorés (échoue : `compute-quote.ts` n'existe pas)**

`packages/common/src/pricing/compute-quote.test.ts` — les valeurs attendues ont été produites par `Invoke-Calcul` (Calculateur3D.ps1 v1.3.0), arrondies à 6 décimales :

```ts
import { describe, it, expect } from 'vitest';
import { computeQuote } from './compute-quote.js';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings, type QuoteInput, type QuoteResult } from './types.js';

const EPS = 1e-4;
const emptyInput: QuoteInput = { filamentLines: [], printHours: 0, printMinutes: 0, prepHours: 0, postHours: 0, designHours: 0, packagingHours: 0, quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0 };
const s = (over: Partial<PricingSettings>): PricingSettings => ({ ...DEFAULT_PRICING_SETTINGS, ...over });

function expectResult(actual: QuoteResult, expected: QuoteResult) {
  for (const key of Object.keys(expected) as (keyof QuoteResult)[]) {
    const e = expected[key]; const a = actual[key];
    if (typeof e === 'boolean') expect(a, key).toBe(e);
    else expect(Math.abs((a as number) - (e as number)), `${key}: ${a} vs ${e}`).toBeLessThan(EPS);
  }
}

describe('computeQuote — cas dorés issus de Invoke-Calcul (PowerShell 1.3.0)', () => {
  const g1Settings = s({ wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0 });
  const g1Input: QuoteInput = { ...emptyInput, filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printHours: 5, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25 };
  const g1: QuoteResult = {
    filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.52704,
    laborPrep: 12.31, laborPost: 6.155, laborDesign: 60, laborPackaging: 2.5,
    depreciation: 2.264167, maintenance: 0.113208, wear: 0.75, fixedCosts: 0,
    subtotal: 86.599415, contingency: 8.659942, costAfterContingency: 95.259356,
    unitPriceExclTax: 114.311228, totalExclTax: 114.311228, discountAmount: 0, shippingCost: 0, vatAmount: 0,
    priceBeforeFloor: 114.311228, floorApplied: false, priceBeforeRounding: 114.311228, roundingAmount: 0, roundingApplied: false,
    finalPrice: 114.311228, pricePerGram: 1.143112, pricePerHour: 22.862246,
  };

  it('G1 markup, un filament, quatre postes de main d\'œuvre, usure', () => {
    expectResult(computeQuote(g1Settings, g1Input), g1);
  });

  it('G2 idem G1 avec arrondi à l\'euro supérieur', () => {
    expectResult(computeQuote({ ...g1Settings, roundToEuro: true }, g1Input), { ...g1, roundingAmount: 0.688772, roundingApplied: true, finalPrice: 115 });
  });

  it('G3 marge cible, deux filaments (ligne à poids 0 ignorée), quantité 3, remise, port, TVA, minutes', () => {
    const settings = s({ pricingMode: 'TARGET_MARGIN', pricingPct: 30, vatPct: 20, floorPrice: 0, wearCostPerHour: 0.2, defaultFixedCosts: 0.5 });
    const input: QuoteInput = { ...emptyInput, filamentLines: [
      { material: 'PETG', weightG: 42.5, pricePerKg: 20, wastePct: 5 },
      { material: 'TPU', weightG: 12, pricePerKg: 25, wastePct: 15 },
      { material: 'PLA', weightG: 0, pricePerKg: 18, wastePct: 10 },
    ], printHours: 2, printMinutes: 45, prepHours: 0.25, packagingHours: 0.5, quantity: 3, consumables: 1.5, discountPct: 10, shippingCost: 6.5 };
    expectResult(computeQuote(settings, input), {
      filamentWeightG: 54.5, filamentCost: 1.2375, printTimeH: 2.75, energyKwh: 1.485, electricityCost: 0.289872,
      laborPrep: 3.0775, laborPost: 0, laborDesign: 0, laborPackaging: 6.155,
      depreciation: 1.245292, maintenance: 0.062265, wear: 0.55, fixedCosts: 2,
      subtotal: 14.617428, contingency: 1.461743, costAfterContingency: 16.079171,
      unitPriceExclTax: 22.970244, totalExclTax: 68.910733, discountAmount: 6.891073, shippingCost: 6.5, vatAmount: 13.703932,
      priceBeforeFloor: 82.223592, floorApplied: false, priceBeforeRounding: 82.223592, roundingAmount: 0, roundingApplied: false,
      finalPrice: 82.223592, pricePerGram: 0.421472, pricePerHour: 8.352816,
    });
  });

  it('G4 plancher 5,5 puis arrondi → 6, entrées nulles', () => {
    const r = computeQuote(s({ roundToEuro: true, floorPrice: 5.5 }), emptyInput);
    expect(r.priceBeforeFloor).toBe(0); expect(r.floorApplied).toBe(true);
    expect(r.priceBeforeRounding).toBe(5.5); expect(r.roundingAmount).toBeCloseTo(0.5, 6); expect(r.roundingApplied).toBe(true);
    expect(r.finalPrice).toBe(6); expect(r.pricePerGram).toBe(0); expect(r.pricePerHour).toBe(0);
  });

  const flat = s({ roundToEuro: true, floorPrice: 0, contingencyPct: 0, pricingPct: 0, electricityPricePerKwh: 0, printerPurchasePrice: 0 });
  it('G5 virgule flottante : 3 × 4,1 = 12,3 → 13', () => {
    const r = computeQuote({ ...flat, hourlyRatePreparation: 4.1 }, { ...emptyInput, prepHours: 3 });
    expect(r.finalPrice).toBe(13); expect(r.roundingAmount).toBeCloseTo(0.7, 6); expect(r.roundingApplied).toBe(true);
  });
  it('G6 prix exactement 12 : arrondi non appliqué', () => {
    const r = computeQuote({ ...flat, hourlyRatePreparation: 12 }, { ...emptyInput, prepHours: 1 });
    expect(r.finalPrice).toBe(12); expect(r.roundingAmount).toBe(0); expect(r.roundingApplied).toBe(false);
  });
});

describe('computeQuote — garde-fous', () => {
  it('refuse une marge cible ≥ 100 %', () => {
    expect(() => computeQuote(s({ pricingMode: 'TARGET_MARGIN', pricingPct: 100 }), emptyInput)).toThrow(/pricingPct/);
    expect(() => computeQuote(s({ pricingMode: 'TARGET_MARGIN', pricingPct: 150 }), emptyInput)).toThrow(/pricingPct/);
  });
  it('une durée de vie imprimante à 0 donne un amortissement nul, pas une division par zéro', () => {
    const r = computeQuote(s({ printerLifetimeHours: 0, floorPrice: 0 }), { ...emptyInput, printHours: 3 });
    expect(r.depreciation).toBe(0); expect(r.maintenance).toBe(0); expect(Number.isFinite(r.finalPrice)).toBe(true);
  });
  it('ne mute pas ses arguments', () => {
    const input = { ...emptyInput, filamentLines: [{ material: 'PLA', weightG: 10, pricePerKg: 18, wastePct: 0 }] };
    const copy = JSON.parse(JSON.stringify(input));
    computeQuote(DEFAULT_PRICING_SETTINGS, input);
    expect(input).toEqual(copy);
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @calc3d/common exec vitest run src/pricing/compute-quote.test.ts`
Expected: FAIL, `Cannot find module './compute-quote.js'`.

- [ ] **Step 4: Implémenter `computeQuote`**

`packages/common/src/pricing/compute-quote.ts` :
```ts
import type { PricingSettings, QuoteInput, QuoteResult } from './types.js';

/**
 * Portage ligne à ligne de Invoke-Calcul (Calculateur3D.ps1). Fonction pure : le navigateur
 * l'appelle pour le résultat en direct, le serveur pour la valeur enregistrée, qui fait foi.
 * Les étapes et leur ordre sont ceux du README de l'application bureau (« Comment le prix est calculé »).
 */
export function computeQuote(settings: PricingSettings, input: QuoteInput): QuoteResult {
  if (settings.pricingMode === 'TARGET_MARGIN' && settings.pricingPct >= 100) {
    throw new RangeError('pricingPct must be below 100 in TARGET_MARGIN mode');
  }

  // 1. Filament : seules les lignes de poids > 0 comptent (comme la grille WPF).
  let filamentCost = 0;
  let filamentWeightG = 0;
  for (const line of input.filamentLines) {
    if (line.weightG > 0) {
      filamentCost += (line.weightG / 1000) * line.pricePerKg * (1 + line.wastePct / 100);
      filamentWeightG += line.weightG;
    }
  }

  // 2. Électricité
  const effectivePowerW = settings.printerPowerW * (settings.averageLoadPct / 100);
  const printTimeH = input.printHours + input.printMinutes / 60;
  const energyKwh = (effectivePowerW / 1000) * printTimeH;
  const electricityCost = settings.electricityPricePerKwh * energyKwh;

  // 3. Main d'œuvre, quatre postes
  const laborPrep = input.prepHours * settings.hourlyRatePreparation;
  const laborPost = input.postHours * settings.hourlyRatePostProcessing;
  const laborDesign = input.designHours * settings.hourlyRateDesign;
  const laborPackaging = input.packagingHours * settings.hourlyRatePackaging;

  // 4. Amortissement, maintenance, usure au prorata du temps d'impression
  const lifeRatio = settings.printerLifetimeHours > 0 ? printTimeH / settings.printerLifetimeHours : 0;
  const depreciation = settings.printerPurchasePrice * lifeRatio;
  const maintenance = settings.printerPurchasePrice * (settings.maintenancePct / 100) * lifeRatio;
  const wear = settings.wearCostPerHour * printTimeH;

  // 5. Coûts fixes
  const fixedCosts = settings.defaultFixedCosts + input.consumables;

  // 6. Sous-total et majoration aléas
  const subtotal = filamentCost + electricityCost + laborPrep + laborPost + laborDesign + laborPackaging + depreciation + maintenance + wear + fixedCosts;
  const contingency = subtotal * (settings.contingencyPct / 100);
  const costAfterContingency = subtotal + contingency;

  // 7. Prix de vente HT unitaire
  const pct = settings.pricingPct / 100;
  const unitPriceExclTax = settings.pricingMode === 'TARGET_MARGIN' ? costAfterContingency / (1 - pct) : costAfterContingency * (1 + pct);

  // 8. Total, remise, port, TVA
  const totalExclTax = unitPriceExclTax * input.quantity;
  const discountAmount = totalExclTax * (input.discountPct / 100);
  const afterDiscount = totalExclTax - discountAmount + input.shippingCost;
  const vatAmount = afterDiscount * (settings.vatPct / 100);
  let finalPrice = afterDiscount + vatAmount;

  // 9. Prix plancher
  const priceBeforeFloor = finalPrice;
  let floorApplied = false;
  if (settings.floorPrice > 0 && finalPrice < settings.floorPrice) {
    finalPrice = settings.floorPrice;
    floorApplied = true;
  }

  // 10. Arrondi à l'euro supérieur, en dernier. On arrondit d'abord au centime pour qu'un 12,00
  //     représenté en virgule flottante comme 12,0000001 ne devienne pas 13.
  const priceBeforeRounding = finalPrice;
  let roundingAmount = 0;
  let roundingApplied = false;
  if (settings.roundToEuro) {
    const rounded = Math.ceil(roundTo(finalPrice, 2));
    roundingAmount = rounded - finalPrice;
    finalPrice = rounded;
    roundingApplied = roundingAmount > 0;
  }

  // 11. Indicateurs sur le prix HT unitaire
  const pricePerGram = filamentWeightG > 0 ? unitPriceExclTax / filamentWeightG : 0;
  const pricePerHour = printTimeH > 0 ? unitPriceExclTax / printTimeH : 0;

  return {
    filamentWeightG, filamentCost, printTimeH, energyKwh, electricityCost,
    laborPrep, laborPost, laborDesign, laborPackaging, depreciation, maintenance, wear, fixedCosts,
    subtotal, contingency, costAfterContingency, unitPriceExclTax, totalExclTax, discountAmount,
    shippingCost: input.shippingCost, vatAmount, priceBeforeFloor, floorApplied,
    priceBeforeRounding, roundingAmount, roundingApplied, finalPrice, pricePerGram, pricePerHour,
  };
}

/** Arrondi « au plus proche, demi vers le haut » comme [math]::Round(x, 2) de .NET (MidpointRounding.ToEven y est le défaut, mais sur 2 décimales les cas de milieu exact sont rarissimes et la tolérance des tests les couvre). */
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @calc3d/common exec vitest run src/pricing/compute-quote.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Build, lint, commit**

Run: `pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck`
Expected: OK.

```bash
git add packages/common
git commit -m "Ajoute le moteur de calcul computeQuote et les constantes partagées (common)"
```

---

### Task 5: Backend — modèles métier, `ownerScope`, paramètres et catalogue par utilisateur

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/src/owner-scope.ts`, `packages/backend/src/settings/settings-service.ts`, `packages/backend/src/settings/settings-service.test.ts`, `packages/backend/src/settings/settings.schema.ts`, `packages/backend/src/routes/settings.routes.ts`, `packages/backend/src/routes/settings.routes.test.ts`, `packages/backend/src/routes/materials.routes.ts`, `packages/backend/src/routes/materials.routes.test.ts`, `packages/backend/src/test-users.ts`
- Modify: `packages/backend/src/app.ts`

**Interfaces:**
- Consumes: `createApp`, `AppError`, `testPrisma`, `UserSettingsDto`, `MaterialDto`, `DEFAULT_PRICING_SETTINGS`, `DEFAULT_MATERIALS`, `PRICING_MODES`.
- Produces: `ownerScope(req): { userId: number }` ; `getOrCreateSettings(prisma, userId): Promise<UserSettingsDto>` ; `toPricingSettings(row): PricingSettings` ; `userSettingsSchema` (zod) ; routes `GET/PUT /api/settings`, `GET/POST /api/materials`, `PUT/DELETE /api/materials/:id` ; helper de test `createTestUser(prisma, username, role)`.

- [ ] **Step 1: Ajouter les modèles métier à `schema.prisma`**

Dans `model User`, ajouter les relations :
```prisma
  settings  UserSettings?
  materials Material[]
  quotes    Quote[]
  purchases Purchase[]
```

Puis, à la fin du fichier :
```prisma
/// Paramètres de tarification d'un utilisateur (un pour un avec User, créé au premier accès).
model UserSettings {
  userId                    Int     @id
  user                      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  currencySymbol            String  @default("€")
  electricityPricePerKwh    Float   @default(0.1952)
  printerPowerW             Float   @default(1350)
  averageLoadPct            Float   @default(40)
  hourlyRatePreparation     Float   @default(12.31)
  hourlyRatePostProcessing  Float   @default(12.31)
  hourlyRateDesign          Float   @default(12.31)
  hourlyRatePackaging       Float   @default(12.31)
  pricingMode               String  @default("MARKUP")
  pricingPct                Float   @default(20)
  contingencyPct            Float   @default(10)
  vatPct                    Float   @default(0)
  printerPurchasePrice      Float   @default(2717)
  printerLifetimeHours      Float   @default(6000)
  maintenancePct            Float   @default(5)
  wearCostPerHour           Float   @default(0)
  defaultFixedCosts         Float   @default(0)
  floorPrice                Float   @default(5)
  roundToEuro               Boolean @default(false)
  pdfShowCostBreakdown      Boolean @default(true)
  updatedAt                 DateTime @updatedAt
}

model Material {
  id         Int    @id @default(autoincrement())
  userId     Int
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  name       String
  pricePerKg Float
  sortOrder  Int    @default(0)

  @@unique([userId, name])
}

model Quote {
  id               Int      @id @default(autoincrement())
  userId           Int
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  legacyId         String?

  projectName      String   @default("")
  customer         String   @default("")
  kind             String   @default("QUOTE")
  status           String   @default("PENDING")
  dueDate          DateTime?
  quantity         Int      @default(1)
  comment          String   @default("")

  filamentLines    String   // JSON FilamentLine[]
  printHours       Int      @default(0)
  printMinutes     Int      @default(0)
  prepHours        Float    @default(0)
  postHours        Float    @default(0)
  designHours      Float    @default(0)
  packagingHours   Float    @default(0)
  consumables      Float    @default(0)
  discountPct      Float    @default(0)
  shippingCost     Float    @default(0)

  filamentWeightG      Float
  filamentCost         Float
  printTimeH           Float
  energyKwh            Float
  electricityCost      Float
  laborPrep            Float
  laborPost            Float
  laborDesign          Float
  laborPackaging       Float
  depreciation         Float
  maintenance          Float
  wear                 Float
  fixedCosts           Float
  subtotal             Float
  contingency          Float
  costAfterContingency Float
  unitPriceExclTax     Float
  totalExclTax         Float
  discountAmount       Float
  vatAmount            Float
  priceBeforeFloor     Float
  floorApplied         Boolean
  priceBeforeRounding  Float
  roundingAmount       Float
  roundingApplied      Boolean
  finalPrice           Float
  pricePerGram         Float
  pricePerHour         Float

  settingsSnapshot String   // JSON PricingSettings

  @@unique([userId, legacyId])
  @@index([userId, createdAt])
  @@index([userId, kind])
  @@index([userId, status])
}

/// Achats réels (lot 2) ; le modèle est créé maintenant pour figer le schéma.
model Purchase {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date        DateTime
  category    String   @default("OTHER")
  description String
  amount      Float
  supplier    String   @default("")
  comment     String   @default("")
  legacyId    String?
  createdAt   DateTime @default(now())

  @@unique([userId, legacyId])
  @@index([userId, date])
}
```

SQLite n'a pas de type JSON dans Prisma : `filamentLines` et `settingsSnapshot` sont des `String` sérialisés par le backend.

Run: `pnpm db:generate && pnpm db:push`
Expected: client généré, base locale mise à jour.

- [ ] **Step 2: `owner-scope.ts` et helper de test `test-users.ts`**

`src/owner-scope.ts` :
```ts
import type { Request } from 'express';

/**
 * Filtre propriétaire obligatoire sur toute requête Prisma des tables métier (UserSettings,
 * Material, Quote, Purchase). Un admin n'a pas de passe-droit : il ne voit que ses propres données.
 * Lève si l'identité manque, ce qui ne doit jamais arriver derrière authMiddleware.
 */
export function ownerScope(req: Request): { userId: number } {
  const id = req.user?.id;
  if (typeof id !== 'number') throw new Error('ownerScope called without an authenticated user');
  return { userId: id };
}
```

`src/test-users.ts` :
```ts
import express, { type Express, type Router } from 'express';
import type { PrismaClient } from '../generated/prisma/index.js';
import type { UserRole } from '@calc3d/common';
import { errorHandler } from './middleware/error-handler.js';

export async function createTestUser(prisma: PrismaClient, username: string, role: UserRole = 'user') {
  return prisma.user.create({ data: { username, displayName: username, role, passwordHash: 'x' } });
}

/** App Express minimale où l'identité est injectée (pas de JWT) et un routeur monté sur `mount`. Accepte directement une ligne Prisma `User` (role en `string`). */
export function appAs(prisma: PrismaClient, user: { id: number; username: string; role: string }, mount: string, router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { typ: 'access', id: user.id, username: user.username, role: user.role as UserRole }; next(); });
  app.locals.prisma = prisma;
  app.use(mount, router);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 3: Test du service de paramètres (échoue)**

`src/settings/settings-service.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { getOrCreateSettings, toPricingSettings } from './settings-service.js';
import { DEFAULT_PRICING_SETTINGS, DEFAULT_MATERIALS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

describe('settings-service', () => {
  it('crée les paramètres par défaut et le catalogue au premier accès, une seule fois', async () => {
    const u = await createTestUser(prisma, 'alice');
    const first = await getOrCreateSettings(prisma, u.id);
    expect(first).toMatchObject({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true });
    const materials = await prisma.material.findMany({ where: { userId: u.id }, orderBy: { sortOrder: 'asc' } });
    expect(materials.map((m) => [m.name, m.pricePerKg])).toEqual(DEFAULT_MATERIALS.map((m) => [m.name, m.pricePerKg]));
    await getOrCreateSettings(prisma, u.id);
    expect(await prisma.material.count({ where: { userId: u.id } })).toBe(DEFAULT_MATERIALS.length);
  });
  it('toPricingSettings ne garde que les champs du moteur', async () => {
    const u = await createTestUser(prisma, 'bob');
    const row = await prisma.userSettings.create({ data: { userId: u.id } });
    const p = toPricingSettings(row);
    expect(Object.keys(p).sort()).toEqual(Object.keys(DEFAULT_PRICING_SETTINGS).sort());
    expect(p.pricingMode).toBe('MARKUP');
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/settings/settings-service.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 4: Implémenter le service**

`src/settings/settings-service.ts` :
```ts
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
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/settings/settings-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Schéma zod des paramètres**

`src/settings/settings.schema.ts` :
```ts
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
```

- [ ] **Step 6: Test des routes paramètres (échoue)**

`src/routes/settings.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { settingsRoutes } from './settings.routes.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const body = { ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true, wearCostPerHour: 0.15, roundToEuro: true };

describe('GET/PUT /api/settings', () => {
  it('renvoie les défauts puis la valeur enregistrée, par utilisateur', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const appA = appAs(prisma, a, '/api/settings', settingsRoutes); const appB = appAs(prisma, b, '/api/settings', settingsRoutes);
    expect((await request(appA).get('/api/settings')).body).toMatchObject({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true });
    expect((await request(appA).put('/api/settings').send(body)).status).toBe(200);
    expect((await request(appA).get('/api/settings')).body).toMatchObject({ wearCostPerHour: 0.15, roundToEuro: true });
    // B n'est pas affecté
    expect((await request(appB).get('/api/settings')).body).toMatchObject({ wearCostPerHour: 0, roundToEuro: false });
  });
  it('un admin ne voit que ses propres paramètres', async () => {
    const a = await createTestUser(prisma, 'a'); const admin = await createTestUser(prisma, 'root', 'admin');
    await request(appAs(prisma, a, '/api/settings', settingsRoutes)).put('/api/settings').send(body);
    expect((await request(appAs(prisma, admin, '/api/settings', settingsRoutes)).get('/api/settings')).body.roundToEuro).toBe(false);
  });
  it('rejette un corps incomplet, une clé inconnue, une marge cible ≥ 100 et un pourcentage négatif', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/settings', settingsRoutes);
    const { pdfShowCostBreakdown: _omit, ...partial } = body;
    expect((await request(app).put('/api/settings').send(partial)).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ ...body, userId: 999 })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ ...body, pricingMode: 'TARGET_MARGIN', pricingPct: 100 })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ ...body, contingencyPct: -1 })).status).toBe(400);
    expect((await request(app).get('/api/settings')).body.roundToEuro).toBe(false);
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/settings.routes.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 7: Implémenter `settings.routes.ts`**

```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { getOrCreateSettings, toSettingsDto } from '../settings/settings-service.js';
import { userSettingsSchema } from '../settings/settings.schema.js';

export const settingsRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

settingsRoutes.get('/', wrap(async (req, res) => {
  res.json(await getOrCreateSettings(req.app.locals.prisma, ownerScope(req).userId));
}));

settingsRoutes.put('/', wrap(async (req, res) => {
  const parsed = userSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid settings', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId); // garantit la ligne et le catalogue par défaut
  const row = await prisma.userSettings.update({ where: { userId }, data: parsed.data });
  res.json(toSettingsDto(row));
}));
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/settings.routes.test.ts`
Expected: PASS.

- [ ] **Step 8: Test des routes catalogue (échoue)**

`src/routes/materials.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { materialsRoutes } from './materials.routes.js';
import { DEFAULT_MATERIALS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

describe('/api/materials', () => {
  it('liste le catalogue par défaut, ajoute, modifie, supprime', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/materials', materialsRoutes);
    const list = (await request(app).get('/api/materials')).body;
    expect(list).toHaveLength(DEFAULT_MATERIALS.length);
    expect(list[0]).toMatchObject({ name: 'PLA', pricePerKg: 18, sortOrder: 0 });
    const created = await request(app).post('/api/materials').send({ name: '  PLA Silk ', pricePerKg: 24 });
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ name: 'PLA Silk', pricePerKg: 24, sortOrder: DEFAULT_MATERIALS.length });
    expect((await request(app).put(`/api/materials/${created.body.id}`).send({ name: 'PLA Silk', pricePerKg: 26 })).body.pricePerKg).toBe(26);
    expect((await request(app).delete(`/api/materials/${created.body.id}`)).status).toBe(204);
    expect((await request(app).get('/api/materials')).body).toHaveLength(DEFAULT_MATERIALS.length);
  });
  it('refuse un doublon à la casse ou aux espaces près (409, code duplicate)', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/materials', materialsRoutes);
    await request(app).get('/api/materials');
    const r1 = await request(app).post('/api/materials').send({ name: 'pla', pricePerKg: 1 });
    expect(r1.status).toBe(409); expect(r1.body.code).toBe('duplicate');
    const r2 = await request(app).post('/api/materials').send({ name: ' PETG ', pricePerKg: 1 });
    expect(r2.status).toBe(409);
  });
  it('cloisonne : la matière de A est introuvable (404) pour B et pour un admin, en lecture comme en écriture', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const appA = appAs(prisma, a, '/api/materials', materialsRoutes);
    const id = (await request(appA).post('/api/materials').send({ name: 'Secret', pricePerKg: 99 })).body.id;
    for (const other of [b, admin]) {
      const app = appAs(prisma, other, '/api/materials', materialsRoutes);
      expect((await request(app).get('/api/materials')).body.map((m: { name: string }) => m.name)).not.toContain('Secret');
      expect((await request(app).put(`/api/materials/${id}`).send({ name: 'Hack', pricePerKg: 1 })).status).toBe(404);
      expect((await request(app).delete(`/api/materials/${id}`)).status).toBe(404);
    }
    expect((await prisma.material.findUnique({ where: { id } }))?.name).toBe('Secret');
  });
  it('la suppression du compte emporte ses matières et paramètres, pas ceux des autres', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    await request(appAs(prisma, a, '/api/materials', materialsRoutes)).get('/api/materials');
    await request(appAs(prisma, b, '/api/materials', materialsRoutes)).get('/api/materials');
    await prisma.user.delete({ where: { id: a.id } });
    expect(await prisma.material.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.userSettings.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.material.count({ where: { userId: b.id } })).toBe(DEFAULT_MATERIALS.length);
  });
  it('valide le corps (nom vide, prix négatif, id non numérique)', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/materials', materialsRoutes);
    expect((await request(app).post('/api/materials').send({ name: '  ', pricePerKg: 1 })).status).toBe(400);
    expect((await request(app).post('/api/materials').send({ name: 'X', pricePerKg: -1 })).status).toBe(400);
    expect((await request(app).put('/api/materials/abc').send({ name: 'X', pricePerKg: 1 })).status).toBe(400);
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/materials.routes.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 9: Implémenter `materials.routes.ts`**

```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { PrismaClient } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { materialBodySchema } from '../settings/settings.schema.js';

export const materialsRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const toDto = (m: { id: number; name: string; pricePerKg: number; sortOrder: number }) => ({ id: m.id, name: m.name, pricePerKg: m.pricePerKg, sortOrder: m.sortOrder });

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Invalid id');
  return id;
}

/** Doublon insensible à la casse : SQLite compare en binaire, on compare donc en mémoire sur le catalogue de l'utilisateur (quelques dizaines de lignes). */
async function assertNoDuplicate(prisma: PrismaClient, userId: number, name: string, exceptId?: number) {
  const rows = await prisma.material.findMany({ where: { userId }, select: { id: true, name: true } });
  const lower = name.toLowerCase();
  if (rows.some((r: { id: number; name: string }) => r.id !== exceptId && r.name.toLowerCase() === lower)) {
    throw new AppError(409, 'A material with this name already exists', undefined, 'duplicate');
  }
}

materialsRoutes.get('/', wrap(async (req, res) => {
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId);
  const rows = await prisma.material.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  res.json(rows.map(toDto));
}));

materialsRoutes.post('/', wrap(async (req, res) => {
  const parsed = materialBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid material', undefined, 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId);
  await assertNoDuplicate(prisma, userId, parsed.data.name);
  const max = await prisma.material.aggregate({ where: { userId }, _max: { sortOrder: true } });
  const row = await prisma.material.create({ data: { userId, name: parsed.data.name, pricePerKg: parsed.data.pricePerKg, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  res.status(201).json(toDto(row));
}));

materialsRoutes.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = materialBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid material', undefined, 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.material.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(404, 'Material not found');
  await assertNoDuplicate(prisma, userId, parsed.data.name, id);
  const row = await prisma.material.update({ where: { id }, data: parsed.data });
  res.json(toDto(row));
}));

materialsRoutes.delete('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  // deleteMany filtré par propriétaire : 0 ligne touchée = introuvable pour cet utilisateur, jamais de fuite.
  const r = await prisma.material.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new AppError(404, 'Material not found');
  res.status(204).send();
}));
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/materials.routes.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 10: Monter les routes dans `app.ts`**

Après `app.use('/api/journal', journalRoutes);` :
```ts
  app.use('/api/settings', settingsRoutes);
  app.use('/api/materials', materialsRoutes);
```
avec les imports `import { settingsRoutes } from './routes/settings.routes.js';` et `import { materialsRoutes } from './routes/materials.routes.js';`.

- [ ] **Step 11: Vérifier, committer**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: tout au vert.

```bash
git add -A
git commit -m "Ajoute les modèles métier, le filtre propriétaire, les paramètres et le catalogue par utilisateur"
```

---

### Task 6: Backend — aperçu et enregistrement d'un devis

**Files:**
- Create: `packages/backend/src/quotes/quote.schema.ts`, `packages/backend/src/quotes/quote-mapper.ts`, `packages/backend/src/quotes/quote-mapper.test.ts`, `packages/backend/src/routes/quotes.routes.ts`, `packages/backend/src/routes/quotes.routes.test.ts`
- Modify: `packages/backend/src/app.ts`

**Interfaces:**
- Consumes: `computeQuote`, `QuoteInput`, `QuoteResult`, `CreateQuoteBody`, `QuoteDto`, `QUOTE_KINDS`, `QUOTE_STATUSES`, `getOrCreateSettings`, `toPricingSettings`, `ownerScope`.
- Produces: `createQuoteSchema` (zod) ; `toQuoteDto(row): QuoteDto` ; `buildQuoteData(userId, body, settings, result)` ; routes `POST /api/quotes/preview` → `{ result: QuoteResult, settings: PricingSettings }` et `POST /api/quotes` → `QuoteDto` (201). Le lot 2 ajoute `GET /quotes`, `GET/PUT/DELETE /quotes/:id`, `/convert`, `/settings` dans le même routeur.

- [ ] **Step 1: Schéma zod**

`src/quotes/quote.schema.ts` :
```ts
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

export const createQuoteSchema = quoteInputSchema.extend({
  projectName: z.string().trim().max(200),
  customer: z.string().trim().max(200),
  kind: z.enum(QUOTE_KINDS),
  status: z.enum(QUOTE_STATUSES),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  comment: z.string().max(2000),
}).strict();
```

- [ ] **Step 2: Test du mapper (échoue)**

`src/quotes/quote-mapper.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { buildQuoteData, toQuoteDto } from './quote-mapper.js';
import { computeQuote, DEFAULT_PRICING_SETTINGS, type CreateQuoteBody } from '@calc3d/common';

const body: CreateQuoteBody = {
  projectName: 'Support', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: '2026-11-01', comment: '',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
  printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
};

describe('quote-mapper', () => {
  it('aller-retour : les données construites, relues comme une ligne Prisma, redonnent le DTO attendu', () => {
    const settings = { ...DEFAULT_PRICING_SETTINGS, wearCostPerHour: 0.15 };
    const result = computeQuote(settings, body);
    const data = buildQuoteData(7, body, settings, result);
    expect(data.userId).toBe(7);
    expect(data.dueDate).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(JSON.parse(data.filamentLines)).toEqual(body.filamentLines);
    const dto = toQuoteDto({ ...data, id: 1, legacyId: null, createdAt: new Date('2026-10-12T10:00:00Z'), updatedAt: new Date('2026-10-12T10:00:00Z') });
    expect(dto).toMatchObject({ id: 1, projectName: 'Support', kind: 'QUOTE', dueDate: '2026-11-01', finalPrice: result.finalPrice, wear: 0.75 });
    expect(dto.settingsSnapshot).toEqual(settings);
    expect(dto.filamentLines).toEqual(body.filamentLines);
    expect(dto.createdAt).toBe('2026-10-12T10:00:00.000Z');
  });
  it('dueDate null est conservé', () => {
    const data = buildQuoteData(1, { ...body, dueDate: null }, DEFAULT_PRICING_SETTINGS, computeQuote(DEFAULT_PRICING_SETTINGS, body));
    expect(data.dueDate).toBeNull();
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/quotes/quote-mapper.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter le mapper**

`src/quotes/quote-mapper.ts` :
```ts
import type { Quote } from '../../generated/prisma/index.js';
import type { CreateQuoteBody, PricingSettings, QuoteResult, QuoteDto, QuoteKind, QuoteStatus, FilamentLine } from '@calc3d/common';

/** Données Prisma d'un devis à partir des entrées validées, de l'instantané de paramètres et du résultat serveur. */
export function buildQuoteData(userId: number, body: CreateQuoteBody, settings: PricingSettings, result: QuoteResult) {
  return {
    userId,
    projectName: body.projectName, customer: body.customer, kind: body.kind, status: body.status,
    dueDate: body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null,
    quantity: body.quantity, comment: body.comment,
    filamentLines: JSON.stringify(body.filamentLines),
    printHours: body.printHours, printMinutes: body.printMinutes,
    prepHours: body.prepHours, postHours: body.postHours, designHours: body.designHours, packagingHours: body.packagingHours,
    consumables: body.consumables, discountPct: body.discountPct, shippingCost: body.shippingCost,
    filamentWeightG: result.filamentWeightG, filamentCost: result.filamentCost, printTimeH: result.printTimeH,
    energyKwh: result.energyKwh, electricityCost: result.electricityCost,
    laborPrep: result.laborPrep, laborPost: result.laborPost, laborDesign: result.laborDesign, laborPackaging: result.laborPackaging,
    depreciation: result.depreciation, maintenance: result.maintenance, wear: result.wear, fixedCosts: result.fixedCosts,
    subtotal: result.subtotal, contingency: result.contingency, costAfterContingency: result.costAfterContingency,
    unitPriceExclTax: result.unitPriceExclTax, totalExclTax: result.totalExclTax, discountAmount: result.discountAmount,
    vatAmount: result.vatAmount, priceBeforeFloor: result.priceBeforeFloor, floorApplied: result.floorApplied,
    priceBeforeRounding: result.priceBeforeRounding, roundingAmount: result.roundingAmount, roundingApplied: result.roundingApplied,
    finalPrice: result.finalPrice, pricePerGram: result.pricePerGram, pricePerHour: result.pricePerHour,
    settingsSnapshot: JSON.stringify(settings),
  };
}

export function toQuoteDto(row: Quote): QuoteDto {
  const { userId: _userId, filamentLines, settingsSnapshot, dueDate, createdAt, updatedAt, kind, status, ...rest } = row;
  return {
    ...rest,
    kind: kind as QuoteKind, status: status as QuoteStatus,
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    filamentLines: JSON.parse(filamentLines) as FilamentLine[],
    settingsSnapshot: JSON.parse(settingsSnapshot) as PricingSettings,
  };
}
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/quotes/quote-mapper.test.ts`
Expected: PASS.

- [ ] **Step 4: Test des routes (échoue)**

`src/routes/quotes.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { quotesRoutes } from './quotes.routes.js';
import { computeQuote, DEFAULT_PRICING_SETTINGS, type CreateQuoteBody } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const body: CreateQuoteBody = {
  projectName: 'Support', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: 'rush',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
  printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
};

describe('/api/quotes', () => {
  it('preview calcule avec les paramètres de l\'utilisateur sans rien enregistrer', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    await prisma.userSettings.create({ data: { userId: a.id, wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0 } });
    const r = await request(app).post('/api/quotes/preview').send(body);
    expect(r.status).toBe(200);
    expect(r.body.result.finalPrice).toBeCloseTo(114.311228, 4);
    expect(r.body.settings.wearCostPerHour).toBe(0.15);
    expect(await prisma.quote.count()).toBe(0);
  });
  it('crée un devis : calcul serveur, instantané des paramètres, montants client ignorés', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const r = await request(app).post('/api/quotes').send({ ...body, finalPrice: 1 });
    expect(r.status, JSON.stringify(r.body)).toBe(400); // clé inconnue : le client n'envoie jamais de montant
    const ok = await request(app).post('/api/quotes').send(body);
    expect(ok.status).toBe(201);
    const expected = computeQuote(DEFAULT_PRICING_SETTINGS, body);
    expect(ok.body.finalPrice).toBeCloseTo(expected.finalPrice, 6);
    expect(ok.body.settingsSnapshot).toEqual(DEFAULT_PRICING_SETTINGS);
    expect(ok.body.filamentLines).toEqual(body.filamentLines);
    expect(ok.body).not.toHaveProperty('userId');
    const row = await prisma.quote.findUnique({ where: { id: ok.body.id } });
    expect(row?.userId).toBe(a.id);
  });
  it('valide : quantité 0 ou décimale, statut inconnu, minutes > 59, marge cible ≥ 100 dans les paramètres', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    expect((await request(app).post('/api/quotes').send({ ...body, quantity: 0 })).status).toBe(400);
    expect((await request(app).post('/api/quotes').send({ ...body, quantity: 1.5 })).status).toBe(400);
    expect((await request(app).post('/api/quotes').send({ ...body, status: 'FINI' })).status).toBe(400);
    expect((await request(app).post('/api/quotes').send({ ...body, printMinutes: 60 })).status).toBe(400);
    // Les appels précédents ont déjà créé la ligne de paramètres : upsert, pas create.
    await prisma.userSettings.upsert({ where: { userId: a.id }, update: { pricingMode: 'TARGET_MARGIN', pricingPct: 100 }, create: { userId: a.id, pricingMode: 'TARGET_MARGIN', pricingPct: 100 } });
    const r = await request(app).post('/api/quotes/preview').send(body);
    expect(r.status).toBe(400); expect(r.body.code).toBe('pricing');
  });
  it('un devis créé par A n\'est pas visible de B ni d\'un admin via la base filtrée', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).post('/api/quotes').send(body);
    expect(await prisma.quote.count({ where: { userId: b.id } })).toBe(0);
    expect(await prisma.quote.count({ where: { userId: a.id } })).toBe(1);
  });
});
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/quotes.routes.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implémenter `quotes.routes.ts`**

```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeQuote, type PricingSettings, type QuoteInput } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { createQuoteSchema, quoteInputSchema } from '../quotes/quote.schema.js';
import { buildQuoteData, toQuoteDto } from '../quotes/quote-mapper.js';

export const quotesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** computeQuote lève RangeError sur une marge cible ≥ 100 : 400 avec un code stable pour le frontend. */
function safeCompute(settings: PricingSettings, input: QuoteInput) {
  try { return computeQuote(settings, input); }
  catch (err) {
    if (err instanceof RangeError) throw new AppError(400, err.message, undefined, 'pricing');
    throw err;
  }
}

/** Paramètres courants de l'utilisateur, sans pdfShowCostBreakdown (qui n'influence pas le prix). */
async function currentPricingSettings(req: Request): Promise<PricingSettings> {
  const { pdfShowCostBreakdown: _omit, ...pricing } = await getOrCreateSettings(req.app.locals.prisma, ownerScope(req).userId);
  return pricing;
}

quotesRoutes.post('/preview', wrap(async (req, res) => {
  const parsed = quoteInputSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid quote input', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const settings = await currentPricingSettings(req);
  res.json({ result: safeCompute(settings, parsed.data), settings });
}));

quotesRoutes.post('/', wrap(async (req, res) => {
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid quote', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const { userId } = ownerScope(req);
  const settings = await currentPricingSettings(req);
  const result = safeCompute(settings, parsed.data);
  const row = await req.app.locals.prisma.quote.create({ data: buildQuoteData(userId, parsed.data, settings, result) });
  res.status(201).json(toQuoteDto(row));
}));
```

Le schéma `quoteInputSchema` n'est pas `.strict()` pour que `POST /preview` accepte le corps complet du formulaire (champs projet compris) ; `createQuoteSchema` l'est, ce qui rejette tout montant envoyé par le client.

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/quotes.routes.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Monter, vérifier, committer**

Dans `app.ts`, après les matières : `app.use('/api/quotes', quotesRoutes);` avec son import.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: tout au vert.

```bash
git add -A
git commit -m "Ajoute l'aperçu et l'enregistrement d'un devis avec calcul serveur et instantané des paramètres"
```

---

### Task 7: Frontend — onglets Paramètres et Catalogue, modules API métier

**Files:**
- Create: `packages/frontend/src/api/settings.api.ts`, `src/api/materials.api.ts`, `src/api/quotes.api.ts`, `src/lib/number.ts`, `src/lib/number.test.ts`, `src/components/settings/PricingSettingsForm.tsx`, `src/components/settings/PricingSettingsForm.test.tsx`, `src/components/settings/MaterialsCard.tsx`, `src/components/settings/MaterialsCard.test.tsx`, `scripts/i18n-fragments/settings-pricing.json`
- Modify: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: routes de la tâche 5 ; `UserSettingsDto`, `MaterialDto`, `PRICING_MODES`.
- Produces: `settingsApi.get(): Promise<UserSettingsDto>`, `settingsApi.update(body): Promise<UserSettingsDto>` ; `materialsApi.list/create/update/remove` ; `quotesApi.preview(input)`, `quotesApi.create(body): Promise<QuoteDto>` ; `parseLocaleNumber(text: string): number | null` ; `formatMoney(value, currency, locale)` ; composants `<PricingSettingsForm settings onSaved />` et `<MaterialsCard />`.

- [ ] **Step 1: Modules API**

`src/api/settings.api.ts` :
```ts
import api from './client';
import type { UserSettingsDto } from '@calc3d/common';
export const settingsApi = {
  get: (): Promise<UserSettingsDto> => api.get('/settings').then((r) => r.data),
  update: (body: UserSettingsDto): Promise<UserSettingsDto> => api.put('/settings', body).then((r) => r.data),
};
```

`src/api/materials.api.ts` :
```ts
import api from './client';
import type { MaterialDto } from '@calc3d/common';
export interface MaterialBody { name: string; pricePerKg: number }
export const materialsApi = {
  list: (): Promise<MaterialDto[]> => api.get('/materials').then((r) => r.data),
  create: (body: MaterialBody): Promise<MaterialDto> => api.post('/materials', body).then((r) => r.data),
  update: (id: number, body: MaterialBody): Promise<MaterialDto> => api.put(`/materials/${id}`, body).then((r) => r.data),
  remove: (id: number): Promise<void> => api.delete(`/materials/${id}`).then(() => undefined),
};
```

`src/api/quotes.api.ts` :
```ts
import api from './client';
import type { CreateQuoteBody, PricingSettings, QuoteDto, QuoteInput, QuoteResult } from '@calc3d/common';
export const quotesApi = {
  preview: (input: QuoteInput): Promise<{ result: QuoteResult; settings: PricingSettings }> => api.post('/quotes/preview', input).then((r) => r.data),
  create: (body: CreateQuoteBody): Promise<QuoteDto> => api.post('/quotes', body).then((r) => r.data),
};
```

- [ ] **Step 2: Test de `parseLocaleNumber` et `formatMoney` (échoue)**

`src/lib/number.test.ts` :
```ts
import { parseLocaleNumber, formatMoney } from './number';

describe('parseLocaleNumber', () => {
  it('accepte la virgule et le point décimal', () => {
    expect(parseLocaleNumber('1,5')).toBe(1.5);
    expect(parseLocaleNumber('1.5')).toBe(1.5);
    expect(parseLocaleNumber(' 12 ')).toBe(12);
    expect(parseLocaleNumber('0')).toBe(0);
  });
  it('tolère les séparateurs de milliers courants', () => {
    expect(parseLocaleNumber('1 234,56')).toBe(1234.56);
    expect(parseLocaleNumber('1 234,56')).toBe(1234.56);
  });
  it('renvoie null pour vide ou non numérique, jamais NaN', () => {
    expect(parseLocaleNumber('')).toBeNull();
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('1,2,3')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formate selon la locale avec le symbole de l\'utilisateur', () => {
    expect(formatMoney(1234.5, '€', 'fr-FR').replace(/ | /g, ' ')).toBe('1 234,50 €');
    expect(formatMoney(1234.5, '$', 'en-US')).toBe('1,234.50 $');
    expect(formatMoney(1.23456, '€', 'fr-FR', 4)).toBe('1,2346 €');
  });
});
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/lib/number.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `lib/number.ts`**

```ts
/** Nombre saisi par un humain : virgule ou point décimal, espaces (fine ou insécable) comme séparateurs de milliers. null si vide ou invalide. */
export function parseLocaleNumber(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || (cleaned.match(/\./g) ?? []).length > 1) return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Montant formaté avec la locale de l'interface et le symbole libre de l'utilisateur (pas de code ISO : la devise est un symbole). */
export function formatMoney(value: number, currencySymbol: string, locale: string, decimals = 2): string {
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return `${n} ${currencySymbol}`;
}

export function formatNumber(value: number, locale: string, decimals = 2): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/lib/number.test.ts`
Expected: PASS.

- [ ] **Step 4: Fragment i18n des paramètres**

`scripts/i18n-fragments/settings-pricing.json` :
```json
{
  "namespace": "settings",
  "keys": {
    "en": {
      "tabs": { "pricing": "Pricing", "materials": "Materials" },
      "pricing": {
        "title": "Pricing settings", "subtitle": "Reused for every new quote",
        "currencySymbol": "Currency symbol", "electricityPricePerKwh": "Electricity price (per kWh)", "printerPowerW": "Printer power (W)", "averageLoadPct": "Average load (%)",
        "hourlyRatePreparation": "Preparation hourly rate", "hourlyRatePostProcessing": "Post-processing hourly rate", "hourlyRateDesign": "Design / modeling hourly rate", "hourlyRatePackaging": "Packaging / shipping hourly rate",
        "pricingMode": "Pricing mode", "modeMarkup": "Markup", "modeTargetMargin": "Target margin", "pricingPct": "Pricing percentage (%)",
        "contingencyPct": "Failure / contingency rate (%)", "vatPct": "VAT (%) — 0 if not applicable",
        "printerPurchasePrice": "Printer purchase price", "printerLifetimeHours": "Printer lifespan (h)", "maintenancePct": "Maintenance (% of price)", "wearCostPerHour": "Printer wear parts (per hour of printing)",
        "defaultFixedCosts": "Default other fixed costs", "floorPrice": "Floor price — minimum sale",
        "roundToEuro": "Round the final price up to the next euro", "pdfShowCostBreakdown": "Show the cost price breakdown on the PDF quote",
        "save": "Save settings", "saved": "Settings saved.", "saveFailed": "Could not save settings.", "invalidNumber": "Invalid number", "targetMarginTooHigh": "Target margin must be below 100 %."
      },
      "materials": {
        "title": "Material price catalog (per kg)", "name": "Material", "pricePerKg": "Price / kg", "add": "Add", "remove": "Remove", "newName": "New material name",
        "duplicate": "This material already exists.", "saved": "Catalog saved.", "saveFailed": "Could not save the catalog.", "confirmRemove": "Remove material \"{{name}}\"?"
      }
    },
    "fr": {
      "tabs": { "pricing": "Tarification", "materials": "Matières" },
      "pricing": {
        "title": "Paramètres de tarification", "subtitle": "Réutilisés pour chaque nouveau devis",
        "currencySymbol": "Symbole de devise", "electricityPricePerKwh": "Prix de l'électricité (par kWh)", "printerPowerW": "Puissance de l'imprimante (W)", "averageLoadPct": "Charge moyenne (%)",
        "hourlyRatePreparation": "Tarif horaire préparation", "hourlyRatePostProcessing": "Tarif horaire post-traitement", "hourlyRateDesign": "Tarif horaire conception / modélisation", "hourlyRatePackaging": "Tarif horaire emballage / expédition",
        "pricingMode": "Mode de tarification", "modeMarkup": "Surcoût (markup)", "modeTargetMargin": "Marge cible", "pricingPct": "Pourcentage de tarification (%)",
        "contingencyPct": "Taux d'échec / aléas (%)", "vatPct": "TVA (%) — 0 si non applicable",
        "printerPurchasePrice": "Prix d'achat de l'imprimante", "printerLifetimeHours": "Durée de vie de l'imprimante (h)", "maintenancePct": "Maintenance (% du prix)", "wearCostPerHour": "Usure des pièces de l'imprimante (par heure d'impression)",
        "defaultFixedCosts": "Autres coûts fixes par défaut", "floorPrice": "Prix plancher — vente minimum",
        "roundToEuro": "Arrondir le prix final à l'euro supérieur", "pdfShowCostBreakdown": "Afficher le détail du coût de revient sur le devis PDF",
        "save": "Enregistrer les paramètres", "saved": "Paramètres enregistrés.", "saveFailed": "Impossible d'enregistrer les paramètres.", "invalidNumber": "Nombre invalide", "targetMarginTooHigh": "La marge cible doit être inférieure à 100 %."
      },
      "materials": {
        "title": "Catalogue des prix par matière (par kg)", "name": "Matière", "pricePerKg": "Prix / kg", "add": "Ajouter", "remove": "Supprimer", "newName": "Nom de la nouvelle matière",
        "duplicate": "Cette matière existe déjà.", "saved": "Catalogue enregistré.", "saveFailed": "Impossible d'enregistrer le catalogue.", "confirmRemove": "Supprimer la matière « {{name}} » ?"
      }
    }
  }
}
```

Run: `node packages/frontend/scripts/merge-i18n.mjs`
Expected: `OK`.

- [ ] **Step 5: Test du formulaire de tarification (échoue)**

`src/components/settings/PricingSettingsForm.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { PricingSettingsForm } from './PricingSettingsForm';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const update = vi.fn();
vi.mock('@/api/settings.api', () => ({ settingsApi: { update: (b: unknown) => update(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const settings = { ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true };
function renderForm() {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><PricingSettingsForm settings={settings} onSaved={() => {}} /></QueryClientProvider>);
}

describe('PricingSettingsForm', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => update.mockReset());

  it('affiche les valeurs courantes et envoie un nombre saisi avec une virgule', async () => {
    update.mockResolvedValue(settings);
    renderForm();
    const wear = screen.getByLabelText(/Usure des pièces/) as HTMLInputElement;
    expect(wear.value).toBe('0');
    fireEvent.change(wear, { target: { value: '0,15' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ wearCostPerHour: 0.15, pricingMode: 'MARKUP', pdfShowCostBreakdown: true });
  });
  it('bloque l\'envoi sur un nombre invalide et sur une marge cible ≥ 100', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Prix de l'électricité/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/ }));
    expect(await screen.findByText('Nombre invalide')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Prix de l'électricité/), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText(/Mode de tarification/), { target: { value: 'TARGET_MARGIN' } });
    fireEvent.change(screen.getByLabelText(/Pourcentage de tarification/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/ }));
    expect(await screen.findByText(/inférieure à 100/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
```

Le mode de tarification est rendu avec un `<select>` natif (pas le `Select` Radix) pour rester testable avec `fireEvent.change` et accessible au clavier sans surcoût ; c'est le seul champ à choix du formulaire.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/settings/PricingSettingsForm.test.tsx`
Expected: FAIL.

- [ ] **Step 6: Implémenter `PricingSettingsForm.tsx`**

```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PRICING_MODES, type PricingMode, type UserSettingsDto } from '@calc3d/common';
import { settingsApi } from '@/api/settings.api';
import { parseLocaleNumber } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type NumericKey = Exclude<keyof UserSettingsDto, 'currencySymbol' | 'pricingMode' | 'roundToEuro' | 'pdfShowCostBreakdown'>;
const NUMERIC_FIELDS: NumericKey[] = [
  'electricityPricePerKwh', 'printerPowerW', 'averageLoadPct',
  'hourlyRatePreparation', 'hourlyRatePostProcessing', 'hourlyRateDesign', 'hourlyRatePackaging',
  'pricingPct', 'contingencyPct', 'vatPct',
  'printerPurchasePrice', 'printerLifetimeHours', 'maintenancePct', 'wearCostPerHour',
  'defaultFixedCosts', 'floorPrice',
];

interface Props { settings: UserSettingsDto; onSaved: (s: UserSettingsDto) => void }

/** Les nombres sont tenus en texte pendant la saisie (virgule acceptée) et convertis à l'enregistrement. */
export function PricingSettingsForm({ settings, onSaved }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState<Record<NumericKey, string>>(() => Object.fromEntries(NUMERIC_FIELDS.map((k) => [k, String(settings[k])])) as Record<NumericKey, string>);
  const [currency, setCurrency] = useState(settings.currencySymbol);
  const [mode, setMode] = useState<PricingMode>(settings.pricingMode);
  const [roundToEuro, setRoundToEuro] = useState(settings.roundToEuro);
  const [pdfBreakdown, setPdfBreakdown] = useState(settings.pdfShowCostBreakdown);
  const [errors, setErrors] = useState<Partial<Record<NumericKey, string>>>({});

  const save = useMutation({
    mutationFn: (body: UserSettingsDto) => settingsApi.update(body),
    onSuccess: (s) => { toast.success(t('settings.pricing.saved')); onSaved(s); },
    onError: () => toast.error(t('settings.pricing.saveFailed')),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: Partial<Record<NumericKey, number>> = {};
    const errs: Partial<Record<NumericKey, string>> = {};
    for (const k of NUMERIC_FIELDS) {
      const n = parseLocaleNumber(text[k]);
      if (n === null || n < 0) errs[k] = t('settings.pricing.invalidNumber'); else parsed[k] = n;
    }
    if (!errs.pricingPct && mode === 'TARGET_MARGIN' && (parsed.pricingPct ?? 0) >= 100) errs.pricingPct = t('settings.pricing.targetMarginTooHigh');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    save.mutate({ ...(parsed as Record<NumericKey, number>), currencySymbol: currency.trim() || '€', pricingMode: mode, roundToEuro, pdfShowCostBreakdown: pdfBreakdown });
  };

  const field = (k: NumericKey) => (
    <div key={k} className="space-y-1">
      <Label htmlFor={`ps-${k}`} className="text-xs">{t(`settings.pricing.${k}`)}</Label>
      <Input id={`ps-${k}`} inputMode="decimal" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} aria-invalid={!!errors[k]} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">{t('settings.pricing.title')}</CardTitle><p className="text-xs text-muted-foreground">{t('settings.pricing.subtitle')}</p></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ps-currencySymbol" className="text-xs">{t('settings.pricing.currencySymbol')}</Label>
            <Input id="ps-currencySymbol" value={currency} maxLength={5} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          {NUMERIC_FIELDS.slice(0, 7).map(field)}
          <div className="space-y-1">
            <Label htmlFor="ps-pricingMode" className="text-xs">{t('settings.pricing.pricingMode')}</Label>
            <select id="ps-pricingMode" value={mode} onChange={(e) => setMode(e.target.value as PricingMode)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {PRICING_MODES.map((m) => <option key={m} value={m}>{t(m === 'MARKUP' ? 'settings.pricing.modeMarkup' : 'settings.pricing.modeTargetMargin')}</option>)}
            </select>
          </div>
          {NUMERIC_FIELDS.slice(7).map(field)}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={roundToEuro} onCheckedChange={setRoundToEuro} /> {t('settings.pricing.roundToEuro')}</label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={pdfBreakdown} onCheckedChange={setPdfBreakdown} /> {t('settings.pricing.pdfShowCostBreakdown')}</label>
        </CardContent>
      </Card>
      <Button type="submit" disabled={save.isPending}>{t('settings.pricing.save')}</Button>
    </form>
  );
}
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/settings/PricingSettingsForm.test.tsx`
Expected: PASS.

- [ ] **Step 7: Test de la carte catalogue (échoue)**

`src/components/settings/MaterialsCard.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { MaterialsCard } from './MaterialsCard';

const list = vi.fn(); const create = vi.fn(); const update = vi.fn(); const remove = vi.fn();
vi.mock('@/api/materials.api', () => ({ materialsApi: { list: () => list(), create: (b: unknown) => create(b), update: (id: number, b: unknown) => update(id, b), remove: (id: number) => remove(id) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MaterialsCard /></QueryClientProvider>);
}

describe('MaterialsCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { list.mockReset(); create.mockReset(); update.mockReset(); remove.mockReset(); });

  it('liste, ajoute et supprime', async () => {
    list.mockResolvedValue([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }]);
    create.mockResolvedValue({ id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 });
    remove.mockResolvedValue(undefined);
    renderCard();
    expect(await screen.findByDisplayValue('PLA')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Nom de la nouvelle matière/), { target: { value: 'PETG' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'PETG', pricePerKg: 20 }));
    fireEvent.click(screen.getAllByRole('button', { name: /Supprimer/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
  it('enregistre un prix modifié avec une virgule au blur', async () => {
    list.mockResolvedValue([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }]);
    update.mockResolvedValue({ id: 1, name: 'PLA', pricePerKg: 19.5, sortOrder: 0 });
    renderCard();
    const price = await screen.findByDisplayValue('18');
    fireEvent.change(price, { target: { value: '19,5' } });
    fireEvent.blur(price);
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { name: 'PLA', pricePerKg: 19.5 }));
  });
  it('affiche le message de doublon renvoyé par le serveur', async () => {
    list.mockResolvedValue([]);
    create.mockRejectedValue({ response: { status: 409, data: { code: 'duplicate' } } });
    renderCard();
    await screen.findByPlaceholderText(/Nom de la nouvelle matière/);
    fireEvent.change(screen.getByPlaceholderText(/Nom de la nouvelle matière/), { target: { value: 'pla' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    expect(await screen.findByText('Cette matière existe déjà.')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/settings/MaterialsCard.test.tsx`
Expected: FAIL.

- [ ] **Step 8: Implémenter `MaterialsCard.tsx`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import type { MaterialDto } from '@calc3d/common';
import { materialsApi } from '@/api/materials.api';
import { parseLocaleNumber } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const NEW_MATERIAL_DEFAULT_PRICE = 20;

/** Catalogue de matières : édition en ligne (nom et prix enregistrés au blur), ajout, suppression confirmée. */
export function MaterialsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: materialsApi.list });
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<MaterialDto | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['materials'] });
  const onError = (err: { response?: { data?: { code?: string } } }) => setError(err?.response?.data?.code === 'duplicate' ? t('settings.materials.duplicate') : t('settings.materials.saveFailed'));

  const create = useMutation({ mutationFn: materialsApi.create, onSuccess: () => { setNewName(''); setError(''); invalidate(); }, onError });
  const update = useMutation({ mutationFn: ({ id, name, pricePerKg }: { id: number; name: string; pricePerKg: number }) => materialsApi.update(id, { name, pricePerKg }), onSuccess: () => { setError(''); invalidate(); }, onError });
  const remove = useMutation({ mutationFn: materialsApi.remove, onSuccess: () => { setToDelete(null); toast.success(t('settings.materials.saved')); invalidate(); }, onError });

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('settings.materials.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">{t('settings.materials.name')}</th><th>{t('settings.materials.pricePerKg')}</th><th /></tr></thead>
            <tbody>
              {materials.map((m) => <MaterialRow key={m.id} material={m} onSave={(name, pricePerKg) => update.mutate({ id: m.id, name, pricePerKg })} onRemove={() => setToDelete(m)} removeLabel={t('settings.materials.remove')} invalidLabel={t('settings.pricing.invalidNumber')} />)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-full sm:w-56" placeholder={t('settings.materials.newName')} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button size="sm" disabled={!newName.trim() || create.isPending} onClick={() => create.mutate({ name: newName.trim(), pricePerKg: NEW_MATERIAL_DEFAULT_PRICE })}><Plus className="mr-1 h-4 w-4" />{t('settings.materials.add')}</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <ConfirmDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)} title={t('settings.materials.remove')} description={t('settings.materials.confirmRemove', { name: toDelete?.name ?? '' })} destructive loading={remove.isPending} onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }} />
      </CardContent>
    </Card>
  );
}

function MaterialRow({ material, onSave, onRemove, removeLabel, invalidLabel }: { material: MaterialDto; onSave: (name: string, pricePerKg: number) => void; onRemove: () => void; removeLabel: string; invalidLabel: string }) {
  const [name, setName] = useState(material.name);
  const [price, setPrice] = useState(String(material.pricePerKg));
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    const n = parseLocaleNumber(price);
    if (n === null || n < 0 || !name.trim()) { setInvalid(true); return; }
    setInvalid(false);
    if (name.trim() !== material.name || n !== material.pricePerKg) onSave(name.trim(), n);
  };
  return (
    <tr className="border-t">
      <td className="py-1 pr-2"><Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label={material.name} /></td>
      <td className="py-1 pr-2"><Input className="w-28" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={commit} aria-invalid={invalid} title={invalid ? invalidLabel : undefined} /></td>
      <td className="py-1 text-right"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={removeLabel} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button></td>
    </tr>
  );
}
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/settings/MaterialsCard.test.tsx`
Expected: PASS.

- [ ] **Step 9: Brancher les onglets dans `Settings.tsx`**

Remplacer le commentaire `{/* Tâche 7 : onglets Paramètres et Catalogue */}` par deux onglets visibles de tous, placés **avant** `account` et sélectionnés par défaut (`defaultValue="pricing"`) :

```tsx
<TabsTrigger value="pricing"><Calculator className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.pricing')}</TabsTrigger>
<TabsTrigger value="materials"><Layers className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.materials')}</TabsTrigger>
...
<TabsContent value="pricing" className="mt-4"><PricingTab /></TabsContent>
<TabsContent value="materials" className="mt-4"><MaterialsCard /></TabsContent>
```

avec, dans le même fichier :
```tsx
function PricingTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  if (isLoading || !data) return <PageLoader />;
  return <PricingSettingsForm key={data.updatedAt ?? 'settings'} settings={data} onSaved={(s) => qc.setQueryData(['settings'], s)} />;
}
```
(`updatedAt` n'est pas dans le DTO : utiliser simplement `key="settings"` ; le formulaire garde son état local et `onSaved` met le cache à jour.) Imports : `Calculator`, `Layers` de `lucide-react`, `settingsApi`, `PricingSettingsForm`, `MaterialsCard`.

- [ ] **Step 10: Vérifier, committer**

Run: `pnpm --filter @calc3d/frontend run typecheck && pnpm --filter @calc3d/frontend run test && pnpm lint`
Expected: au vert. Puis `pnpm dev`, ouvrir Paramètres : modifier l'usure à `0,15`, enregistrer, recharger la page, la valeur est conservée ; ajouter puis supprimer une matière.

```bash
git add -A
git commit -m "Ajoute les onglets Tarification et Matières de la page Paramètres"
```

---

### Task 8: Frontend — page Devis avec calcul en direct et enregistrement

**Files:**
- Create: `packages/frontend/src/components/quote/FilamentGrid.tsx`, `src/components/quote/QuoteResultPanel.tsx`, `src/components/quote/quote-form-state.ts`, `src/components/quote/quote-form-state.test.ts`, `src/pages/Quote.tsx`, `src/pages/Quote.test.tsx`, `scripts/i18n-fragments/quote.json`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `computeQuote`, `QUOTE_KINDS`, `QUOTE_STATUSES`, `settingsApi.get`, `materialsApi.list`, `quotesApi.create`, `parseLocaleNumber`, `formatMoney`, `formatNumber`.
- Produces: `QuoteFormState` (toutes les saisies en texte), `emptyQuoteForm(defaultMaterial)`, `toQuoteInput(state): { input: QuoteInput; errors: string[] }`, `toCreateBody(state)` ; page `/` ; les composants `FilamentGrid` et `QuoteResultPanel` sont réutilisés au lot 2 (rechargement d'un devis) et au lot 3 (page d'impression).

- [ ] **Step 1: Fragment i18n du devis**

`scripts/i18n-fragments/quote.json` :
```json
{
  "namespace": "quote",
  "keys": {
    "en": {
      "title": "Quote", "subtitle": "Create a quote and calculate the final price",
      "project": { "title": "Project information", "projectName": "Project / part name", "customer": "Customer", "kind": "Type", "status": "Status", "dueDate": "Due date", "quantity": "Quantity" },
      "kinds": { "QUOTE": "Quote", "ORDER": "Order" },
      "statuses": { "PENDING": "Pending", "SCHEDULED": "Scheduled", "IN_PROGRESS": "In progress", "DONE": "Done", "ON_HOLD": "On hold" },
      "filament": { "title": "Filament (one line per material / color used)", "material": "Material", "weightG": "Weight (g)", "pricePerKg": "Price / kg", "wastePct": "Waste (%)", "cost": "Cost", "addLine": "Add line", "removeLine": "Remove line" },
      "time": { "title": "Printing and labor", "printHours": "Print time — h", "printMinutes": "minutes", "prepHours": "Preparation time (h)", "postHours": "Post-processing time (h)", "designHours": "Design / modeling time (h)", "packagingHours": "Packaging / shipping time (h)" },
      "options": { "title": "Order options", "consumables": "Consumables / additional parts", "discountPct": "Discount (%)", "shippingCost": "Shipping cost", "comment": "Comment" },
      "result": {
        "title": "Result", "filament": "Filament (total weight {{weight}} g)", "electricity": "Electricity ({{hours}} h, {{kwh}} kWh)",
        "laborPrep": "Preparation labor", "laborPost": "Post-processing labor", "laborDesign": "Design / modeling labor", "laborPackaging": "Packaging / shipping labor",
        "depreciation": "Printer depreciation", "maintenance": "Printer maintenance", "wear": "Printer wear parts", "fixedCosts": "Consumables / fixed costs",
        "subtotal": "SUBTOTAL (cost price)", "contingency": "Contingency / failure surcharge ({{pct}} %)", "costAfterContingency": "Cost after surcharge",
        "pricingMode": "Pricing mode", "unitPriceExclTax": "Selling price excl. tax (per unit)", "quantity": "Quantity", "totalExclTax": "Selling price excl. tax (order total)",
        "discount": "Discount ({{pct}} %)", "shipping": "Shipping", "vat": "VAT ({{pct}} %)", "rounding": "Rounded up to the next euro",
        "pricePerGram": "Unit price per g (excl. tax)", "pricePerHour": "Unit price per hour (excl. tax)", "finalPrice": "FINAL PRICE",
        "floorApplied": "Floor price applied (calculated: {{price}})", "invalid": "Fix the highlighted fields to see the price."
      },
      "actions": { "save": "Save to history", "saving": "Saving…", "saved": "Quote saved.", "saveFailed": "Could not save the quote.", "new": "New quote", "export": "Export / Print (PDF)", "exportLater": "Available after saving (lot 3)" },
      "errors": { "invalidNumber": "Invalid number", "quantityMin": "Quantity must be a whole number ≥ 1", "minutesRange": "Minutes must be between 0 and 59" }
    },
    "fr": {
      "title": "Devis", "subtitle": "Crée un devis et calcule le prix final",
      "project": { "title": "Informations projet", "projectName": "Nom du projet / pièce", "customer": "Client", "kind": "Type", "status": "Statut", "dueDate": "Date souhaitée", "quantity": "Quantité" },
      "kinds": { "QUOTE": "Devis", "ORDER": "Commande" },
      "statuses": { "PENDING": "En attente", "SCHEDULED": "Programmé", "IN_PROGRESS": "En cours", "DONE": "Terminé", "ON_HOLD": "En pause" },
      "filament": { "title": "Filament (une ligne par matière / couleur utilisée)", "material": "Matière", "weightG": "Poids (g)", "pricePerKg": "Prix / kg", "wastePct": "Pertes (%)", "cost": "Coût", "addLine": "Ajouter une ligne", "removeLine": "Supprimer la ligne" },
      "time": { "title": "Impression et main d'œuvre", "printHours": "Durée d'impression — h", "printMinutes": "minutes", "prepHours": "Temps de préparation (h)", "postHours": "Temps de post-traitement (h)", "designHours": "Temps de conception / modélisation (h)", "packagingHours": "Temps d'emballage / expédition (h)" },
      "options": { "title": "Options de commande", "consumables": "Consommables / pièces additionnelles", "discountPct": "Remise (%)", "shippingCost": "Frais de port", "comment": "Commentaire" },
      "result": {
        "title": "Résultat", "filament": "Filament (poids total {{weight}} g)", "electricity": "Électricité ({{hours}} h, {{kwh}} kWh)",
        "laborPrep": "Main d'œuvre préparation", "laborPost": "Main d'œuvre post-traitement", "laborDesign": "Main d'œuvre conception / modélisation", "laborPackaging": "Main d'œuvre emballage / expédition",
        "depreciation": "Amortissement imprimante", "maintenance": "Maintenance imprimante", "wear": "Usure pièces imprimante", "fixedCosts": "Consommables / coûts fixes",
        "subtotal": "SOUS-TOTAL (coût de revient)", "contingency": "Majoration aléas / échec ({{pct}} %)", "costAfterContingency": "Coût après majoration",
        "pricingMode": "Mode de tarification", "unitPriceExclTax": "Prix de vente HT (unitaire)", "quantity": "Quantité", "totalExclTax": "Prix de vente HT (total commande)",
        "discount": "Remise ({{pct}} %)", "shipping": "Frais de port", "vat": "TVA ({{pct}} %)", "rounding": "Arrondi à l'euro supérieur",
        "pricePerGram": "Prix unitaire au gramme (HT)", "pricePerHour": "Prix unitaire à l'heure (HT)", "finalPrice": "PRIX FINAL",
        "floorApplied": "Prix plancher appliqué (calculé : {{price}})", "invalid": "Corrige les champs en erreur pour voir le prix."
      },
      "actions": { "save": "Enregistrer dans l'historique", "saving": "Enregistrement…", "saved": "Devis enregistré.", "saveFailed": "Impossible d'enregistrer le devis.", "new": "Nouveau devis", "export": "Exporter / Imprimer (PDF)", "exportLater": "Disponible après enregistrement (lot 3)" },
      "errors": { "invalidNumber": "Nombre invalide", "quantityMin": "La quantité doit être un entier ≥ 1", "minutesRange": "Les minutes doivent être entre 0 et 59" }
    }
  }
}
```

Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

- [ ] **Step 2: Test de l'état du formulaire (échoue)**

`src/components/quote/quote-form-state.test.ts` :
```ts
import { emptyQuoteForm, toQuoteInput, toCreateBody } from './quote-form-state';

describe('quote-form-state', () => {
  it('convertit les textes (virgule acceptée) en QuoteInput', () => {
    const f = emptyQuoteForm('PLA');
    f.lines[0] = { material: 'PLA', weightG: '100', pricePerKg: '18', wastePct: '10' };
    f.printHours = '5'; f.prepHours = '1'; f.postHours = '0,5'; f.designHours = '2'; f.packagingHours = '0,25'; f.quantity = '1';
    const { input, errors } = toQuoteInput(f);
    expect(errors).toEqual([]);
    expect(input).toMatchObject({ printHours: 5, postHours: 0.5, packagingHours: 0.25, quantity: 1, filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }] });
  });
  it('signale quantité 0 / décimale, minutes hors plage et nombre invalide', () => {
    const f = emptyQuoteForm('PLA');
    f.quantity = '0'; f.printMinutes = '75'; f.prepHours = 'abc';
    expect(toQuoteInput(f).errors).toEqual(expect.arrayContaining(['quantity', 'printMinutes', 'prepHours']));
    f.quantity = '1,5';
    expect(toQuoteInput(f).errors).toContain('quantity');
  });
  it('un champ vide vaut 0 (sauf la quantité)', () => {
    const f = emptyQuoteForm('PLA');
    f.prepHours = '';
    const { input, errors } = toQuoteInput(f);
    expect(errors).toEqual([]); expect(input.prepHours).toBe(0);
  });
  it('toCreateBody ajoute les champs projet, dueDate vide → null', () => {
    const f = emptyQuoteForm('PLA'); f.projectName = ' Boîtier '; f.dueDate = '';
    const body = toCreateBody(f);
    expect(body).toMatchObject({ projectName: 'Boîtier', customer: '', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '' });
    expect(body).not.toHaveProperty('finalPrice');
  });
});
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/quote/quote-form-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `quote-form-state.ts`**

```ts
import type { CreateQuoteBody, QuoteInput, QuoteKind, QuoteStatus } from '@calc3d/common';
import { parseLocaleNumber } from '@/lib/number';

export interface FilamentLineText { material: string; weightG: string; pricePerKg: string; wastePct: string }
export interface QuoteFormState {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus; dueDate: string; comment: string;
  quantity: string; lines: FilamentLineText[];
  printHours: string; printMinutes: string; prepHours: string; postHours: string; designHours: string; packagingHours: string;
  consumables: string; discountPct: string; shippingCost: string;
}
type NumericField = Exclude<keyof QuoteFormState, 'projectName' | 'customer' | 'kind' | 'status' | 'dueDate' | 'comment' | 'lines'>;
export type QuoteFormError = NumericField | `lines.${number}.${keyof Omit<FilamentLineText, 'material'>}`;

export const emptyLine = (material: string, pricePerKg = ''): FilamentLineText => ({ material, weightG: '0', pricePerKg, wastePct: '10' });

export function emptyQuoteForm(defaultMaterial: string, defaultPricePerKg = ''): QuoteFormState {
  return {
    projectName: '', customer: '', kind: 'QUOTE', status: 'PENDING', dueDate: '', comment: '',
    quantity: '1', lines: [emptyLine(defaultMaterial, defaultPricePerKg)],
    printHours: '0', printMinutes: '0', prepHours: '0', postHours: '0', designHours: '0', packagingHours: '0',
    consumables: '0', discountPct: '0', shippingCost: '0',
  };
}

/** Champ vide = 0. Négatif ou non numérique = erreur. */
function num(text: string, errors: QuoteFormError[], key: QuoteFormError): number {
  if (text.trim() === '') return 0;
  const n = parseLocaleNumber(text);
  if (n === null || n < 0) { errors.push(key); return 0; }
  return n;
}

export function toQuoteInput(f: QuoteFormState): { input: QuoteInput; errors: QuoteFormError[] } {
  const errors: QuoteFormError[] = [];
  const quantity = parseLocaleNumber(f.quantity);
  if (quantity === null || !Number.isInteger(quantity) || quantity < 1) errors.push('quantity');
  const printHours = num(f.printHours, errors, 'printHours');
  if (!Number.isInteger(printHours)) errors.push('printHours');
  const printMinutes = num(f.printMinutes, errors, 'printMinutes');
  if (!Number.isInteger(printMinutes) || printMinutes > 59) errors.push('printMinutes');
  const filamentLines = f.lines.map((l, i) => ({
    material: l.material,
    weightG: num(l.weightG, errors, `lines.${i}.weightG`),
    pricePerKg: num(l.pricePerKg, errors, `lines.${i}.pricePerKg`),
    wastePct: num(l.wastePct, errors, `lines.${i}.wastePct`),
  }));
  const input: QuoteInput = {
    filamentLines, printHours, printMinutes,
    prepHours: num(f.prepHours, errors, 'prepHours'), postHours: num(f.postHours, errors, 'postHours'),
    designHours: num(f.designHours, errors, 'designHours'), packagingHours: num(f.packagingHours, errors, 'packagingHours'),
    quantity: quantity !== null && Number.isInteger(quantity) && quantity >= 1 ? quantity : 1,
    consumables: num(f.consumables, errors, 'consumables'),
    discountPct: Math.min(100, num(f.discountPct, errors, 'discountPct')),
    shippingCost: num(f.shippingCost, errors, 'shippingCost'),
  };
  return { input, errors: [...new Set(errors)] };
}

export function toCreateBody(f: QuoteFormState): CreateQuoteBody {
  const { input } = toQuoteInput(f);
  return {
    ...input,
    projectName: f.projectName.trim(), customer: f.customer.trim(), kind: f.kind, status: f.status,
    dueDate: f.dueDate ? f.dueDate : null, comment: f.comment,
  };
}
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/quote/quote-form-state.test.ts`
Expected: PASS.

- [ ] **Step 4: `FilamentGrid.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { Plus, Minus } from 'lucide-react';
import type { MaterialDto } from '@calc3d/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseLocaleNumber, formatNumber } from '@/lib/number';
import { emptyLine, type FilamentLineText, type QuoteFormError } from './quote-form-state';

interface Props { lines: FilamentLineText[]; materials: MaterialDto[]; errors: QuoteFormError[]; onChange: (lines: FilamentLineText[]) => void }

/** Grille filament : une ligne par matière ; choisir une matière préremplit son prix au kg depuis le catalogue. */
export function FilamentGrid({ lines, materials, errors, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const set = (i: number, patch: Partial<FilamentLineText>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, material: string) => {
    const m = materials.find((x) => x.name === material);
    set(i, { material, pricePerKg: m ? String(m.pricePerKg) : lines[i].pricePerKg });
  };
  const lineCost = (l: FilamentLineText) => {
    const w = parseLocaleNumber(l.weightG) ?? 0; const p = parseLocaleNumber(l.pricePerKg) ?? 0; const waste = parseLocaleNumber(l.wastePct) ?? 0;
    return w > 0 ? (w / 1000) * p * (1 + waste / 100) : 0;
  };
  const err = (key: QuoteFormError) => errors.includes(key);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">{t('quote.filament.material')}</th><th>{t('quote.filament.weightG')}</th><th>{t('quote.filament.pricePerKg')}</th><th>{t('quote.filament.wastePct')}</th><th className="text-right">{t('quote.filament.cost')}</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-2">
                  <select aria-label={t('quote.filament.material')} value={l.material} onChange={(e) => pick(i, e.target.value)} className="flex h-9 w-full min-w-[8rem] rounded-md border border-input bg-background px-2 text-sm">
                    {!materials.some((m) => m.name === l.material) && <option value={l.material}>{l.material}</option>}
                    {materials.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </td>
                <td className="py-1 pr-2"><Input aria-label={t('quote.filament.weightG')} inputMode="decimal" className="w-24" value={l.weightG} aria-invalid={err(`lines.${i}.weightG`)} onChange={(e) => set(i, { weightG: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input aria-label={t('quote.filament.pricePerKg')} inputMode="decimal" className="w-24" value={l.pricePerKg} aria-invalid={err(`lines.${i}.pricePerKg`)} onChange={(e) => set(i, { pricePerKg: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input aria-label={t('quote.filament.wastePct')} inputMode="decimal" className="w-20" value={l.wastePct} aria-invalid={err(`lines.${i}.wastePct`)} onChange={(e) => set(i, { wastePct: e.target.value })} /></td>
                <td className="py-1 text-right font-mono-data text-xs">{formatNumber(lineCost(l), i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, emptyLine(materials[0]?.name ?? 'PLA', materials[0] ? String(materials[0].pricePerKg) : '')])}><Plus className="mr-1 h-4 w-4" />{t('quote.filament.addLine')}</Button>
        <Button type="button" size="sm" variant="outline" disabled={lines.length <= 1} onClick={() => onChange(lines.slice(0, -1))}><Minus className="mr-1 h-4 w-4" />{t('quote.filament.removeLine')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `QuoteResultPanel.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import type { PricingSettings, QuoteInput, QuoteResult } from '@calc3d/common';
import { formatMoney, formatNumber } from '@/lib/number';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props { result: QuoteResult | null; settings: PricingSettings; input: QuoteInput }

/** Décomposition du calcul, même ordre que la page Devis de l'application bureau. result null = formulaire en erreur. */
export function QuoteResultPanel({ result, settings, input }: Props) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const money = (v: number, d = 2) => formatMoney(v, settings.currencySymbol, loc, d);
  if (!result) {
    return <Card><CardHeader><CardTitle className="text-sm font-medium">{t('quote.result.title')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t('quote.result.invalid')}</p></CardContent></Card>;
  }
  const r = result;
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between gap-4 py-1 text-sm ${strong ? 'font-semibold' : ''}`}><span>{label}</span><span className="font-mono-data tabular-nums">{value}</span></div>
  );
  const Sep = () => <hr className="my-1 border-border" />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('quote.result.title')}</CardTitle></CardHeader>
      <CardContent>
        <Row label={t('quote.result.filament', { weight: formatNumber(r.filamentWeightG, loc, 1) })} value={money(r.filamentCost)} />
        <Row label={t('quote.result.electricity', { hours: formatNumber(r.printTimeH, loc, 2), kwh: formatNumber(r.energyKwh, loc, 3) })} value={money(r.electricityCost)} />
        <Row label={t('quote.result.laborPrep')} value={money(r.laborPrep)} />
        <Row label={t('quote.result.laborPost')} value={money(r.laborPost)} />
        <Row label={t('quote.result.laborDesign')} value={money(r.laborDesign)} />
        <Row label={t('quote.result.laborPackaging')} value={money(r.laborPackaging)} />
        <Row label={t('quote.result.depreciation')} value={money(r.depreciation)} />
        <Row label={t('quote.result.maintenance')} value={money(r.maintenance)} />
        <Row label={t('quote.result.wear')} value={money(r.wear)} />
        <Row label={t('quote.result.fixedCosts')} value={money(r.fixedCosts)} />
        <Sep />
        <Row label={t('quote.result.subtotal')} value={money(r.subtotal)} strong />
        <Row label={t('quote.result.contingency', { pct: formatNumber(settings.contingencyPct, loc, 0) })} value={money(r.contingency)} />
        <Row label={t('quote.result.costAfterContingency')} value={money(r.costAfterContingency)} strong />
        <Sep />
        <Row label={t('quote.result.pricingMode')} value={`${t(settings.pricingMode === 'MARKUP' ? 'settings.pricing.modeMarkup' : 'settings.pricing.modeTargetMargin')} (${formatNumber(settings.pricingPct, loc, 0)} %)`} />
        <Row label={t('quote.result.unitPriceExclTax')} value={money(r.unitPriceExclTax)} />
        <Row label={t('quote.result.quantity')} value={String(input.quantity)} />
        <Row label={t('quote.result.totalExclTax')} value={money(r.totalExclTax)} />
        <Row label={t('quote.result.discount', { pct: formatNumber(input.discountPct, loc, 0) })} value={`-${money(r.discountAmount)}`} />
        <Row label={t('quote.result.shipping')} value={money(r.shippingCost)} />
        {settings.vatPct > 0 && <Row label={t('quote.result.vat', { pct: formatNumber(settings.vatPct, loc, 0) })} value={money(r.vatAmount)} />}
        {r.roundingApplied && <Row label={t('quote.result.rounding')} value={`+${money(r.roundingAmount)}`} />}
        <Sep />
        <Row label={t('quote.result.pricePerGram')} value={money(r.pricePerGram, 4)} />
        <Row label={t('quote.result.pricePerHour')} value={money(r.pricePerHour)} />
        <div className="mt-3 flex items-center justify-between rounded-md bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold text-primary">{t('quote.result.finalPrice')}</span>
          <span className="text-2xl font-bold text-primary font-mono-data" data-testid="final-price">{money(r.finalPrice)}</span>
        </div>
        {r.floorApplied && <p className="mt-1 text-xs text-muted-foreground">{t('quote.result.floorApplied', { price: money(r.priceBeforeFloor) })}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Test de la page Devis (échoue)**

`src/pages/Quote.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import Quote from './Quote';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const create = vi.fn();
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ ...DEFAULT_PRICING_SETTINGS, wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0, pdfShowCostBreakdown: true }) } }));
vi.mock('@/api/materials.api', () => ({ materialsApi: { list: () => Promise.resolve([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }, { id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 }]) } }));
vi.mock('@/api/quotes.api', () => ({ quotesApi: { create: (b: unknown) => create(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><Quote /></MemoryRouter></QueryClientProvider>);
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('page Devis', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => create.mockReset());

  it('calcule en direct le cas doré G1 et affiche 114,31 €', async () => {
    renderPage();
    await screen.findByLabelText(/Poids \(g\)/);
    type(/Poids \(g\)/, '100'); type(/Pertes \(%\)/, '10');
    type(/Durée d'impression/, '5'); type(/Temps de préparation/, '1'); type(/Temps de post-traitement/, '0,5');
    type(/Temps de conception/, '2'); type(/Temps d'emballage/, '0,25');
    await waitFor(() => expect(screen.getByTestId('final-price').textContent?.replace(/\s/g, '')).toBe('114,31€'));
    expect(screen.getByText(/Usure pièces imprimante/).nextSibling?.textContent?.replace(/\s/g, '')).toBe('0,75€');
  });
  it('choisir une matière préremplit son prix au kg', async () => {
    renderPage();
    const sel = await screen.findByLabelText(/^Matière$/);
    fireEvent.change(sel, { target: { value: 'PETG' } });
    expect((screen.getByLabelText(/Prix \/ kg/) as HTMLInputElement).value).toBe('20');
  });
  it('n\'enregistre pas avec une quantité invalide, puis enregistre les entrées sans montants', async () => {
    create.mockResolvedValue({ id: 42 });
    renderPage();
    await screen.findByLabelText(/Quantité/);
    type(/Quantité/, '0');
    expect(screen.getByRole('button', { name: /Enregistrer dans l'historique/ })).toBeDisabled();
    expect(screen.getByText(/Corrige les champs en erreur/)).toBeInTheDocument();
    type(/Quantité/, '2'); type(/Nom du projet/, 'Boîtier'); type(/Poids \(g\)/, '50');
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer dans l'historique/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({ projectName: 'Boîtier', quantity: 2, kind: 'QUOTE', status: 'PENDING', filamentLines: [{ material: 'PLA', weightG: 50, pricePerKg: 18, wastePct: 10 }] });
    expect(body).not.toHaveProperty('finalPrice');
    expect(await screen.findByRole('button', { name: /Nouveau devis/ })).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/Quote.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implémenter `pages/Quote.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, FilePlus, Printer } from 'lucide-react';
import { computeQuote, QUOTE_KINDS, QUOTE_STATUSES, type QuoteKind, type QuoteStatus, type QuoteResult } from '@calc3d/common';
import { settingsApi } from '@/api/settings.api';
import { materialsApi } from '@/api/materials.api';
import { quotesApi } from '@/api/quotes.api';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilamentGrid } from '@/components/quote/FilamentGrid';
import { QuoteResultPanel } from '@/components/quote/QuoteResultPanel';
import { emptyQuoteForm, toQuoteInput, toCreateBody, type QuoteFormState, type QuoteFormError } from '@/components/quote/quote-form-state';

export default function Quote() {
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: materialsApi.list });
  if (settingsQ.isLoading || materialsQ.isLoading || !settingsQ.data || !materialsQ.data) return <PageLoader />;
  const first = materialsQ.data[0];
  return <QuoteEditor key={first?.id ?? 'none'} settings={settingsQ.data} materials={materialsQ.data} defaultMaterial={first?.name ?? 'PLA'} defaultPrice={first ? String(first.pricePerKg) : ''} />;
}

function QuoteEditor({ settings, materials, defaultMaterial, defaultPrice }: { settings: Awaited<ReturnType<typeof settingsApi.get>>; materials: Awaited<ReturnType<typeof materialsApi.list>>; defaultMaterial: string; defaultPrice: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<QuoteFormState>(() => emptyQuoteForm(defaultMaterial, defaultPrice));
  const [savedId, setSavedId] = useState<number | null>(null);
  const { pdfShowCostBreakdown: _omit, ...pricing } = settings;

  // Résultat en direct : recalculé à chaque frappe par le moteur partagé ; le serveur refera le calcul à l'enregistrement.
  const { input, errors, result } = useMemo(() => {
    const { input, errors } = toQuoteInput(form);
    let result: QuoteResult | null = null;
    if (errors.length === 0) { try { result = computeQuote(pricing, input); } catch { result = null; } }
    return { input, errors, result };
  }, [form, pricing]);

  const save = useMutation({
    mutationFn: () => quotesApi.create(toCreateBody(form)),
    onSuccess: (q) => { setSavedId(q.id); toast.success(t('quote.actions.saved')); },
    onError: () => toast.error(t('quote.actions.saveFailed')),
  });
  const set = (patch: Partial<QuoteFormState>) => { setForm({ ...form, ...patch }); setSavedId(null); };
  const has = (k: QuoteFormError) => errors.includes(k);
  const numField = (k: Exclude<QuoteFormError, `lines.${number}.${string}`>, label: string, width = 'w-full') => (
    <div className="space-y-1">
      <Label htmlFor={`q-${k}`} className="text-xs">{label}</Label>
      <Input id={`q-${k}`} inputMode="decimal" className={width} value={form[k]} aria-invalid={has(k)} onChange={(e) => set({ [k]: e.target.value } as Partial<QuoteFormState>)} />
      {has(k) && <p className="text-xs text-destructive">{t(k === 'quantity' ? 'quote.errors.quantityMin' : k === 'printMinutes' ? 'quote.errors.minutesRange' : 'quote.errors.invalidNumber')}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('quote.title')}</h1><p className="text-sm text-muted-foreground">{t('quote.subtitle')}</p></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.project.title')}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="q-projectName" className="text-xs">{t('quote.project.projectName')}</Label><Input id="q-projectName" value={form.projectName} onChange={(e) => set({ projectName: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="q-customer" className="text-xs">{t('quote.project.customer')}</Label><Input id="q-customer" value={form.customer} onChange={(e) => set({ customer: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="q-kind" className="text-xs">{t('quote.project.kind')}</Label>
                <select id="q-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value as QuoteKind })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{QUOTE_KINDS.map((k) => <option key={k} value={k}>{t(`quote.kinds.${k}`)}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="q-status" className="text-xs">{t('quote.project.status')}</Label>
                <select id="q-status" value={form.status} onChange={(e) => set({ status: e.target.value as QuoteStatus })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{t(`quote.statuses.${s}`)}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="q-dueDate" className="text-xs">{t('quote.project.dueDate')}</Label><Input id="q-dueDate" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>
              {numField('quantity', t('quote.project.quantity'))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.filament.title')}</CardTitle></CardHeader>
            <CardContent><FilamentGrid lines={form.lines} materials={materials} errors={errors} onChange={(lines) => set({ lines })} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.time.title')}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {numField('printHours', t('quote.time.printHours'))}
              {numField('printMinutes', t('quote.time.printMinutes'))}
              {numField('prepHours', t('quote.time.prepHours'))}
              {numField('postHours', t('quote.time.postHours'))}
              {numField('designHours', t('quote.time.designHours'))}
              {numField('packagingHours', t('quote.time.packagingHours'))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.options.title')}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {numField('consumables', t('quote.options.consumables'))}
              {numField('discountPct', t('quote.options.discountPct'))}
              {numField('shippingCost', t('quote.options.shippingCost'))}
              <div className="space-y-1 sm:col-span-3"><Label htmlFor="q-comment" className="text-xs">{t('quote.options.comment')}</Label><Textarea id="q-comment" value={form.comment} onChange={(e) => set({ comment: e.target.value })} /></div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <QuoteResultPanel result={result} settings={pricing} input={input} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={!result || save.isPending || savedId !== null}><Save className="mr-1 h-4 w-4" />{save.isPending ? t('quote.actions.saving') : t('quote.actions.save')}</Button>
            <Button variant="outline" onClick={() => { setForm(emptyQuoteForm(defaultMaterial, defaultPrice)); setSavedId(null); }}><FilePlus className="mr-1 h-4 w-4" />{t('quote.actions.new')}</Button>
            <Button variant="outline" disabled title={t('quote.actions.exportLater')}><Printer className="mr-1 h-4 w-4" />{t('quote.actions.export')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Le bouton Exporter est présent mais désactivé jusqu'au lot 3 (page d'impression `/quotes/:id/print`). Le bouton Enregistrer se désactive après un enregistrement réussi tant que le formulaire n'a pas changé (évite les doublons ; le lot 2 le transformera en « Mettre à jour »).

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/Quote.test.tsx`
Expected: PASS, 3 tests. Si `Textarea` n'existe pas dans `components/ui`, le copier depuis `../Minecraft/packages/frontend/src/components/ui/textarea.tsx`.

- [ ] **Step 8: Brancher la route `/`**

Dans `App.tsx` : `const Quote = lazy(() => import('@/pages/Quote'));` et `<Route path="/" element={<Quote />} />` à la place de `NotFound`. Retirer le commentaire « Tâche 8 ».

- [ ] **Step 9: Vérifier en vrai et committer**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: tout au vert.

Puis `pnpm dev` : saisir le cas G1 (PLA 100 g, 10 % pertes, 5 h, prépa 1 h, post 0,5 h, conception 2 h, emballage 0,25 h) avec, dans Paramètres, usure 0,15, conception 30 €/h, emballage 10 €/h, plancher 0 : le prix final affiché est **114,31 €**, identique à l'application bureau avec les mêmes paramètres. Enregistrer : le toast confirme et la ligne existe dans la table `Quote` (vérifier avec `pnpm --filter @calc3d/backend exec prisma studio` ou `sqlite3`).

```bash
git add -A
git commit -m "Ajoute la page Devis : calcul en direct, grille filament, enregistrement"
```

---

### Task 9: Docker Compose, documentation, vérification de bout en bout du lot

**Files:**
- Create: `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `README.md`, `README.fr.md`, `CHANGELOG.md`, `CLAUDE.md`
- Modify: `.github/workflows/ci.yml` (déjà prêt ; vérifier seulement)

**Interfaces:**
- Consumes: tout le lot.
- Produces: `docker compose up -d --build` sert l'application sur `http://localhost:${FRONTEND_PORT:-3000}`.

- [ ] **Step 1: `Dockerfile.backend`**

Copier `../Minecraft/Dockerfile.backend` puis : remplacer `@mc/common` → `@calc3d/common`, `@mc/backend` → `@calc3d/backend` ; conserver la ligne `find ... geoip-city*.dat -delete` (base pays seule) ; conserver `CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]` ; retirer la phrase du commentaire sur le socket Docker (« Reading the Docker socket needs group_add in compose »).

- [ ] **Step 2: `Dockerfile.frontend`**

Copier `../Minecraft/Dockerfile.frontend` puis : `@mc/common` → `@calc3d/common`, `@mc/frontend` → `@calc3d/frontend` ; dans la configuration nginx écrite par `printf`, supprimer les blocs `location ^~ /api/backups/download/`, `location = /api/mods/upload` et `location /ws` ; conserver `location /api` (sans les en-têtes `Upgrade`/`Connection`, inutiles sans WebSocket), `location /` avec `try_files`, `gzip`, `client_max_body_size 10m` (l'import bureau du lot 3 enverra des CSV de quelques Mo).

- [ ] **Step 3: `docker-compose.yml`**

```yaml
services:
  backend:
    build: { context: ., dockerfile: Dockerfile.backend }
    container_name: calc3d-backend
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=file:/app/packages/backend/data/calc3d.db
      - "JWT_SECRET=${JWT_SECRET:?set JWT_SECRET in .env - openssl rand -hex 32}"
      - "ENCRYPTION_KEY=${ENCRYPTION_KEY:?set ENCRYPTION_KEY in .env, different from JWT_SECRET}"
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
    volumes:
      - calc3d-data:/app/packages/backend/data
    networks: [calc3d-network]
  frontend:
    build: { context: ., dockerfile: Dockerfile.frontend }
    container_name: calc3d-frontend
    restart: unless-stopped
    ports: ["${FRONTEND_PORT:-3000}:8080"]
    depends_on: [backend]
    networks: [calc3d-network]
volumes:
  calc3d-data:
networks:
  calc3d-network:
```

Run: `docker compose config`
Expected: configuration rendue sans erreur (avec `.env` présent).

- [ ] **Step 4: Construire et démarrer la stack**

Run: `docker compose up -d --build && sleep 15 && curl -s http://localhost:3000/api/health && curl -s http://localhost:3000/api/setup/status`
Expected: `{"status":"ok",...}` puis `{"needsSetup":true}` (ou `false` si la base du volume a déjà un compte). Ouvrir `http://localhost:3000`, dérouler installation → login → Paramètres → Devis → enregistrement. Puis `docker compose down` (le volume `calc3d-data` est conservé).

- [ ] **Step 5: `README.md` (anglais) et `README.fr.md`**

Structure identique dans les deux langues (le français est la version source, l'anglais la traduction) :

1. Titre « Calc3D-Web », une phrase : portage web multi-utilisateur de [CalculateurPrix](../CalculateurPrix) (application de bureau PowerShell/WPF), architecture reprise de MC Manager / TS6 Manager. Badge licence GPL-3.0 (même licence que l'application bureau).
2. **Fonctionnalités (lot 1)** : comptes et rôles (`admin` gère les comptes, `user` a ses propres données ; un admin ne voit jamais les données métier d'un autre compte), MFA TOTP, appareils de confiance, politique de mot de passe, journal de connexions, audit ; paramètres de tarification et catalogue de matières par utilisateur ; page Devis avec calcul en direct identique à la version bureau (lien vers « Comment le prix est calculé » du README de CalculateurPrix), enregistrement. **À venir** : lot 2 (historique, achats, finances), lot 3 (import G-code, impression PDF, import des données de l'application bureau).
3. **Installation** : prérequis Docker ; `cp .env.example .env`, générer les deux secrets avec `openssl rand -hex 32`, `docker compose up -d --build`, ouvrir `http://localhost:3000`, créer le premier admin.
4. **Développement** : Node 22, pnpm 9 ; `pnpm install`, `pnpm db:generate`, `pnpm --filter @calc3d/common run build`, `pnpm db:push`, `pnpm dev` (backend 3001, frontend 5173) ; `pnpm lint`, `pnpm typecheck`, `pnpm test`.
5. **Données et confidentialité** : SQLite dans le volume `calc3d-data` ; aucune connexion sortante du backend ; aucune ressource externe chargée par le frontend ; mots de passe hachés (bcrypt), secrets TOTP chiffrés avec `ENCRYPTION_KEY`.
6. **Licence**, **Changelog**, lien vers `docs/superpowers/specs/`.

- [ ] **Step 6: `CHANGELOG.md`**

```markdown
# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

## [0.1.0] - lot 1

### Ajouté
- Monorepo pnpm (`@calc3d/common`, `@calc3d/backend`, `@calc3d/frontend`), CI GitHub Actions, Docker Compose.
- Authentification reprise de MC Manager : installation du premier admin, login, MFA TOTP avec codes de secours, appareils de confiance, politique de mot de passe, changement de mot de passe forcé, journal de connexions, audit des actions d'administration. Rôles `admin` et `user`.
- Cloisonnement par utilisateur de toutes les données métier (`ownerScope`) ; un admin ne voit pas les données des autres comptes.
- Paramètres de tarification et catalogue de matières par utilisateur.
- Moteur de calcul `computeQuote` partagé navigateur/serveur, portage de `Invoke-Calcul` (CalculateurPrix 1.3.0), validé par des cas dorés.
- Page Devis : filament multi-matière, quatre postes de main d'œuvre, options de commande, résultat en direct, enregistrement avec instantané des paramètres.

### Sécurité
- `JWT_SECRET` et `ENCRYPTION_KEY` obligatoires (32 caractères minimum, différents), rôle rechargé en base à chaque requête, validation zod stricte des corps, 404 sur les ressources d'autrui, aucune ressource externe.
```

- [ ] **Step 7: `CLAUDE.md`**

Rédiger sur le modèle de `../Minecraft/CLAUDE.md`, en français, avec : vue d'ensemble (trois packages, tableau), commandes (celles du README, plus `pnpm --filter @calc3d/backend exec vitest run <fichier>`, `node packages/frontend/scripts/merge-i18n.mjs`), schéma Prisma (`schema.prisma` source de vérité, `migrations/` gitignoré, `db push` au démarrage du conteneur), architecture backend (ordre de démarrage de `index.ts`, `app.locals.prisma`, routes publiques puis `authMiddleware`, `ownerScope` obligatoire, 404 pour autrui, `AppError.code` stable : `validation`, `duplicate`, `pricing`), moteur de calcul (`computeQuote` dans `common`, cas dorés, « toute modification de la formule doit d'abord être faite dans CalculateurPrix puis reportée, avec de nouveaux cas dorés produits par PowerShell »), frontend (stores, `lib/number.ts` pour toute saisie numérique, `<select>` natifs dans les formulaires métier, i18n par fragments), invariants de sécurité (liste de la spec §9), tests (`testPrisma()`, `appAs()`/`createTestUser()` dans `test-users.ts`, trois cas propriétaire / autre / admin pour chaque route métier).

- [ ] **Step 8: Vérification finale du lot et commit**

Run (dans l'ordre de la CI) :
```bash
pnpm install --frozen-lockfile && pnpm audit --audit-level high && pnpm db:generate && pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker build -f Dockerfile.backend -t calc3d-backend-test . && docker build -f Dockerfile.frontend -t calc3d-frontend-test .
```
Expected: tout au vert. Si `pnpm audit` échoue sur un avis sans correctif amont et limité aux outils de build, l'ajouter dans `pnpm.auditConfig.ignoreGhsas` du `package.json` racine **et** le documenter dans `CLAUDE.md` (comme MC Manager).

Critère d'acceptation du lot 1 (spec §12) : le cas G1 saisi dans Calc3D-Web et dans CalculateurPrix avec les mêmes paramètres donne **114,31 €** des deux côtés. Noter le résultat de cette vérification manuelle dans le message de commit.

```bash
git add -A
git commit -m "Ajoute Docker Compose, README fr/en, CHANGELOG et CLAUDE.md (lot 1 complet)"
```

---

## Notes pour les lots suivants

- Lot 2 ajoute dans `quotes.routes.ts` : `GET /`, `GET /:id`, `PUT /:id` (recalcul avec `settingsSnapshot` sauf `?useCurrentSettings=1`), `PUT /:id/settings`, `POST /:id/convert`, `DELETE /:id` ; `purchases.routes.ts` ; `finances.routes.ts` ; pages `/history`, `/purchases`, `/finances` ; bouton « Mettre à jour » et bandeau « paramètres d'origine » dans `pages/Quote.tsx` (prévoir une prop `initial?: QuoteDto` sur `QuoteEditor`).
- Lot 3 ajoute `parseGcodeMetadata` dans `common`, la page `/quotes/:id/print` (réutilise `QuoteResultPanel` en mode client, sans mode de tarification ni marge), `POST /import/desktop` et la carte d'import dans Paramètres. Le bouton Exporter de la page Devis est alors activé après enregistrement.
- La route de langue utilisée est `PUT /api/auth/language` (héritée de MC Manager) et non `/me/language` comme l'écrit la spec §6 : la spec sera corrigée au lot 2 pour refléter l'existant.


