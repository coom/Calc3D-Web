import type { PricingSettings } from '../pricing/types.js';
export interface UserSettingsDto extends PricingSettings { pdfShowCostBreakdown: boolean }
/** Paiement PayPal proposé au client (par utilisateur). Activer exige un pseudo PayPal.Me ou une adresse. */
export interface PaypalSettingsDto { paypalEnabled: boolean; paypalHandle: string; paypalEmail: string }
export interface MaterialDto { id: number; name: string; pricePerKg: number; sortOrder: number }
