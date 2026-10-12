import nodemailer from 'nodemailer';
import type { PrismaClient, SmtpSettings } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { decrypt } from '../utils/crypto.js';

export interface MailMessage { to: string; subject: string; text: string; html: string }
export interface SmtpTransportOptions { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } }
export interface MailTransport { sendMail(m: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown> }
export type TransportFactory = (opts: SmtpTransportOptions) => MailTransport;

/** Seul appel réseau sortant du backend : SMTP vers l'hôte configuré par l'admin (spec lot 4 §7). */
const nodemailerFactory: TransportFactory = (opts) => nodemailer.createTransport(opts);

export async function getSmtpSettings(prisma: PrismaClient): Promise<SmtpSettings | null> { return prisma.smtpSettings.findUnique({ where: { id: 1 } }); }
export async function isSmtpEnabled(prisma: PrismaClient): Promise<boolean> { const s = await getSmtpSettings(prisma); return !!s && s.enabled && s.host !== ''; }

export function transportOptions(s: SmtpSettings): SmtpTransportOptions {
  return { host: s.host, port: s.port, secure: s.secure, ...(s.username ? { auth: { user: s.username, pass: s.passwordEnc ? decrypt(s.passwordEnc) : '' } } : {}) };
}

/** 409 smtp_disabled si non configuré ; 502 smtp_failed (message du transport en `details`) si l'envoi échoue. */
export async function sendMail(prisma: PrismaClient, msg: MailMessage, factory: TransportFactory = nodemailerFactory): Promise<void> {
  const s = await getSmtpSettings(prisma);
  if (!s || !s.enabled || !s.host) throw new AppError(409, 'SMTP is not configured', undefined, 'smtp_disabled');
  const from = s.fromName ? `"${s.fromName.replace(/"/g, '')}" <${s.fromAddress}>` : s.fromAddress;
  try { await factory(transportOptions(s)).sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }); }
  catch (err) { throw new AppError(502, 'E-mail could not be sent', err instanceof Error ? err.message : String(err), 'smtp_failed'); }
}
