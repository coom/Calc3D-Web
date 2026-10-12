import type { PricingMode } from '../constants.js';

/** Paramètres qui influencent le prix (transposition de config.json, sans Langue ni PdfDetailCouts). */
export interface PricingSettings {
  currencySymbol: string;
  electricityPricePerKwh: number;
  printerPowerW: number;
  averageLoadPct: number;
  hourlyRatePreparation: number;
  hourlyRatePostProcessing: number;
  hourlyRateDesign: number;
  hourlyRatePackaging: number;
  pricingMode: PricingMode;
  pricingPct: number;
  contingencyPct: number;
  vatPct: number;
  printerPurchasePrice: number;
  printerLifetimeHours: number;
  maintenancePct: number;
  wearCostPerHour: number;
  defaultFixedCosts: number;
  floorPrice: number;
  roundToEuro: boolean;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  currencySymbol: '€', electricityPricePerKwh: 0.1952, printerPowerW: 1350, averageLoadPct: 40,
  hourlyRatePreparation: 12.31, hourlyRatePostProcessing: 12.31, hourlyRateDesign: 12.31, hourlyRatePackaging: 12.31,
  pricingMode: 'MARKUP', pricingPct: 20, contingencyPct: 10, vatPct: 0,
  printerPurchasePrice: 2717, printerLifetimeHours: 6000, maintenancePct: 5, wearCostPerHour: 0,
  defaultFixedCosts: 0, floorPrice: 5, roundToEuro: false,
};

export interface FilamentLine { material: string; weightG: number; pricePerKg: number; wastePct: number }

export interface QuoteInput {
  filamentLines: FilamentLine[];
  printHours: number;
  printMinutes: number;
  prepHours: number;
  postHours: number;
  designHours: number;
  packagingHours: number;
  quantity: number;
  consumables: number;
  discountPct: number;
  shippingCost: number;
}

export interface QuoteResult {
  filamentWeightG: number; filamentCost: number;
  printTimeH: number; energyKwh: number; electricityCost: number;
  laborPrep: number; laborPost: number; laborDesign: number; laborPackaging: number;
  depreciation: number; maintenance: number; wear: number; fixedCosts: number;
  subtotal: number; contingency: number; costAfterContingency: number;
  unitPriceExclTax: number; totalExclTax: number; discountAmount: number; shippingCost: number; vatAmount: number;
  priceBeforeFloor: number; floorApplied: boolean;
  priceBeforeRounding: number; roundingAmount: number; roundingApplied: boolean;
  finalPrice: number; pricePerGram: number; pricePerHour: number;
}
