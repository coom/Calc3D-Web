import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users.api';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeleteUserDialog } from '@/components/settings/DeleteUserDialog';
import { JournalRetentionCard } from '@/components/settings/JournalRetentionCard';
import { PricingSettingsForm } from '@/components/settings/PricingSettingsForm';
import { MaterialsCard } from '@/components/settings/MaterialsCard';
import { DesktopImportCard } from '@/components/settings/DesktopImportCard';
import { SmtpSettingsCard } from '@/components/settings/SmtpSettingsCard';
import { EmailCard } from '@/components/settings/EmailCard';
import { AddUserDialog } from '@/components/settings/AddUserDialog';
import { EditUserDialog } from '@/components/settings/EditUserDialog';
import { ResetPasswordDialog } from '@/components/settings/ResetPasswordDialog';
import { smtpApi } from '@/api/smtp.api';
import type { CreateUserBody, MailOutcome, UserRow } from '@/api/users.api';
import { settingsApi } from '@/api/settings.api';
import { Users, Plus, Trash2, Check, Lock, KeyRound, Pencil, Calculator, Layers, Upload, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '@/i18n';

export default function Settings() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
      <Tabs defaultValue="pricing">
        <TabsList>
          <TabsTrigger value="pricing"><Calculator className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.pricing')}</TabsTrigger>
          <TabsTrigger value="materials"><Layers className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.materials')}</TabsTrigger>
          <TabsTrigger value="import"><Upload className="h-3.5 w-3.5 mr-1" /> {t('desktopImport.tab')}</TabsTrigger>
          <TabsTrigger value="account"><Lock className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.account')}</TabsTrigger>
          {isAdmin && <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.users')}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="smtp"><Mail className="h-3.5 w-3.5 mr-1" /> {t('smtp.tab')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="pricing" className="mt-4"><PricingTab /></TabsContent>
        <TabsContent value="materials" className="mt-4"><MaterialsCard /></TabsContent>
        <TabsContent value="import" className="mt-4"><DesktopImportCard /></TabsContent>
        <TabsContent value="account" className="mt-4"><AccountTab /></TabsContent>
        {isAdmin && <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>}
        {isAdmin && <TabsContent value="smtp" className="mt-4"><SmtpSettingsCard /></TabsContent>}
      </Tabs>
    </div>
  );
}

/** Paramètres de tarification de l'utilisateur courant ; le formulaire garde son état local, onSaved met le cache à jour. */
function PricingTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  if (isLoading || !data) return <PageLoader />;
  return <PricingSettingsForm key="settings" settings={data} onSaved={(s) => qc.setQueryData(['settings'], s)} />;
}

function AccountTab() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
  });

  const handleSubmit = () => {
    if (newPassword.length < 6) {
      toast.error(t('settings.account.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.account.passwordsDoNotMatch'));
      return;
    }
    changePassword.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('settings.account.passwordChanged'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || 'Failed to change password';
        toast.error(msg);
      },
    });
  };

  return (
    <div className="max-w-md space-y-4">
      <LanguageCard />
      <EmailCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('settings.account.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">{t('settings.account.currentPassword')}</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('settings.account.newPassword')}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('settings.account.confirmPassword')}</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!currentPassword || !newPassword || !confirmPassword || changePassword.isPending}
            className="w-full mt-1"
          >
            {changePassword.isPending ? t('settings.account.changing') : t('settings.account.changePassword')}
          </Button>
        </CardContent>
      </Card>

      <MfaCard />
      <TrustedDevicesCard />
    </div>
  );
}

function TrustedDevicesCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['trusted-devices'], queryFn: () => authApi.trustedList() });
  const devices: any[] = data?.devices ?? [];

  const fmt = (d: string) => new Date(d).toLocaleDateString(i18n.resolvedLanguage);

  const revoke = useMutation({
    mutationFn: (id: number) => authApi.trustedRevoke(id),
    onSuccess: () => { toast.success(t('settings.account.trustedDevices.revoked')); qc.invalidateQueries({ queryKey: ['trusted-devices'] }); },
    onError: () => toast.error(t('settings.account.trustedDevices.revokeError')),
  });
  const revokeAll = useMutation({
    mutationFn: () => authApi.trustedRevokeAll(),
    onSuccess: () => { toast.success(t('settings.account.trustedDevices.revokedAll')); qc.invalidateQueries({ queryKey: ['trusted-devices'] }); },
    onError: () => toast.error(t('settings.account.trustedDevices.revokeError')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('settings.account.trustedDevices.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('settings.account.trustedDevices.description')}</p>
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('settings.account.trustedDevices.empty')}</p>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {d.userAgent || '—'}{d.current && <span className="ml-2 text-[10px] text-primary">({t('settings.account.trustedDevices.thisDevice')})</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('settings.account.trustedDevices.added')}: {fmt(d.createdAt)} · {t('settings.account.trustedDevices.expires')}: {fmt(d.expiresAt)}
                    {d.ipAddress ? ` · ${d.ipAddress}` : ''}
                  </div>
                </div>
                <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(d.id)}>
                  {t('settings.account.trustedDevices.revoke')}
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={revokeAll.isPending} onClick={() => revokeAll.mutate()}>
              {t('settings.account.trustedDevices.revokeAll')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LanguageCard() {
  const { t, i18n } = useTranslation();
  const { user, setAuth, accessToken, refreshToken } = useAuthStore();
  const current = LANGUAGES.find((l) => i18n.resolvedLanguage === l.code)?.code ?? 'en';

  const choose = (code: string) => {
    setLanguage(code);
    if (accessToken) {
      authApi.setLanguage(code).then(() => {
        if (user) setAuth(accessToken, refreshToken!, { ...user, language: code });
        toast.success(t('common.save'));
      }).catch(() => { /* ignore */ });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('settings.account.language')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select value={current} onValueChange={choose}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}><span className="mr-2 text-xs font-semibold uppercase">{l.code}</span>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">{t('settings.account.languageHint')}</p>
      </CardContent>
    </Card>
  );
}

function MfaCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const enabled = !!me?.user?.mfaEnabled;
  const required = !!me?.user?.mfaRequired;

  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState('');

  const setup = useMutation({
    mutationFn: () => authApi.mfaSetup(),
    onSuccess: (d) => setQr(d.qrDataUrl),
    onError: () => toast.error(t('settings.account.mfa.setupFailed')),
  });
  const enable = useMutation({
    mutationFn: () => authApi.mfaEnable(code),
    onSuccess: (d) => { setRecoveryCodes(d.recoveryCodes); setQr(null); setCode(''); qc.invalidateQueries({ queryKey: ['me'] }); toast.success(t('settings.account.mfa.enabledToast')); },
    onError: () => toast.error(t('settings.account.mfa.invalidCode')),
  });
  const disable = useMutation({
    mutationFn: () => authApi.mfaDisable(disablePw),
    onSuccess: () => { setDisablePw(''); setRecoveryCodes(null); qc.invalidateQueries({ queryKey: ['me'] }); toast.success(t('settings.account.mfa.disabledToast')); },
    onError: (err: any) => toast.error(err.response?.data?.error || t('settings.account.mfa.disableFailed')),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">{t('settings.account.mfa.title')}</CardTitle>
        <Badge variant={enabled ? 'default' : 'outline'} className={enabled ? 'bg-emerald-600' : ''}>{enabled ? t('settings.account.mfa.on') : t('settings.account.mfa.off')}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {recoveryCodes && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-500 text-xs font-medium"><KeyRound className="h-3.5 w-3.5" /> {t('settings.account.mfa.recoveryTitle')}</div>
            <p className="text-[10px] text-muted-foreground">{t('settings.account.mfa.recoveryHint')}</p>
            <div className="grid grid-cols-2 gap-1 font-mono-data text-[11px]">{recoveryCodes.map((c) => <span key={c}>{c}</span>)}</div>
          </div>
        )}

        {!enabled && !qr && (
          <>
            <p className="text-xs text-muted-foreground">{t('settings.account.mfa.intro')}</p>
            <Button size="sm" onClick={() => setup.mutate()} disabled={setup.isPending}>{setup.isPending ? t('settings.account.mfa.starting') : t('settings.account.mfa.enable')}</Button>
          </>
        )}

        {!enabled && qr && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('settings.account.mfa.scanPrompt')}</p>
            <img src={qr} alt="TOTP QR code" className="h-44 w-44 rounded bg-white p-2" />
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" className="h-8 text-xs w-40 text-center tracking-widest" />
            <Button size="sm" onClick={() => enable.mutate()} disabled={enable.isPending || code.length < 6}>{enable.isPending ? t('settings.account.mfa.verifying') : t('settings.account.mfa.verifyEnable')}</Button>
          </div>
        )}

        {enabled && (
          <div className="space-y-2">
            {required
              ? <p className="text-xs text-muted-foreground">{t('settings.account.mfa.requiredNote')}</p>
              : <>
                  <p className="text-xs text-muted-foreground">{t('settings.account.mfa.disablePrompt')}</p>
                  <div className="flex items-center gap-2">
                    <Input type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} placeholder={t('settings.account.mfa.passwordPlaceholder')} className="h-8 min-w-0 flex-1 text-xs sm:w-48 sm:flex-none" />
                    <Button size="sm" variant="destructive" onClick={() => disable.mutate()} disabled={disable.isPending || !disablePw}>{t('settings.account.mfa.disable')}</Button>
                  </div>
                </>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/** Onglet Utilisateurs (admin) : liste, ajout, modification (nom, e-mail, langue), réinitialisation de mot de passe, MFA, suppression. */
function UsersTab() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: smtp } = useQuery({ queryKey: ['smtp-status'], queryFn: smtpApi.status });
  const smtpEnabled = !!smtp?.enabled;
  const createUser = useMutation({ mutationFn: (data: CreateUserBody) => usersApi.create(data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  const updateUser = useMutation({ mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.update>[1] }) => usersApi.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  const deleteUser = useMutation({ mutationFn: (id: number) => usersApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });

  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);

  const userList = useMemo(() => (Array.isArray(users) ? users : []), [users]);

  if (isLoading) return <PageLoader />;

  // Le compte est créé ou modifié même si l'e-mail échoue : succès, puis avertissement avec la raison.
  const reportMail = (r: MailOutcome | undefined, email: string, failedKey: string) => {
    if (!r) return;
    if (r.emailSent) toast.success(t('settings.users.toastEmailSent', { email }));
    else if (r.emailError !== undefined) toast.warning(t(failedKey, { reason: r.emailError }));
  };
  const errorMessage = (e: unknown, fallback: string) => {
    const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
    return code === 'smtp_disabled' ? t('settings.users.notifyNeedsSmtp') : fallback;
  };

  const handleCreate = (body: CreateUserBody) => {
    createUser.mutate(body, {
      onSuccess: (r) => { toast.success(t('settings.users.toastCreated')); setShowAdd(false); if (body.notify) reportMail(r, body.email ?? '', 'settings.users.toastCreatedEmailFailed'); },
      onError: (e) => toast.error(errorMessage(e, t('settings.users.toastCreateFailed'))),
    });
  };

  const handleEdit = (id: number, data: { displayName: string; email: string; language: string | null }) => {
    updateUser.mutate({ id, data }, {
      onSuccess: () => { toast.success(t('settings.users.toastUpdated')); setEditUser(null); },
      onError: () => toast.error(t('settings.users.toastUpdateFailed')),
    });
  };

  const handleRoleChange = (userId: number, role: string) => {
    updateUser.mutate({ id: userId, data: { role } }, {
      onSuccess: () => toast.success(t('settings.users.toastRoleUpdated')),
      onError: () => toast.error(t('settings.users.toastRoleFailed')),
    });
  };

  const handleToggleEnabled = (userId: number, enabled: boolean) => {
    updateUser.mutate({ id: userId, data: { enabled } }, {
      onSuccess: () => toast.success(enabled ? t('settings.users.toastEnabled') : t('settings.users.toastDisabled')),
      onError: () => toast.error(t('settings.users.toastStatusFailed')),
    });
  };

  const handleRequireMfa = (userId: number, mfaRequired: boolean) => {
    updateUser.mutate({ id: userId, data: { mfaRequired } }, {
      onSuccess: () => toast.success(mfaRequired ? t('settings.users.toastMfaRequired') : t('settings.users.toastMfaNotRequired')),
      onError: () => toast.error(t('settings.users.toastMfaRequireFailed')),
    });
  };

  const handleResetMfa = (userId: number) => {
    updateUser.mutate({ id: userId, data: { resetMfa: true } }, {
      onSuccess: () => toast.success(t('settings.users.toastMfaReset')),
      onError: () => toast.error(t('settings.users.toastMfaResetFailed')),
    });
  };

  const handleResetPassword = (id: number, data: { password: string; mustChangePassword: boolean; notify: boolean }) => {
    if (data.password.length < 6) { toast.error(t('settings.users.passwordMinError')); return; }
    const email = userList.find((u) => u.id === id)?.email ?? '';
    updateUser.mutate({ id, data }, {
      onSuccess: (r) => { toast.success(t('settings.users.toastPasswordReset')); setResetUser(null); if (data.notify) reportMail(r, email, 'settings.users.toastResetEmailFailed'); },
      onError: (e) => toast.error(errorMessage(e, t('settings.users.toastPasswordResetFailed'))),
    });
  };

  return (
    <div className="space-y-4">
      <PasswordPolicyCard />
      <JournalRetentionCard />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('settings.users.subtitle')}</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> {t('settings.users.add')}</Button>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">{t('settings.users.colUsername')}</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">{t('settings.users.colDisplayName')}</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">{t('settings.users.colRole')}</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">{t('settings.users.colLanguage')}</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">{t('settings.users.colStatus')}</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">{t('settings.users.col2fa')}</th>
              <th className="h-10 px-3 text-right font-medium text-muted-foreground">{t('settings.users.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {userList.map((u) => {
              const isProtected = u.username === 'admin';
              return (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono-data text-xs">{u.username}</td>
                  <td className="px-3 py-2.5">
                    <div>{u.displayName}</div>
                    {u.email && <div className="text-[10px] text-muted-foreground">{u.email}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    {isProtected ? (
                      <Badge variant="default" className="text-[10px] capitalize">{u.role}</Badge>
                    ) : (
                      <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}>
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t('settings.users.roleAdmin')}</SelectItem>
                          <SelectItem value="user">{t('settings.users.roleUser')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs uppercase text-muted-foreground">{u.language ?? '-'}</td>
                  <td className="px-3 py-2.5">
                    {isProtected ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3 w-3" /> {t('settings.users.active')}
                      </span>
                    ) : (
                      <Switch
                        checked={u.enabled}
                        onCheckedChange={(v) => handleToggleEnabled(u.id, v)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span title={t('settings.users.require2faTitle')} className="inline-flex items-center gap-1">
                        <Switch checked={!!u.mfaRequired} onCheckedChange={(v) => handleRequireMfa(u.id, v)} />
                        <span className="text-[10px] text-muted-foreground">{u.mfaEnabled ? t('settings.users.mfaOn') : (u.mfaRequired ? t('settings.users.mfaPending') : t('settings.users.mfaOff'))}</span>
                      </span>
                      {u.mfaEnabled && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" title={t('settings.users.resetLostDeviceTitle')} onClick={() => handleResetMfa(u.id)}>
                          {t('settings.users.reset')}
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t('settings.users.editTooltip')} onClick={() => setEditUser(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t('settings.users.resetPasswordTitle')} onClick={() => setResetUser(u)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)} disabled={isProtected}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddUserDialog open={showAdd} onOpenChange={setShowAdd} smtpEnabled={smtpEnabled} defaultLanguage={i18n.resolvedLanguage === 'en' ? 'en' : 'fr'} onSubmit={handleCreate} loading={createUser.isPending} />
      <EditUserDialog user={editUser} onOpenChange={(o) => { if (!o) setEditUser(null); }} onSubmit={handleEdit} loading={updateUser.isPending} />
      <ResetPasswordDialog user={resetUser} smtpEnabled={smtpEnabled} onOpenChange={(o) => { if (!o) setResetUser(null); }} onSubmit={handleResetPassword} loading={updateUser.isPending} />

      <DeleteUserDialog
        open={deleteId !== null}
        username={userList.find((u) => u.id === deleteId)?.username ?? ''}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        loading={deleteUser.isPending}
        onConfirm={() => { if (deleteId) deleteUser.mutate(deleteId, { onSuccess: () => { toast.success(t('settings.users.toastDeleted')); setDeleteId(null); } }); }}
      />
    </div>
  );
}


function PasswordPolicyCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: policy } = useQuery({ queryKey: ['password-policy'], queryFn: usersApi.passwordPolicy });
  const [minLength, setMinLength] = useState(12);
  const [requireComplexity, setRequireComplexity] = useState(true);

  const [seededPolicy, setSeededPolicy] = useState<typeof policy>(undefined);
  if (policy && policy !== seededPolicy) {
    setSeededPolicy(policy);
    setMinLength(policy.minLength);
    setRequireComplexity(policy.requireComplexity);
  }

  const save = useMutation({
    mutationFn: () => usersApi.updatePasswordPolicy({ minLength, requireComplexity }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['password-policy'] }); toast.success(t('settings.users.passwordPolicy.toastSaved')); },
    onError: (err: any) => toast.error(err.response?.data?.error || t('settings.users.passwordPolicy.toastSaveFailed')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('settings.users.passwordPolicy.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <div className="flex items-center gap-3">
          <Label className="text-xs w-40">{t('settings.users.passwordPolicy.minLength')}</Label>
          <Input className="h-8 text-xs w-24" type="number" min={1} max={128} value={minLength}
            onChange={(e) => setMinLength(parseInt(e.target.value) || 1)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={requireComplexity} onCheckedChange={setRequireComplexity} />
          <Label className="text-xs font-normal">
            {t('settings.users.passwordPolicy.requireComplexity')}
            <span className="text-muted-foreground"> {t('settings.users.passwordPolicy.requireComplexityHint')}</span>
          </Label>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t('settings.users.passwordPolicy.appliedHint')}
        </p>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('settings.users.passwordPolicy.saving') : t('settings.users.passwordPolicy.savePolicy')}
        </Button>
      </CardContent>
    </Card>
  );
}
