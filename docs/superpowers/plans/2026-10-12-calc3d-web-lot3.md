# Calc3D-Web lot 3 : import G-code, impression PDF, import des données bureau — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduire les trois dernières fonctions de l'application bureau : remplir un devis depuis un ou plusieurs fichiers G-code (durée, poids par matière, matière résolue contre le catalogue), imprimer ou exporter un devis en PDF avec la même mise en page que `Export-DevisHtml` (détail du coût de revient selon l'option), et importer `config.json`, `historique.csv`, `achats.csv` de l'application bureau dans le compte de l'utilisateur, de façon idempotente.

**Architecture:** Le parseur G-code `parseGcodeMetadata` est une fonction pure dans `@calc3d/common` (portage de `Import-GcodeMetadonnees`), exécutée **dans le navigateur** : le fichier n'est jamais envoyé au serveur. La page d'impression `/quotes/:id/print` est une page React sans mise en page applicative, qui appelle `window.print()`. L'import bureau est côté serveur (`POST /api/import/desktop`, corps JSON avec le texte des trois fichiers, limite 20 Mo) : un parseur CSV strict du format `Export-Csv`, des tables de correspondance français → clés dans `common`, un service idempotent par `legacyId`, et un rapport renvoyé au client.

**Tech Stack:** identique aux lots 1 et 2. Aucune nouvelle dépendance (pas de multer : le client lit les fichiers avec `FileReader` et envoie leur texte).

**Spec:** `docs/superpowers/specs/2026-10-12-calc3d-web-design.md` (§5 G-code, §7 page d'impression, §8 import bureau, §12 critères du lot 3)

## Global Constraints

- Toutes les contraintes des lots 1 et 2 restent en vigueur (versions, `ownerScope`, 404 pour autrui, aucun montant accepté du client **sauf pour l'import bureau**, où les montants enregistrés par l'application bureau sont repris tels quels pour que l'historique reste fidèle, spec §8).
- Le G-code n'est jamais envoyé au serveur ; `parseGcodeMetadata` ne reçoit qu'une chaîne (début + fin du fichier, 200 000 octets chacun, comme `Read-GcodeChunk`).
- La page d'impression n'affiche **jamais** le mode de tarification ni le pourcentage de marge ; le détail du coût de revient dépend de `pdfShowCostBreakdown` des paramètres courants ; tout texte libre est rendu par React (jamais de `dangerouslySetInnerHTML`).
- Import bureau : UTF-8 avec ou sans BOM, séparateur `,`, guillemets doublés, en-tête obligatoire ; colonnes absentes (format 1.2) → valeurs par défaut (0, `false`) ; `Id` → `legacyId`, un second import met à jour sans doublon ; préfixe `'` de `Protect-CsvTexte` retiré sur `Projet`, `Client`, `Commentaire`, `Description`, `Fournisseur` ; lignes rejetées listées avec leur numéro et le motif, jamais d'abandon global pour une ligne invalide.
- `pnpm lint && pnpm typecheck && pnpm test` au vert et un commit à la fin de chaque tâche.

## Review Focus

1. **G-code multi-matière Bambu/Orca** : `; filament_type = PLA;PETG` et `; total filament weight [g] : 12.3, 4.5` donnent deux lignes, poids cumulés par matière sur plusieurs fichiers ; un fichier sans métadonnée est signalé, pas ignoré en silence. Tests dans les tâches 1 et 3.
2. **Nom de matière inconnu dans le G-code** (`PLA [Basic]`) : résolu contre le catalogue par égalité puis inclusion insensibles à la casse, sinon **ajouté au catalogue** à 20 €/kg (comme `Resolve-MatiereGcode`), nom nettoyé et plafonné à 60 caractères. Tests dans la tâche 3.
3. **Impression** : un devis chargé par `/quotes/:id/print` qui n'appartient pas à l'utilisateur affiche « introuvable » ; avec `pdfShowCostBreakdown` désactivé, aucune ligne de coût interne n'apparaît ; le prix final affiché est celui enregistré, pas un recalcul. Tests dans la tâche 4.
4. **CSV hostile ou abîmé** : champ avec virgule et guillemets, ligne tronquée, montant « 12,5 » (virgule décimale de `Export-Csv` en culture fr), `Type` vide (ancien format), date invalide → la ligne est rejetée avec motif, les autres passent. Tests dans la tâche 2.
5. **Réimport** : importer deux fois les mêmes fichiers ne crée aucun doublon et met à jour les lignes modifiées ; le catalogue est remplacé par celui de `config.json` sans casser les devis existants (le nom de matière d'un devis est du texte). Tests dans la tâche 2.

---

## Structure des fichiers

`packages/common/src/` :
- `gcode/parse-gcode.ts` (+ test) : `parseGcodeMetadata(text): GcodeMetadata`, `GCODE_CHUNK_BYTES`.
- `desktop/mappings.ts` : `DESKTOP_KIND`, `DESKTOP_STATUS`, `DESKTOP_CATEGORY`, `DESKTOP_PRICING_MODE`, `unprotectCsvText`.
- `types/import.ts` : `DesktopImportBody`, `DesktopImportReport`.
- `index.ts`.

`packages/backend/src/` :
- `import/csv.ts` (+ test) : `parseCsv(text): { header: string[]; rows: { line: number; cells: string[] }[]; errors: { line: number; reason: string }[] }`.
- `import/zoned-time.ts` (+ test) : `zonedLocalToUtc(dateTime, timeZone): Date`.
- `import/desktop-import.ts` (+ test) : `importDesktopData(prisma, userId, body, timeZone): Promise<DesktopImportReport>`.
- `routes/import.routes.ts` (+ test), `app.ts`.

`packages/frontend/src/` :
- `lib/gcode-files.ts` (+ test) : `readGcodeChunks(file): Promise<string>`, `resolveMaterialName(name, catalog)`.
- `components/quote/GcodeImportButton.tsx` (+ test).
- `pages/QuotePrint.tsx` (+ test), route `/quotes/:id/print` hors `AppLayout` (mais authentifiée).
- `components/settings/DesktopImportCard.tsx` (+ test), onglet « Import » de `pages/Settings.tsx`.
- `api/import.api.ts`, `pages/Quote.tsx` (bouton Exporter), `App.tsx`.
- `scripts/i18n-fragments/{gcode,print,desktop-import}.json`.

Docs : `README*.md`, `CHANGELOG.md` (0.3.0), `CLAUDE.md`, spec §12.

---

### Task 1: `@calc3d/common` — parseur G-code, tables de correspondance bureau, types d'import

**Files:**
- Create: `packages/common/src/gcode/parse-gcode.ts`, `packages/common/src/gcode/parse-gcode.test.ts`, `packages/common/src/desktop/mappings.ts`, `packages/common/src/desktop/mappings.test.ts`, `packages/common/src/types/import.ts`
- Modify: `packages/common/src/index.ts`

**Interfaces:**
- Produces: `GCODE_CHUNK_BYTES = 200_000` ; `GcodeMetadata { printMinutes: number | null; materials: { material: string; weightG: number }[] }` ; `parseGcodeMetadata(text: string): GcodeMetadata` ; `DESKTOP_KIND: Record<string, QuoteKind>`, `DESKTOP_STATUS`, `DESKTOP_CATEGORY`, `DESKTOP_PRICING_MODE` ; `unprotectCsvText(s)` ; `DesktopImportBody { config?: string; historique?: string; achats?: string }` ; `DesktopImportReport`.

- [ ] **Step 1: Test du parseur (échoue)**

`packages/common/src/gcode/parse-gcode.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { parseGcodeMetadata } from './parse-gcode.js';

describe('parseGcodeMetadata', () => {
  it('PrusaSlicer : durée « estimated printing time (normal mode) », poids [g] et type', () => {
    const t = `; generated by PrusaSlicer\n; filament used [mm] = 5123.4\n; filament used [g] = 15.28\n; filament_type = PETG\n; estimated printing time (normal mode) = 1h 32m 10s\n`;
    expect(parseGcodeMetadata(t)).toEqual({ printMinutes: 92, materials: [{ material: 'PETG', weightG: 15.28 }] });
  });
  it('OrcaSlicer / Bambu multi-matière : total estimated time, total filament weight [g] avec virgules, filament_type avec ;', () => {
    const t = `; total estimated time: 2d 3h 5m 30s\n; total filament weight [g] : 12.3, 4.5\n; filament_type = PLA;PETG\n`;
    expect(parseGcodeMetadata(t)).toEqual({ printMinutes: 2 * 1440 + 185 + 1, materials: [{ material: 'PLA', weightG: 12.3 }, { material: 'PETG', weightG: 4.5 }] });
  });
  it('Cura : ;TIME: en secondes et longueur en mètres → poids estimé par densité PLA', () => {
    const t = `;FLAVOR:Marlin\n;TIME:5400\n;Filament used: 1.5m\n;MATERIAL:PLA\n`;
    const r = parseGcodeMetadata(t);
    expect(r.printMinutes).toBe(90);
    // volume = π·0.0875²·150 cm ≈ 3.608 cm³ × 1.24 = 4.5 g
    expect(r.materials).toEqual([{ material: 'PLA', weightG: 4.5 }]);
  });
  it('longueur [mm] sans poids : densité choisie selon le type (PETG 1.27)', () => {
    const t = `; filament used [mm] = 1000\n; filament_type = PETG\n`;
    expect(parseGcodeMetadata(t).materials).toEqual([{ material: 'PETG', weightG: 3.1 }]);
  });
  it('un seul type pour plusieurs poids : le type est repris ; aucun type : PLA', () => {
    expect(parseGcodeMetadata(`; total filament weight [g] : 1, 2\n; filament_type = ASA\n`).materials).toEqual([{ material: 'ASA', weightG: 1 }, { material: 'ASA', weightG: 2 }]);
    expect(parseGcodeMetadata(`; filament used [g] = 7\n`).materials).toEqual([{ material: 'PLA', weightG: 7 }]);
  });
  it('rien de reconnu : durée null, aucune matière ; la durée seule est acceptée', () => {
    expect(parseGcodeMetadata('G1 X10 Y10\n')).toEqual({ printMinutes: null, materials: [] });
    expect(parseGcodeMetadata('; model printing time: 45m\n')).toEqual({ printMinutes: 45, materials: [] });
  });
});
```

Run: `pnpm --filter @calc3d/common exec vitest run src/gcode` → FAIL.

- [ ] **Step 2: Implémenter le parseur**

`packages/common/src/gcode/parse-gcode.ts` :
```ts
/** Taille lue en tête et en queue de fichier par le navigateur (même valeur que Read-GcodeChunk). */
export const GCODE_CHUNK_BYTES = 200_000;

export interface GcodeMetadata { printMinutes: number | null; materials: { material: string; weightG: number }[] }

const DENSITIES: [string, number][] = [['PLA', 1.24], ['PETG', 1.27], ['ABS', 1.04], ['ASA', 1.07], ['TPU', 1.21], ['NYLON', 1.14], ['PA', 1.14], ['PC', 1.2], ['PVB', 1.09]];
const num = (s: string) => { const n = Number(s.trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const list = (s: string, sep: RegExp) => s.split(sep).map((x) => num(x)).filter((x) => x > 0);

/**
 * Portage de Import-GcodeMetadonnees (Calculateur3D.ps1) : durée et poids par matière depuis les commentaires
 * des slicers courants (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura). Le texte est celui des 200 ko de tête
 * et de queue du fichier, concaténés par le navigateur.
 */
export function parseGcodeMetadata(text: string): GcodeMetadata {
  // --- Durée ---
  let printMinutes: number | null = null;
  const dur = '(?:(\\d+)d\\s*)?(?:(\\d+)h\\s*)?(?:(\\d+)m\\s*)?(?:(\\d+)s\\s*)?';
  for (const label of ['total\\s+estimated\\s+time', 'estimated printing time \\(normal mode\\)', 'model\\s+printing\\s+time']) {
    const m = new RegExp(`${label}\\s*[:=]\\s*${dur}`, 'i').exec(text);
    if (m && (m[1] || m[2] || m[3] || m[4])) {
      const [d, h, mi, s] = [m[1], m[2], m[3], m[4]].map((x) => (x ? Number(x) : 0));
      printMinutes = d * 1440 + h * 60 + mi + Math.round(s / 60);
      break;
    }
  }
  if (printMinutes === null) {
    const cura = /^;TIME:(\d+)/im.exec(text);
    if (cura) printMinutes = Math.round(Number(cura[1]) / 60);
  }

  // --- Types de matière ---
  const typeMatch = /^;\s*filament_type\s*=\s*(.+)$/im.exec(text);
  const types = typeMatch ? typeMatch[1].split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];

  // --- Poids [g], sinon longueur convertie par densité ---
  let weights: number[] = [];
  const w = /^;\s*(?:total\s+filament\s+weight|(?:total\s+)?filament\s+used)\s*\[g\]\s*[:=]\s*(.+)$/im.exec(text);
  if (w) weights = list(w[1], /[,;]/);
  if (weights.length === 0) {
    let lengthsMm: number[] = [];
    const lmm = /^;\s*(?:total\s+filament\s+length|(?:total\s+)?filament\s+used)\s*\[mm\]\s*[:=]\s*(.+)$/im.exec(text);
    if (lmm) lengthsMm = list(lmm[1], /[,;]/);
    else {
      const lm = /^;\s*Filament\s+used\s*:\s*(.+)$/im.exec(text);
      if (lm) lengthsMm = lm[1].split(',').map((p) => { const mm = /([\d.]+)\s*m\b/.exec(p); return mm ? Number(mm[1]) * 1000 : 0; }).filter((x) => x > 0);
    }
    weights = lengthsMm.map((mm, i) => {
      let density = 1.24;
      const key = (types[i] ?? '').toUpperCase();
      for (const [k, d] of DENSITIES) { if (key.includes(k)) { density = d; break; } }
      const r = 0.0875; // rayon d'un filament 1,75 mm en cm
      return Math.round(Math.PI * r * r * (mm / 10) * density * 10) / 10;
    });
  }

  const materials = weights.map((weightG, i) => ({ material: types[i] ?? (types.length === 1 ? types[0] : 'PLA'), weightG }));
  return { printMinutes, materials };
}
```

Run: `pnpm --filter @calc3d/common exec vitest run src/gcode` → PASS, 6 tests. Si le cas Cura donne 4.4 ou 4.6, vérifier le calcul : π × 0,0875² × 150 × 1,24 = 4,4737… → arrondi 4,5.

- [ ] **Step 3: Tables de correspondance et types d'import (test puis code)**

`packages/common/src/desktop/mappings.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { DESKTOP_KIND, DESKTOP_STATUS, DESKTOP_CATEGORY, DESKTOP_PRICING_MODE, unprotectCsvText } from './mappings.js';

describe('correspondances bureau → clés', () => {
  it('traduit les valeurs françaises canoniques des CSV', () => {
    expect(DESKTOP_KIND['Commande']).toBe('ORDER'); expect(DESKTOP_KIND['Devis']).toBe('QUOTE');
    expect(DESKTOP_STATUS['Termine']).toBe('DONE'); expect(DESKTOP_STATUS['En pause']).toBe('ON_HOLD'); expect(DESKTOP_STATUS['Programme']).toBe('SCHEDULED');
    expect(DESKTOP_CATEGORY['Pieces detachees']).toBe('SPARE_PARTS'); expect(DESKTOP_CATEGORY['Autre']).toBe('OTHER');
    expect(DESKTOP_PRICING_MODE['MargeCible']).toBe('TARGET_MARGIN'); expect(DESKTOP_PRICING_MODE['Markup']).toBe('MARKUP');
  });
  it('unprotectCsvText retire le préfixe de protection contre les formules, et lui seul', () => {
    expect(unprotectCsvText("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(unprotectCsvText("'-5")).toBe('-5');
    expect(unprotectCsvText("'Bonjour")).toBe("'Bonjour");
    expect(unprotectCsvText('Normal')).toBe('Normal');
  });
});
```

`packages/common/src/desktop/mappings.ts` :
```ts
import type { PricingMode, PurchaseCategory, QuoteKind, QuoteStatus } from '../constants.js';

/** Valeurs canoniques françaises de historique.csv / achats.csv / config.json de l'application bureau. */
export const DESKTOP_KIND: Record<string, QuoteKind> = { Devis: 'QUOTE', Commande: 'ORDER' };
export const DESKTOP_STATUS: Record<string, QuoteStatus> = { 'En attente': 'PENDING', Programme: 'SCHEDULED', 'En cours': 'IN_PROGRESS', Termine: 'DONE', 'En pause': 'ON_HOLD' };
export const DESKTOP_CATEGORY: Record<string, PurchaseCategory> = { 'Filament / Consommables': 'FILAMENT', 'Pieces detachees': 'SPARE_PARTS', 'Maintenance / Reparation': 'MAINTENANCE', 'Materiel / Equipement': 'HARDWARE', Outillage: 'TOOLS', Autre: 'OTHER' };
export const DESKTOP_PRICING_MODE: Record<string, PricingMode> = { Markup: 'MARKUP', MargeCible: 'TARGET_MARGIN' };

/** Inverse de Protect-CsvTexte : retire l'apostrophe ajoutée devant = + @ - tabulation. */
export function unprotectCsvText(s: string): string {
  return /^'[=+@\t\r-]/.test(s) ? s.slice(1) : s;
}
```

`packages/common/src/types/import.ts` :
```ts
export interface DesktopImportBody { config?: string; historique?: string; achats?: string }
export interface ImportRejection { line: number; reason: string }
export interface DesktopImportReport {
  settings: { imported: boolean; materials: number };
  quotes: { created: number; updated: number; rejected: ImportRejection[] };
  purchases: { created: number; updated: number; rejected: ImportRejection[] };
}
```

`index.ts` : ajouter `export * from './gcode/parse-gcode.js'; export * from './desktop/mappings.js'; export * from './types/import.js';`.

Run: `pnpm --filter @calc3d/common run test` → PASS (24 tests). Puis `pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add packages/common
git commit -m "Ajoute le parseur G-code, les correspondances bureau et les types d'import (common)"
```

---

### Task 2: Backend — import des données de l'application bureau

**Files:**
- Create: `packages/backend/src/import/csv.ts` (+ test), `src/import/zoned-time.ts` (+ test), `src/import/desktop-import.ts` (+ test), `src/routes/import.routes.ts` (+ test)
- Modify: `packages/backend/src/app.ts`

**Interfaces:**
- Consumes: `DESKTOP_*`, `unprotectCsvText`, `DesktopImportBody`, `DesktopImportReport`, `DEFAULT_PRICING_SETTINGS`, `getOrCreateSettings`, `ownerScope`.
- Produces: `parseCsv(text): { header: string[]; rows: { line: number; cells: string[] }[]; errors: { line: number; reason: string }[] }` ; `zonedLocalToUtc(local: string /* yyyy-MM-dd HH:mm */, timeZone: string): Date` ; `importDesktopData(prisma, userId, body, timeZone): Promise<DesktopImportReport>` ; `POST /api/import/desktop` (JSON ≤ 20 Mo, `?tz=`) → `DesktopImportReport`.

- [ ] **Step 1: Parseur CSV (test puis code)**

`src/import/csv.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv (format Export-Csv)', () => {
  it('lit en-tête, guillemets, guillemets doublés, virgules dans les champs, CRLF et BOM', () => {
    const text = '﻿"Id","Projet","Commentaire"\r\n"1","Boîte ""XL"", bleue","a, b"\r\n"2","Simple",""\r\n';
    const r = parseCsv(text);
    expect(r.header).toEqual(['Id', 'Projet', 'Commentaire']);
    expect(r.rows).toEqual([{ line: 2, cells: ['1', 'Boîte "XL", bleue', 'a, b'] }, { line: 3, cells: ['2', 'Simple', ''] }]);
    expect(r.errors).toEqual([]);
  });
  it('accepte les champs sans guillemets et les retours à la ligne dans un champ cité', () => {
    const r = parseCsv('a,b\n1,"ligne 1\nligne 2"\n');
    expect(r.rows[0].cells).toEqual(['1', 'ligne 1\nligne 2']);
  });
  it('signale une ligne dont le nombre de colonnes diffère de l\'en-tête, sans arrêter', () => {
    const r = parseCsv('a,b,c\n1,2,3\n4,5\n6,7,8\n');
    expect(r.rows.map((x) => x.line)).toEqual([2, 4]);
    expect(r.errors).toEqual([{ line: 3, reason: 'expected 3 columns, got 2' }]);
  });
  it('fichier vide ou sans en-tête', () => {
    expect(parseCsv('')).toEqual({ header: [], rows: [], errors: [{ line: 1, reason: 'empty file' }] });
  });
});
```

`src/import/csv.ts` :
```ts
export interface CsvRow { line: number; cells: string[] }
export interface CsvResult { header: string[]; rows: CsvRow[]; errors: { line: number; reason: string }[] }

/** Parseur strict du format Export-Csv de PowerShell (RFC 4180) : en-tête obligatoire, guillemets doublés, CRLF ou LF, BOM toléré. */
export function parseCsv(text: string): CsvResult {
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = []; let cell = ''; let quoted = false; let line = 1; let recordLine = 1; let i = 0;
  const endCell = () => { cells.push(cell); cell = ''; };
  const endRecord = () => { endCell(); if (cells.length > 1 || cells[0] !== '') records.push({ line: recordLine, cells }); cells = []; recordLine = line; };
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i++; continue; }
      if (c === '\n') line++;
      cell += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { endCell(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { line++; endRecord(); i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || cells.length > 0) { endRecord(); }
  if (records.length === 0) return { header: [], rows: [], errors: [{ line: 1, reason: 'empty file' }] };
  const header = records[0].cells.map((h) => h.trim());
  const rows: CsvRow[] = []; const errors: { line: number; reason: string }[] = [];
  for (const r of records.slice(1)) {
    if (r.cells.length !== header.length) errors.push({ line: r.line, reason: `expected ${header.length} columns, got ${r.cells.length}` });
    else rows.push(r);
  }
  return { header, rows, errors };
}
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/import/csv.test.ts` → PASS, 4 tests (après avoir vu le FAIL « module introuvable »).

- [ ] **Step 2: Conversion heure locale → UTC (test puis code)**

`src/import/zoned-time.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { zonedLocalToUtc } from './zoned-time.js';

describe('zonedLocalToUtc', () => {
  it('convertit une heure locale Paris (été et hiver) et une date seule', () => {
    expect(zonedLocalToUtc('2026-07-15 14:30', 'Europe/Paris').toISOString()).toBe('2026-07-15T12:30:00.000Z');
    expect(zonedLocalToUtc('2026-01-15 14:30', 'Europe/Paris').toISOString()).toBe('2026-01-15T13:30:00.000Z');
    expect(zonedLocalToUtc('2026-01-15', 'Europe/Paris').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(zonedLocalToUtc('2026-01-15 14:30', 'UTC').toISOString()).toBe('2026-01-15T14:30:00.000Z');
  });
  it('renvoie une date invalide pour un texte non reconnu', () => {
    expect(Number.isNaN(zonedLocalToUtc('hier', 'UTC').getTime())).toBe(true);
    expect(Number.isNaN(zonedLocalToUtc('2026-02-30 10:00', 'UTC').getTime())).toBe(true);
  });
});
```

`src/import/zoned-time.ts` :
```ts
/** Décalage (ms) entre l'heure murale du fuseau et UTC pour un instant donné. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - instant.getTime();
}

/** « yyyy-MM-dd HH:mm » ou « yyyy-MM-dd » lu dans un CSV de l'application bureau (heure murale de l'utilisateur) → instant UTC. */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const probe = new Date(guess);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return new Date(NaN);
  // Deux passes suffisent (changement d'heure compris) : on corrige le décalage mesuré sur la première estimation.
  const first = guess - offsetMs(probe, timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}
```

Run: `pnpm --filter @calc3d/backend exec vitest run src/import/zoned-time.test.ts` → PASS.

- [ ] **Step 3: Service d'import (test puis code)**

`src/import/desktop-import.test.ts` :
```ts
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
"22222222-2222-2222-2222-222222222222","2026-09-02 11:00","","Sans type","","En attente","","1","[]","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","Markup","20","0","0","0","0","0","0","0","5","0","0","note","0,1952","1350","40","12,31","12,31","10","2717","6000","5","5"
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
});
```

`src/import/desktop-import.ts` :
```ts
import type { PrismaClient } from '../../generated/prisma/index.js';
import { DEFAULT_PRICING_SETTINGS, DESKTOP_CATEGORY, DESKTOP_KIND, DESKTOP_PRICING_MODE, DESKTOP_STATUS, unprotectCsvText, type DesktopImportBody, type DesktopImportReport, type FilamentLine, type ImportRejection, type PricingSettings } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { parseCsv, type CsvRow } from './csv.js';
import { zonedLocalToUtc } from './zoned-time.js';

/** Nombre au format du CSV bureau (culture fr : virgule décimale) ; vide → 0 ; invalide → NaN. */
const num = (s: string | undefined): number => { const t = (s ?? '').trim(); if (t === '') return 0; const n = Number(t.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const bool = (v: unknown): boolean => v === true || String(v).trim() === 'True' || String(v).trim() === '1';

/** Correspondance config.json → UserSettings (mêmes clés que la spec §4). Clé absente → valeur par défaut. */
function settingsFromConfig(cfg: Record<string, unknown>) {
  const n = (k: string, d: number) => { const v = Number(cfg[k]); return Number.isFinite(v) ? v : d; };
  const D = DEFAULT_PRICING_SETTINGS;
  return {
    currencySymbol: typeof cfg.DeviseSymbole === 'string' && cfg.DeviseSymbole.trim() ? String(cfg.DeviseSymbole).trim().slice(0, 5) : D.currencySymbol,
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
    wearCostPerHour: n('CfgUsureParHeureEUR'), defaultFixedCosts: 0, floorPrice: n('CfgPrixPlancherEUR'), roundToEuro: bool(get('CfgArrondirEuro')),
  };
}

function quoteFromRow(row: CsvRow, header: string[], currency: string, timeZone: string): { legacyId: string; data: Record<string, unknown> } | ImportRejection {
  const get = (col: string) => { const i = header.indexOf(col); return i >= 0 ? row.cells[i] : ''; };
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
      const parsed = JSON.parse(json);
      lines = (Array.isArray(parsed) ? parsed : [parsed]).map((l: Record<string, unknown>) => ({ material: String(l.Matiere ?? 'PLA').slice(0, 60), weightG: Number(l.PoidsG) || 0, pricePerKg: Number(l.PrixKg) || 0, wastePct: Number(l.PertesPct) || 0 }));
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
  const data = {
    createdAt, dueDate, kind, status, projectName: unprotectCsvText(get('Projet')), customer: unprotectCsvText(get('Client')), comment: unprotectCsvText(get('Commentaire')),
    filamentLines: JSON.stringify(lines), settingsSnapshot: JSON.stringify(snapshot),
    ...numeric, priceBeforeRounding, roundingApplied: numeric.roundingAmount > 0,
    priceBeforeFloor: priceBeforeRounding, floorApplied: snapshot.floorPrice > 0 && priceBeforeRounding <= snapshot.floorPrice && numeric.totalExclTax - numeric.discountAmount + numeric.shippingCost + numeric.vatAmount < snapshot.floorPrice,
  };
  return { legacyId, data };
}

function purchaseFromRow(row: CsvRow, header: string[]): { legacyId: string; data: Record<string, unknown> } | ImportRejection {
  const get = (col: string) => { const i = header.indexOf(col); return i >= 0 ? row.cells[i] : ''; };
  const legacyId = get('Id').trim();
  if (!legacyId) return { line: row.line, reason: 'missing Id' };
  const date = zonedLocalToUtc(get('Date').trim().slice(0, 10), 'UTC');
  if (Number.isNaN(date.getTime())) return { line: row.line, reason: 'invalid Date' };
  const category = DESKTOP_CATEGORY[get('Categorie').trim()];
  if (!category) return { line: row.line, reason: 'unknown Categorie' };
  const amount = num(get('Montant'));
  if (!Number.isFinite(amount) || amount <= 0) return { line: row.line, reason: 'invalid Montant' };
  const description = unprotectCsvText(get('Description')).trim().slice(0, 200) || '(sans description)';
  return { legacyId, data: { date, category, amount, description, supplier: unprotectCsvText(get('Fournisseur')).trim().slice(0, 200), comment: unprotectCsvText(get('Commentaire')).slice(0, 2000) } };
}

const isRejection = (x: unknown): x is ImportRejection => typeof (x as ImportRejection).reason === 'string';

/** Import idempotent des fichiers de l'application bureau dans le compte `userId` (spec §8). */
export async function importDesktopData(prisma: PrismaClient, userId: number, body: DesktopImportBody, timeZone: string): Promise<DesktopImportReport> {
  const report: DesktopImportReport = { settings: { imported: false, materials: 0 }, quotes: { created: 0, updated: 0, rejected: [] }, purchases: { created: 0, updated: 0, rejected: [] } };
  await getOrCreateSettings(prisma, userId);

  if (body.config !== undefined) {
    let cfg: Record<string, unknown>;
    try { cfg = JSON.parse(body.config.replace(/^﻿/, '')); if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('not an object'); }
    catch { throw new AppError(400, 'Invalid config.json', undefined, 'validation'); }
    await prisma.userSettings.update({ where: { userId }, data: settingsFromConfig(cfg) });
    report.settings.imported = true;
    const catalog = cfg.PrixParMatiere;
    if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
      const entries = Object.entries(catalog as Record<string, unknown>).map(([name, price]) => [name.trim().slice(0, 60), Number(price)] as const).filter(([name, price]) => name && Number.isFinite(price) && price >= 0);
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
    for (const row of csv.rows) {
      const r = quoteFromRow(row, csv.header, currency, timeZone);
      if (isRejection(r)) { report.quotes.rejected.push(r); continue; }
      const existing = await prisma.quote.findFirst({ where: { userId, legacyId: r.legacyId }, select: { id: true } });
      if (existing) { await prisma.quote.update({ where: { id: existing.id }, data: r.data }); report.quotes.updated++; }
      else { await prisma.quote.create({ data: { userId, legacyId: r.legacyId, ...r.data } as never }); report.quotes.created++; }
    }
  }

  if (body.achats !== undefined) {
    const csv = parseCsv(body.achats);
    report.purchases.rejected.push(...csv.errors);
    for (const row of csv.rows) {
      const r = purchaseFromRow(row, csv.header);
      if (isRejection(r)) { report.purchases.rejected.push(r); continue; }
      const existing = await prisma.purchase.findFirst({ where: { userId, legacyId: r.legacyId }, select: { id: true } });
      if (existing) { await prisma.purchase.update({ where: { id: existing.id }, data: r.data }); report.purchases.updated++; }
      else { await prisma.purchase.create({ data: { userId, legacyId: r.legacyId, ...r.data } as never }); report.purchases.created++; }
    }
  }
  return report;
}
```

Le `as never` sur `create` contourne le typage strict de Prisma sur un objet construit dynamiquement ; l'alternative propre est de typer `data` avec `Prisma.QuoteUncheckedCreateInput` : préférer ce typage si `tsc` l'accepte sans cast (importer `Prisma` depuis le client généré), et ne garder `as never` qu'en dernier recours.

Run: `pnpm --filter @calc3d/backend exec vitest run src/import` → PASS (après le FAIL initial). Si le cas « invalid Date » renvoie une autre ligne, vérifier que `parseCsv` numérote les lignes à partir de 1 pour l'en-tête (la 3e ligne de données est la ligne 4).

- [ ] **Step 4: Route (test puis code)**

`src/routes/import.routes.test.ts` :
```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { importRoutes } from './import.routes.js';
import { errorHandler } from '../middleware/error-handler.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

function appAs(user: { id: number; username: string; role: string }) {
  const app = express();
  app.use((req, _res, next) => { req.user = { typ: 'access', id: user.id, username: user.username, role: user.role as 'admin' | 'user' }; next(); });
  app.locals.prisma = prisma;
  app.use('/api/import', importRoutes);
  app.use(errorHandler);
  return app;
}
const achats = '"Id","Date","Categorie","Description","Montant","Fournisseur","Commentaire"\n"a1","2026-09-05","Outillage","Pince","9,9","",""\n';

describe('POST /api/import/desktop', () => {
  it('importe dans le compte courant et renvoie le rapport ; corps vide ou fuseau inconnu → 400', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const r = await request(appAs(a)).post('/api/import/desktop?tz=Europe/Paris').send({ achats });
    expect(r.status).toBe(200); expect(r.body.purchases).toEqual({ created: 1, updated: 0, rejected: [] });
    expect(await prisma.purchase.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma.purchase.count({ where: { userId: b.id } })).toBe(0);
    expect((await request(appAs(a)).post('/api/import/desktop').send({})).status).toBe(400);
    expect((await request(appAs(a)).post('/api/import/desktop?tz=Mars/Olympus').send({ achats })).status).toBe(400);
    expect((await request(appAs(a)).post('/api/import/desktop').send({ achats: 42 })).status).toBe(400);
  });
  it('accepte un corps de plusieurs Mo (limite propre à la route)', async () => {
    const a = await createTestUser(prisma, 'a');
    const big = achats + Array.from({ length: 40_000 }, (_, i) => `"b${i}","2026-09-05","Outillage","Ligne ${i} ${'x'.repeat(60)}","1","",""`).join('\n') + '\n';
    expect(big.length).toBeGreaterThan(3_000_000);
    const r = await request(appAs(a)).post('/api/import/desktop').send({ achats: big });
    expect(r.status).toBe(200); expect(r.body.purchases.created).toBe(40_001);
  }, 120_000);
});
```

`src/routes/import.routes.ts` :
```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { importDesktopData } from '../import/desktop-import.js';

export const importRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const bodySchema = z.object({ config: z.string().max(1_000_000).optional(), historique: z.string().max(20_000_000).optional(), achats: z.string().max(20_000_000).optional() }).strict()
  .refine((b) => b.config !== undefined || b.historique !== undefined || b.achats !== undefined, 'at least one file is required');

function parseTimeZone(raw: unknown): string {
  if (raw === undefined) return 'UTC';
  const tz = String(raw);
  if (tz.length > 64) throw new AppError(400, 'Invalid tz');
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { throw new AppError(400, 'Invalid tz'); }
}

/** Fichiers de l'application bureau envoyés en texte (le client les lit avec FileReader). Limite propre à la route : 20 Mo. */
importRoutes.post('/desktop', express.json({ limit: '20mb' }), wrap(async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid import body', parsed.error.issues.map((i) => i.message).join('; '), 'validation');
  const timeZone = parseTimeZone(req.query.tz);
  res.json(await importDesktopData(req.app.locals.prisma, ownerScope(req).userId, parsed.data, timeZone));
}));
```

Dans `app.ts` : `import { importRoutes } from './routes/import.routes.js';` et `app.use('/api/import', importRoutes);` après les finances. Le `express.json({ limit: '1mb' })` global s'exécute avant : il doit **ignorer** cette route. Remplacer la ligne globale par `app.use((req, res, next) => (req.path.startsWith('/api/import/') ? next() : express.json({ limit: '1mb' })(req, res, next)));`, avec un commentaire.

Run: `pnpm --filter @calc3d/backend exec vitest run src/routes/import.routes.test.ts` → PASS. Puis `pnpm lint && pnpm typecheck && pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Ajoute l'import des données de l'application bureau (API)"
```

---

### Task 3: Frontend — import G-code dans la page Devis

**Files:**
- Create: `packages/frontend/src/lib/gcode-files.ts` (+ test), `src/components/quote/GcodeImportButton.tsx` (+ test), `scripts/i18n-fragments/gcode.json`
- Modify: `src/pages/Quote.tsx`

**Interfaces:**
- Consumes: `parseGcodeMetadata`, `GCODE_CHUNK_BYTES`, `materialsApi.create`, `MaterialDto`, `QuoteFormState`, `emptyLine`.
- Produces: `readGcodeChunks(file: File): Promise<string>` ; `cleanMaterialName(name): string` ; `resolveMaterialName(name, catalog: MaterialDto[]): MaterialDto | null` ; `<GcodeImportButton materials onApply />` avec `onApply(patch: { printHours?, printMinutes?, lines?, projectName? })`.

- [ ] **Step 1: Fragment i18n**

`scripts/i18n-fragments/gcode.json` :
```json
{
  "namespace": "gcode",
  "keys": {
    "en": { "button": "Import G-code", "hint": "Automatically detects print time, filament weight and material. Select several files for a multi-part print (time and weight are added up).",
      "done": "Fields filled in from {{count}} file(s): {{items}}.", "time": "total print time", "filament": "filament (added up per material)",
      "nothing": "No usable information found. Check that the file(s) were generated by a standard slicer (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura…).",
      "noData": "No usable data: {{files}}", "readError": "Read error: {{files}}", "materialAdded": "Material \"{{name}}\" added to the catalog at {{price}}/kg." },
    "fr": { "button": "Importer un G-code", "hint": "Détecte automatiquement la durée, le poids et la matière du filament. Sélectionne plusieurs fichiers pour une impression en plusieurs pièces (durée et poids cumulés).",
      "done": "Champs complétés depuis {{count}} fichier(s) : {{items}}.", "time": "durée totale", "filament": "filament (cumulé par matière)",
      "nothing": "Aucune information exploitable n'a été trouvée. Vérifie que le(s) fichier(s) ont bien été générés par un slicer standard (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura…).",
      "noData": "Sans données exploitables : {{files}}", "readError": "Erreur de lecture : {{files}}", "materialAdded": "Matière « {{name}} » ajoutée au catalogue à {{price}}/kg." }
  }
}
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

- [ ] **Step 2: Lecture partielle et résolution de matière (test puis code)**

`src/lib/gcode-files.test.ts` :
```ts
import { readGcodeChunks, cleanMaterialName, resolveMaterialName } from './gcode-files';
import { GCODE_CHUNK_BYTES } from '@calc3d/common';

const mat = (id: number, name: string) => ({ id, name, pricePerKg: 20, sortOrder: id });

describe('gcode-files', () => {
  it('lit tête et queue d\'un gros fichier sans charger le milieu', async () => {
    const head = '; filament_type = PETG\n'; const tail = '\n; estimated printing time (normal mode) = 10m\n';
    const big = head + 'G1 X0\n'.repeat(100_000) + tail;
    const text = await readGcodeChunks(new File([big], 'piece.gcode'));
    expect(text.startsWith(head)).toBe(true);
    expect(text.endsWith(tail)).toBe(true);
    expect(text.length).toBeLessThanOrEqual(2 * GCODE_CHUNK_BYTES + 1);
  });
  it('un petit fichier est lu une seule fois', async () => {
    expect(await readGcodeChunks(new File(['; TIME:60\n'], 'p.gcode'))).toBe('; TIME:60\n');
  });
  it('cleanMaterialName retire les caractères de contrôle et plafonne à 60', () => {
    expect(cleanMaterialName(' PLA\u0000 [Basic] ')).toBe('PLA  [Basic]');
    expect(cleanMaterialName('x'.repeat(80))).toHaveLength(60);
  });
  it('resolveMaterialName : égalité puis inclusion insensibles à la casse, sinon null', () => {
    const catalog = [mat(1, 'PLA'), mat(2, 'PETG-CF'), mat(3, 'Nylon (PA)')];
    expect(resolveMaterialName('pla', catalog)?.name).toBe('PLA');
    expect(resolveMaterialName('PLA [Basic]', catalog)?.name).toBe('PLA');
    expect(resolveMaterialName('petg', catalog)?.name).toBe('PETG-CF');
    expect(resolveMaterialName('ASA', catalog)).toBeNull();
    expect(resolveMaterialName('', catalog)?.name).toBe('PLA');
  });
});
```

`src/lib/gcode-files.ts` :
```ts
import { GCODE_CHUNK_BYTES, type MaterialDto } from '@calc3d/common';

/** Tête et queue du fichier (200 ko chacune, comme Read-GcodeChunk) : les métadonnées des slicers y sont ; le fichier n'est jamais envoyé au serveur. */
export async function readGcodeChunks(file: File): Promise<string> {
  if (file.size <= 2 * GCODE_CHUNK_BYTES) return file.text();
  const head = await file.slice(0, GCODE_CHUNK_BYTES).text();
  const tail = await file.slice(file.size - GCODE_CHUNK_BYTES).text();
  return `${head}\n${tail}`;
}

/** Le nom vient d'un fichier potentiellement fourni par un tiers (même nettoyage que Resolve-MatiereGcode). */
export function cleanMaterialName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1F]/g, ' ').trim().slice(0, 60).trim();
}

/** Matière du catalogue correspondant au nom détecté ; vide → première matière ; aucune correspondance → null (l'appelant l'ajoute au catalogue). */
export function resolveMaterialName(detected: string, catalog: MaterialDto[]): MaterialDto | null {
  const name = cleanMaterialName(detected);
  if (!name) return catalog[0] ?? null;
  const lower = name.toLowerCase();
  return catalog.find((m) => m.name.toLowerCase() === lower)
    ?? catalog.find((m) => lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower))
    ?? null;
}
```
Run: `pnpm --filter @calc3d/frontend exec vitest run src/lib/gcode-files.test.ts` → PASS (après FAIL). Si jsdom ne fournit pas `Blob.prototype.text`, ajouter dans `src/test-setup.ts` un polyfill lisant via `FileReader`.

- [ ] **Step 3: Test du bouton (échoue)**

`src/components/quote/GcodeImportButton.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { GcodeImportButton } from './GcodeImportButton';

const create = vi.fn();
vi.mock('@/api/materials.api', () => ({ materialsApi: { create: (b: unknown) => create(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const catalog = [{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }, { id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 }];

function setup(onApply = vi.fn()) {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><GcodeImportButton materials={catalog} onApply={onApply} /></QueryClientProvider>);
  return onApply;
}
const pick = (files: File[]) => fireEvent.change(screen.getByTestId('gcode-input'), { target: { files } });

describe('GcodeImportButton', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => create.mockReset());

  it('cumule durée et poids par matière sur deux fichiers et propose le nom du projet pour un seul fichier', async () => {
    const onApply = setup();
    pick([new File(['; estimated printing time (normal mode) = 1h 30m\n; filament used [g] = 10\n; filament_type = PLA\n'], 'support.gcode')]);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0]).toEqual({ printHours: 1, printMinutes: 30, lines: [{ material: 'PLA', weightG: '10', pricePerKg: '18', wastePct: '10' }], projectName: 'support' });
    pick([new File(['; total estimated time: 45m\n; total filament weight [g] : 5, 2\n; filament_type = PLA;PETG\n'], 'a.gcode'), new File(['; total estimated time: 1h\n; filament used [g] = 3\n; filament_type = pla\n'], 'b.gcode')]);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
    expect(onApply.mock.calls[1][0]).toEqual({ printHours: 1, printMinutes: 45, lines: [{ material: 'PLA', weightG: '8', pricePerKg: '18', wastePct: '10' }, { material: 'PETG', weightG: '2', pricePerKg: '20', wastePct: '10' }] });
  });
  it('ajoute au catalogue une matière inconnue (nettoyée) à 20 €/kg', async () => {
    create.mockResolvedValue({ id: 3, name: 'ASA Glow', pricePerKg: 20, sortOrder: 2 });
    const onApply = setup();
    pick([new File(['; filament used [g] = 4\n; filament_type = ASA Glow\u0001\n'], 'x.gcode')]);
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'ASA Glow', pricePerKg: 20 }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].lines).toEqual([{ material: 'ASA Glow', weightG: '4', pricePerKg: '20', wastePct: '10' }]);
  });
  it('fichier sans métadonnée : rien appliqué, avertissement', async () => {
    const { toast } = await import('sonner');
    const onApply = setup();
    pick([new File(['G1 X1\n'], 'vide.gcode')]);
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(onApply).not.toHaveBeenCalled();
  });
});
```
Run → FAIL.

- [ ] **Step 4: Implémenter `GcodeImportButton.tsx`**

```tsx
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileDown } from 'lucide-react';
import { parseGcodeMetadata, type MaterialDto } from '@calc3d/common';
import { materialsApi } from '@/api/materials.api';
import { readGcodeChunks, resolveMaterialName, cleanMaterialName } from '@/lib/gcode-files';
import { Button } from '@/components/ui/button';
import type { FilamentLineText } from './quote-form-state';

export interface GcodeApplyPatch { printHours?: number; printMinutes?: number; lines?: FilamentLineText[]; projectName?: string }
interface Props { materials: MaterialDto[]; onApply: (patch: GcodeApplyPatch) => void; projectNameEmpty?: boolean }

const NEW_MATERIAL_PRICE = 20;

/** Même comportement que le bouton « Importer un G-code » de l'application bureau : durée cumulée, poids cumulés par matière résolue, matière inconnue ajoutée au catalogue. */
export function GcodeImportButton({ materials, onApply, projectNameEmpty = true }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      let minutes = 0; let timeFound = false;
      const weights = new Map<string, { material: MaterialDto; weightG: number }>();
      const noData: string[] = []; const errors: string[] = [];
      let catalog = [...materials];
      for (const file of files) {
        let meta;
        try { meta = parseGcodeMetadata(await readGcodeChunks(file)); } catch { errors.push(file.name); continue; }
        let found = false;
        if (meta.printMinutes !== null) { minutes += meta.printMinutes; timeFound = true; found = true; }
        for (const m of meta.materials) {
          let resolved = resolveMaterialName(m.material, catalog);
          if (!resolved) {
            const name = cleanMaterialName(m.material) || 'PLA';
            try {
              resolved = await materialsApi.create({ name, pricePerKg: NEW_MATERIAL_PRICE });
              catalog = [...catalog, resolved];
              qc.invalidateQueries({ queryKey: ['materials'] });
              toast.success(t('gcode.materialAdded', { name, price: NEW_MATERIAL_PRICE }));
            } catch { resolved = catalog[0]; if (!resolved) continue; }
          }
          const cur = weights.get(resolved.name) ?? { material: resolved, weightG: 0 };
          cur.weightG += m.weightG; weights.set(resolved.name, cur); found = true;
        }
        if (!found) noData.push(file.name);
      }
      const items: string[] = []; const patch: GcodeApplyPatch = {};
      if (timeFound) { patch.printHours = Math.floor(minutes / 60); patch.printMinutes = minutes % 60; items.push(t('gcode.time')); }
      if (weights.size > 0) {
        patch.lines = [...weights.values()].map((w) => ({ material: w.material.name, weightG: String(Math.round(w.weightG * 10) / 10), pricePerKg: String(w.material.pricePerKg), wastePct: '10' }));
        items.push(t('gcode.filament'));
      }
      if (files.length === 1 && projectNameEmpty && items.length > 0) patch.projectName = files[0].name.replace(/\.[^.]+$/, '');
      const extra = [noData.length ? t('gcode.noData', { files: noData.join(', ') }) : '', errors.length ? t('gcode.readError', { files: errors.join(', ') }) : ''].filter(Boolean).join(' ');
      if (items.length > 0) { onApply(patch); toast.success(`${t('gcode.done', { count: files.length, items: items.join(', ') })} ${extra}`.trim()); }
      else toast.warning(`${t('gcode.nothing')} ${extra}`.trim());
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} data-testid="gcode-input" type="file" multiple accept=".gcode,.gco,.g" className="hidden" onChange={(e) => void handle(Array.from(e.target.files ?? []))} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}><FileDown className="mr-1 h-4 w-4" />{t('gcode.button')}</Button>
      <span className="text-xs text-muted-foreground">{t('gcode.hint')}</span>
    </div>
  );
}
```

Dans `pages/Quote.tsx`, sous le titre (avant le bandeau), rendre :
```tsx
<GcodeImportButton materials={materials} projectNameEmpty={!form.projectName.trim()} onApply={(p) => set({
  ...(p.printHours !== undefined ? { printHours: String(p.printHours), printMinutes: String(p.printMinutes ?? 0) } : {}),
  ...(p.lines ? { lines: p.lines } : {}),
  ...(p.projectName !== undefined ? { projectName: p.projectName } : {}),
})} />
```
(importer `GcodeImportButton`). Le test de la page Devis existant ne mocke pas `materialsApi.create` : le bouton ne l'appelle qu'à l'import, rien à changer.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/quote src/pages/Quote.test.tsx` → PASS.

- [ ] **Step 5: Vérifier, committer**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @calc3d/frontend run test
git add -A
git commit -m "Ajoute l'import G-code dans la page Devis (lecture dans le navigateur)"
```

---

### Task 4: Frontend — page d'impression `/quotes/:id/print`

**Files:**
- Create: `packages/frontend/src/pages/QuotePrint.tsx` (+ test), `scripts/i18n-fragments/print.json`
- Modify: `src/App.tsx`, `src/pages/Quote.tsx` (bouton Exporter)

**Interfaces:**
- Consumes: `quotesApi.get`, `settingsApi.get` (pour `pdfShowCostBreakdown` et la devise), `QuoteDto`, `formatMoney`, `formatNumber`, `formatDate`.
- Produces: route `/quotes/:id/print` (authentifiée, hors `AppLayout`) ; `window.print()` au chargement sauf `?noprint=1`.

- [ ] **Step 1: Fragment i18n**

`scripts/i18n-fragments/print.json` :
```json
{
  "namespace": "print",
  "keys": {
    "en": { "title": "Quote - {{name}}", "generated": "Generated on {{date}}", "customer": "Customer", "dueDate": "Due date", "status": "Status", "quantity": "Quantity",
      "itemBreakdown": "Item breakdown", "material": "Material", "weight": "Weight", "pricePerKg": "Price/kg", "waste": "Waste", "cost": "Cost",
      "costBreakdown": "Cost price breakdown (per item)", "costPrice": "Cost price (per item)", "labor": "Labor", "consumables": "Consumables / additional parts",
      "pricing": "Pricing", "unitPrice": "Selling price excl. tax (per unit)", "subtotal": "Subtotal (excl. tax)", "discount": "Discount ({{pct}} %)", "shipping": "Shipping", "vat": "VAT ({{pct}} %)", "rounding": "Rounding",
      "finalPrice": "FINAL PRICE", "floorNote": "Floor price applied (calculated before floor: {{price}})", "comment": "Comment:", "print": "Print / Save as PDF", "notFound": "This quote does not exist or is not yours.",
      "lines": { "filament": "Filament", "electricity": "Electricity ({{hours}} h, {{kwh}} kWh)", "laborPrep": "Preparation labor", "laborPost": "Post-processing labor", "laborDesign": "Design / modeling labor", "laborPackaging": "Packaging / shipping labor", "depreciation": "Printer depreciation", "maintenance": "Printer maintenance", "wear": "Printer wear parts", "fixedCosts": "Consumables / additional parts", "contingency": "Contingency / failure surcharge ({{pct}} %)" } },
    "fr": { "title": "Devis - {{name}}", "generated": "Généré le {{date}}", "customer": "Client", "dueDate": "Date souhaitée", "status": "Statut", "quantity": "Quantité",
      "itemBreakdown": "Détail de la pièce", "material": "Matière", "weight": "Poids", "pricePerKg": "Prix/kg", "waste": "Pertes", "cost": "Coût",
      "costBreakdown": "Détail du coût de revient (par pièce)", "costPrice": "Coût de revient (par pièce)", "labor": "Main d'œuvre", "consumables": "Consommables / pièces additionnelles",
      "pricing": "Tarification", "unitPrice": "Prix de vente HT (unitaire)", "subtotal": "Sous-total HT", "discount": "Remise ({{pct}} %)", "shipping": "Frais de port", "vat": "TVA ({{pct}} %)", "rounding": "Arrondi",
      "finalPrice": "PRIX FINAL", "floorNote": "Prix plancher appliqué (calculé avant plancher : {{price}})", "comment": "Commentaire :", "print": "Imprimer / Enregistrer en PDF", "notFound": "Ce devis n'existe pas ou ne t'appartient pas.",
      "lines": { "filament": "Filament", "electricity": "Électricité ({{hours}} h, {{kwh}} kWh)", "laborPrep": "Main d'œuvre préparation", "laborPost": "Main d'œuvre post-traitement", "laborDesign": "Main d'œuvre conception / modélisation", "laborPackaging": "Main d'œuvre emballage / expédition", "depreciation": "Amortissement imprimante", "maintenance": "Maintenance imprimante", "wear": "Usure pièces imprimante", "fixedCosts": "Consommables / pièces additionnelles", "contingency": "Majoration aléas / échec ({{pct}} %)" } }
  }
}
```
Et dans le fragment `quote.json` existant, remplacer la clé `actions.exportLater` par `"exportLater": "Enregistre d'abord le devis."` / `"Save the quote first."`. Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

- [ ] **Step 2: Test de la page (échoue)**

`src/pages/QuotePrint.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import QuotePrint from './QuotePrint';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const get = vi.fn(); const settings = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { get: (id: number) => get(id) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => settings() } }));

const quote = {
  id: 7, createdAt: '2026-10-01T10:00:00Z', updatedAt: '', legacyId: null, projectName: 'Boîtier <b>', customer: 'ACME & Co', kind: 'QUOTE', status: 'PENDING', dueDate: '2026-11-15', comment: 'Fragile',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 2, packagingHours: 0.25, quantity: 2, consumables: 1.5, discountPct: 10, shippingCost: 6.5,
  settingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, contingencyPct: 10, vatPct: 20, pricingMode: 'TARGET_MARGIN', pricingPct: 30 },
  filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05,
  unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26,
};
function renderPage(id = '7') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/quotes/${id}/print?noprint=1`]}><Routes><Route path="/quotes/:id/print" element={<QuotePrint />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe('page d\'impression', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); settings.mockReset(); get.mockResolvedValue(quote); settings.mockResolvedValue({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true, currencySymbol: '€' }); });

  it('reproduit les sections du devis bureau avec le détail du coût, sans mode de tarification ni marge', async () => {
    renderPage();
    expect(await screen.findByText('Devis - Boîtier <b>')).toBeInTheDocument();
    expect(screen.getByText('ACME & Co')).toBeInTheDocument();
    expect(screen.getByText('Détail du coût de revient (par pièce)')).toBeInTheDocument();
    for (const l of ['Usure pièces imprimante', 'Main d\'œuvre conception / modélisation', 'Majoration aléas / échec (10 %)']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.queryByText(/Main d'œuvre post-traitement/)).not.toBeInTheDocument(); // ligne nulle omise
    expect(screen.getByText('Remise (10 %)')).toBeInTheDocument();
    expect(screen.getByText('TVA (20 %)')).toBeInTheDocument();
    expect(screen.getByText('Arrondi')).toBeInTheDocument();
    expect(screen.getByTestId('print-final').textContent?.replace(/\s/g, '')).toBe('289,00€');
    expect(document.body.textContent).not.toMatch(/Marge cible|Surcoût|30 %/);
    expect(screen.getByText('Fragile')).toBeInTheDocument();
  });
  it('option désactivée : mode simplifié (main d\'œuvre totale et consommables seulement)', async () => {
    settings.mockResolvedValue({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: false, currencySymbol: '€' });
    renderPage();
    await screen.findByText('Devis - Boîtier <b>');
    expect(screen.queryByText('Détail du coût de revient (par pièce)')).not.toBeInTheDocument();
    expect(screen.queryByText('Usure pièces imprimante')).not.toBeInTheDocument();
    expect(screen.getByText("Main d'œuvre")).toBeInTheDocument();
    expect(screen.getByText('Consommables / pièces additionnelles')).toBeInTheDocument();
  });
  it('devis d\'autrui ou inexistant : message, rien d\'autre', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    renderPage('99');
    expect(await screen.findByText(/n'existe pas ou ne t'appartient pas/)).toBeInTheDocument();
    expect(screen.queryByText('Tarification')).not.toBeInTheDocument();
  });
});
```
Run → FAIL.

- [ ] **Step 3: Implémenter `pages/QuotePrint.tsx`**

```tsx
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { quotesApi } from '@/api/quotes.api';
import { settingsApi } from '@/api/settings.api';
import { formatDate } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/number';
import { PageLoader } from '@/components/shared/LoadingSpinner';

/**
 * Page HTML imprimable du devis, équivalent de Export-DevisHtml (application bureau) : infos client, détail des matières,
 * détail du coût de revient si l'option est active, tarification, prix final. Jamais le mode de tarification ni la marge.
 * Tous les textes libres passent par React (échappés). window.print() au chargement, sauf ?noprint=1 (tests).
 */
export default function QuotePrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, i18n } = useTranslation();
  const quoteId = /^\d+$/.test(id ?? '') ? Number(id) : null;
  const quoteQ = useQuery({ queryKey: ['quote', quoteId], queryFn: () => quotesApi.get(quoteId!), enabled: quoteId !== null, retry: false, staleTime: 0 });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const ready = !!quoteQ.data && !!settingsQ.data;
  useEffect(() => { if (ready && params.get('noprint') !== '1') { const h = setTimeout(() => window.print(), 300); return () => clearTimeout(h); } }, [ready, params]);

  if (quoteId === null || quoteQ.isError) return <p style={{ fontFamily: 'sans-serif', padding: 40 }}>{t('print.notFound')}</p>;
  if (!ready) return <PageLoader />;
  const q = quoteQ.data!; const s = q.settingsSnapshot; const loc = i18n.language;
  const cur = settingsQ.data!.currencySymbol;
  const money = (v: number) => formatMoney(v, cur, loc);
  const costLines: { label: string; value: number }[] = [
    { label: t('print.lines.filament'), value: q.filamentCost },
    { label: t('print.lines.electricity', { hours: formatNumber(q.printTimeH, loc, 2), kwh: formatNumber(q.energyKwh, loc, 3) }), value: q.electricityCost },
    { label: t('print.lines.laborPrep'), value: q.laborPrep }, { label: t('print.lines.laborPost'), value: q.laborPost },
    { label: t('print.lines.laborDesign'), value: q.laborDesign }, { label: t('print.lines.laborPackaging'), value: q.laborPackaging },
    { label: t('print.lines.depreciation'), value: q.depreciation }, { label: t('print.lines.maintenance'), value: q.maintenance }, { label: t('print.lines.wear'), value: q.wear },
    { label: t('print.lines.fixedCosts'), value: q.fixedCosts },
    { label: t('print.lines.contingency', { pct: formatNumber(s.contingencyPct, loc, 0) }), value: q.contingency },
  ].filter((l) => l.value > 0);
  const laborTotal = q.laborPrep + q.laborPost + q.laborDesign + q.laborPackaging;
  const showBreakdown = settingsQ.data!.pdfShowCostBreakdown;
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <tr><td style={strong ? { fontWeight: 700 } : undefined}>{label}</td><td className="montant" style={strong ? { fontWeight: 700 } : undefined}>{value}</td></tr>
  );
  return (
    <div className="print-page">
      <style>{`
        .print-page { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 40px; max-width: 800px; }
        .print-page h1 { font-size: 22px; margin-bottom: 0; } .print-page .sous-titre { color: #6B7280; font-size: 13px; margin: 2px 0 24px; }
        .print-page table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        .print-page th, .print-page td { text-align: left; padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #E5E7EB; }
        .print-page th { background: #F9FAFB; color: #6B7280; font-weight: 600; } .print-page td.montant { text-align: right; }
        .print-page .info-table td:first-child { color: #6B7280; width: 160px; }
        .print-page .final { background: #EEF2FF; padding: 14px 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
        .print-page .final .label { color: #4F46E5; font-weight: 600; } .print-page .final .valeur { color: #4F46E5; font-weight: 700; font-size: 22px; }
        .print-page .note { color: #6B7280; font-size: 11px; } .print-page .commentaire { margin-top: 16px; }
        .print-page .toolbar { margin-bottom: 16px; } @media print { .print-page { margin: 15mm; } .print-page .toolbar { display: none; } }
      `}</style>
      <div className="toolbar"><button type="button" onClick={() => window.print()}>{t('print.print')}</button></div>
      <h1>{t('print.title', { name: q.projectName })}</h1>
      <p className="sous-titre">{t('print.generated', { date: new Date().toLocaleString(loc) })}</p>
      <table className="info-table"><tbody>
        <tr><td>{t('print.customer')}</td><td>{q.customer}</td></tr>
        <tr><td>{t('print.dueDate')}</td><td>{q.dueDate ? formatDate(q.dueDate, loc) : '—'}</td></tr>
        <tr><td>{t('print.status')}</td><td>{t(`quote.statuses.${q.status}`)}</td></tr>
        <tr><td>{t('print.quantity')}</td><td>{q.quantity}</td></tr>
      </tbody></table>
      <h3>{t('print.itemBreakdown')}</h3>
      <table><thead><tr><th>{t('print.material')}</th><th>{t('print.weight')}</th><th>{t('print.pricePerKg')}</th><th>{t('print.waste')}</th><th>{t('print.cost')}</th></tr></thead>
        <tbody>{q.filamentLines.filter((l) => l.weightG > 0).map((l, i) => (
          <tr key={i}><td>{l.material}</td><td>{formatNumber(l.weightG, loc, 1)} g</td><td>{formatNumber(l.pricePerKg, loc, 2)} {cur}/kg</td><td>{formatNumber(l.wastePct, loc, 0)} %</td><td>{money((l.weightG / 1000) * l.pricePerKg * (1 + l.wastePct / 100))}</td></tr>
        ))}</tbody></table>
      {showBreakdown ? (
        <>
          <h3>{t('print.costBreakdown')}</h3>
          <table><tbody>{costLines.map((l) => <Row key={l.label} label={l.label} value={money(l.value)} />)}<Row label={t('print.costPrice')} value={money(q.costAfterContingency)} strong /></tbody></table>
        </>
      ) : (laborTotal > 0 || q.fixedCosts > 0) && (
        <table><tbody>{laborTotal > 0 && <Row label={t('print.labor')} value={money(laborTotal)} />}{q.fixedCosts > 0 && <Row label={t('print.consumables')} value={money(q.fixedCosts)} />}</tbody></table>
      )}
      <h3>{t('print.pricing')}</h3>
      <table><tbody>
        <Row label={t('print.unitPrice')} value={money(q.unitPriceExclTax)} />
        <Row label={t('print.quantity')} value={String(q.quantity)} />
        <Row label={t('print.subtotal')} value={money(q.totalExclTax)} strong />
        <Row label={t('print.discount', { pct: formatNumber(q.discountPct, loc, 0) })} value={`-${money(q.discountAmount)}`} />
        <Row label={t('print.shipping')} value={money(q.shippingCost)} />
        {s.vatPct > 0 && <Row label={t('print.vat', { pct: formatNumber(s.vatPct, loc, 0) })} value={money(q.vatAmount)} />}
        {q.roundingApplied && <Row label={t('print.rounding')} value={`+${money(q.roundingAmount)}`} />}
      </tbody></table>
      <div className="final"><span className="label">{t('print.finalPrice')}</span><span className="valeur" data-testid="print-final">{money(q.finalPrice)}</span></div>
      {q.floorApplied && <p className="note">{t('print.floorNote', { price: money(q.priceBeforeFloor) })}</p>}
      {q.comment.trim() && <div className="commentaire"><strong>{t('print.comment')}</strong><p>{q.comment}</p></div>}
    </div>
  );
}
```
`Row` est défini dans le composant : le déplacer **au niveau module** (règle react-hooks), comme au lot 1.

`App.tsx` : `const QuotePrint = lazy(() => import('@/pages/QuotePrint'));` et, **hors** du `<Route element={<AppLayout />}>` mais protégée : ajouter un petit composant `RequireAuth` dans `App.tsx` :
```tsx
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
```
et `<Route path="/quotes/:id/print" element={<RequireAuth><QuotePrint /></RequireAuth>} />` (importer `Navigate`).

`pages/Quote.tsx` : le bouton Exporter devient `const printId = initial?.id ?? savedId;` puis `<Button variant="outline" disabled={printId === null} title={printId === null ? t('quote.actions.exportLater') : undefined} onClick={() => window.open(`/quotes/${printId}/print`, '_blank', 'noopener')}>`. Ajouter au test de la page Devis (cas « enregistre les entrées ») : après l'enregistrement, `expect(screen.getByRole('button', { name: /Exporter/ })).toBeEnabled()` ; et avant : `toBeDisabled()`.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/pages/QuotePrint.test.tsx src/pages/Quote.test.tsx` → PASS.

- [ ] **Step 4: Vérifier, committer**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @calc3d/frontend run test
git add -A
git commit -m "Ajoute la page d'impression du devis et active le bouton Exporter"
```

---

### Task 5: Frontend — carte « Importer depuis l'application bureau » dans Paramètres

**Files:**
- Create: `packages/frontend/src/api/import.api.ts`, `src/components/settings/DesktopImportCard.tsx` (+ test), `scripts/i18n-fragments/desktop-import.json`
- Modify: `src/pages/Settings.tsx` (onglet « Import »)

**Interfaces:**
- Consumes: `POST /api/import/desktop?tz=`, `DesktopImportBody`, `DesktopImportReport`.
- Produces: `importApi.desktop(body): Promise<DesktopImportReport>` ; `<DesktopImportCard />`.

- [ ] **Step 1: Fragment et module API**

`scripts/i18n-fragments/desktop-import.json` :
```json
{
  "namespace": "desktopImport",
  "keys": {
    "en": { "tab": "Import", "title": "Import from the desktop app", "intro": "Pick the files from your CalculateurPrix folder. Settings and the material catalog are replaced; quotes and purchases are matched by their desktop Id, so importing twice never creates duplicates.",
      "config": "config.json (settings and catalog)", "historique": "historique.csv (quotes and orders)", "achats": "achats.csv (purchases)", "run": "Import", "running": "Importing…", "pickOne": "Pick at least one file.", "failed": "Import failed: {{reason}}",
      "report": { "title": "Import report", "settings": "Settings imported, {{count}} material(s) in the catalog.", "settingsSkipped": "Settings: no file.", "quotes": "Quotes: {{created}} created, {{updated}} updated, {{rejected}} rejected.", "purchases": "Purchases: {{created}} created, {{updated}} updated, {{rejected}} rejected.", "rejectedLine": "line {{line}}: {{reason}}" } },
    "fr": { "tab": "Import", "title": "Importer depuis l'application bureau", "intro": "Choisis les fichiers de ton dossier CalculateurPrix. Les paramètres et le catalogue sont remplacés ; les devis et achats sont reconnus par leur Id bureau, un second import ne crée donc jamais de doublon.",
      "config": "config.json (paramètres et catalogue)", "historique": "historique.csv (devis et commandes)", "achats": "achats.csv (achats)", "run": "Importer", "running": "Import en cours…", "pickOne": "Choisis au moins un fichier.", "failed": "Import échoué : {{reason}}",
      "report": { "title": "Rapport d'import", "settings": "Paramètres importés, {{count}} matière(s) au catalogue.", "settingsSkipped": "Paramètres : aucun fichier.", "quotes": "Devis : {{created}} créés, {{updated}} mis à jour, {{rejected}} rejetés.", "purchases": "Achats : {{created}} créés, {{updated}} mis à jour, {{rejected}} rejetés.", "rejectedLine": "ligne {{line}} : {{reason}}" } }
  }
}
```
Run: `node packages/frontend/scripts/merge-i18n.mjs` → `OK`.

`src/api/import.api.ts` :
```ts
import api from './client';
import type { DesktopImportBody, DesktopImportReport } from '@calc3d/common';
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };
export const importApi = { desktop: (body: DesktopImportBody): Promise<DesktopImportReport> => api.post('/import/desktop', body, { params: { tz: tz() }, timeout: 120_000 }).then((r) => r.data) };
```

- [ ] **Step 2: Test de la carte (échoue)**

`src/components/settings/DesktopImportCard.test.tsx` :
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { DesktopImportCard } from './DesktopImportCard';

const desktop = vi.fn();
vi.mock('@/api/import.api', () => ({ importApi: { desktop: (b: unknown) => desktop(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup() {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><DesktopImportCard /></QueryClientProvider>);
  return qc;
}

describe('DesktopImportCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => desktop.mockReset());

  it('envoie le texte des fichiers choisis et affiche le rapport avec les lignes rejetées', async () => {
    desktop.mockResolvedValue({ settings: { imported: true, materials: 11 }, quotes: { created: 3, updated: 1, rejected: [{ line: 5, reason: 'invalid Date' }] }, purchases: { created: 0, updated: 0, rejected: [] } });
    const qc = setup();
    qc.setQueryData(['settings'], { x: 1 }); qc.setQueryData(['materials'], []);
    fireEvent.change(screen.getByLabelText(/config\.json/), { target: { files: [new File(['{"Langue":"fr"}'], 'config.json')] } });
    fireEvent.change(screen.getByLabelText(/historique\.csv/), { target: { files: [new File(['"Id"\n"1"\n'], 'historique.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: /^Importer$/ }));
    await waitFor(() => expect(desktop).toHaveBeenCalledWith({ config: '{"Langue":"fr"}', historique: '"Id"\n"1"\n' }));
    expect(await screen.findByText(/Paramètres importés, 11 matière/)).toBeInTheDocument();
    expect(screen.getByText(/Devis : 3 créés, 1 mis à jour, 1 rejetés/)).toBeInTheDocument();
    expect(screen.getByText(/ligne 5 : invalid Date/)).toBeInTheDocument();
    expect(qc.getQueryState(['settings'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['materials'])?.isInvalidated).toBe(true);
  });
  it('sans fichier : message, aucun appel', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Importer$/ }));
    expect(await screen.findByText(/Choisis au moins un fichier/)).toBeInTheDocument();
    expect(desktop).not.toHaveBeenCalled();
  });
});
```
Run → FAIL.

- [ ] **Step 3: Implémenter `DesktopImportCard.tsx` et l'onglet**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { DesktopImportBody, DesktopImportReport } from '@calc3d/common';
import { importApi } from '@/api/import.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Slot = keyof DesktopImportBody;
const SLOTS: { key: Slot; accept: string }[] = [{ key: 'config', accept: '.json' }, { key: 'historique', accept: '.csv' }, { key: 'achats', accept: '.csv' }];

/** Import des fichiers de l'application bureau : lus dans le navigateur, envoyés en texte, rapport affiché. */
export function DesktopImportCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [error, setError] = useState('');
  const [report, setReport] = useState<DesktopImportReport | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      const body: DesktopImportBody = {};
      for (const { key } of SLOTS) { const f = files[key]; if (f) body[key] = await f.text(); }
      return importApi.desktop(body);
    },
    onSuccess: (r) => { setReport(r); setError(''); for (const k of [['settings'], ['materials'], ['quotes'], ['quote'], ['purchases'], ['finances']]) qc.invalidateQueries({ queryKey: k }); },
    onError: (e: { response?: { data?: { error?: string; details?: string } }; message?: string }) => setError(t('desktopImport.failed', { reason: e?.response?.data?.details || e?.response?.data?.error || e?.message || '?' })),
  });
  const submit = () => { if (!SLOTS.some(({ key }) => files[key])) { setError(t('desktopImport.pickOne')); return; } setError(''); run.mutate(); };
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('desktopImport.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('desktopImport.intro')}</p>
        {SLOTS.map(({ key, accept }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`import-${key}`} className="text-xs">{t(`desktopImport.${key}`)}</Label>
            <Input id={`import-${key}`} type="file" accept={accept} onChange={(e) => setFiles({ ...files, [key]: e.target.files?.[0] })} />
          </div>
        ))}
        <Button size="sm" onClick={submit} disabled={run.isPending}><Upload className="mr-1 h-4 w-4" />{run.isPending ? t('desktopImport.running') : t('desktopImport.run')}</Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {report && (
          <div className="rounded-md border border-border p-3 text-xs space-y-1">
            <p className="font-medium">{t('desktopImport.report.title')}</p>
            <p>{report.settings.imported ? t('desktopImport.report.settings', { count: report.settings.materials }) : t('desktopImport.report.settingsSkipped')}</p>
            <p>{t('desktopImport.report.quotes', { created: report.quotes.created, updated: report.quotes.updated, rejected: report.quotes.rejected.length })}</p>
            <p>{t('desktopImport.report.purchases', { created: report.purchases.created, updated: report.purchases.updated, rejected: report.purchases.rejected.length })}</p>
            {[...report.quotes.rejected, ...report.purchases.rejected].slice(0, 50).map((r, i) => <p key={i} className="text-muted-foreground">{t('desktopImport.report.rejectedLine', { line: r.line, reason: r.reason })}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```
Dans `Settings.tsx` : onglet `import` (icône `Upload`) après `materials`, visible de tous, contenu `<DesktopImportCard />`, clé i18n `desktopImport.tab`.

Run: `pnpm --filter @calc3d/frontend exec vitest run src/components/settings/DesktopImportCard.test.tsx` → PASS.

- [ ] **Step 4: Vérifier, committer**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @calc3d/frontend run test
git add -A
git commit -m "Ajoute l'import des données de l'application bureau dans les Paramètres"
```

---

### Task 6: Documentation, spec, vérification de bout en bout, finition

**Files:**
- Modify: `README.md`, `README.fr.md`, `CHANGELOG.md` (0.3.0), `CLAUDE.md`, spec §12, `packages/*/package.json` (0.3.0)

- [ ] **Step 1: Documentation**

- `CHANGELOG.md` : `## [0.3.0] - <date> — lot 3` : import G-code (navigateur, PrusaSlicer/Orca/Bambu/Cura, cumul multi-fichiers, matière inconnue ajoutée au catalogue), page d'impression `/quotes/:id/print` (même mise en page que le PDF bureau, détail des coûts selon l'option), import des données bureau (config, historique 1.2 et 1.3, achats ; idempotent par Id ; rapport).
- README fr/en : section Fonctionnalités : retirer « À venir », ajouter les trois points ; section Installation : « Récupérer ton historique de l'application bureau : Paramètres → Import ».
- `CLAUDE.md` : routes et modules ajoutés, règle « le G-code ne quitte pas le navigateur », « l'import bureau est la seule entrée qui accepte des montants ».
- Spec §12 : lot 3 implémenté ; §8 : corps JSON au lieu de multipart (ruling).
- Versions `0.3.0` dans les trois `package.json`.

- [ ] **Step 2: Chaîne CI locale puis parcours de bout en bout**

Run: `pnpm install --frozen-lockfile && pnpm audit --audit-level high && pnpm db:generate && pnpm --filter @calc3d/common run build && pnpm lint && pnpm typecheck && pnpm test && pnpm build` → au vert.

Parcours sur la stack de dev (`pnpm dev`) : importer les vrais `config.json`, `historique.csv`, `achats.csv` de `C:\Workspace\CalculateurPrix` dans un compte de test (via l'UI avec Chrome si l'extension est connectée, sinon via `POST /api/import/desktop` avec le contenu des fichiers) ; vérifier dans l'Historique qu'un devis importé se recharge et affiche son prix d'origine ; ouvrir `/quotes/<id>/print` ; importer un G-code réel depuis `DevisExportes` ou un slicer si disponible, sinon un fichier synthétique.

Critères d'acceptation du lot 3 (spec §12) : `historique.csv` et `achats.csv` réels importés sans rejet ; un devis rechargé reproduit son prix d'origine ; le PDF reprend les mêmes sections que la version bureau.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Documente le lot 3 (import G-code, impression PDF, import bureau)"
```

---

## Notes

- `POST /api/import/desktop` reçoit le **texte** des fichiers en JSON (limite 20 Mo) plutôt que du multipart : aucune dépendance supplémentaire, les fichiers bureau font quelques Mo au plus. La spec §8 est corrigée à la tâche 6.
- Les dates `Date` de `historique.csv` sont des heures murales de l'utilisateur : converties en UTC avec le fuseau du navigateur (`?tz=`), comme pour les Finances.
- Les montants importés sont repris tels quels (spec §8) ; `energyKwh` n'existe pas dans le CSV et vaut 0 ; `priceBeforeFloor`/`floorApplied` sont reconstitués au mieux.
- Après ce lot, l'application web couvre toutes les fonctions de l'application bureau 1.3.0.
