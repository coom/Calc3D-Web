import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '@/i18n';
import { AddUserDialog } from './AddUserDialog';
import { EditUserDialog } from './EditUserDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import type { UserRow } from '@/api/users.api';

const bob: UserRow = { id: 7, username: 'bob', displayName: 'Bob', role: 'user', enabled: true, createdAt: '2026-10-01T00:00:00Z', lastLoginAt: null, mfaEnabled: false, mfaRequired: false, email: 'bob@x.fr', language: 'en' };

describe('AddUserDialog', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });

  it("langue préremplie, « Notifier » bloqué sans adresse puis débloqué ; l'envoi porte e-mail, langue et notify", () => {
    const onSubmit = vi.fn();
    render(<AddUserDialog open onOpenChange={() => {}} smtpEnabled defaultLanguage="fr" onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/^Langue/)).toHaveValue('fr');
    const notify = screen.getByRole('switch', { name: /Notifier par e-mail/ });
    expect(notify).toBeDisabled();
    expect(screen.getByText(/Saisissez une adresse e-mail/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nom d'utilisateur/), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText(/Nom affiché/), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'bob@x.fr' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: 'Str0ng-Passw0rd!' } });
    fireEvent.change(screen.getByLabelText(/^Langue/), { target: { value: 'en' } });
    expect(notify).toBeEnabled();
    fireEvent.click(notify);
    fireEvent.click(screen.getByRole('switch', { name: /Changer le mot de passe/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Créer$/ }));
    expect(onSubmit).toHaveBeenCalledWith({ username: 'bob', displayName: 'Bob', password: 'Str0ng-Passw0rd!', role: 'user', mfaRequired: false, mustChangePassword: true, email: 'bob@x.fr', language: 'en', notify: true });
  });
  it('SMTP non configuré : « Notifier » bloqué avec explication, même avec une adresse', () => {
    render(<AddUserDialog open onOpenChange={() => {}} smtpEnabled={false} defaultLanguage="en" onSubmit={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'bob@x.fr' } });
    expect(screen.getByRole('switch', { name: /Notifier par e-mail/ })).toBeDisabled();
    expect(screen.getByText(/SMTP n'est pas configuré/)).toBeInTheDocument();
  });
});

describe('EditUserDialog', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  it("préremplie avec l'utilisateur ; l'envoi porte nom, e-mail et langue (vide = non définie)", () => {
    const onSubmit = vi.fn();
    render(<EditUserDialog user={bob} onOpenChange={() => {}} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/Nom affiché/)).toHaveValue('Bob');
    expect(screen.getByLabelText(/Adresse e-mail/)).toHaveValue('bob@x.fr');
    expect(screen.getByLabelText(/^Langue/)).toHaveValue('en');
    fireEvent.change(screen.getByLabelText(/Nom affiché/), { target: { value: 'Bobby' } });
    fireEvent.change(screen.getByLabelText(/^Langue/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(onSubmit).toHaveBeenCalledWith(7, { displayName: 'Bobby', email: 'bob@x.fr', language: null });
  });
});

describe('ResetPasswordDialog', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  it("sans adresse connue, « Notifier » est bloqué ; avec adresse et SMTP, l'envoi porte notify", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ResetPasswordDialog user={{ ...bob, email: '' }} smtpEnabled onOpenChange={() => {}} onSubmit={onSubmit} />);
    expect(screen.getByRole('switch', { name: /Notifier par e-mail/ })).toBeDisabled();
    rerender(<ResetPasswordDialog user={bob} smtpEnabled onOpenChange={() => {}} onSubmit={onSubmit} />);
    const notify = screen.getByRole('switch', { name: /Notifier par e-mail/ });
    expect(notify).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/Nouveau mot de passe/), { target: { value: 'Str0ng-Passw0rd!' } });
    fireEvent.click(notify);
    fireEvent.click(screen.getByRole('button', { name: /^Réinitialiser le mot de passe$/ }));
    expect(onSubmit).toHaveBeenCalledWith(7, { password: 'Str0ng-Passw0rd!', mustChangePassword: false, notify: true });
  });
});
