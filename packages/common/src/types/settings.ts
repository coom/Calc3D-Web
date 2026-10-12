import type { PricingSettings } from '../pricing/types.js';
export interface UserSettingsDto extends PricingSettings { pdfShowCostBreakdown: boolean }
export interface MaterialDto { id: number; name: string; pricePerKg: number; sortOrder: number }
