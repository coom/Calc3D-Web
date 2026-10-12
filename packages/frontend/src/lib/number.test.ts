import { parseLocaleNumber, formatMoney } from './number';

describe('parseLocaleNumber', () => {
  it('accepte la virgule et le point décimal', () => {
    expect(parseLocaleNumber('1,5')).toBe(1.5);
    expect(parseLocaleNumber('1.5')).toBe(1.5);
    expect(parseLocaleNumber(' 12 ')).toBe(12);
    expect(parseLocaleNumber('0')).toBe(0);
  });
  it('tolère les séparateurs de milliers courants', () => {
    expect(parseLocaleNumber('1 234,56')).toBe(1234.56);
    expect(parseLocaleNumber('1\u202f234,56')).toBe(1234.56);
  });
  it('renvoie null pour vide ou non numérique, jamais NaN', () => {
    expect(parseLocaleNumber('')).toBeNull();
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('1,2,3')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formate selon la locale avec le symbole de l\'utilisateur', () => {
    expect(formatMoney(1234.5, '€', 'fr-FR').replace(/\u202f|\u00a0/g, ' ')).toBe('1 234,50 €');
    expect(formatMoney(1234.5, '$', 'en-US')).toBe('1,234.50 $');
    expect(formatMoney(1.23456, '€', 'fr-FR', 4)).toBe('1,2346 €');
  });
});
