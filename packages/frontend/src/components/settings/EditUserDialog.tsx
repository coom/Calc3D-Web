import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserRow } from '@/api/users.api';
import { USER_LANGUAGES } from '@calc3d/common';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Body = { displayName: string; email: string; language: string | null };
interface Props { user: UserRow | null; onOpenChange: (open: boolean) => void; onSubmit: (id: number, body: Body) => void; loading?: boolean }

/** Modification par l'admin du nom affiché, de l'adresse e-mail et de la langue d'un utilisateur. Ouverte quand `user` est fourni. */
export function EditUserDialog({ user, onOpenChange, onSubmit, loading }: Props) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {user && <EditUserForm key={user.id} user={user} onCancel={() => onOpenChange(false)} onSubmit={(b) => onSubmit(user.id, b)} loading={loading} />}
      </DialogContent>
    </Dialog>
  );
}

/** Formulaire remonté (clé = id) à chaque utilisateur : l'état initial vient des props, sans effet. */
function EditUserForm({ user, onCancel, onSubmit, loading }: { user: UserRow; onCancel: () => void; onSubmit: (b: Body) => void; loading?: boolean }) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user.displayName); const [email, setEmail] = useState(user.email ?? ''); const [language, setLanguage] = useState(user.language ?? '');
  return (
    <>
      <DialogHeader><DialogTitle className="text-sm">{t('settings.users.editTitle')}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-mono-data">{user.username}</p>
        <div><Label htmlFor="edit-displayName" className="text-xs">{t('settings.users.displayName')}</Label><Input id="edit-displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <div><Label htmlFor="edit-email" className="text-xs">{t('settings.users.email')}</Label><Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></div>
        <div>
          <Label htmlFor="edit-language" className="text-xs">{t('settings.users.language')}</Label>
          <select id="edit-language" value={language} onChange={(e) => setLanguage(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t('settings.users.languageUnset')}</option>
            {USER_LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>{t('settings.users.cancel')}</Button>
        <Button onClick={() => onSubmit({ displayName: displayName.trim(), email: email.trim(), language: language || null })} disabled={loading || !displayName.trim()}>{t('settings.users.save')}</Button>
      </DialogFooter>
    </>
  );
}
