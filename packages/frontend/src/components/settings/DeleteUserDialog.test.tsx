import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '@/i18n';
import { DeleteUserDialog } from './DeleteUserDialog';

describe('DeleteUserDialog', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });

  it('exige la saisie exacte du nom d\'utilisateur avant de permettre la suppression, et annonce la perte des données', () => {
    const onConfirm = vi.fn();
    render(<DeleteUserDialog username="bob" open onOpenChange={() => {}} onConfirm={onConfirm} loading={false} />);
    expect(screen.getByText(/devis/i)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /Supprimer définitivement/ });
    expect(confirm).toBeDisabled();
    const input = screen.getByLabelText(/nom d'utilisateur/i);
    fireEvent.change(input, { target: { value: 'bo' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'bob' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
