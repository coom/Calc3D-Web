import type { Application } from 'express';
import type { PrismaClient } from '../../generated/prisma/index.js';

export const TRUST_HOPS_KEY = 'proxy.trustHops';
/** 1 = le seul nginx intégré (Dockerfile.frontend). Ajouter 1 par proxy ou WAF supplémentaire devant lui. */
export const DEFAULT_TRUST_HOPS = 1;
export const MAX_TRUST_HOPS = 16;

/**
 * Profondeur de proxys de confiance (réglage Express `trust proxy`) : nombre de sauts, en partant du backend,
 * à ignorer dans X-Forwarded-For pour retrouver l'IP du client (journal de connexions, audit, limiteurs).
 * Lue en base au démarrage, modifiable à chaud par l'admin (même solution que TS6-Manager).
 */
export async function loadTrustHops(prisma: PrismaClient): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: TRUST_HOPS_KEY } });
    const n = row ? Number(row.value) : DEFAULT_TRUST_HOPS;
    return Number.isInteger(n) && n >= 0 && n <= MAX_TRUST_HOPS ? n : DEFAULT_TRUST_HOPS;
  } catch {
    return DEFAULT_TRUST_HOPS;
  }
}

export async function saveTrustHops(prisma: PrismaClient, hops: number): Promise<void> {
  await prisma.appSetting.upsert({ where: { key: TRUST_HOPS_KEY }, update: { value: String(hops) }, create: { key: TRUST_HOPS_KEY, value: String(hops) } });
}

/** Express recompile la fonction de confiance à chaque `set` : aucun redémarrage nécessaire. */
export function applyTrustHops(app: Application, hops: number): void {
  app.set('trust proxy', hops);
}
