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

- **Historique** (lot 2) : devis et commandes groupés par mois, recherche et filtres, rechargement d'un devis avec les paramètres de sa création et mise à jour sans doublon, recalcul avec les paramètres actuels sur demande, conversion en commande, suppression.
- **Achats** (lot 2) : registre des achats réels par catégorie, groupé par mois.
- **Finances** (lot 2) : revenu, coûts d'impression, marge nette, achats réels sur la période choisie ; répartition par poste, évolution mensuelle, achats par catégorie, comparatif coût modélisé / achats réels. Seuls les devis convertis en commande comptent comme revenu.

- **Import G-code** (lot 3) : sur la page Devis, choisis un ou plusieurs fichiers G-code (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura) : durée d'impression et poids de filament sont remplis, cumulés par matière sur l'ensemble des fichiers ; une matière inconnue est ajoutée au catalogue à 20 par kg. Les fichiers sont lus dans le navigateur et ne sont jamais envoyés au serveur.
- **Impression / PDF** (lot 3) : après enregistrement, le bouton Exporter ouvre `/quotes/<id>/print`, une page imprimable avec les mêmes sections que le PDF bureau (client, détail de la pièce, détail du coût de revient si l'option est active, tarification, prix final). Le mode de tarification et la marge n'apparaissent jamais. Les montants sont ceux enregistrés, jamais recalculés.
- **Import depuis l'application bureau** (lot 3) : Paramètres → Import accepte `config.json`, `historique.csv` (formats 1.2 et 1.3) et `achats.csv`. Les paramètres et le catalogue sont remplacés ; les devis et achats sont reconnus par leur Id bureau, un second import ne crée donc jamais de doublon. Les montants sont repris tels quels. Un rapport liste les lignes créées, mises à jour et rejetées avec leur motif.

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

Pour récupérer ton historique de l'application bureau : Paramètres → Import, puis choisis les fichiers `config.json`, `historique.csv` et `achats.csv` de ton dossier CalculateurPrix.

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
