# TurboIAM — Project Brain (Root)

> Auto-loaded by Claude. Read this INSTEAD of exploring files from scratch.

## Stack
- **Backend**: NestJS + TypeScript, Prisma + PostgreSQL, Redis (`turbo-backend/`)
- **Frontend**: React 18 + Vite + TypeScript, Zustand, TanStack Query, Tailwind CSS v4 (`turbo-frontend/`)
- **Auth**: JWT (access 15m + refresh 7d), bcrypt, passport-jwt
- **SSO**: Okta OIDC via openid-client@5, secrets AES-256-GCM encrypted in DB

## Monorepo Structure
```
turbo-claude/
├── turbo-backend/           NestJS API (port 3000)
│   ├── src/modules/         auth, users, applications, okta
│   ├── src/common/          guards, decorators, prisma, crypto
│   ├── prisma/schema.prisma Data models
│   └── CLAUDE.md            Backend-specific brain →
├── turbo-frontend/          React + Vite (port 5173)
│   ├── src/pages/           Route-level page components
│   ├── src/layouts/         AppLayout, Sidebar, Header, AuthLayout
│   ├── src/components/      ui/ (Button, Card, Badge, Input), common/
│   ├── src/api/             Typed API clients (auth.api, users.api, etc.)
│   ├── src/store/           Zustand: authStore.ts
│   ├── src/router/          React Router v6 (index.tsx + guards)
│   └── CLAUDE.md            Frontend-specific brain →
├── upcore-agent/            UpcoreCodeTestDeploy Agent (Claude Agent SDK)
│   ├── server/              Express + WebSocket server → Railway
│   ├── frontend/            React chat UI → Vercel
│   ├── context/             TurboIAM brain files (copied for agent use)
│   └── CLAUDE.md            Agent-specific brain →
└── CLAUDE.md                ← This file
```

## Key Architecture Constraints
- **Multi-tenant**: Every DB query must filter by `enterpriseId` — never return cross-tenant data
- **Okta SSO**: Per-enterprise Okta config stored in `enterprise_okta_configs` table
- **Secrets**: Okta `clientSecret` and `apiToken` encrypted AES-256-GCM — NEVER return raw secrets via API
- **RBAC format**: Always `SUPER_ADMIN`, `GRC_ADMIN`, `APP_ADMIN`, `SSO_ADMIN`, `AUDITOR`, `DELEGATE` (UPPERCASE_UNDERSCORE)
- **Redis sessions**: 2-minute TTL for SSO token exchange after Okta callback (prevents URL token leakage)
- **PKCE + nonce**: Used for Okta OIDC to prevent CSRF/replay attacks

## Design System (Quick Ref)
- **Primary**: `#4F46E5` (indigo-600), hover `#4338CA`
- **Success**: `#16A34A`, **Warning**: `#D97706`, **Error**: `#DC2626`
- **Text**: `#111827` (primary), `#6B7280` (muted), `#9CA3AF` (placeholder)
- **Border**: `#E9EAEB`, **BG**: `#F9FAFB`
- **Sidebar**: 240px wide, **Header**: 72px tall
- **Active nav**: `bg-[#4F46E5] text-white shadow-sm`

## Adding a New Backend Module
1. `src/modules/<name>/<name>.service.ts` — business logic
2. `src/modules/<name>/<name>.controller.ts` — routes with `@Roles()` + `@UseGuards(JwtAuthGuard, RolesGuard)`
3. `src/modules/<name>/<name>.module.ts` — wire service + controller
4. Register in `src/app.module.ts` imports array
5. Add DTOs in `src/modules/<name>/dto/`

## Adding a New Frontend Page
1. Create `src/pages/<PageName>/index.tsx`
2. Add lazy import in `src/router/index.tsx`
3. Add route entry under the `AppLayout` children array
4. Add nav item in `src/layouts/Sidebar.tsx` NAV_MAIN or NAV_BOTTOM arrays
5. Add route constant in `src/constants/routes.ts`

## Run Commands
```bash
# Backend
cd turbo-backend && npm run start:dev    # dev server (port 3000)
npx prisma migrate dev --name <name>    # run a migration
npx prisma studio                       # visual DB browser

# Frontend
cd turbo-frontend && npm run dev        # dev server (port 5173)
```

## Required Backend .env Vars
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=<≥32 chars>
ENCRYPTION_KEY=<≥32 chars>          # AES-256-GCM key for Okta secrets
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

## Sprint Status
- Sprint 1: ✅ JWT auth, RBAC, login UI, AppLayout
- Sprint 2: ✅ User management API + (frontend coming)
- Sprint 3: ⏳ Applications (Add page built, list/detail in progress)
- Sprint 4: ✅ Okta SSO integration (backend + frontend settings)
- Sprint 5-7: ⏳ Risk & Compliance, Audit/Reports, TurboChat

## Brain File Maintenance
After any session where you modify the backend or frontend, check:
- Added/changed API endpoint → update `turbo-backend/docs/API_REFERENCE.md`
- Changed prisma schema → update `turbo-backend/docs/DATA_MODEL.md`
- Added page/route → update `turbo-frontend/CLAUDE.md` (routes table)
- Added/changed UI component variant → update `turbo-frontend/docs/DESIGN_SYSTEM.md`

Do this BEFORE ending the session, even if the user didn't ask.
