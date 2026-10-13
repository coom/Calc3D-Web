import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserRow } from '@/api/users.api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NotifySwitch } from './NotifySwitch';

type Body = { password: string; mustChangePassword: boolean; notify: boolean };
interface Props { user: UserRow | null; smtpEnabled: boolean; onOpenChange: (open: boolean) => void; onSubmit: (id: number, body: Body) => void; loading?: boolean }

/** Réinitialisation du mot de passe par l'admin, avec changement imposé et notification facultatifs. Ouverte quand `user` est fourni. */
export function ResetPasswordDialog({ user, smtpEnabled, onOpenChange, onSubmit, loading }: Props) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {user && <ResetPasswordForm key={user.id} user={user} smtpEnabled={smtpEnabled} onCancel={() => onOpenChange(false)} onSubmit={(b) => onSubmit(user.id, b)} loading={loading} />}
      </DialogContent>
    </Dialog>
  );
}

/** Formulaire remonté (clé = id) à chaque utilisateur : champs vides à chaque ouverture, sans effet. */
function ResetPasswordForm({ user, smtpEnabled, onCancel, onSubmit, loading }: { user: UserRow; smtpEnabled: boolean; onCancel: () => void; onSubmit: (b: Body) => void; loading?: boolean }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(''); const [mustChange, setMustChange] = useState(false); const [notify, setNotify] = useState(false);
  const hasEmail = !!user.email;
  return (
    <>
      <DialogHeader><DialogTitle className="text-sm">{t('settings.users.resetPasswordDialogTitle')}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('settings.users.setNewPasswordFor')} <span className="font-medium text-foreground">{user.username}</span></p>
        <div>
          <Label htmlFor="reset-password" className="text-xs">{t('settings.users.newPassword')}</Label>
          <Input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('settings.users.minCharsPlaceholder')} autoComplete="new-password" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="reset-mustChange" checked={mustChange} onCheckedChange={setMustChange} />
          <Label htmlFor="reset-mustChange" className="text-xs font-normal">{t('settings.users.mustChangePassword')}</Label>
        </div>
        <NotifySwitch id="reset-notify" checked={notify} onCheckedChange={setNotify} smtpEnabled={smtpEnabled} hasEmail={hasEmail} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>{t('settings.users.cancel')}</Button>
        <Button onClick={() => onSubmit({ password, mustChangePassword: mustChange, notify: notify && smtpEnabled && hasEmail })} disabled={password.length < 6 || loading}>
          {loading ? t('settings.users.resetting') : t('settings.users.resetPassword')}
        </Button>
      </DialogFooter>
    </>
  );
}
