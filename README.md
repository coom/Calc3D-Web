# Calc3D-Web

🇫🇷 [Version française](README.fr.md)

Multi-user web port of [CalculateurPrix](../CalculateurPrix), the 3D printing price calculator (PowerShell / WPF desktop app). The architecture comes from MC Manager and TS6 Manager: pnpm monorepo, Express + Prisma/SQLite backend, React / Vite / Tailwind / shadcn frontend, JWT authentication, Docker Compose.

![License](https://img.shields.io/badge/license-GPL--3.0-green)

## Features (lot 1)

- **Accounts and roles**: `admin` manages accounts, the password policy, the login journal and the audit log; `user` owns their own data. An admin is also a user: they **never** see another account's quotes, purchases, settings or catalog.
- **Security** inherited from MC Manager: TOTP MFA with recovery codes, trusted devices, password policy, forced password change.
- **Per-user pricing settings**: electricity, hourly rates (preparation, post-processing, design, packaging), markup or target-margin mode, contingency, VAT, depreciation, maintenance, wear parts, floor price, round-to-euro, cost breakdown on the PDF.
- **Per-user material catalog** (price per kg).
- **Quote page**: multi-material filament, four labor tasks, order options, result recomputed live on every keystroke by the shared engine, save with a snapshot of the settings. The price is **identical to the cent** to the desktop app with the same settings (see [How the price is calculated](../CalculateurPrix/README.en.md#how-the-price-is-calculated)).

- **History** (lot 2): quotes and orders grouped by month, search and filters, reload a quote with the settings it was created with and update it without duplicates, recompute with current settings on demand, convert to order, delete.
- **Purchases** (lot 2): register of actual purchases by category, grouped by month.
- **Finances** (lot 2): revenue, printing costs, net margin and actual purchases over the chosen period; breakdown by item, monthly trend, purchases by category, modeled cost vs actual purchases. Only quotes converted to orders count as revenue.

Coming next: lot 3 (G-code import, PDF printing, import of the desktop app data).

## Installation

Requirement: Docker.

```bash
cp .env.example .env
# Generate two different secrets, 32 characters minimum:
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
docker compose up -d --build
```

Open `http://localhost:3000` (port configurable with `FRONTEND_PORT`) and create the first administrator account. Other accounts are created by an admin in Settings → Users; there is no self-registration.

## Development

Requirements: Node 22, pnpm 9.

```bash
pnpm install
pnpm db:generate                          # Prisma client (packages/backend/generated/, git-ignored)
pnpm --filter @calc3d/common run build    # backend and frontend import @calc3d/common from its dist/
cp .env.example .env                      # then fill in JWT_SECRET and ENCRYPTION_KEY
pnpm db:push                              # creates packages/backend/data/calc3d.db
pnpm dev                                  # backend :3001 + frontend :5173

pnpm lint && pnpm typecheck && pnpm test
```

## Data and privacy

- All data lives in a SQLite database, Docker volume `calc3d-data` (or `packages/backend/data/` locally).
- The backend makes **no outbound connection**; the frontend loads **no external resource** (system fonts).
- Passwords are hashed (bcrypt), TOTP secrets encrypted with `ENCRYPTION_KEY`, refresh tokens rotate.

## License

GPL-3.0, like the desktop app. See [CHANGELOG.md](CHANGELOG.md) for the history and `docs/superpowers/specs/` for the design.
