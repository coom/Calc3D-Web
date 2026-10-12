import { monthKey, monthLabel, formatDate, todayIso } from './dates';

describe('dates', () => {
  it('monthKey extrait yyyy-MM en heure locale', () => {
    expect(monthKey('2026-10-12T10:00:00.000Z')).toMatch(/^2026-10$/);
    expect(monthKey('2026-03-05')).toBe('2026-03');
  });
  it('monthLabel : mois en toutes lettres avec majuscule initiale', () => {
    expect(monthLabel('2026-10', 'fr')).toBe('Octobre 2026');
    expect(monthLabel('2026-10', 'en')).toBe('October 2026');
  });
  it('formatDate : date courte localisée', () => {
    expect(formatDate('2026-10-05', 'fr')).toBe('05/10/2026');
    expect(formatDate('2026-10-05', 'en')).toBe('10/5/2026');
  });
  it('todayIso : yyyy-MM-dd', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
