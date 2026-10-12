import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { PricingSettingsForm } from './PricingSettingsForm';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const update = vi.fn();
vi.mock('@/api/settings.api', () => ({ settingsApi: { update: (b: unknown) => update(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const settings = { ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true };
function renderForm() {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><PricingSettingsForm settings={settings} onSaved={() => {}} /></QueryClientProvider>);
}

describe('PricingSettingsForm', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => update.mockReset());

  it('affiche les valeurs courantes et envoie un nombre saisi avec une virgule', async () => {
    update.mockResolvedValue(settings);
    renderForm();
    const wear = screen.getByLabelText(/Usure des pièces/) as HTMLInputElement;
    expect(wear.value).toBe('0');
    fireEvent.change(wear, { target: { value: '0,15' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ wearCostPerHour: 0.15, pricingMode: 'MARKUP', pdfShowCostBreakdown: true });
  });
  it('bloque l\'envoi sur un nombre invalide et sur une marge cible ≥ 100', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Prix de l'électricité/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/ }));
    expect(await screen.findByText('Nombre invalide')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Prix de l'électricité/), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText(/Mode de tarification/), { target: { value: 'TARGET_MARGIN' } });
    fireEvent.change(screen.getByLabelText(/Pourcentage de tarification/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/ }));
    expect(await screen.findByText(/inférieure à 100/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
