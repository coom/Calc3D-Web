import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { ClientShareCard } from './ClientShareCard';
import type { QuoteDto } from '@calc3d/common';

const share = vi.fn(); const unshare = vi.fn(); const shareByEmail = vi.fn(); const convert = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { share: (id: number) => share(id), unshare: (id: number) => unshare(id), shareByEmail: (id: number, b: unknown) => shareByEmail(id, b), convert: (id: number) => convert(id) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const base = { id: 7, shared: false, sharedAt: null, clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null, clientEmail: '', paymentMethod: null, kind: 'QUOTE', projectName: 'P' } as unknown as QuoteDto;
function setup(quote: QuoteDto, smtpEnabled = false) {
  const onChanged = vi.fn(); const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><ClientShareCard quote={quote} smtpEnabled={smtpEnabled} onChanged={onChanged} /></QueryClientProvider>);
  return onChanged;
}

describe('ClientShareCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }); });
  beforeEach(() => { share.mockReset(); unshare.mockReset(); shareByEmail.mockReset(); convert.mockReset(); });

  it("génère le lien, l'affiche une seule fois avec Copier, puis propose régénérer / révoquer", async () => {
    share.mockResolvedValue({ url: 'http://x/q/abc' });
    const onChanged = setup(base);
    expect(screen.getByText(/Pas encore partagé/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Générer le lien/ }));
    expect(await screen.findByDisplayValue('http://x/q/abc')).toBeInTheDocument();
    expect(screen.getByText(/affiché qu'une seule fois/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Copier$/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/q/abc'));
    expect(onChanged).toHaveBeenCalled();
  });
  it('devis partagé : régénérer demande confirmation ; e-mail désactivé sans SMTP', async () => {
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z' });
    expect(screen.getByText(/Lien actif depuis/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envoyer par e-mail/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Régénérer le lien/ }));
    expect(await screen.findByText(/la réponse déjà reçue est effacée/)).toBeInTheDocument();
  });
  it('moyen de paiement choisi par le client affiché (PayPal), absent sinon', () => {
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-11T10:00:00Z', paymentMethod: 'PAYPAL' });
    expect(screen.getByText(/Paiement : PayPal/)).toBeInTheDocument();
  });
  it('réponse acceptée : badge, date, commentaire, bouton Convertir ; refusée : pas de conversion', async () => {
    convert.mockResolvedValue({});
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-11T10:00:00Z', clientComment: 'Allez-y' });
    expect(screen.getAllByText('Accepté').length).toBeGreaterThan(0);
    expect(screen.getByText('Allez-y')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Convertir en commande/ }));
    await waitFor(() => expect(convert).toHaveBeenCalledWith(7));
  });
  it('refusée : pas de bouton Convertir', () => {
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z', clientResponse: 'REFUSED', clientRespondedAt: '2026-10-11T10:00:00Z' });
    expect(screen.queryByRole('button', { name: /Convertir en commande/ })).not.toBeInTheDocument();
  });
  it('envoi par e-mail avec SMTP : adresse préremplie, appel API, confirmation', async () => {
    shareByEmail.mockResolvedValue({ url: 'http://x/q/abc' });
    setup({ ...base, shared: true, sharedAt: '2026-10-10T10:00:00Z', clientEmail: 'c@x.fr', paymentMethod: null }, true);
    fireEvent.click(screen.getByRole('button', { name: /Envoyer par e-mail/ }));
    expect(await screen.findByDisplayValue('c@x.fr')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/ }));
    await waitFor(() => expect(shareByEmail).toHaveBeenCalledWith(7, { to: 'c@x.fr', message: 'Bonjour' }));
  });
});
