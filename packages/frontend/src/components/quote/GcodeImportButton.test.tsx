import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { GcodeImportButton } from './GcodeImportButton';

const create = vi.fn();
vi.mock('@/api/materials.api', () => ({ materialsApi: { create: (b: unknown) => create(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const catalog = [{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }, { id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 }];

function setup(onApply = vi.fn()) {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><GcodeImportButton materials={catalog} onApply={onApply} /></QueryClientProvider>);
  return onApply;
}
const pick = (files: File[]) => fireEvent.change(screen.getByTestId('gcode-input'), { target: { files } });

describe('GcodeImportButton', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => create.mockReset());

  it('cumule durée et poids par matière sur deux fichiers et propose le nom du projet pour un seul fichier', async () => {
    const onApply = setup();
    pick([new File(['; estimated printing time (normal mode) = 1h 30m\n; filament used [g] = 10\n; filament_type = PLA\n'], 'support.gcode')]);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0]).toEqual({ printHours: 1, printMinutes: 30, lines: [{ material: 'PLA', weightG: '10', pricePerKg: '18', wastePct: '10' }], projectName: 'support' });
    pick([new File(['; total estimated time: 45m\n; total filament weight [g] : 5, 2\n; filament_type = PLA;PETG\n'], 'a.gcode'), new File(['; total estimated time: 1h\n; filament used [g] = 3\n; filament_type = pla\n'], 'b.gcode')]);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
    expect(onApply.mock.calls[1][0]).toEqual({ printHours: 1, printMinutes: 45, lines: [{ material: 'PLA', weightG: '8', pricePerKg: '18', wastePct: '10' }, { material: 'PETG', weightG: '2', pricePerKg: '20', wastePct: '10' }] });
  });
  it('ajoute au catalogue une matière inconnue (nettoyée) à 20 €/kg', async () => {
    create.mockResolvedValue({ id: 3, name: 'ASA Glow', pricePerKg: 20, sortOrder: 2 });
    const onApply = setup();
    pick([new File(['; filament used [g] = 4\n; filament_type = ASA Glow' + String.fromCharCode(1) + '\n'], 'x.gcode')]);
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'ASA Glow', pricePerKg: 20 }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].lines).toEqual([{ material: 'ASA Glow', weightG: '4', pricePerKg: '20', wastePct: '10' }]);
  });
  it('fichier sans métadonnée : rien appliqué, avertissement', async () => {
    const { toast } = await import('sonner');
    const onApply = setup();
    pick([new File(['G1 X1\n'], 'vide.gcode')]);
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(onApply).not.toHaveBeenCalled();
  });
});
