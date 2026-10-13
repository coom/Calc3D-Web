import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Props { id: string; checked: boolean; onCheckedChange: (v: boolean) => void; smtpEnabled: boolean; hasEmail: boolean }

/**
 * Interrupteur « Notifier par e-mail » des boîtes d'ajout et de réinitialisation : bloqué, avec la raison affichée,
 * tant que SMTP n'est pas configuré ou qu'aucune adresse n'est connue (le serveur refuse de toute façon : 400 / 409).
 */
export function NotifySwitch({ id, checked, onCheckedChange, smtpEnabled, hasEmail }: Props) {
  const { t } = useTranslation();
  const blocked = !smtpEnabled ? t('settings.users.notifyNeedsSmtp') : (!hasEmail ? t('settings.users.notifyNeedsEmail') : '');
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Switch id={id} checked={checked && !blocked} disabled={!!blocked} onCheckedChange={onCheckedChange} />
        <Label htmlFor={id} className="text-xs font-normal">{t('settings.users.notify')}</Label>
      </div>
      <p className="text-[10px] text-muted-foreground">{blocked || t('settings.users.notifyHint')}</p>
    </div>
  );
}
