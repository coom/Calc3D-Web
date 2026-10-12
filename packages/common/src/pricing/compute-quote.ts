import type { PricingSettings, QuoteInput, QuoteResult } from './types.js';

/**
 * Portage ligne à ligne de Invoke-Calcul (Calculateur3D.ps1). Fonction pure : le navigateur
 * l'appelle pour le résultat en direct, le serveur pour la valeur enregistrée, qui fait foi.
 * Les étapes et leur ordre sont ceux du README de l'application bureau (« Comment le prix est calculé »).
 */
export function computeQuote(settings: PricingSettings, input: QuoteInput): QuoteResult {
  if (settings.pricingMode === 'TARGET_MARGIN' && settings.pricingPct >= 100) {
    throw new RangeError('pricingPct must be below 100 in TARGET_MARGIN mode');
  }

  // 1. Filament : seules les lignes de poids > 0 comptent (comme la grille WPF).
  let filamentCost = 0;
  let filamentWeightG = 0;
  for (const line of input.filamentLines) {
    if (line.weightG > 0) {
      filamentCost += (line.weightG / 1000) * line.pricePerKg * (1 + line.wastePct / 100);
      filamentWeightG += line.weightG;
    }
  }

  // 2. Électricité
  const effectivePowerW = settings.printerPowerW * (settings.averageLoadPct / 100);
  const printTimeH = input.printHours + input.printMinutes / 60;
  const energyKwh = (effectivePowerW / 1000) * printTimeH;
  const electricityCost = settings.electricityPricePerKwh * energyKwh;

  // 3. Main d'œuvre, quatre postes
  const laborPrep = input.prepHours * settings.hourlyRatePreparation;
  const laborPost = input.postHours * settings.hourlyRatePostProcessing;
  const laborDesign = input.designHours * settings.hourlyRateDesign;
  const laborPackaging = input.packagingHours * settings.hourlyRatePackaging;

  // 4. Amortissement, maintenance, usure au prorata du temps d'impression
  const lifeRatio = settings.printerLifetimeHours > 0 ? printTimeH / settings.printerLifetimeHours : 0;
  const depreciation = settings.printerPurchasePrice * lifeRatio;
  const maintenance = settings.printerPurchasePrice * (settings.maintenancePct / 100) * lifeRatio;
  const wear = settings.wearCostPerHour * printTimeH;

  // 5. Coûts fixes
  const fixedCosts = settings.defaultFixedCosts + input.consumables;

  // 6. Sous-total et majoration aléas
  const subtotal = filamentCost + electricityCost + laborPrep + laborPost + laborDesign + laborPackaging + depreciation + maintenance + wear + fixedCosts;
  const contingency = subtotal * (settings.contingencyPct / 100);
  const costAfterContingency = subtotal + contingency;

  // 7. Prix de vente HT unitaire
  const pct = settings.pricingPct / 100;
  const unitPriceExclTax = settings.pricingMode === 'TARGET_MARGIN' ? costAfterContingency / (1 - pct) : costAfterContingency * (1 + pct);

  // 8. Total, remise, port, TVA
  const totalExclTax = unitPriceExclTax * input.quantity;
  const discountAmount = totalExclTax * (input.discountPct / 100);
  const afterDiscount = totalExclTax - discountAmount + input.shippingCost;
  const vatAmount = afterDiscount * (settings.vatPct / 100);
  let finalPrice = afterDiscount + vatAmount;

  // 9. Prix plancher
  const priceBeforeFloor = finalPrice;
  let floorApplied = false;
  if (settings.floorPrice > 0 && finalPrice < settings.floorPrice) {
    finalPrice = settings.floorPrice;
    floorApplied = true;
  }

  // 10. Arrondi à l'euro supérieur, en dernier. On arrondit d'abord au centime pour qu'un 12,00
  //     représenté en virgule flottante comme 12,0000001 ne devienne pas 13.
  const priceBeforeRounding = finalPrice;
  let roundingAmount = 0;
  let roundingApplied = false;
  if (settings.roundToEuro) {
    const rounded = Math.ceil(roundTo(finalPrice, 2));
    roundingAmount = rounded - finalPrice;
    finalPrice = rounded;
    roundingApplied = roundingAmount > 0;
  }

  // 11. Indicateurs sur le prix HT unitaire
  const pricePerGram = filamentWeightG > 0 ? unitPriceExclTax / filamentWeightG : 0;
  const pricePerHour = printTimeH > 0 ? unitPriceExclTax / printTimeH : 0;

  return {
    filamentWeightG, filamentCost, printTimeH, energyKwh, electricityCost,
    laborPrep, laborPost, laborDesign, laborPackaging, depreciation, maintenance, wear, fixedCosts,
    subtotal, contingency, costAfterContingency, unitPriceExclTax, totalExclTax, discountAmount,
    shippingCost: input.shippingCost, vatAmount, priceBeforeFloor, floorApplied,
    priceBeforeRounding, roundingAmount, roundingApplied, finalPrice, pricePerGram, pricePerHour,
  };
}

/** Arrondi au centime, demi vers le haut (comme [math]::Round(x, 2) de .NET pour tous les cas réels). */
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
