import { describe, it, expect } from 'vitest';
import { credentialsEmail, quoteEmail, responseEmail } from './templates.js';

describe("gabarits d'e-mail", () => {
  it('e-mail devis : objet, lien, message échappé en HTML mais brut en texte', () => {
    const m = quoteEmail('fr', { projectName: 'Boîtier <b>', ownerName: 'Guillaume', url: 'http://x/q/abc', message: 'Bonjour <script>' });
    expect(m.subject).toBe('Devis Boîtier <b> – Guillaume');
    expect(m.html).toContain('Boîtier &lt;b&gt;'); expect(m.html).toContain('&lt;script&gt;'); expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('href="http://x/q/abc"'); expect(m.text).toContain('http://x/q/abc'); expect(m.text).toContain('Bonjour <script>');
    expect(quoteEmail('en', { projectName: 'P', ownerName: 'G', url: 'u', message: '' }).subject).toBe('Quote P – G');
  });
  it('e-mail réponse : objet selon la décision, commentaire échappé, lien vers le devis', () => {
    const m = responseEmail('fr', { projectName: 'P', customer: 'ACME', decision: 'REFUSED', comment: 'a < b', quoteUrl: 'http://x/?quote=7' });
    expect(m.subject).toBe('Devis P : refusé par ACME');
    expect(m.html).toContain('a &lt; b'); expect(m.html).toContain('http://x/?quote=7');
    expect(responseEmail('en', { projectName: 'P', customer: 'ACME', decision: 'ACCEPTED', comment: '', quoteUrl: 'u' }).subject).toBe('Quote P: accepted by ACME');
    expect(responseEmail('fr', { projectName: 'P', customer: '', decision: 'ACCEPTED', comment: '', quoteUrl: 'u' }).subject).toBe('Devis P : accepté par le client');
  });
  it('e-mail réponse : moyen de paiement choisi mentionné (liquide / PayPal), absent sinon', () => {
    const base = { projectName: 'P', customer: 'ACME', decision: 'ACCEPTED' as const, comment: '', quoteUrl: 'u' };
    expect(responseEmail('fr', { ...base, paymentMethod: 'PAYPAL' }).text).toContain('Paiement : PayPal');
    expect(responseEmail('fr', { ...base, paymentMethod: 'CASH' }).text).toContain('Paiement : en liquide');
    expect(responseEmail('en', { ...base, paymentMethod: 'CASH' }).text).toContain('Payment: cash');
    expect(responseEmail('fr', base).text).not.toContain('Paiement');
  });
});

describe("e-mail d'identifiants (création de compte, réinitialisation)", () => {
  const base = { url: 'https://calc3d.x/', username: 'bob', password: 'P<ss>1', displayName: 'Bob <b>', mustChangePassword: false, mfaRequired: false, mfaEnabled: false };
  it('bienvenue fr : adresse, identifiant, mot de passe, invitation MFA ; champs échappés en HTML, bruts en texte', () => {
    const m = credentialsEmail('fr', { ...base, kind: 'welcome' });
    expect(m.subject).toBe('Votre accès à Calc3D');
    expect(m.text).toContain('Bonjour Bob <b>'); expect(m.text).toContain('https://calc3d.x/'); expect(m.text).toContain('Identifiant : bob'); expect(m.text).toContain('Mot de passe : P<ss>1');
    expect(m.html).toContain('Bob &lt;b&gt;'); expect(m.html).toContain('P&lt;ss&gt;1'); expect(m.html).not.toContain('P<ss>1'); expect(m.html).toContain('href="https://calc3d.x/"');
    expect(m.text).toContain('nous vous invitons à activer'); expect(m.text).not.toContain('temporaire');
  });
  it('mot de passe temporaire et MFA obligatoire : mentions dédiées ; MFA déjà actif : aucune mention', () => {
    const tmp = credentialsEmail('fr', { ...base, kind: 'welcome', mustChangePassword: true, mfaRequired: true });
    expect(tmp.text).toContain('temporaire'); expect(tmp.text).toContain('première connexion'); expect(tmp.text).toContain('obligatoire'); expect(tmp.text).not.toContain('nous vous invitons');
    const on = credentialsEmail('fr', { ...base, kind: 'reset', mfaEnabled: true });
    expect(on.text).not.toMatch(/MFA/);
  });
  it('réinitialisation en : objet et intro dédiés, mention « next time you sign in » si temporaire', () => {
    const m = credentialsEmail('en', { ...base, kind: 'reset', mustChangePassword: true });
    expect(m.subject).toBe('Your new Calc3D password'); expect(m.text).toContain('reset by an administrator'); expect(m.text).toContain('temporary'); expect(m.text).toContain('next time you sign in');
    expect(credentialsEmail('en', { ...base, kind: 'welcome' }).subject).toBe('Your Calc3D access');
    expect(credentialsEmail(null, { ...base, kind: 'welcome' }).subject).toBe('Your Calc3D access');
  });
});
