# Calc3D-Web : portage web multi-utilisateur du calculateur de prix impression 3D

Date : 2026-10-12
Statut : design validé en discussion, en attente de relecture de ce document

## 1. Objectif et contexte

Calc3D-Web est le portage web de `CalculateurPrix` (dépôt voisin `../CalculateurPrix`,
application de bureau Windows PowerShell + WPF, version 1.3.0). Il reprend toutes ses
fonctions : devis avec filament multi-matière, main d'œuvre, amortissement, usure,
arrondi, historique devis/commandes, achats réels, tableau de bord Finances, import
G-code, export PDF, interface français/anglais.

Il reprend **l'architecture et le module d'authentification de MC Manager**
(`../Minecraft`), lui-même issu de `ts6-manager` : monorepo pnpm, backend Express +
Prisma/SQLite, frontend React 18 / Vite / Tailwind / shadcn, JWT, Docker Compose.

### Ce que le partenaire a demandé

- Un dépôt totalement séparé de l'application bureau.
- Base de données locale, gestion des utilisateurs et des rôles « façon MC Manager /
  TS6 Manager ».
- Multi-utilisateur par conception : chaque utilisateur a ses propres devis, commandes,
  achats, finances et **ses propres paramètres**.
- Toutes les fonctions et tous les paramètres de l'application bureau.

### Arbitrages validés

1. « Devis/factures » désignait devis et commandes, comme dans l'application bureau.
   **Aucune facturation** (numérotation légale, mentions obligatoires) n'est prévue.
2. L'admin gère les comptes mais **ne voit jamais les données métier des autres
   utilisateurs** (devis, commandes, achats, paramètres, catalogue, finances).
3. Le module d'authentification de MC Manager est repris tel quel : MFA TOTP avec
   codes de secours, appareils de confiance, politique de mot de passe, changement de
   mot de passe forcé, journal des connexions, audit des actions d'admin. Sans SAML,
   sans Discord.

### Hypothèses retenues

- Auto-hébergement sur un hôte Docker, un seul conteneur backend et un conteneur
  frontend nginx, SQLite dans un volume. Pas de haute disponibilité.
- Pas d'inscription libre : le premier admin est créé par la page d'installation, les
  autres comptes par un admin.
- Les montants sont stockés en `Float` (comme les colonnes CSV actuelles) et arrondis à
  l'affichage ; la devise est un symbole libre par utilisateur, sans conversion.
- Le PDF reste une page HTML imprimable ouverte dans le navigateur (impression
  « Microsoft Print to PDF » ou équivalent), comme aujourd'hui. Pas de génération PDF
  côté serveur.
- Le G-code est analysé dans le navigateur ; le fichier n'est jamais envoyé au serveur.

### Hors périmètre

Facturation, paiement, envoi d'e-mails, synchronisation avec l'application bureau
(l'import de données est à sens unique, bureau vers web), gestion de plusieurs
imprimantes par utilisateur, partage de devis entre utilisateurs, API publique.

## 2. Architecture générale

Monorepo pnpm, nom de code `calc3d-web`, trois packages :

| Package | Nom npm | Rôle |
|---------|---------|------|
| `packages/backend` | `@calc3d/backend` | Express 4 + Prisma 6 / SQLite, auth JWT, routes métier, import bureau |
| `packages/frontend` | `@calc3d/frontend` | SPA React 18 / Vite 6 / Tailwind 3 / shadcn, TanStack Query 5, zustand 5, i18next (fr, en), react-router 6 |
| `packages/common` | `@calc3d/common` | Types et constantes partagés **et moteur de calcul de prix** (`computeQuote`), TypeScript pur sans dépendance |

Versions alignées sur MC Manager (Node 22 en CI et Docker, pnpm 9, TypeScript 5.9,
vitest 4, zod 3, pino, helmet, express-rate-limit). Structure de fichiers, scripts
`package.json`, `eslint.config.mjs`, `tsconfig.base.json`, Dockerfiles et workflow CI
repris de MC Manager et débarrassés de ce qui concerne Minecraft.

Le moteur de calcul vit dans `common` parce qu'il sert aux deux côtés : le navigateur
affiche le résultat en direct pendant la saisie, le serveur recalcule à
l'enregistrement et **sa valeur fait foi** (le client n'envoie que les entrées, jamais
les montants calculés).

## 3. Authentification, rôles et cloisonnement

### Repris de MC Manager sans changement fonctionnel

Backend : `middleware/auth.ts` (JWT avec revendication `typ` : `access`, `mfa`,
`pwchange` ; rôle et `enabled` rechargés en base à chaque requête), `middleware/rbac.ts`,
`middleware/error-handler.ts`, `routes/setup.routes.ts` (premier admin),
`routes/auth.routes.ts` (login, MFA, refresh avec rotation et détection de
réutilisation, logout, appareils de confiance, changement de mot de passe),
`routes/users.routes.ts` (CRUD des comptes par l'admin, activer/désactiver, exiger la
MFA, forcer le changement de mot de passe, réinitialiser le mot de passe),
`routes/audit.routes.ts`, `routes/journal.routes.ts`, `auth/session.ts`,
`auth/web-login-journal.ts`, `utils/{crypto,mfa,trusted-device,trusted-device-service,
validate-password,logger,pagination,geo}.ts`, et les modèles Prisma `User`,
`RefreshToken`, `TrustedDevice`, `AppSetting`, `AuditLog`, `WebLogin`.

Frontend : `pages/{Login,SetupPage,Audit,Journal}.tsx`, l'onglet Utilisateurs et la
carte Sécurité de `pages/Settings.tsx`, `components/layout/*`, `stores/auth.store.ts`,
`stores/ui.store.ts`, `lib/*`, le client HTTP avec rafraîchissement du jeton, le
mécanisme i18n (`scripts/i18n-fragments/`, `merge-i18n.mjs`).

Réglages d'instance (`AppSetting`) conservés : `password.minLength`,
`password.requireComplexity`, `journal.retentionDays`.

### Adaptations

- Les rôles sont `admin` et `user` (renommage de `viewer`, qui n'a pas de sens ici).
  Un `user` a tous les droits sur ses propres données. Un `admin` a en plus la gestion
  des comptes, la politique de sécurité, l'audit et le journal de connexions.
- **Un admin est aussi un utilisateur** : il a ses propres paramètres, devis et achats.
- `User.language` (déjà présent) devient la langue de l'interface de l'utilisateur ;
  elle est aussi utilisée pour le PDF.

### Règle de cloisonnement (invariant central)

Toute table métier porte un `userId`. Toute route métier :

1. est montée derrière `authMiddleware` ;
2. lit `req.user.id` et **filtre systématiquement** par ce `userId` dans chaque requête
   Prisma (lecture, écriture, suppression, agrégation) ;
3. répond **404** quand la ressource demandée existe mais appartient à quelqu'un
   d'autre, pour ne pas révéler son existence ;
4. n'offre **aucun paramètre** permettant de viser un autre `userId`, y compris pour
   un admin. Il n'existe pas de route « toutes les données » ni de tableau de bord
   global.

Un helper `ownerScope(req)` renvoie `{ userId: req.user.id }` et doit être utilisé dans
chaque `where`. Un test par route vérifie qu'un utilisateur B ne lit ni ne modifie une
ressource de A (404), et qu'un admin n'y accède pas davantage.

L'audit ne concerne que les actions d'administration des comptes et des réglages
d'instance. Les actions métier (créer un devis, etc.) ne sont pas auditées et le
détail d'un `AuditLog` ne contient jamais de donnée métier.

La suppression d'un compte supprime en cascade toutes ses données métier
(`onDelete: Cascade`), après confirmation explicite côté UI avec saisie du nom
d'utilisateur.

## 4. Modèle de données

Modèles ajoutés à `schema.prisma`, tous rattachés à `User` par `userId` avec
`onDelete: Cascade`.

### `UserSettings` (1 pour 1 avec `User`, créé au premier accès avec les valeurs par défaut)

Transposition de `config.json` de l'application bureau :

| Champ | Type | Défaut | Origine bureau |
|-------|------|--------|----------------|
| `currencySymbol` | String | `€` | `DeviseSymbole` |
| `electricityPricePerKwh` | Float | 0.1952 | `PrixElectriciteKwh` |
| `printerPowerW` | Float | 1350 | `PuissanceImprimanteW` |
| `averageLoadPct` | Float | 40 | `ChargeMoyennePct` |
| `hourlyRatePreparation` | Float | 12.31 | `TarifHorairePreparation` |
| `hourlyRatePostProcessing` | Float | 12.31 | `TarifHorairePostTraitement` |
| `hourlyRateDesign` | Float | 12.31 | `TarifHoraireConception` |
| `hourlyRatePackaging` | Float | 12.31 | `TarifHoraireEmballage` |
| `pricingMode` | String (`MARKUP` / `TARGET_MARGIN`) | `MARKUP` | `ModeTarification` (`Markup` / `MargeCible`) |
| `pricingPct` | Float | 20 | `PourcentageTarification` |
| `contingencyPct` | Float | 10 | `TauxAleasPct` |
| `vatPct` | Float | 0 | `TvaPct` |
| `printerPurchasePrice` | Float | 2717 | `AmortissementPrixAchat` |
| `printerLifetimeHours` | Float | 6000 | `AmortissementDureeVieHeures` |
| `maintenancePct` | Float | 5 | `MaintenancePct` |
| `wearCostPerHour` | Float | 0 | `UsureParHeureEUR` |
| `defaultFixedCosts` | Float | 0 | `AutresCoutsFixesDefaut` |
| `floorPrice` | Float | 5 | `PrixPlancherEUR` |
| `roundToEuro` | Boolean | false | `ArrondirEuro` |
| `pdfShowCostBreakdown` | Boolean | true | `PdfDetailCouts` |

La langue n'est pas ici : elle est sur `User.language`.

### `Material`

`id`, `userId`, `name` (unique par utilisateur), `pricePerKg` Float, `sortOrder` Int.
Catalogue par défaut créé avec `UserSettings` : PLA 18, PETG 20, ABS 19, ASA 22,
TPU 25, Nylon (PA) 35, PA-CF 45, PETG-CF 30, PC 35, PVB 20, Autre 20.

### `Quote`

Une ligne par devis ou commande, équivalent d'une ligne de `historique.csv`. Les
**entrées** sont stockées en colonnes, les **résultats** aussi (pour l'historique et
les finances sans recalcul), et l'**instantané des paramètres** en JSON.

| Groupe | Champs |
|--------|--------|
| Identité | `id` (Int autoincrement), `userId`, `createdAt`, `updatedAt`, `legacyId` String? (GUID de l'import bureau, unique par utilisateur) |
| Projet | `projectName`, `customer`, `kind` (`QUOTE` / `ORDER`), `status` (`PENDING`, `SCHEDULED`, `IN_PROGRESS`, `DONE`, `ON_HOLD`), `dueDate` DateTime?, `quantity` Int, `comment` |
| Entrées | `filamentLines` Json `[{ material, weightG, pricePerKg, wastePct }]`, `printHours` Int, `printMinutes` Int, `prepHours`, `postHours`, `designHours`, `packagingHours`, `consumables`, `discountPct`, `shippingCost` |
| Résultats | `filamentWeightG`, `filamentCost`, `printTimeH`, `energyKwh`, `electricityCost`, `laborPrep`, `laborPost`, `laborDesign`, `laborPackaging`, `depreciation`, `maintenance`, `wear`, `fixedCosts`, `subtotal`, `contingency`, `costAfterContingency`, `unitPriceExclTax`, `totalExclTax`, `discountAmount`, `vatAmount`, `priceBeforeFloor`, `floorApplied` Boolean, `priceBeforeRounding`, `roundingAmount`, `finalPrice`, `pricePerGram`, `pricePerHour` |
| Instantané | `settingsSnapshot` Json : la totalité de `UserSettings` au moment du calcul (hors `pdfShowCostBreakdown`) |

Index : `(userId, createdAt)`, `(userId, kind)`, `(userId, status)`.

Les valeurs canoniques passent du français (`En attente`, `Commande`, ...) à des clés
stables en anglais, traduites à l'affichage par i18next. La correspondance exacte est
dans `@calc3d/common` (`QUOTE_STATUSES`, `QUOTE_KINDS`, `PURCHASE_CATEGORIES`,
`PRICING_MODES`) et sert aussi à l'import bureau.

### `Purchase`

`id`, `userId`, `date` DateTime, `category` (`FILAMENT`, `SPARE_PARTS`, `MAINTENANCE`,
`HARDWARE`, `TOOLS`, `OTHER`), `description`, `amount` Float, `supplier`, `comment`,
`legacyId` String?, `createdAt`. Index `(userId, date)`.

## 5. Moteur de calcul `@calc3d/common`

`computeQuote(settings: PricingSettings, input: QuoteInput): QuoteResult`, fonction
pure, portage ligne à ligne de `Invoke-Calcul` (Calculateur3D.ps1) :

1. Filament = Σ (poids/1000 × prix/kg × (1 + pertes/100)) sur les lignes de poids > 0.
2. Électricité = puissance × charge/100 / 1000 × durée × prix kWh.
3. Main d'œuvre = Σ temps × tarif pour les quatre postes.
4. Amortissement = prix d'achat × durée / durée de vie ; maintenance = idem × %/100 ;
   usure = coût horaire × durée.
5. Coûts fixes = coûts fixes par défaut + consommables saisis.
6. Sous-total, majoration aléas, coût après majoration.
7. Prix de vente HT unitaire : `MARKUP` → coût × (1 + %), `TARGET_MARGIN` →
   coût / (1 − %). Un pourcentage de marge cible ≥ 100 est rejeté par la validation.
8. Total = unitaire × quantité ; remise ; port ; TVA.
9. Prix plancher si le total est inférieur.
10. Arrondi à l'euro supérieur si activé : `ceil(round(prix, 2))`, écart exposé, et
    `roundingApplied` seulement si l'écart est > 0.
11. Prix au gramme et à l'heure sur le prix HT unitaire.

Tests : un jeu de cas « dorés » dont les valeurs attendues sont produites par la
version PowerShell (y compris les scénarios du script de test de ce matin : 12,3 → 13,
12 reste 12, plancher 5,5 puis arrondi → 6, config sans les champs 1.3). Tolérance
0,0001.

`common` expose aussi `parseGcodeMetadata(text: string)` (portage de
`Import-GcodeMetadonnees` : PrusaSlicer, OrcaSlicer, Bambu Studio, Cura ; durée,
poids par matière, nom de matière nettoyé et plafonné) avec ses tests sur des extraits
de G-code, et les tables de correspondance de l'import bureau.

## 6. API REST

Toutes les routes sous `/api`, JSON, validées par zod. Routes publiques : `/health`,
`/setup`, `/auth/*`. Tout le reste derrière `authMiddleware`. Routes d'admin derrière
`rbac('admin')` et auditées. Les routes métier appliquent `ownerScope`.

| Méthode et route | Rôle | Lot | Description |
|------------------|------|-----|-------------|
| `GET/PUT /settings` | user | 1 | Paramètres de l'utilisateur courant (création à la volée) |
| `GET/POST /materials`, `PUT/DELETE /materials/:id` | user | 1 | Catalogue de matières |
| `POST /quotes/preview` | user | 1 | Calcule sans enregistrer (sert de référence au client ; le client calcule aussi en local) |
| `GET /quotes` | user | 2 | Liste paginée, filtres `q` (projet/client), `kind`, `status`, tri par date |
| `POST /quotes` | user | 1 | Crée : entrées + instantané des paramètres courants, calcul serveur |
| `GET /quotes/:id` | user | 2 | Détail avec instantané |
| `PUT /quotes/:id` | user | 2 | Met à jour les entrées ; recalcul **avec l'instantané du devis**, sauf `?useCurrentSettings=1` |
| `PUT /quotes/:id?useCurrentSettings=1` | user | 2 | Variante de la mise à jour : remplace l'instantané par les paramètres courants (couvre le besoin de `PUT /quotes/:id/settings`, reporté : une édition champ par champ de l'instantané sera ajoutée si le besoin apparaît) |
| `POST /quotes/:id/convert` | user | 2 | `QUOTE` → `ORDER` (409 si déjà une commande) |
| `DELETE /quotes/:id` | user | 2 | Suppression |
| `GET/POST /purchases`, `PUT/DELETE /purchases/:id` | user | 2 | Achats, filtres `q`, `category` |
| `GET /finances?period=all\|12m\|year\|month` | user | 2 | Indicateurs, répartition par poste, évolution mensuelle (12 derniers mois), répartition des achats, comparatif |
| `POST /import/desktop` | user | 3 | Import de `config.json`, `historique.csv`, `achats.csv` (multipart, 5 Mo max par fichier) |
| `PUT /auth/language` | user | 1 | Langue de l'interface (route héritée de MC Manager) |
| `/users`, `/audit`, `/journal`, `/settings/security` | admin | 1 | Repris de MC Manager |

Le `PUT /quotes/:id` conserve la sémantique bureau : un devis rechargé est recalculé
avec les tarifs de sa création, pas ceux d'aujourd'hui, et le bouton devient « Mettre à
jour ». L'instantané lui-même peut être modifié par la page Paramètres en « mode devis
chargé » : reporté, remplacé par l'interrupteur « Recalculer avec mes paramètres actuels » (`?useCurrentSettings=1`) de la page Devis.

## 7. Frontend

Routes : `/login`, `/setup`, `/` (Devis), `/history`, `/purchases`, `/finances`,
`/settings` (onglets Paramètres, Catalogue, Compte ; onglets Utilisateurs, Sécurité,
Audit, Journal pour l'admin), `/quotes/:id/print` (page PDF).

- **Devis** : formulaire identique à la page bureau (informations projet, grille
  filament éditable, temps, options, commentaire), résultat recalculé **à chaque
  frappe** par `computeQuote` de `common` avec les paramètres chargés ; les boutons
  Enregistrer / Mettre à jour / Exporter / Nouveau. Un bandeau signale un devis chargé
  depuis l'historique (paramètres d'origine).
- **Import G-code** : `<input type="file" multiple>`, lecture par `FileReader`,
  `parseGcodeMetadata`, cumul des durées et poids, résolution de la matière détectée
  contre le catalogue (même logique que `Resolve-MatiereGcode`).
- **Historique** et **Achats** : tableaux groupés par mois, repliables, recherche et
  filtres, actions (charger, convertir, supprimer avec confirmation). Pagination côté
  serveur par mois.
- **Finances** : indicateurs et barres proportionnelles reprenant les cinq blocs de la
  page bureau ; graphiques en composants shadcn/Tailwind simples (barres horizontales),
  pas de bibliothèque de graphiques.
- **Page d'impression** `/quotes/:id/print` : rendu HTML équivalent à `Export-DevisHtml`
  (infos client, détail des matières, section détail du coût de revient si l'option est
  active, tarification, arrondi, prix final, note plancher, commentaire), appel de
  `window.print()` au chargement, feuille de style `@media print`. Le mode de
  tarification et la marge n'y figurent jamais.
- **Paramètres** : formulaire de `UserSettings`, catalogue de matières, langue, carte
  Import depuis l'application bureau (lot 3), compte (mot de passe, MFA, appareils de
  confiance).
- i18n : `fr.json` et `en.json` via fragments et `merge-i18n.mjs` ; `Intl.NumberFormat`
  avec la locale de l'utilisateur pour les montants (fr-FR : `1 234,56`).

## 8. Import depuis l'application bureau (lot 3)

- `config.json` → `UserSettings` et `Material` (remplacement, après confirmation).
- `historique.csv` → `Quote` : correspondance colonne par colonne, valeurs françaises
  converties en clés (`Termine` → `DONE`, `Commande` → `ORDER`, `MargeCible` →
  `TARGET_MARGIN`), colonnes `Cfg*` → `settingsSnapshot` (champs 1.3 absents → 0 /
  false), `LignesFilamentJson` → `filamentLines`, retrait du préfixe `'` de protection
  CSV sur `Projet`, `Client`, `Commentaire`. `Id` → `legacyId` : un second import ne
  crée pas de doublon (upsert par `(userId, legacyId)`).
- `achats.csv` → `Purchase`, même principe.
- Les montants importés sont repris tels quels (pas de recalcul) pour que l'historique
  reste fidèle. Un rapport d'import (créés, mis à jour, lignes rejetées avec motif)
  est renvoyé et affiché.
- Encodage : UTF-8 avec ou sans BOM ; séparateur `,` avec guillemets (format
  `Export-Csv`) ; dates `yyyy-MM-dd HH:mm` et `yyyy-MM-dd`.

## 9. Sécurité (invariants à ne pas casser)

- `JWT_SECRET` et `ENCRYPTION_KEY` obligatoires, 32 caractères minimum, différents.
- JWT avec `typ` vérifié ; rôle et `enabled` rechargés en base à chaque requête.
- Cloisonnement par `ownerScope` sur chaque requête Prisma métier ; 404 pour les
  ressources d'autrui ; aucune route d'accès global ; testé pour chaque route.
- Validation zod de toutes les entrées ; bornes numériques (pas de négatif sauf
  remise 0 à 100, marge cible < 100, quantité ≥ 1).
- Page d'impression : tout texte libre est échappé par React ; aucune insertion de HTML
  brut (`dangerouslySetInnerHTML` interdit).
- Import bureau : taille limitée, analyse en mémoire par un parseur CSV strict, aucune
  exécution, aucune écriture hors base.
- helmet, CORS limité à `FRONTEND_URL`, rate limiting sur `/auth/*` et `/setup`.
- Aucun appel réseau sortant du backend. Aucune police ni ressource externe chargée par
  le frontend (à documenter dans la section Confidentialité du README).

## 10. Déploiement et CI

- `.env.example` : `PORT`, `DATABASE_URL=file:./data/calc3d.db`, `JWT_SECRET`,
  `ENCRYPTION_KEY`, `JWT_ACCESS_EXPIRY=15m`, `JWT_REFRESH_EXPIRY=7d`, `FRONTEND_URL`,
  `FRONTEND_PORT`.
- `docker-compose.yml` : `backend` (Node 22 slim, `prisma db push --skip-generate` puis
  `node dist/index.js`, volume `calc3d-data`), `frontend` (nginx, proxy `/api` vers
  `backend:3001`). `docker compose up -d --build`.
- `schema.prisma` est la source de vérité ; pas d'historique de migrations dans le
  dépôt (même convention que MC Manager).
- CI GitHub Actions : `pnpm install --frozen-lockfile`, `pnpm audit --audit-level high`,
  `db:generate`, build de `common`, lint, typecheck, test, build, build des deux
  Dockerfiles.

## 11. Tests

- `common` : moteur de calcul (cas dorés), parseur G-code, tables de correspondance.
- Backend (vitest, `testPrisma()` sur SQLite temporaire) : chaque route métier avec les
  trois cas propriétaire / autre utilisateur / admin, calcul serveur à l'enregistrement,
  recalcul avec instantané, finances sur un jeu de données connu, import bureau sur des
  fichiers d'exemple (dont le format 1.2 sans les colonnes 1.3).
- Frontend (vitest + Testing Library) : formulaire Devis (résultat en direct), page
  d'impression (présence et absence des lignes selon l'option), import G-code sur un
  fichier d'exemple, garde de rôle sur les pages admin.

## 12. Découpage en lots et critères d'acceptation

**Lot 1 : socle, comptes, paramètres, devis.** Monorepo opérationnel, CI verte,
Docker Compose qui démarre. Installation du premier admin, login, MFA, gestion des
comptes. Page Paramètres et catalogue. Page Devis complète avec calcul en direct,
enregistrement et bouton Nouveau. Critère : un devis saisi dans Calc3D-Web et dans
l'application bureau avec les mêmes paramètres donne le même prix au centime.

**Lot 2 : historique, achats, finances** (implémenté, branche `lot2-historique-finances`). Liste, filtres, chargement d'un devis avec
ses paramètres d'origine, mise à jour sans doublon, conversion en commande, suppression.
Achats. Finances avec les cinq blocs. Critère : les indicateurs Finances d'un jeu de
données importé correspondent à ceux de l'application bureau.

**Lot 3 : import G-code, impression PDF, import bureau.** Critère : `historique.csv`
et `achats.csv` réels importés sans rejet, un devis rechargé reproduit son prix
d'origine, le PDF reprend les mêmes sections que la version bureau.

Chaque lot a son plan dans `docs/superpowers/plans/` et sa branche.

## 13. Points ouverts

Aucun bloquant. À trancher pendant le lot 1 sans impact sur le design : nom affiché de
l'application et icône, thème sombre (MC Manager en a un, repris si le coût est nul).
