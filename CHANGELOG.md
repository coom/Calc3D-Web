# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

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
