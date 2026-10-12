# Calc3D-Web

🇬🇧 [English version](README.md)

Portage web multi-utilisateur de [CalculateurPrix](../CalculateurPrix), le calculateur de prix pour impression 3D (application de bureau PowerShell / WPF). L'architecture est reprise de MC Manager et TS6 Manager : monorepo pnpm, backend Express + Prisma/SQLite, frontend React / Vite / Tailwind / shadcn, authentification JWT, Docker Compose.

![Licence](https://img.shields.io/badge/licence-GPL--3.0-green)

## Fonctionnalités (lot 1)

- **Comptes et rôles** : `admin` gère les comptes, la politique de mot de passe, le journal de connexions et l'audit ; `user` dispose de ses propres données. Un admin est aussi un utilisateur : il ne voit **jamais** les devis, achats, paramètres ou catalogue d'un autre compte.
- **Sécurité** reprise de MC Manager : MFA TOTP avec codes de secours, appareils de confiance, politique de mot de passe, changement de mot de passe forcé.
- **Paramètres de tarification par utilisateur** : électricité, tarifs horaires (préparation, post-traitement, conception, emballage), mode surcoût ou marge cible, aléas, TVA, amortissement, maintenance, usure des pièces, prix plancher, arrondi à l'euro, détail des coûts sur le PDF.
- **Catalogue de matières par utilisateur** (prix au kg).
- **Page Devis** : filament multi-matière, quatre postes de main d'œuvre, options de commande, résultat recalculé en direct à chaque frappe par le moteur partagé, enregistrement avec instantané des paramètres. Le prix est **identique au centime** à celui de l'application bureau avec les mêmes paramètres (voir [Comment le prix est calculé](../CalculateurPrix/README.md#comment-le-prix-est-calculé)).

À venir : lot 2 (historique, achats, finances), lot 3 (import G-code, impression PDF, import des données de l'application bureau).

## Installation

Prérequis : Docker.

```bash
cp .env.example .env
# Générer deux secrets différents, 32 caractères minimum :
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
docker compose up -d --build
```

Ouvrir `http://localhost:3000` (port modifiable via `FRONTEND_PORT`) et créer le premier compte administrateur. Les autres comptes sont créés par un admin dans Paramètres → Utilisateurs ; il n'y a pas d'inscription libre.

## Développement

Prérequis : Node 22, pnpm 9.

```bash
pnpm install
pnpm db:generate                          # client Prisma (packages/backend/generated/, gitignoré)
pnpm --filter @calc3d/common run build    # backend et frontend importent @calc3d/common depuis son dist/
cp .env.example .env                      # puis renseigner JWT_SECRET et ENCRYPTION_KEY
pnpm db:push                              # crée packages/backend/data/calc3d.db
pnpm dev                                  # backend :3001 + frontend :5173

pnpm lint && pnpm typecheck && pnpm test
```

## Données et confidentialité

- Toutes les données sont dans une base SQLite, volume Docker `calc3d-data` (ou `packages/backend/data/` en local).
- Le backend n'effectue **aucune connexion sortante** ; le frontend ne charge **aucune ressource externe** (polices système).
- Mots de passe hachés (bcrypt), secrets TOTP chiffrés avec `ENCRYPTION_KEY`, jetons de rafraîchissement à rotation.

## Licence

GPL-3.0, comme l'application bureau. Voir [CHANGELOG.md](CHANGELOG.md) pour l'historique et `docs/superpowers/specs/` pour la conception.
