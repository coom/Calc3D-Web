import { describe, it, expect } from 'vitest';
import { paypalMeUrl, PAYPAL_SEND_URL } from './paypal-link.js';

describe('paypalMeUrl', () => {
  it('pseudo, montant à deux décimales et code devise déduit du symbole', () => {
    expect(paypalMeUrl('guillaume3d', 42.5, '€')).toBe('https://www.paypal.com/paypalme/guillaume3d/42.50EUR');
    expect(paypalMeUrl('bob', 289, '$')).toBe('https://www.paypal.com/paypalme/bob/289.00USD');
    expect(paypalMeUrl('bob', 10, '£')).toBe('https://www.paypal.com/paypalme/bob/10.00GBP');
    expect(paypalMeUrl('bob', 10, 'CHF')).toBe('https://www.paypal.com/paypalme/bob/10.00CHF');
  });
  it('symbole inconnu : montant sans devise (PayPal applique celle du compte) ; montant nul ou négatif : lien sans montant', () => {
    expect(paypalMeUrl('bob', 12.345, '¥')).toBe('https://www.paypal.com/paypalme/bob/12.35');
    expect(paypalMeUrl('bob', 0, '€')).toBe('https://www.paypal.com/paypalme/bob');
    expect(paypalMeUrl('bob', -3, '€')).toBe('https://www.paypal.com/paypalme/bob');
  });
  it('le pseudo est encodé : aucun caractère ne peut altérer le chemin', () => {
    expect(paypalMeUrl('a/b?c#d', 1, '€')).toBe('https://www.paypal.com/paypalme/a%2Fb%3Fc%23d/1.00EUR');
    expect(PAYPAL_SEND_URL).toMatch(/^https:\/\/www\.paypal\.com\//);
  });
});
