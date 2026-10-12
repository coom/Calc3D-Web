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
