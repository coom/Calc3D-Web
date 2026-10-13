import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { PaypalCard } from './PaypalCard';

const getPaypal = vi.fn(); const updatePaypal = vi.fn();
vi.mock('@/api/settings.api', () => ({ settingsApi: { getPaypal: () => getPaypal(), updatePaypal: (b: unknown) => updatePaypal(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><PaypalCard /></QueryClientProvider>);
}

describe('PaypalCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { getPaypal.mockReset(); updatePaypal.mockReset(); });

  it('charge les valeurs, bloque l’activation sans pseudo ni adresse, puis enregistre pseudo, adresse et activation', async () => {
    getPaypal.mockResolvedValue({ paypalEnabled: false, paypalHandle: '', paypalEmail: '' });
    updatePaypal.mockResolvedValue({ paypalEnabled: true, paypalHandle: 'g3d', paypalEmail: 'g@x.fr' });
    setup();
    const toggle = await screen.findByRole('switch', { name: /Proposer le paiement PayPal/ });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/Saisissez un pseudo PayPal.Me ou une adresse/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Pseudo PayPal.Me/), { target: { value: 'g3d' } });
    fireEvent.change(screen.getByLabelText(/Adresse e-mail PayPal/), { target: { value: 'g@x.fr' } });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(updatePaypal).toHaveBeenCalledWith({ paypalEnabled: true, paypalHandle: 'g3d', paypalEmail: 'g@x.fr' }));
  });
  it('valeurs existantes affichées ; effacer le pseudo et l’adresse désactive PayPal à l’envoi', async () => {
    getPaypal.mockResolvedValue({ paypalEnabled: true, paypalHandle: 'g3d', paypalEmail: '' });
    updatePaypal.mockResolvedValue({ paypalEnabled: false, paypalHandle: '', paypalEmail: '' });
    setup();
    expect(await screen.findByLabelText(/Pseudo PayPal.Me/)).toHaveValue('g3d');
    expect(screen.getByRole('switch', { name: /Proposer le paiement PayPal/ })).toBeChecked();
    fireEvent.change(screen.getByLabelText(/Pseudo PayPal.Me/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(updatePaypal).toHaveBeenCalledWith({ paypalEnabled: false, paypalHandle: '', paypalEmail: '' }));
  });
});
