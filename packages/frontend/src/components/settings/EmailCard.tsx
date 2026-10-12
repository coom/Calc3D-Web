import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Adresse de notification du compte (réponses des clients). Vide = aucune notification. */
export function EmailCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user); const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState(user?.email ?? '');
  const save = useMutation({
    mutationFn: () => authApi.updateEmail(email.trim()),
    onSuccess: (r) => { if (user) setUser({ ...user, email: r.email }); setEmail(r.email); toast.success(t('accountEmail.saved')); },
    onError: () => toast.error(t('accountEmail.invalid')),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('accountEmail.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('accountEmail.intro')}</p>
        <div className="space-y-1"><Label htmlFor="account-email" className="text-xs">{t('accountEmail.label')}</Label><Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{t('accountEmail.save')}</Button>
      </CardContent>
    </Card>
  );
}
