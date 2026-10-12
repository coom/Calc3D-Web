import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import PublicQuote from './PublicQuote';
import type { PublicQuoteDto } from '@calc3d/common';

const get = vi.fn(); const respond = vi.fn();
vi.mock('@/api/public.api', () => ({ publicApi: { get: (t: string) => get(t), respond: (t: string, b: unknown) => respond(t, b) } }));

const dto: PublicQuoteDto = { projectName: 'Boîtier <b>', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, quantity: 1, comment: '', filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printTimeH: 5, energyKwh: 2.7, contingencyPct: 10, laborTotal: 12.31, fixedCosts: 0, costLines: null, costAfterContingency: null, unitPriceExclTax: 20, totalExclTax: 20, discountPct: 0, discountAmount: 0, shippingCost: 0, vatPct: 0, vatAmount: 0, roundingApplied: false, roundingAmount: 0, floorApplied: false, priceBeforeFloor: 20, finalPrice: 20, currencySymbol: '€', ownerDisplayName: 'Guillaume', clientResponse: null, clientRespondedAt: null };
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
});
