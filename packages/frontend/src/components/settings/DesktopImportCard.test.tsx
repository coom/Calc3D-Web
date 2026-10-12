import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { DesktopImportCard } from './DesktopImportCard';

const desktop = vi.fn();
vi.mock('@/api/import.api', () => ({ importApi: { desktop: (b: unknown) => desktop(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup() {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><DesktopImportCard /></QueryClientProvider>);
  return qc;
}
const NL = String.fromCharCode(10);

describe('DesktopImportCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => desktop.mockReset());

  it('envoie le texte des fichiers choisis et affiche le rapport avec les lignes rejetées', async () => {
    desktop.mockResolvedValue({ settings: { imported: true, materials: 11 }, quotes: { created: 3, updated: 1, rejected: [{ line: 5, reason: 'invalid Date' }] }, purchases: { created: 0, updated: 0, rejected: [] } });
    const qc = setup();
    qc.setQueryData(['settings'], { x: 1 }); qc.setQueryData(['materials'], []);
    fireEvent.change(screen.getByLabelText(/config\.json/), { target: { files: [new File(['{"Langue":"fr"}'], 'config.json')] } });
    fireEvent.change(screen.getByLabelText(/historique\.csv/), { target: { files: [new File(['"Id"' + NL + '"1"' + NL], 'historique.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: /^Importer$/ }));
    await waitFor(() => expect(desktop).toHaveBeenCalledWith({ config: '{"Langue":"fr"}', historique: '"Id"' + NL + '"1"' + NL }));
    expect(await screen.findByText(/Paramètres importés, 11 matière/)).toBeInTheDocument();
    expect(screen.getByText(/Devis : 3 créés, 1 mis à jour, 1 rejetés/)).toBeInTheDocument();
    expect(screen.getByText(/ligne 5 : invalid Date/)).toBeInTheDocument();
    expect(qc.getQueryState(['settings'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['materials'])?.isInvalidated).toBe(true);
  });
  it('sans fichier : message, aucun appel', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Importer$/ }));
    expect(await screen.findByText(/Choisis au moins un fichier/)).toBeInTheDocument();
    expect(desktop).not.toHaveBeenCalled();
  });
});
