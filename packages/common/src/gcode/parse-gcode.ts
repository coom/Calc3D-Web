/** Taille lue en tête et en queue de fichier par le navigateur (même valeur que Read-GcodeChunk). */
export const GCODE_CHUNK_BYTES = 200_000;

export interface GcodeMetadata { printMinutes: number | null; materials: { material: string; weightG: number }[] }

const DENSITIES: [string, number][] = [['PLA', 1.24], ['PETG', 1.27], ['ABS', 1.04], ['ASA', 1.07], ['TPU', 1.21], ['NYLON', 1.14], ['PA', 1.14], ['PC', 1.2], ['PVB', 1.09]];
const num = (s: string) => { const n = Number(s.trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };
/** Une valeur par position d'extrudeur, zéros compris : l'appariement avec filament_type se fait par index, le filtrage des poids nuls vient après. */
const list = (s: string, sep: RegExp) => s.split(sep).map((x) => num(x));

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
  if (weights.every((x) => x <= 0)) {
    let lengthsMm: number[] = [];
    const lmm = /^;\s*(?:total\s+filament\s+length|(?:total\s+)?filament\s+used)\s*\[mm\]\s*[:=]\s*(.+)$/im.exec(text);
    if (lmm) lengthsMm = list(lmm[1], /[,;]/);
    else {
      const lm = /^;\s*Filament\s+used\s*:\s*(.+)$/im.exec(text);
      if (lm) lengthsMm = lm[1].split(',').map((p) => { const mm = /([\d.]+)\s*m\b/.exec(p); return mm ? Number(mm[1]) * 1000 : 0; });
    }
    weights = lengthsMm.map((mm, i) => {
      let density = 1.24;
      const key = (types[i] ?? '').toUpperCase();
      for (const [k, d] of DENSITIES) { if (key.includes(k)) { density = d; break; } }
      const r = 0.0875; // rayon d'un filament 1,75 mm en cm
      return Math.round(Math.PI * r * r * (mm / 10) * density * 10) / 10;
    });
  }

  const materials = weights.map((weightG, i) => ({ material: types[i] ?? (types.length === 1 ? types[0] : 'PLA'), weightG })).filter((m) => m.weightG > 0);
  return { printMinutes, materials };
}
