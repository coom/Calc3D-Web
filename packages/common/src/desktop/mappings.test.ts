import { describe, it, expect } from 'vitest';
import { DESKTOP_KIND, DESKTOP_STATUS, DESKTOP_CATEGORY, DESKTOP_PRICING_MODE, unprotectCsvText } from './mappings.js';

describe('correspondances bureau → clés', () => {
  it('traduit les valeurs françaises canoniques des CSV', () => {
    expect(DESKTOP_KIND['Commande']).toBe('ORDER'); expect(DESKTOP_KIND['Devis']).toBe('QUOTE');
    expect(DESKTOP_STATUS['Termine']).toBe('DONE'); expect(DESKTOP_STATUS['En pause']).toBe('ON_HOLD'); expect(DESKTOP_STATUS['Programme']).toBe('SCHEDULED');
    expect(DESKTOP_CATEGORY['Pieces detachees']).toBe('SPARE_PARTS'); expect(DESKTOP_CATEGORY['Autre']).toBe('OTHER');
    expect(DESKTOP_PRICING_MODE['MargeCible']).toBe('TARGET_MARGIN'); expect(DESKTOP_PRICING_MODE['Markup']).toBe('MARKUP');
  });
  it('unprotectCsvText retire le préfixe de protection contre les formules, et lui seul', () => {
    expect(unprotectCsvText("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(unprotectCsvText("'-5")).toBe('-5');
    expect(unprotectCsvText("'Bonjour")).toBe("'Bonjour");
    expect(unprotectCsvText('Normal')).toBe('Normal');
  });
});
