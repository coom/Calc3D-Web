# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

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
