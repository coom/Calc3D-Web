import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '@/i18n';
import { QuoteImageCard } from './QuoteImageCard';

const prepareImage = vi.fn(); const fetchImage = vi.fn(); const toastError = vi.fn();
vi.mock('@/lib/image-prepare', () => ({ prepareImage: (src: unknown) => prepareImage(src), ImagePrepareError: class ImagePrepareError extends Error {} }));
vi.mock('@/api/quotes.api', () => ({ quotesApi: { fetchImage: (url: string) => fetchImage(url) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }));
const DATA = 'data:image/jpeg;base64,/9j/AAA';

describe('QuoteImageCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { prepareImage.mockReset(); fetchImage.mockReset(); toastError.mockReset(); prepareImage.mockResolvedValue(DATA); });

  it('case décochée : Parcourir et URL inactifs ; cochée : fichier local préparé puis transmis ; Retirer et décocher renvoient null', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuoteImageCard image={null} onChange={onChange} />);
    const include = screen.getByLabelText(/Inclure une image/);
    expect(include).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Parcourir/ })).toBeDisabled();
    expect(screen.getByLabelText(/Adresse de l'image/)).toBeDisabled();
    fireEvent.click(include);
    expect(screen.getByRole('button', { name: /Parcourir/ })).toBeEnabled();
    const file = new File(['x'], 'piece.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(DATA));
    expect(prepareImage).toHaveBeenCalledWith(file);
    rerender(<QuoteImageCard image={DATA} onChange={onChange} />);
    expect(screen.getByRole('img', { name: /Aperçu/ })).toHaveAttribute('src', DATA);
    fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    rerender(<QuoteImageCard image={DATA} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Inclure une image/));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
  it("URL : le serveur télécharge, le navigateur prépare l'image reçue ; erreur typée affichée (adresse privée)", async () => {
    const onChange = vi.fn();
    fetchImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,iVBOR' });
    render(<QuoteImageCard image={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Inclure une image/));
    fireEvent.change(screen.getByLabelText(/Adresse de l'image/), { target: { value: 'https://img.example.com/a.png' } });
    fireEvent.click(screen.getByRole('button', { name: /Récupérer/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(DATA));
    expect(fetchImage).toHaveBeenCalledWith('https://img.example.com/a.png'); expect(prepareImage).toHaveBeenCalledWith('data:image/png;base64,iVBOR');
    await waitFor(() => expect(screen.getByRole('button', { name: /Récupérer/ })).toBeEnabled());
    fetchImage.mockRejectedValue({ response: { status: 400, data: { code: 'blocked_address' } } });
    fireEvent.click(screen.getByRole('button', { name: /Récupérer/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/réseau privé/)));
  });
  it('image déjà présente (devis chargé) : case cochée et aperçu affiché', () => {
    render(<QuoteImageCard image={DATA} onChange={() => {}} />);
    expect(screen.getByLabelText(/Inclure une image/)).toBeChecked();
    expect(screen.getByRole('img', { name: /Aperçu/ })).toBeInTheDocument();
  });
});
