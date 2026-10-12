import { describe, it, expect } from 'vitest';
import { zonedLocalToUtc } from './zoned-time.js';

describe('zonedLocalToUtc', () => {
  it('convertit une heure locale Paris (été et hiver) et une date seule', () => {
    expect(zonedLocalToUtc('2026-07-15 14:30', 'Europe/Paris').toISOString()).toBe('2026-07-15T12:30:00.000Z');
    expect(zonedLocalToUtc('2026-01-15 14:30', 'Europe/Paris').toISOString()).toBe('2026-01-15T13:30:00.000Z');
    expect(zonedLocalToUtc('2026-01-15', 'Europe/Paris').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(zonedLocalToUtc('2026-01-15 14:30', 'UTC').toISOString()).toBe('2026-01-15T14:30:00.000Z');
  });
  it('renvoie une date invalide pour un texte non reconnu', () => {
    expect(Number.isNaN(zonedLocalToUtc('hier', 'UTC').getTime())).toBe(true);
    expect(Number.isNaN(zonedLocalToUtc('2026-02-30 10:00', 'UTC').getTime())).toBe(true);
  });
});
