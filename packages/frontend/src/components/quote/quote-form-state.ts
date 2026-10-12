import type { CreateQuoteBody, QuoteDto, QuoteInput, QuoteKind, QuoteStatus } from '@calc3d/common';
import { parseLocaleNumber } from '@/lib/number';

export interface FilamentLineText { material: string; weightG: string; pricePerKg: string; wastePct: string }
export interface QuoteFormState {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus; dueDate: string; comment: string;
  quantity: string; lines: FilamentLineText[];
  printHours: string; printMinutes: string; prepHours: string; postHours: string; designHours: string; packagingHours: string;
  consumables: string; discountPct: string; shippingCost: string;
}
type NumericField = Exclude<keyof QuoteFormState, 'projectName' | 'customer' | 'kind' | 'status' | 'dueDate' | 'comment' | 'lines'>;
export type QuoteFormError = NumericField | `lines.${number}.${keyof Omit<FilamentLineText, 'material'>}`;

export const emptyLine = (material: string, pricePerKg = ''): FilamentLineText => ({ material, weightG: '0', pricePerKg, wastePct: '10' });

export function emptyQuoteForm(defaultMaterial: string, defaultPricePerKg = ''): QuoteFormState {
  return {
    projectName: '', customer: '', kind: 'QUOTE', status: 'PENDING', dueDate: '', comment: '',
    quantity: '1', lines: [emptyLine(defaultMaterial, defaultPricePerKg)],
    printHours: '0', printMinutes: '0', prepHours: '0', postHours: '0', designHours: '0', packagingHours: '0',
    consumables: '0', discountPct: '0', shippingCost: '0',
  };
}

/** Champ vide = 0. Négatif ou non numérique = erreur. */
function num(text: string, errors: QuoteFormError[], key: QuoteFormError): number {
  if (text.trim() === '') return 0;
  const n = parseLocaleNumber(text);
  if (n === null || n < 0) { errors.push(key); return 0; }
  return n;
}

export function toQuoteInput(f: QuoteFormState): { input: QuoteInput; errors: QuoteFormError[] } {
  const errors: QuoteFormError[] = [];
  const quantity = parseLocaleNumber(f.quantity);
  if (quantity === null || !Number.isInteger(quantity) || quantity < 1) errors.push('quantity');
  const printHours = num(f.printHours, errors, 'printHours');
  if (!Number.isInteger(printHours)) errors.push('printHours');
  const printMinutes = num(f.printMinutes, errors, 'printMinutes');
  if (!Number.isInteger(printMinutes) || printMinutes > 59) errors.push('printMinutes');
  const filamentLines = f.lines.map((l, i) => ({
    material: l.material,
    weightG: num(l.weightG, errors, `lines.${i}.weightG`),
    pricePerKg: num(l.pricePerKg, errors, `lines.${i}.pricePerKg`),
    wastePct: num(l.wastePct, errors, `lines.${i}.wastePct`),
  }));
  const input: QuoteInput = {
    filamentLines, printHours, printMinutes,
    prepHours: num(f.prepHours, errors, 'prepHours'), postHours: num(f.postHours, errors, 'postHours'),
    designHours: num(f.designHours, errors, 'designHours'), packagingHours: num(f.packagingHours, errors, 'packagingHours'),
    quantity: quantity !== null && Number.isInteger(quantity) && quantity >= 1 ? quantity : 1,
    consumables: num(f.consumables, errors, 'consumables'),
    discountPct: Math.min(100, num(f.discountPct, errors, 'discountPct')),
    shippingCost: num(f.shippingCost, errors, 'shippingCost'),
  };
  return { input, errors: [...new Set(errors)] };
}

export function toCreateBody(f: QuoteFormState): CreateQuoteBody {
  const { input } = toQuoteInput(f);
  return {
    ...input,
    projectName: f.projectName.trim(), customer: f.customer.trim(), kind: f.kind, status: f.status,
    dueDate: f.dueDate ? f.dueDate : null, comment: f.comment,
  };
}

const s = (n: number) => String(n);
/** Formulaire (texte) à partir d'un devis enregistré ; `String(n)` garde le point décimal, accepté par parseLocaleNumber. */
export function quoteFormFromDto(q: QuoteDto): QuoteFormState {
  return {
    projectName: q.projectName, customer: q.customer, kind: q.kind, status: q.status, dueDate: q.dueDate ?? '', comment: q.comment,
    quantity: s(q.quantity), lines: q.filamentLines.map((l) => ({ material: l.material, weightG: s(l.weightG), pricePerKg: s(l.pricePerKg), wastePct: s(l.wastePct) })),
    printHours: s(q.printHours), printMinutes: s(q.printMinutes), prepHours: s(q.prepHours), postHours: s(q.postHours), designHours: s(q.designHours), packagingHours: s(q.packagingHours),
    consumables: s(q.consumables), discountPct: s(q.discountPct), shippingCost: s(q.shippingCost),
  };
}
