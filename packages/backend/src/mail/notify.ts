import type { PrismaClient, Quote } from '../../generated/prisma/index.js';
import type { ClientResponse, PaymentMethod } from '@calc3d/common';
import { config } from '../config.js';
import { isSmtpEnabled, sendMail, type TransportFactory } from './mailer.js';
import { responseEmail } from './templates.js';

/** Après une réponse client : e-mail au propriétaire s'il a une adresse et si SMTP est actif. Meilleur effort (l'appelant journalise l'échec). */
export async function notifyOwnerOfResponse(prisma: PrismaClient, quote: Quote, factory?: TransportFactory): Promise<void> {
  if (!quote.clientResponse || !(await isSmtpEnabled(prisma))) return;
  const owner = await prisma.user.findUnique({ where: { id: quote.userId }, select: { email: true, language: true } });
  if (!owner?.email) return;
  const content = responseEmail(owner.language, { projectName: quote.projectName, customer: quote.customer, decision: quote.clientResponse as ClientResponse, comment: quote.clientComment, paymentMethod: quote.paymentMethod as PaymentMethod | null, quoteUrl: `${config.frontendUrl.replace(/\/+$/, '')}/?quote=${quote.id}` });
  await sendMail(prisma, { to: owner.email, ...content }, factory);
}
