import { emptyQuoteForm, toQuoteInput, toCreateBody, quoteFormFromDto } from './quote-form-state';
import type { QuoteDto } from '@calc3d/common';

const emptyQuoteFormDto = () => ({
  id: 1, createdAt: '', updatedAt: '', legacyId: null, settingsSnapshot: {} as QuoteDto['settingsSnapshot'],
  projectName: '', customer: '', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '',
  filamentLines: [], printHours: 0, printMinutes: 0, prepHours: 0, postHours: 0, designHours: 0, packagingHours: 0,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
}) as unknown as QuoteDto;

describe('quote-form-state', () => {
  it('quoteFormFromDto remplit le formulaire en texte depuis un devis, et l\'aller-retour redonne les mêmes entrées', () => {
    const dto = {
      id: 7, createdAt: '', updatedAt: '', legacyId: null, settingsSnapshot: {} as QuoteDto['settingsSnapshot'],
      projectName: 'Boîtier', customer: 'ACME', kind: 'ORDER', status: 'DONE', dueDate: '2026-11-01', comment: 'rush',
      filamentLines: [{ material: 'PETG', weightG: 42.5, pricePerKg: 20, wastePct: 5 }],
      printHours: 2, printMinutes: 45, prepHours: 0.25, postHours: 0, designHours: 0, packagingHours: 0.5,
      quantity: 3, consumables: 1.5, discountPct: 10, shippingCost: 6.5,
    } as unknown as QuoteDto;
    const f = quoteFormFromDto(dto);
    expect(f.lines[0]).toEqual({ material: 'PETG', weightG: '42.5', pricePerKg: '20', wastePct: '5' });
    expect(f.printMinutes).toBe('45'); expect(f.quantity).toBe('3'); expect(f.dueDate).toBe('2026-11-01'); expect(f.kind).toBe('ORDER');
    const body = toCreateBody(f);
    expect(body).toMatchObject({ projectName: 'Boîtier', customer: 'ACME', kind: 'ORDER', status: 'DONE', dueDate: '2026-11-01', comment: 'rush', printHours: 2, printMinutes: 45, prepHours: 0.25, packagingHours: 0.5, quantity: 3, consumables: 1.5, discountPct: 10, shippingCost: 6.5, filamentLines: dto.filamentLines });
  });
  it("image : absente du corps tant qu'elle n'a pas été touchée ; null retire, data URL remplace", () => {
    const f = emptyQuoteForm('PLA');
    expect(f.image).toBeNull(); expect(f.imageDirty).toBe(false);
    expect(toCreateBody(f)).not.toHaveProperty('image');
    expect(toCreateBody({ ...f, image: null, imageDirty: true }).image).toBeNull();
    expect(toCreateBody({ ...f, image: 'data:image/jpeg;base64,/9j/', imageDirty: true }).image).toBe('data:image/jpeg;base64,/9j/');
    const loaded = quoteFormFromDto({ ...emptyQuoteFormDto(), hasImage: true, image: 'data:image/jpeg;base64,/9j/' });
    expect(loaded.image).toBe('data:image/jpeg;base64,/9j/'); expect(loaded.imageDirty).toBe(false);
    expect(toCreateBody(loaded)).not.toHaveProperty('image');
  });
  it('convertit les textes (virgule acceptée) en QuoteInput', () => {
    const f = emptyQuoteForm('PLA');
    f.lines[0] = { material: 'PLA', weightG: '100', pricePerKg: '18', wastePct: '10' };
    f.printHours = '5'; f.prepHours = '1'; f.postHours = '0,5'; f.designHours = '2'; f.packagingHours = '0,25'; f.quantity = '1';
    const { input, errors } = toQuoteInput(f);
    expect(errors).toEqual([]);
    expect(input).toMatchObject({ printHours: 5, postHours: 0.5, packagingHours: 0.25, quantity: 1, filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }] });
  });
  it('signale quantité 0 / décimale, minutes hors plage et nombre invalide', () => {
    const f = emptyQuoteForm('PLA');
    f.quantity = '0'; f.printMinutes = '75'; f.prepHours = 'abc';
    expect(toQuoteInput(f).errors).toEqual(expect.arrayContaining(['quantity', 'printMinutes', 'prepHours']));
    f.quantity = '1,5';
    expect(toQuoteInput(f).errors).toContain('quantity');
  });
  it('un champ vide vaut 0 (sauf la quantité)', () => {
    const f = emptyQuoteForm('PLA');
    f.prepHours = '';
    const { input, errors } = toQuoteInput(f);
    expect(errors).toEqual([]); expect(input.prepHours).toBe(0);
  });
  it('toCreateBody ajoute les champs projet, dueDate vide → null', () => {
    const f = emptyQuoteForm('PLA'); f.projectName = ' Boîtier '; f.dueDate = '';
    const body = toCreateBody(f);
    expect(body).toMatchObject({ projectName: 'Boîtier', customer: '', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '' });
    expect(body).not.toHaveProperty('finalPrice');
  });
});
