import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateUserBody } from '@/api/users.api';
import { USER_LANGUAGES } from '@calc3d/common';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NotifySwitch } from './NotifySwitch';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; smtpEnabled: boolean; defaultLanguage: string; onSubmit: (body: CreateUserBody) => void; loading?: boolean }
const SELECT_CLASS = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

/** Ajout d'un utilisateur par l'admin : identité, e-mail, langue de l'interface et des e-mails, MFA, mot de passe temporaire, notification. */
export function AddUserDialog({ open, onOpenChange, smtpEnabled, defaultLanguage, onSubmit, loading }: Props) {
  const { t } = useTranslation();
  const empty = { username: '', displayName: '', email: '', password: '', role: 'user', language: defaultLanguage, mfaRequired: false, mustChangePassword: false, notify: false };
  const [form, setForm] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }));
  const close = (o: boolean) => { if (!o) setForm(empty); onOpenChange(o); };
  const hasEmail = form.email.trim() !== '';
  const submit = () => onSubmit({
    username: form.username.trim(), displayName: form.displayName.trim(), password: form.password, role: form.role,
    mfaRequired: form.mfaRequired, mustChangePassword: form.mustChangePassword, email: form.email.trim(), language: form.language, notify: form.notify && smtpEnabled && hasEmail,
  });
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('settings.users.addDialogTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="add-username" className="text-xs">{t('settings.users.username')}</Label><Input id="add-username" value={form.username} onChange={(e) => set({ username: e.target.value })} placeholder="johndoe" autoComplete="off" /></div>
          <div><Label htmlFor="add-displayName" className="text-xs">{t('settings.users.displayName')}</Label><Input id="add-displayName" value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder="John Doe" /></div>
          <div><Label htmlFor="add-email" className="text-xs">{t('settings.users.email')}</Label><Input id="add-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="john@example.com" autoComplete="off" /></div>
          <div><Label htmlFor="add-password" className="text-xs">{t('settings.users.password')}</Label><Input id="add-password" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="********" autoComplete="new-password" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="add-role" className="text-xs">{t('settings.users.role')}</Label>
              <select id="add-role" value={form.role} onChange={(e) => set({ role: e.target.value })} className={SELECT_CLASS}>
                <option value="user">{t('settings.users.roleUser')}</option>
                <option value="admin">{t('settings.users.roleAdmin')}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="add-language" className="text-xs">{t('settings.users.language')}</Label>
              <select id="add-language" value={form.language} onChange={(e) => set({ language: e.target.value })} className={SELECT_CLASS}>
                {USER_LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="add-mfa" checked={form.mfaRequired} onCheckedChange={(v) => set({ mfaRequired: v })} />
            <Label htmlFor="add-mfa" className="text-xs font-normal">{t('settings.users.requireMfa')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="add-mustChange" checked={form.mustChangePassword} onCheckedChange={(v) => set({ mustChangePassword: v })} />
            <Label htmlFor="add-mustChange" className="text-xs font-normal">{t('settings.users.mustChangePassword')}</Label>
          </div>
          <NotifySwitch id="add-notify" checked={form.notify} onCheckedChange={(v) => set({ notify: v })} smtpEnabled={smtpEnabled} hasEmail={hasEmail} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={loading}>{t('settings.users.cancel')}</Button>
          <Button onClick={submit} disabled={loading || !form.username.trim() || !form.displayName.trim() || !form.password}>{t('settings.users.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
