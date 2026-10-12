/** Corps de POST /api/import/desktop : texte brut des fichiers de l'application bureau. */
export interface DesktopImportBody { config?: string; historique?: string; achats?: string }
export interface ImportRejection { line: number; reason: string }
export interface DesktopImportReport {
  settings: { imported: boolean; materials: number };
  quotes: { created: number; updated: number; rejected: ImportRejection[] };
  purchases: { created: number; updated: number; rejected: ImportRejection[] };
}
