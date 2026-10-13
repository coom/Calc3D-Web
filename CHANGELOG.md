# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

### Corrigé
- **IP client derrière un proxy** : le journal de connexions, l'audit et les limiteurs lisaient l'adresse du dernier proxy (WAF, par exemple SafeLine) au lieu de celle du client, car le backend ne faisait confiance qu'à un saut (le nginx intégré). Nouveau réglage admin « Proxy inverse / IP client » (Paramètres → Utilisateurs) : nombre de sauts de proxy de confiance, appliqué à chaud, avec l'IP détectée pour la requête en cours afin d'ajuster. Même solution que TS6-Manager. API : `GET/PUT /api/proxy` (admin, audité `proxy.update`).

### Ajouté
- **Page Indicateurs** (menu Atelier) : sur 7, 30, 90 ou 365 jours, tuiles « commandes en cours » (instantané : non terminées et non payées), nouvelles commandes, commandes payées, devis acceptés / refusés / convertis, chacune avec l'écart par rapport à la période précédente, taux d'acceptation (acceptés / répondus) et taux de conversion (convertis / devis créés). Évolution par jour, semaine ou mois en colonnes groupées (HTML/CSS, aucune bibliothèque), légende, valeurs au survol et vue tableau. API : `GET /api/indicators?days=&tz=` (calcul `computeIndicators` dans common, cloisonné par utilisateur).
- **Historique** : tri par colonne (date, projet, client, type, statut) croissant ou décroissant via les en-têtes ; trié par date, regroupement par mois comme avant, sinon liste plate. API : `GET /api/quotes?sort=&dir=`.
- **Commande payée** : interrupteur « Payée » sur chaque commande (Historique et devis chargé), date de paiement stockée dans `Quote.paidAt`. API : `PUT /api/quotes/:id/paid` (409 `not_order` sur un devis). La conversion d'un devis pose désormais `Quote.convertedAt`.
- **Paiement PayPal** (Paramètres → Compte, par utilisateur, désactivé par défaut) : pseudo PayPal.Me et/ou adresse e-mail PayPal, interrupteur « Proposer le paiement PayPal aux clients ». Quand il est actif, le client choisit Liquide ou PayPal en confirmant son acceptation ; la page du devis affiche ensuite « Payer par PayPal » (lien PayPal.Me direct avec le montant du devis) ou, sans pseudo, l'adresse à copier et un lien vers la page d'envoi PayPal. Le moyen choisi apparaît dans la carte Client et dans l'e-mail de notification. Désactiver PayPal retire le choix et le lien, sans effacer les coordonnées.
- API : `GET/PUT /api/settings/paypal` ; `POST /api/public/quotes/:token/respond` accepte `paymentMethod` (exigé avec l'acceptation si PayPal est proposé, refusé sinon) ; le DTO public porte `paymentMethod` et `paypal` (null si PayPal désactivé). Colonnes `UserSettings.paypalEnabled/paypalHandle/paypalEmail`, `Quote.paymentMethod`.
- **Utilisateurs** (admin) : adresse e-mail et langue de l'utilisateur à la création et dans une nouvelle boîte « Modifier » (nom affiché, e-mail, langue). La langue enregistrée s'applique à l'interface dès la connexion et aux e-mails ; l'utilisateur peut toujours la changer lui-même (sélecteur de l'en-tête ou Paramètres → Compte), le choix est stocké en base.
- **Notifier par e-mail** à la création d'un compte et à la réinitialisation d'un mot de passe par l'admin : envoi, dans la langue de l'utilisateur, de l'adresse du site, de l'identifiant et du mot de passe, avec invitation à activer le MFA (présenté comme obligatoire si « Exiger le MFA » est coché) et mention « mot de passe temporaire » si « Changer le mot de passe à la prochaine connexion » est coché. Nécessite SMTP et une adresse ; le compte est créé même si l'envoi échoue (avertissement). Le mot de passe n'est jamais journalisé.
- API : `POST /api/users` accepte `email`, `language`, `notify` et renvoie `emailSent` ; `PUT /api/users/:id` accepte `email`, `language` et `notify` (avec `password`, réponse 200 `{ emailSent }`) ; `GET /api/users` renvoie `email` et `language`.

### Corrigé
- Page publique du devis : la boîte de confirmation (accepter / refuser) s'affichait en texte noir sur fond sombre, car le thème sombre par défaut de l'application s'appliquait aussi aux visiteurs sans compte. La page client est désormais toujours en thème clair.

## [0.4.0] - 2026-10-12 — lot 4

### Ajouté
- **Lien client** : depuis un devis enregistré, carte « Client » pour générer un lien unique `/q/<jeton>` (jeton aléatoire de 32 octets, stocké haché, affiché une seule fois), le régénérer (l'ancien meurt, la réponse est effacée) ou le révoquer.
- **Page publique** `/q/<jeton>` : le client consulte le devis en lecture seule (même document que l'impression, option « détail des coûts » respectée, jamais le mode de tarification ni la marge) et l'accepte ou le refuse avec un commentaire, une seule fois. Langue du navigateur. Routes `/api/public` sans authentification, limiteur dédié (30 requêtes / 15 min), corps ≤ 16 ko.
- **Suivi des réponses** : badge Accepté / Refusé / En attente et filtre « Réponse client » dans l'Historique, pastille « Nouveau » et compteur de réponses non lues sur l'entrée Historique, réponse et commentaire sur le devis chargé avec bouton « Convertir en commande ». Pas de conversion automatique.
- **SMTP** (admin, Paramètres → E-mail) : hôte, port, TLS, identifiant, mot de passe chiffré avec `ENCRYPTION_KEY` et jamais réaffiché, expéditeur, e-mail de test. Dépendance `nodemailer`.
- **E-mails** : « Envoyer par e-mail » depuis la carte Client (génère un nouveau lien et l'envoie au client avec un message facultatif) ; notification au propriétaire quand le client répond, à l'adresse saisie dans Paramètres → Compte.
- API : `POST/DELETE /api/quotes/:id/share`, `POST /api/quotes/:id/share/email`, `POST /api/quotes/:id/response/seen`, `GET /api/quotes/unseen-count`, filtre `response` de `GET /api/quotes`, `GET/POST /api/public/quotes/:token[/respond]`, `/api/smtp`, `PUT /api/account/email`.

### Modifié
- Invariant réseau : le backend ne fait aucun appel sortant **hormis SMTP** vers l'hôte configuré par l'admin.
- Page d'impression : le titre du document reprend le nom du devis (nom du PDF enregistré).
- Réponse du client atomique (écriture conditionnelle) : deux réponses simultanées donnent un 200 et un 409, la première reste.
- Transport SMTP avec délais bornés (connexion et salutation 10 s, socket 30 s) ; les envois d'e-mail attendent jusqu'à 45 s côté client.
- Page publique : seul le 404 affiche « lien invalide » ; limiteur, panne ou réseau affichent « service momentanément indisponible ».

### Corrigé
- Page d'impression : fond de page blanc hors du cadre (le thème sombre de l'application rendait la note « prix plancher appliqué » illisible à l'écran).

## [0.3.0] - 2026-10-12 — lot 3

### Ajouté
- **Import G-code** dans la page Devis : lecture dans le navigateur (tête et queue du fichier, jamais envoyé au serveur) des métadonnées PrusaSlicer, OrcaSlicer, Bambu Studio et Cura ; durée et poids cumulés par matière sur plusieurs fichiers ; matière inconnue ajoutée au catalogue à 20 par kg ; nom du projet proposé depuis le nom du fichier. Parseur `parseGcodeMetadata` dans `@calc3d/common`, portage de `Import-GcodeMetadonnees`.
- **Page d'impression** `/quotes/:id/print` (bouton Exporter, actif après enregistrement) : même mise en page que le PDF de l'application bureau, détail du coût de revient selon l'option `pdfShowCostBreakdown`, jamais le mode de tarification ni la marge ; montants enregistrés, pas de recalcul ; impression déclenchée à l'ouverture.
- **Import des données de l'application bureau** (Paramètres → Import, `POST /api/import/desktop`) : `config.json` (paramètres et catalogue remplacés), `historique.csv` (formats 1.2 et 1.3, montants repris tels quels, instantané des paramètres reconstitué depuis les colonnes `Cfg*`, dates converties avec le fuseau du navigateur) et `achats.csv` ; idempotent par Id bureau (`legacyId`) ; rapport des lignes créées, mises à jour et rejetées avec motif ; corps JSON jusqu'à 20 Mo propre à cette route.

### Corrigé
- Un corps de requête trop volumineux ou un JSON invalide renvoyait 500 : l'API répond maintenant 413 (`payload_too_large`) et 400 (`validation`).
- Parseur G-code : en multi-extrudeur, un poids nul en tête (`filament used [g] = 0.00, 12.30, 4.50`) décalait les matières ; l'appariement se fait maintenant par position avant le filtrage des poids nuls. Le même défaut existe dans `Import-GcodeMetadonnees` de l'application bureau.
- Les paramètres importés depuis `config.json` passent par les mêmes bornes que `PUT /api/settings` (400 `validation` avec le détail des champs).
- nginx (Docker) aligné sur la route d'import : corps jusqu'à 20 Mo, délais de 120 s.
- Page Devis : sur un devis chargé puis modifié, le bouton Exporter est désactivé tant que la mise à jour n'est pas enregistrée (le PDF reflète toujours l'état enregistré).

## [0.2.0] - 2026-10-12 — lot 2

### Ajouté
- **Historique** : liste des devis et commandes groupée par mois (sections repliables), recherche projet/client, filtres par type et statut, pagination. Chargement d'un devis dans la page Devis avec **les paramètres de sa création** (bandeau, bouton « Mettre à jour ce devis » sans doublon), interrupteur « Recalculer avec mes paramètres actuels », conversion en commande, suppression avec confirmation.
- **Achats** : registre des achats réels (date, catégorie, description, montant, fournisseur, commentaire), liste groupée par mois avec recherche et filtre par catégorie, suppression.
- **Finances** : les cinq blocs de l'application bureau (indicateurs sur la période, répartition du coût d'impression par poste, évolution mensuelle, achats par catégorie, comparatif coût modélisé / achats réels), sur les commandes et les achats de l'utilisateur. Agrégats calculés par `computeFinances` dans `@calc3d/common`, à partir des montants enregistrés.
- API : `GET/PUT/DELETE /api/quotes/:id`, `GET /api/quotes` (filtres, pagination), `POST /api/quotes/:id/convert`, `/api/purchases`, `GET /api/finances?period=`.

### Modifié
- Différence assumée avec la version bureau : le poste « consommables / coûts fixes » des Finances ne compte plus les consommables deux fois.

## [0.1.0] - 2026-10-12 — lot 1

### Ajouté
- Monorepo pnpm (`@calc3d/common`, `@calc3d/backend`, `@calc3d/frontend`), CI GitHub Actions, Docker Compose.
- Authentification reprise de MC Manager : installation du premier admin, login, MFA TOTP avec codes de secours, appareils de confiance, politique de mot de passe, changement de mot de passe forcé, journal de connexions avec purge selon rétention, audit des actions d'administration. Rôles `admin` et `user`.
- Cloisonnement par utilisateur de toutes les données métier (`ownerScope`) ; un admin ne voit pas les données des autres comptes.
- Paramètres de tarification et catalogue de matières par utilisateur.
- Moteur de calcul `computeQuote` partagé navigateur/serveur, portage de `Invoke-Calcul` (CalculateurPrix 1.3.0), validé par six cas dorés produits par la version PowerShell.
- Page Devis : filament multi-matière, quatre postes de main d'œuvre, options de commande, résultat en direct, enregistrement avec instantané des paramètres.

### Sécurité
- `JWT_SECRET` et `ENCRYPTION_KEY` obligatoires (32 caractères minimum, différents), rôle rechargé en base à chaque requête, validation zod stricte des corps (aucun montant accepté du client), 404 sur les ressources d'autrui, aucune ressource externe chargée par le frontend.
