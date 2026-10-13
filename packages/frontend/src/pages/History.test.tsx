import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import History from './History';

const list = vi.fn(); const convert = vi.fn(); const remove = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { list: (q: unknown) => list(q), convert: (id: number) => convert(id), remove: (id: number) => remove(id) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ currencySymbol: '€' }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const item = (over: Record<string, unknown>) => ({ id: 1, createdAt: '2026-10-03T10:00:00Z', projectName: 'Boîtier', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', quantity: 2, finalPrice: 114.31, ...over });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/history']}><Routes><Route path="/history" element={<History />} /><Route path="/" element={<div>QUOTE PAGE</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  return qc;
}

describe('page Historique', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { list.mockReset(); convert.mockReset(); remove.mockReset(); list.mockResolvedValue({ total: 2, page: 1, limit: 50, items: [item({ shared: true, sharedAt: '2026-10-04T10:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-05T10:00:00Z', clientComment: '', responseSeenAt: null, clientEmail: '', paymentMethod: null }), item({ id: 2, createdAt: '2026-09-15T10:00:00Z', projectName: 'Support', kind: 'ORDER', status: 'DONE' })] }); });

  it('groupe par mois, affiche les lignes, replie un mois', async () => {
    renderPage();
    expect(await screen.findByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Septembre 2026')).toBeInTheDocument();
    expect(screen.getByText('Boîtier')).toBeInTheDocument();
    expect(screen.getByText('Commande', { selector: 'div' })).toBeInTheDocument(); // le badge, pas l'option du filtre
    fireEvent.click(screen.getByRole('button', { name: /Septembre 2026/ }));
    expect(screen.queryByText('Support')).not.toBeInTheDocument();
  });
  it('les filtres relancent la requête avec q, kind et status', async () => {
    renderPage();
    await screen.findByText('Boîtier');
    fireEvent.change(screen.getByPlaceholderText(/Recherche/), { target: { value: 'acme' } });
    fireEvent.change(screen.getByLabelText(/^Type$/), { target: { value: 'ORDER' } });
    fireEvent.change(screen.getByLabelText(/^Statut$/), { target: { value: 'DONE' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'acme', kind: 'ORDER', status: 'DONE', page: 1 })));
  });
  it('convertir ou supprimer invalide le détail du devis en cache (sinon la page Devis rechargerait un devis périmé et pourrait rétrograder la commande)', async () => {
    convert.mockResolvedValue(item({ kind: 'ORDER' })); remove.mockResolvedValue(undefined);
    const qc = renderPage();
    await screen.findByText('Boîtier');
    qc.setQueryData(['quote', 1], item({}));
    qc.setQueryData(['finances', 'all'], { period: 'all' });
    fireEvent.click(screen.getAllByRole('button', { name: /Convertir en commande/ })[0]);
    await waitFor(() => expect(convert).toHaveBeenCalledWith(1));
    await waitFor(() => expect(qc.getQueryState(['quote', 1])?.isInvalidated).toBe(true));
    expect(qc.getQueryState(['finances', 'all'])?.isInvalidated).toBe(true);
  });
  it('charge un devis dans la page Devis, convertit, supprime après confirmation', async () => {
    convert.mockResolvedValue(item({ kind: 'ORDER' })); remove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Boîtier');
    fireEvent.click(screen.getAllByRole('button', { name: /Convertir en commande/ })[0]);
    await waitFor(() => expect(convert).toHaveBeenCalledWith(1));
    expect(screen.getAllByRole('button', { name: /Convertir en commande/ })[1]).toBeDisabled(); // ligne déjà commande
    fireEvent.click(screen.getAllByRole('button', { name: /^Supprimer$/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
    fireEvent.click(screen.getAllByRole('button', { name: /Charger dans Devis/ })[0]);
    expect(await screen.findByText('QUOTE PAGE')).toBeInTheDocument();
  });
  it('affiche le badge de réponse et filtre par réponse client', async () => {
    renderPage();
    expect(await screen.findByText('Accepté')).toBeInTheDocument();
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Réponse client/), { target: { value: 'REFUSED' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ response: 'REFUSED', page: 1 })));
  });
});
