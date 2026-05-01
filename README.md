# DocChain

DocChain is a modular monolith for a closed university correspondence and administrative workflow system.

## Stack

- Express + TypeScript backend
- Vite React frontend
- Tailwind CSS v4
- MySQL through XAMPP on `127.0.0.1:3306`
- SQL migrations and seeds through `mysql2`

## Local Setup

1. Copy `.env.example` to `.env` if you need to override defaults.
2. Ensure MySQL is running on port `3306`.
3. Run `npm run db:create`.
4. Run `npm run db:migrate`.
5. Run `npm run db:seed`.
6. Run `npm run dev`.

The default seeded admin is configured by `SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, and `SEED_ADMIN_PASSWORD`.

The default database name is `docchain_express` to avoid colliding with any older `docChain` schema.
