# Agent rules: the details

`CLAUDE.md` at the repository root carries only the rules that are never
traded: every agent session reads it on every turn, so each line costs tokens
on every round (ADR-0068). The details an agent looks up when it needs them
live here.

## Structure

Fullstack monorepo — Bun workspaces + Turborepo.

```
apps/
  api/        — NestJS 11 API, Prisma 7 (PostgreSQL, pg driver adapter)   :8180
  web/        — Next.js 16 (App Router, Turbopack), React 19, Tailwind 4   :3517
  runner/     — @nautelle/runner — the runner that executes typed commands next to a project
  docs/       — @nautelle/docs — Astro documentation site                    :4321
packages/
  shared/     — @nautelle/shared — code shared by api and web
docker/       — docker-compose: PostgreSQL 16 :5421, Redis 7.4 :6421
scripts/      — db-start-docker.sh (up → migrate → seed)
```

## Commands

| Command | What it does |
|---|---|
| `bun install` | install all workspaces |
| `bun install` | install all workspaces |
| `bun run build` | build everything (turbo, cached) |
| `bun run start:dev` | api + web in watch mode |
| `bun run lint` | lint every workspace (turbo) |
| `bun run test` | tests of every workspace (turbo; Jest in api) |
| `bun run typecheck` | TypeScript type check of every workspace (turbo) |
| `bun run format` | Biome format with writes over the whole repository |
| `bun run check` | repository checks, no writes: Biome lint + format + import order, CI config, images, brand, pins, numbering, the env reference, and the `scripts/` tests |
| `bun run check:secrets` | gitleaks over the git history with `.gitleaks.toml` (local gitleaks, else Docker); the CI `secrets` step runs the same scan |
| `bun run db:up` | start the docker-compose services (PostgreSQL, Redis) in the background |
| `bun run db:down` | stop and remove the docker-compose services; the data volumes stay |
| `bun run db:setup` | start PostgreSQL, apply migrations, seed |
| `bun run db:migrate` | `prisma migrate dev` — create and apply a migration |
| `bun run db:generate` | regenerate the Prisma client |
| `bun run db:seed` | seed the database |
| `bun run db:studio` | Prisma Studio |
| `bun run admin:create` | create the first administrator in the API |
| `bun run docs:env` | regenerate the environment variable reference (`bun run check` verifies it is current) |
| `bun run docs:dev` | documentation site dev server on :4321 |

The API workspace has its own test scripts, run with
`bun run --cwd apps/api <script>`: `test` (type check, then every Jest
project), `test:unit` (`*.spec.ts` only), `test:e2e` (`*.e2e.spec.ts` only),
`test:watch` (unit tests in watch mode) and `test:cov` (coverage). While
working, run only the e2e suites you touched with `--testPathPatterns`.
