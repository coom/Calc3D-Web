import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props { username: string; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void; loading?: boolean }

/**
 * Suppression d'un compte : emporte en cascade ses paramètres, son catalogue et ses devis (spec §3).
 * Le bouton reste désactivé tant que le nom d'utilisateur n'est pas saisi à l'identique.
 */
export function DeleteUserDialog({ username, open, onOpenChange, onConfirm, loading }: Props) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === username;
  const close = (o: boolean) => { if (!o) setTyped(''); onOpenChange(o); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.users.deleteTitle')}</DialogTitle>
          <DialogDescription>{t('settings.users.deleteCascade', { name: username })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="delete-user-confirm" className="text-xs">{t('settings.users.deleteTypeUsername', { name: username })}</Label>
          <Input id="delete-user-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={loading}>{t('shared.cancel')}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!matches || loading}>{t('settings.users.deletePermanently')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
