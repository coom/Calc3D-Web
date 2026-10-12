// Configuration de la CLI Prisma. Elle ne charge plus .env toute seule : on charge
// explicitement le .env de la racine du monorepo (le même que src/config.ts), quel
// que soit le dossier d'où la commande est lancée.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
