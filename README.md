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
3. Follow the database setup below.
4. Run `npm run dev`.

## Database Setup

For a fresh database, run:

```bash
npm run db:create
npm run db:migrate
npm run db:seed
```

For a destructive local reset, run:

```bash
npm run db:reset
```

The migration files are a squashed production baseline. Do not run this baseline against a database that already has the old `001`-`010` migration history recorded. Back up any data first, then drop/recreate the database and run the fresh setup commands.

The seed creates the super admin account, the minimal organization/unit/assignment foundation needed to log in, and baseline confidentiality/priority reference values needed for draft creation. The default admin is configured by `SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, and `SEED_ADMIN_PASSWORD`.

