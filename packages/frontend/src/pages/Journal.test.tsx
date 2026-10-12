import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import { journalApi } from '@/api/journal.api';
import { useAuthStore } from '@/stores/auth.store';
import Journal from './Journal';

vi.mock('@/api/journal.api', () => ({ journalApi: { web: vi.fn() } }));

function setup(role: 'admin' | 'user' = 'admin') {
  useAuthStore.setState({ accessToken: 't', refreshToken: 'r', user: { id: 1, username: 'u', displayName: 'U', role } });
  vi.mocked(journalApi.web).mockResolvedValue({ total: 1, page: 1, limit: 50, items: [{ id: 1, username: 'nobody', userId: null, ip: '1.2.3.4', country: 'FR', success: false, reason: 'unknown_user', createdAt: '2026-10-10T09:00:00Z' }] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/journal']}>
        <Routes>
          <Route path="/journal" element={<Journal />} />
          <Route path="/" element={<div>home placeholder</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Journal page', () => {
  beforeAll(async () => { await i18n.changeLanguage('en'); });
  it('shows web logins with ip, country and result, and filters by name', async () => {
    setup();
    expect(await screen.findByText('nobody')).toBeInTheDocument();
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText('FR')).toBeInTheDocument();
    expect(screen.getByText('unknown user')).toBeInTheDocument();
    expect(screen.getByText('failure')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'nob' } });
    await waitFor(() => expect(journalApi.web).toHaveBeenCalledWith(expect.objectContaining({ q: 'nob', page: 1 })));
  });
  it('converts the from date to a local-day boundary and returns to page 1', async () => {
    setup();
    await screen.findByText('nobody');
    vi.mocked(journalApi.web).mockResolvedValue({ total: 120, page: 1, limit: 50, items: [] });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-09' } });
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '›' }));
    await waitFor(() => expect(journalApi.web).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-10' } });
    await waitFor(() => expect(journalApi.web).toHaveBeenLastCalledWith(expect.objectContaining({ from: new Date('2026-10-10T00:00:00').toISOString(), page: 1 })));
  });
  it('redirects a plain user to the home page', async () => {
    vi.mocked(journalApi.web).mockClear();
    setup('user');
    expect(await screen.findByText('home placeholder')).toBeInTheDocument();
    expect(journalApi.web).not.toHaveBeenCalled();
  });
});
