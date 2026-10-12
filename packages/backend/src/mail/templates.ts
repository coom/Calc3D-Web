import type { ClientResponse } from '@calc3d/common';

export interface MailContent { subject: string; text: string; html: string }
type Lang = 'fr' | 'en';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const lang = (l: string | null | undefined): Lang => (l === 'fr' ? 'fr' : 'en');
const wrap = (title: string, body: string) => `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#111827"><h2 style="font-size:18px">${title}</h2>${body}<p style="color:#6B7280;font-size:12px">Calc3D</p></body></html>`;

const T = {
  fr: {
    quoteSubject: (p: string, o: string) => `Devis ${p} – ${o}`, quoteIntro: (o: string) => `${o} vous a envoyé un devis.`, open: 'Consulter le devis et répondre', personal: 'Ce lien est personnel : ne le transmettez pas.',
    respSubject: (p: string, d: ClientResponse, c: string) => `Devis ${p} : ${d === 'ACCEPTED' ? 'accepté' : 'refusé'} par ${c || 'le client'}`,
    respIntro: (c: string, d: ClientResponse) => `${c || 'Le client'} a ${d === 'ACCEPTED' ? 'accepté' : 'refusé'} le devis.`, comment: 'Commentaire :', openQuote: 'Ouvrir le devis',
  },
  en: {
    quoteSubject: (p: string, o: string) => `Quote ${p} – ${o}`, quoteIntro: (o: string) => `${o} sent you a quote.`, open: 'View the quote and answer', personal: 'This link is personal: please do not forward it.',
    respSubject: (p: string, d: ClientResponse, c: string) => `Quote ${p}: ${d === 'ACCEPTED' ? 'accepted' : 'declined'} by ${c || 'the customer'}`,
    respIntro: (c: string, d: ClientResponse) => `${c || 'The customer'} ${d === 'ACCEPTED' ? 'accepted' : 'declined'} the quote.`, comment: 'Comment:', openQuote: 'Open the quote',
  },
};

/** E-mail envoyé au client avec le lien de partage. Champs libres encodés HTML ; version texte brute. Aucune ressource distante. */
export function quoteEmail(l: string | null | undefined, p: { projectName: string; ownerName: string; url: string; message: string }): MailContent {
  const s = T[lang(l)];
  const subject = s.quoteSubject(p.projectName, p.ownerName);
  const text = [s.quoteIntro(p.ownerName), p.message ? `\n${p.message}\n` : '', `${s.open} : ${p.url}`, s.personal].filter(Boolean).join('\n');
  const html = wrap(esc(subject), `<p>${esc(s.quoteIntro(p.ownerName))}</p>${p.message ? `<p style="white-space:pre-wrap">${esc(p.message)}</p>` : ''}<p><a href="${esc(p.url)}">${esc(s.open)}</a></p><p style="color:#6B7280">${esc(s.personal)}</p>`);
  return { subject, text, html };
}

/** Notification au propriétaire après la réponse du client. */
export function responseEmail(l: string | null | undefined, p: { projectName: string; customer: string; decision: ClientResponse; comment: string; quoteUrl: string }): MailContent {
  const s = T[lang(l)];
  const subject = s.respSubject(p.projectName, p.decision, p.customer);
  const text = [s.respIntro(p.customer, p.decision), p.comment ? `${s.comment}\n${p.comment}` : '', `${s.openQuote} : ${p.quoteUrl}`].filter(Boolean).join('\n\n');
  const html = wrap(esc(subject), `<p>${esc(s.respIntro(p.customer, p.decision))}</p>${p.comment ? `<p><strong>${esc(s.comment)}</strong></p><p style="white-space:pre-wrap">${esc(p.comment)}</p>` : ''}<p><a href="${esc(p.quoteUrl)}">${esc(s.openQuote)}</a></p>`);
  return { subject, text, html };
}
