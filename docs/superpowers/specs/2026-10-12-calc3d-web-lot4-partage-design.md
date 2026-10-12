# Calc3D-Web — Lot 4 : lien client, réponse au devis, e-mail (SMTP)

Date : 2026-10-12. Complète la spec générale `2026-10-12-calc3d-web-design.md` (lots 1 à 3 implémentés). Les invariants de cette spec générale (cloisonnement `ownerScope`, 404 pour autrui, validation zod, montants enregistrés jamais recalculés, données canoniques) restent en vigueur ; seul l'invariant « aucun appel réseau sortant du backend » est amendé (§7).

## 1. Objectif

Permettre au propriétaire d'un devis de l'envoyer à son client par un lien unique en lecture seule ; le client accepte ou refuse ; la réponse est visible dans l'application ; un serveur SMTP configurable permet d'envoyer le lien par e-mail et de notifier le propriétaire.

### Demandé par le partenaire
- Lien unique par devis, lecture seule pour le client, boutons accepter / refuser.
- Réponse visible « par l'admin dans la section adéquate » : lu comme **le propriétaire du devis**, dans l'Historique et sur le devis chargé. Le rôle admin n'obtient aucun accès aux devis d'autrui.
- Configuration SMTP pour envoyer le devis par e-mail.

### Arbitrages validés (conception approuvée le 2026-10-12)
- Le client n'a pas de compte : le lien seul donne accès.
- Le client voit exactement ce que montre le PDF : mêmes sections, option « détail des coûts » respectée, jamais le mode de tarification ni la marge.
- Pas de conversion automatique en commande à l'acceptation : le propriétaire convertit lui-même.
- Lien sans expiration automatique, révocable et régénérable.
- Une seule réponse par lien ; pour rouvrir, le propriétaire régénère le lien.
- Le partage fonctionne sans SMTP (lien à copier) ; l'e-mail est un plus.

### Hors périmètre
Signature électronique, pièce jointe PDF dans l'e-mail, relances automatiques, plusieurs destinataires par devis, modèle d'e-mail personnalisable, file d'attente d'envoi.

## 2. Modèle de données

Ajouts sur `Quote` :

| Champ | Type | Rôle |
|---|---|---|
| `shareTokenHash` | `String?` `@unique` | SHA-256 hex du jeton de partage ; `null` = non partagé |
| `sharedAt` | `DateTime?` | date de (re)génération du lien |
| `clientResponse` | `String?` | `ACCEPTED` / `REFUSED` / `null` (clé canonique, jamais traduite) |
| `clientRespondedAt` | `DateTime?` | |
| `clientComment` | `String` `@default("")` | commentaire libre du client, 2 000 car. max |
| `responseSeenAt` | `DateTime?` | `null` tant que le propriétaire n'a pas vu la réponse (compteur « non lus ») |
| `clientEmail` | `String` `@default("")` | dernière adresse à laquelle le lien a été envoyé |

Ajout sur `User` : `email String @default("")` (notification du propriétaire ; modifiable dans Paramètres → Compte, validé `z.string().email().max(200)` ou vide).

Nouvelle table `SmtpSettings` (une seule ligne, `id = 1`) :

| Champ | Type |
|---|---|
| `host` `String`, `port` `Int` (défaut 587), `secure` `Boolean` (TLS implicite, défaut false), `username` `String`, `passwordEnc` `String` (chiffré par `utils/crypto.encrypt`, jamais renvoyé), `fromAddress` `String`, `fromName` `String`, `enabled` `Boolean`, `updatedAt` |

Constantes communes (`@calc3d/common`) : `CLIENT_RESPONSES = ['ACCEPTED', 'REFUSED']`, type `ClientResponse`. DTO `QuoteDto` étendu des champs ci-dessus sauf `shareTokenHash` (remplacé par `shared: boolean`). DTO public `PublicQuoteDto` (§4).

Indices : `@@index([userId, clientResponse])`.

## 3. Lien de partage (côté propriétaire)

Routes sous `/api/quotes/:id` (authentifiées, `ownerScope`, 404 pour autrui) :

- `POST /share` → génère un jeton (`crypto.randomBytes(32).toString('base64url')`), stocke son SHA-256, `sharedAt = now`, remet `clientResponse`, `clientRespondedAt`, `clientComment`, `responseSeenAt` à vide (réouverture). Réponse : `{ url: "<FRONTEND_URL>/q/<jeton>" }`. Le jeton en clair n'est **jamais stocké** ni renvoyé une seconde fois : le propriétaire régénère s'il l'a perdu.
- `DELETE /share` → `shareTokenHash = null` (révocation) ; la réponse déjà reçue est conservée.
- `POST /share/email` `{ to: email, message?: string ≤ 1000 }` → **régénère** le jeton à chaque envoi (le jeton n'est jamais stocké en clair, un lien existant ne peut donc pas être renvoyé ; l'ancien lien meurt, le dernier e-mail fait foi), envoie l'e-mail (§7) puis enregistre le nouveau hash et `clientEmail`. 409 `already_answered` si une réponse existe déjà (régénérer effacerait la réponse : le propriétaire régénère explicitement) ; 409 `smtp_disabled` si SMTP absent ou désactivé ; 502 `smtp_failed` avec le message du transport si l'envoi échoue, auquel cas l'ancien lien reste valide. (Décision prise au plan, 2026-10-12.)
- `POST /response/seen` → `responseSeenAt = now`.
- `GET /api/quotes/unseen-count` → `{ count }` des devis du propriétaire avec `clientResponse != null` et `responseSeenAt == null`.
- `GET /api/quotes` : filtre supplémentaire `response = ACCEPTED | REFUSED | PENDING | NONE` (`PENDING` = partagé sans réponse, `NONE` = non partagé).

Conversion en commande (`POST /:id/convert`) et suppression inchangées ; la suppression d'un devis rend son lien mort (404 public).

## 4. Page publique client

Routes publiques (sans `authMiddleware`), montées sous `/api/public`, limiteur dédié 30 requêtes / 15 min par IP :

- `GET /api/public/quotes/:token` → 404 si jeton inconnu (après hachage), sinon `PublicQuoteDto` :
  `projectName, customer, kind, status, dueDate, quantity, comment, filamentLines, printTimeH, energyKwh, laborTotal, fixedCosts, costLines? (si pdfShowCostBreakdown du propriétaire), costAfterContingency?, unitPriceExclTax, totalExclTax, discountPct, discountAmount, shippingCost, vatPct, vatAmount, roundingApplied, roundingAmount, floorApplied, priceBeforeFloor, finalPrice, currencySymbol, clientResponse, clientRespondedAt, ownerDisplayName`.
  **Jamais** : `settingsSnapshot`, `pricingMode`, `pricingPct`, `userId`, `legacyId`, e-mail du propriétaire. Le DTO est construit par une fonction pure `toPublicQuoteDto(quote, settings)` testée pour l'absence de ces clés.
- `POST /api/public/quotes/:token/respond` `{ decision: 'ACCEPTED' | 'REFUSED', comment?: string ≤ 2000 }` → 404 jeton inconnu, 409 `already_answered` si `clientResponse` déjà renseigné, sinon enregistre, `responseSeenAt = null`, déclenche la notification au propriétaire (§7, meilleur effort : un échec d'e-mail ne fait pas échouer la réponse, il est journalisé). Réponse : `PublicQuoteDto` à jour.

Frontend : route `/q/:token` hors `AppLayout`, sans authentification, page `pages/PublicQuote.tsx` réutilisant la mise en page de `QuotePrint` (composant partagé `components/quote/QuoteDocument.tsx` extrait de `QuotePrint.tsx`, alimenté par un DTO public ou un `QuoteDto`). En bas : « Accepter le devis » / « Refuser le devis », zone de commentaire, confirmation avant envoi (dialogue), puis état « Vous avez accepté ce devis le … » (plus de boutons). Bouton « Imprimer ». Langue : détecteur i18next sur la langue du navigateur (fr/en), pas la langue du propriétaire. Un jeton inconnu affiche « Ce lien n'est plus valide ». `document.title` = « Devis - <projet> ».

## 5. Suivi côté propriétaire

- **Historique** : colonne « Réponse » avec badge `Accepté` (vert) / `Refusé` (rouge) / `En attente` (ambre, partagé sans réponse) / vide ; filtre « Réponse client » (toutes / acceptés / refusés / en attente / non partagés) ; pastille sur la ligne tant que `responseSeenAt` est vide ; le chargement du devis (ou le clic sur le badge) appelle `POST /response/seen`.
- **Navigation** : compteur de réponses non lues sur l'entrée Historique (`GET /api/quotes/unseen-count`, rafraîchi toutes les 60 s et à chaque invalidation des devis).
- **Devis chargé** (page Devis, `?quote=`) : carte « Client » sous le bandeau : état du partage (non partagé / lien actif depuis le … / révoqué), boutons « Générer le lien » (puis « Copier », le lien n'est affiché qu'une fois, juste après génération), « Régénérer », « Révoquer », « Envoyer par e-mail » (dialogue : adresse préremplie avec `clientEmail`, message facultatif ; désactivé avec info-bulle si SMTP non configuré) ; réponse du client avec date et commentaire, bouton « Convertir en commande » si accepté et encore devis.
- Un devis déjà converti en commande peut toujours être partagé (le client voit « Commande »).

## 6. Configuration SMTP (admin)

Paramètres → onglet « E-mail » (rôle admin seulement, route `/api/smtp` derrière `requireRole('admin')`) :
- `GET /api/smtp` → paramètres sans mot de passe + `hasPassword: boolean`.
- `PUT /api/smtp` → corps validé (hôte ≤ 255, port 1–65535, `secure`, identifiant ≤ 255, mot de passe facultatif : vide = inchangé, expéditeur e-mail valide, nom ≤ 100, `enabled`). Mot de passe chiffré avec `ENCRYPTION_KEY`. Audit `smtp_updated` (sans secret).
- `POST /api/smtp/test` `{ to }` → envoie un e-mail de test avec la configuration **enregistrée** ; 502 `smtp_failed` avec le message du transport sinon.
- Carte UI : formulaire, interrupteur « Activé », champ « Envoyer un e-mail de test à », résultat affiché.

## 7. Envoi d'e-mails

- Dépendance `nodemailer` (backend). Module `mail/mailer.ts` : `getTransport(prisma)` (lit `SmtpSettings`, déchiffre le mot de passe, `null` si désactivé), `sendMail(prisma, { to, subject, text, html })`. Textes en `mail/templates.ts`, fonctions pures renvoyant `{ subject, text, html }` dans la langue demandée (celle du propriétaire pour les deux e-mails) ; tous les champs libres encodés HTML.
- E-mail « devis » au client : objet « Devis <projet> – <nom du propriétaire> », message du propriétaire, lien, rappel que le lien est personnel.
- E-mail « réponse » au propriétaire (si `User.email` non vide) : objet « Devis <projet> : accepté / refusé par <client> », commentaire, lien vers `/?quote=<id>`.
- Invariant amendé : le backend ne fait **aucun appel réseau sortant hormis SMTP vers l'hôte configuré par l'admin**. Pas de téléchargement, pas d'image distante dans les e-mails.
- Tests : `nodemailer` est remplacé par un transport factice (`jsonTransport` ou injection) ; aucun test n'ouvre de connexion réseau.

## 8. Sécurité

- Jeton : 32 octets aléatoires, encodage base64url (43 caractères), stocké haché SHA-256 ; comparaison par recherche sur le hash (index unique). Un jeton révoqué ou régénéré ne résout plus.
- Routes publiques : limiteur 30 / 15 min / IP sur `/api/public`, corps ≤ 16 ko, `helmet` inchangé, aucune information sur l'existence d'un devis au-delà de 404.
- Le DTO public exclut explicitement toute donnée interne (test dédié listant les clés interdites).
- Les champs libres (commentaire client, message, projet, nom du client) sont stockés bruts et échappés à l'affichage (React) et dans les e-mails (encodage HTML dans `templates.ts`).
- Journal web : la réponse d'un client n'est pas une connexion ; elle n'est ni dans le journal ni dans l'audit (donnée métier). L'audit ne reçoit que `smtp_updated`.
- `FRONTEND_URL` (déjà obligatoire) sert de base aux liens ; pas de dérivation depuis l'en-tête `Host`.

## 9. Tests et critères d'acceptation

- Backend : jeton (génération, hachage, révocation, régénération efface la réponse), routes propriétaire (propriétaire / autre utilisateur / admin → 404), routes publiques (404, 409 déjà répondu, réponse enregistrée, DTO sans clés interdites, limiteur), `toPublicQuoteDto`, `templates.ts` (échappement), `mailer.ts` avec transport factice, SMTP (admin seulement, mot de passe jamais renvoyé, vide = inchangé), filtre `response` et `unseen-count`.
- Frontend : page publique (rendu, acceptation avec confirmation, état répondu, lien invalide), carte Client (générer / copier / régénérer / révoquer / e-mail désactivé sans SMTP), badge et filtre de l'Historique, compteur de non-lus, carte SMTP.
- Critère d'acceptation : un devis partagé depuis un compte est accepté depuis une fenêtre privée sans connexion ; le propriétaire voit le badge, le compteur et le commentaire ; un e-mail de test part avec un SMTP réel (vérifié manuellement par le partenaire) ; un autre compte ne voit ni le devis ni sa réponse.

## 10. Découpage

Un seul plan (lot 4) en quatre tâches : (1) modèle, common, jeton et routes propriétaire ; (2) routes publiques, DTO public, page publique ; (3) suivi propriétaire (Historique, compteur, carte Client) ; (4) SMTP, mailer, e-mails, onglet admin, docs. Branche `lot4-partage-client`.
