import { emptyQuoteForm, toQuoteInput, toCreateBody } from './quote-form-state';

describe('quote-form-state', () => {
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
