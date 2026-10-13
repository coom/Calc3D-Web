import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { ReverseProxyCard } from './ReverseProxyCard';

const get = vi.fn(); const update = vi.fn();
vi.mock('@/api/proxy.api', () => ({ proxyApi: { get: () => get(), update: (h: number) => update(h) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><ReverseProxyCard /></QueryClientProvider>);
}

describe('ReverseProxyCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); update.mockReset(); });

  it("affiche la profondeur et l'IP détectée, enregistre une nouvelle profondeur puis recharge l'IP", async () => {
    get.mockResolvedValueOnce({ trustHops: 1, detectedIp: '10.0.0.2' }).mockResolvedValue({ trustHops: 2, detectedIp: '203.0.113.5' });
    update.mockResolvedValue({ trustHops: 2 });
    setup();
    expect(await screen.findByText('10.0.0.2')).toBeInTheDocument();
    const input = screen.getByLabelText(/Sauts de proxy de confiance/);
    expect(input).toHaveValue(1);
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(2));
    expect(await screen.findByText('203.0.113.5')).toBeInTheDocument();
  });
});
