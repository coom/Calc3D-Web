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

const C = {
  fr: {
    welcomeSubject: 'Votre accès à Calc3D', resetSubject: 'Votre nouveau mot de passe Calc3D', hello: (n: string) => `Bonjour ${n},`,
    welcomeIntro: 'Un compte a été créé pour vous sur Calc3D. Voici vos informations de connexion :', resetIntro: 'Votre mot de passe Calc3D a été réinitialisé par un administrateur. Voici vos nouvelles informations de connexion :',
    url: 'Adresse', username: 'Identifiant', password: 'Mot de passe',
    temporary: (first: boolean) => `Ce mot de passe est temporaire : vous devrez le modifier lors de votre ${first ? 'première' : 'prochaine'} connexion.`,
    mfaRequired: (first: boolean) => `L'authentification à deux facteurs (MFA) est obligatoire sur votre compte : vous serez invité à la configurer lors de votre ${first ? 'première' : 'prochaine'} connexion.`,
    mfaInvite: "Pour plus de sécurité, nous vous invitons à activer l'authentification à deux facteurs (MFA) depuis Paramètres → Compte.",
    keep: 'Conservez cet e-mail en lieu sûr et ne le transmettez pas.',
  },
  en: {
    welcomeSubject: 'Your Calc3D access', resetSubject: 'Your new Calc3D password', hello: (n: string) => `Hello ${n},`,
    welcomeIntro: 'An account has been created for you on Calc3D. Here are your sign-in details:', resetIntro: 'Your Calc3D password has been reset by an administrator. Here are your new sign-in details:',
    url: 'Address', username: 'Username', password: 'Password',
    temporary: (first: boolean) => `This password is temporary: you will have to change it the ${first ? 'first' : 'next'} time you sign in.`,
    mfaRequired: (first: boolean) => `Two-factor authentication (MFA) is mandatory on your account: you will be asked to set it up the ${first ? 'first' : 'next'} time you sign in.`,
    mfaInvite: 'For better security, we invite you to enable two-factor authentication (MFA) from Settings → Account.',
    keep: 'Keep this e-mail in a safe place and do not forward it.',
  },
};

export interface CredentialsEmailParams { kind: 'welcome' | 'reset'; url: string; username: string; password: string; displayName: string; mustChangePassword: boolean; mfaRequired: boolean; mfaEnabled: boolean }

/**
 * E-mail d'identifiants envoyé à l'utilisateur à la création de son compte ou après une réinitialisation par un admin.
 * Contient le mot de passe en clair (décision de l'admin) : jamais journalisé. Mention « temporaire » si changement
 * imposé ; MFA présenté comme obligatoire si exigé, comme invitation sinon, rien s'il est déjà activé.
 */
export function credentialsEmail(l: string | null | undefined, p: CredentialsEmailParams): MailContent {
  const s = C[lang(l)]; const first = p.kind === 'welcome';
  const subject = first ? s.welcomeSubject : s.resetSubject;
  const notes = [p.mustChangePassword ? s.temporary(first) : '', p.mfaRequired ? s.mfaRequired(first) : (p.mfaEnabled ? '' : s.mfaInvite), s.keep].filter(Boolean);
  const text = [s.hello(p.displayName), first ? s.welcomeIntro : s.resetIntro, `${s.url} : ${p.url}\n${s.username} : ${p.username}\n${s.password} : ${p.password}`, ...notes].join('\n\n');
  const html = wrap(esc(subject), `<p>${esc(s.hello(p.displayName))}</p><p>${esc(first ? s.welcomeIntro : s.resetIntro)}</p>`
    + `<table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#6B7280">${esc(s.url)}</td><td><a href="${esc(p.url)}">${esc(p.url)}</a></td></tr>`
    + `<tr><td style="padding:2px 12px 2px 0;color:#6B7280">${esc(s.username)}</td><td><code>${esc(p.username)}</code></td></tr>`
    + `<tr><td style="padding:2px 12px 2px 0;color:#6B7280">${esc(s.password)}</td><td><code>${esc(p.password)}</code></td></tr></table>`
    + notes.map((n) => `<p>${esc(n)}</p>`).join(''));
  return { subject, text, html };
}
