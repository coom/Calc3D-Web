import type { ClientResponse, QuoteKind, QuoteStatus } from '../constants.js';

/** Fenêtres de la page Indicateurs, en jours glissants jusqu'à maintenant. */
export const INDICATOR_WINDOWS = [7, 30, 90, 365] as const;
export type IndicatorWindow = (typeof INDICATOR_WINDOWS)[number];
export type IndicatorGranularity = 'day' | 'week' | 'month';

/** Colonnes d'un devis nécessaires aux indicateurs (dates ISO 8601). */
export interface IndicatorQuoteRow {
  kind: QuoteKind; status: QuoteStatus; createdAt: string;
  clientResponse: ClientResponse | null; clientRespondedAt: string | null;
  convertedAt: string | null; paidAt: string | null;
}

/**
 * Compteurs d'une période, chacun daté par son événement : devis créés (createdAt, lignes nées devis),
 * commandes nouvelles (convertedAt, sinon createdAt d'une commande directe), commandes payées (paidAt),
 * devis acceptés / refusés (clientRespondedAt), devis convertis (convertedAt).
 */
export interface IndicatorCounts { newQuotes: number; newOrders: number; paidOrders: number; accepted: number; refused: number; converted: number }
/** Groupe chronologique : jour, semaine (blocs de 7 jours depuis le début de la fenêtre) ou mois calendaire ; `start` / `end` en yyyy-MM-dd. */
export interface IndicatorBucket extends IndicatorCounts { key: string; start: string; end: string }

export interface IndicatorsDto {
  days: IndicatorWindow; from: string; to: string;
  /** Instantané, indépendant de la période : commandes ni terminées ni payées. */
  openOrders: number;
  current: IndicatorCounts;
  /** Même durée, juste avant `from` : sert d'écart sur les tuiles. */
  previous: IndicatorCounts;
  /** Acceptation = acceptés / (acceptés + refusés) ; conversion = convertis / devis créés. null si dénominateur nul. */
  rates: { acceptancePct: number | null; conversionPct: number | null };
  granularity: IndicatorGranularity;
  buckets: IndicatorBucket[];
}
