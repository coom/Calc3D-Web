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

/** Prix d'une matière inconnue ajoutée au catalogue (même valeur que l'application bureau). */
const NEW_MATERIAL_PRICE = 20;

/**
 * Même comportement que le bouton « Importer un G-code » de l'application bureau : les fichiers sont lus dans le
 * navigateur (tête et queue), la durée est cumulée, les poids sont cumulés par matière résolue dans le catalogue,
 * une matière inconnue est ajoutée au catalogue. Le G-code ne quitte jamais le navigateur.
 */
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
        let meta: ReturnType<typeof parseGcodeMetadata>;
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
              void qc.invalidateQueries({ queryKey: ['materials'] });
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
