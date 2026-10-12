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
