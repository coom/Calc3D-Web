# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

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
