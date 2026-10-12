import { describe, it, expect } from 'vitest';
import { quoteEmail, responseEmail } from './templates.js';

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
});
