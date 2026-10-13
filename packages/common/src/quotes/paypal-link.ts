/** Page d'envoi d'argent PayPal (le client y saisit lui-même l'adresse e-mail du destinataire). */
export const PAYPAL_SEND_URL = 'https://www.paypal.com/myaccount/transfer/homepage/pay';

/** Symboles de devise des paramètres → code ISO accepté par PayPal.Me. Inconnu : pas de code, PayPal applique la devise du compte. */
const CURRENCY_CODES: Record<string, string> = { '€': 'EUR', '$': 'USD', '£': 'GBP', 'CHF': 'CHF', 'CAD': 'CAD', 'AUD': 'AUD' };

/**
 * Lien PayPal.Me vers le pseudo du propriétaire, montant prérempli (deux décimales, point) suivi du code devise.
 * Le pseudo est encodé : il vient des paramètres du propriétaire, jamais du client, mais ne doit pas pouvoir altérer le chemin.
 */
export function paypalMeUrl(handle: string, amount: number, currencySymbol: string): string {
  const base = `https://www.paypal.com/paypalme/${encodeURIComponent(handle.trim())}`;
  if (!(amount > 0)) return base;
  const code = CURRENCY_CODES[currencySymbol.trim()] ?? '';
  return `${base}/${amount.toFixed(2)}${code}`;
}
