import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { SmtpSettingsCard } from './SmtpSettingsCard';

const get = vi.fn(); const update = vi.fn(); const test = vi.fn();
vi.mock('@/api/smtp.api', () => ({ smtpApi: { get: () => get(), update: (b: unknown) => update(b), test: (to: string) => test(to) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const dto = { host: 'smtp.x', port: 587, secure: false, username: 'u', hasPassword: true, fromAddress: 'calc@x.fr', fromName: 'Calc3D', enabled: true };
function setup() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={qc}><SmtpSettingsCard /></QueryClientProvider>); }

describe('SmtpSettingsCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); update.mockReset(); test.mockReset(); get.mockResolvedValue(dto); });

  it('charge la configuration (mot de passe vide avec mention « conserver »), enregistre sans mot de passe si le champ est vide', async () => {
    update.mockResolvedValue(dto);
    setup();
    expect(await screen.findByDisplayValue('smtp.x')).toBeInTheDocument();
    expect((screen.getByLabelText(/^Mot de passe$/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Laisser vide pour conserver/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Port$/), { target: { value: '465' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.x', port: 465, enabled: true })));
    expect(update.mock.calls[0][0]).not.toHaveProperty('password');
  });
  it("e-mail de test : appel avec l'adresse, erreur affichée avec le détail", async () => {
    test.mockRejectedValue({ response: { status: 502, data: { details: 'auth failed' } } });
    setup();
    await screen.findByDisplayValue('smtp.x');
    fireEvent.change(screen.getByLabelText(/e-mail de test/), { target: { value: 'me@x.fr' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le test/ }));
    await waitFor(() => expect(test).toHaveBeenCalledWith('me@x.fr'));
    expect(await screen.findByText(/Test échoué : auth failed/)).toBeInTheDocument();
  });
});
