import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import PublicQuote from './PublicQuote';
import type { PublicQuoteDto } from '@calc3d/common';

const get = vi.fn(); const respond = vi.fn();
vi.mock('@/api/public.api', () => ({ publicApi: { get: (t: string) => get(t), respond: (t: string, b: unknown) => respond(t, b) } }));

const dto: PublicQuoteDto = { projectName: 'Boîtier <b>', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, quantity: 1, comment: '', filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printTimeH: 5, energyKwh: 2.7, contingencyPct: 10, laborTotal: 12.31, fixedCosts: 0, costLines: null, costAfterContingency: null, unitPriceExclTax: 20, totalExclTax: 20, discountPct: 0, discountAmount: 0, shippingCost: 0, vatPct: 0, vatAmount: 0, roundingApplied: false, roundingAmount: 0, floorApplied: false, priceBeforeFloor: 20, finalPrice: 20, currencySymbol: '€', ownerDisplayName: 'Guillaume', clientResponse: null, clientRespondedAt: null, paymentMethod: null, paypal: null };
function renderPage(token = 'tok') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/q/${token}`]}><Routes><Route path="/q/:token" element={<PublicQuote />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe('page publique du devis', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); respond.mockReset(); });

  it('affiche le devis et accepte après confirmation, avec commentaire', async () => {
    get.mockResolvedValue(dto); respond.mockResolvedValue({ ...dto, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    renderPage();
    expect(await screen.findByText('Devis de Guillaume')).toBeInTheDocument();
    expect(screen.getByText('Devis - Boîtier <b>')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Marge|Markup|Tarification\s*:/);
    fireEvent.change(screen.getByLabelText(/Commentaire/), { target: { value: 'Parfait' } });
    fireEvent.click(screen.getByRole('button', { name: /Accepter le devis/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Confirmer$/ }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('tok', { decision: 'ACCEPTED', comment: 'Parfait' }));
    expect(await screen.findByText(/Vous avez accepté ce devis le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accepter le devis/ })).not.toBeInTheDocument();
  });
  it('déjà répondu : état affiché, pas de boutons ; lien invalide : message', async () => {
    get.mockResolvedValue({ ...dto, clientResponse: 'REFUSED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    renderPage();
    expect(await screen.findByText(/Vous avez refusé ce devis le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refuser le devis/ })).not.toBeInTheDocument();
    get.mockRejectedValue({ response: { status: 404 } });
    renderPage('dead');
    expect(await screen.findByText(/Ce lien n'est plus valide/)).toBeInTheDocument();
  });
  it("409 pendant l'envoi : message « déjà répondu » et rechargement", async () => {
    get.mockResolvedValueOnce(dto).mockResolvedValueOnce({ ...dto, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    respond.mockRejectedValue({ response: { status: 409, data: { code: 'already_answered' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Refuser le devis/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Confirmer$/ }));
    expect(await screen.findByText(/déjà reçu une réponse/)).toBeInTheDocument();
    expect(await screen.findByText(/Vous avez accepté ce devis le/)).toBeInTheDocument();
  });
  it("retire le thème sombre pendant l'affichage et le rétablit en quittant (document blanc, boîte de confirmation lisible)", async () => {
    get.mockResolvedValue(dto);
    document.documentElement.classList.add('dark');
    const { unmount } = renderPage();
    expect(await screen.findByText('Devis de Guillaume')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    unmount();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    document.documentElement.classList.remove('dark');
  });
  it('PayPal non proposé : aucun choix de paiement dans la confirmation, réponse sans moyen de paiement', async () => {
    get.mockResolvedValue(dto); respond.mockResolvedValue({ ...dto, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Accepter le devis/ }));
    expect(screen.queryByText(/Comment souhaitez-vous régler/)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^Confirmer$/ }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('tok', { decision: 'ACCEPTED', comment: '' }));
    expect(screen.queryByText(/PayPal/)).not.toBeInTheDocument();
  });
  it('PayPal proposé : choix Liquide / PayPal dans la confirmation ; PayPal choisi → lien PayPal.Me avec le montant', async () => {
    const withPaypal = { ...dto, finalPrice: 42.5, paypal: { handle: 'g3d', email: '' } };
    get.mockResolvedValue(withPaypal); respond.mockResolvedValue({ ...withPaypal, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z', paymentMethod: 'PAYPAL' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Accepter le devis/ }));
    expect(await screen.findByText(/Comment souhaitez-vous régler/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /PayPal/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmer$/ }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('tok', { decision: 'ACCEPTED', comment: '', paymentMethod: 'PAYPAL' }));
    const link = await screen.findByRole('link', { name: /Payer par PayPal/ });
    expect(link).toHaveAttribute('href', 'https://www.paypal.com/paypalme/g3d/42.50EUR');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
  it('PayPal proposé avec adresse seulement : adresse affichée et lien vers la page d\u2019envoi ; refus : pas de choix', async () => {
    const withEmail = { ...dto, paypal: { handle: '', email: 'g@x.fr' } };
    get.mockResolvedValue(withEmail); respond.mockResolvedValue({ ...withEmail, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z', paymentMethod: 'PAYPAL' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Refuser le devis/ }));
    expect(screen.queryByText(/Comment souhaitez-vous régler/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Accepter le devis/ }));
    fireEvent.click(await screen.findByRole('radio', { name: /PayPal/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmer$/ }));
    expect(await screen.findByText('g@x.fr')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir PayPal/ })).toHaveAttribute('href', 'https://www.paypal.com/myaccount/transfer/homepage/pay');
    expect(screen.queryByRole('link', { name: /Payer par PayPal/ })).not.toBeInTheDocument();
  });
  it('liquide choisi : mention « en liquide », pas de lien PayPal', async () => {
    const withPaypal = { ...dto, paypal: { handle: 'g3d', email: '' } };
    get.mockResolvedValue({ ...withPaypal, clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-12T10:00:00Z', paymentMethod: 'CASH' });
    renderPage();
    expect(await screen.findByText(/Paiement en liquide/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /PayPal/ })).not.toBeInTheDocument();
  });
  it('429 ou erreur serveur : message « indisponible », pas « lien invalide » (I3)', async () => {
    get.mockRejectedValue({ response: { status: 429 } });
    renderPage('busy');
    expect(await screen.findByText(/momentanément indisponible/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/Ce lien n'est plus valide/)).not.toBeInTheDocument();
  });
});
