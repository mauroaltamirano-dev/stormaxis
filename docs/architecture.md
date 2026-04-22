# HOTS / NexusGG — Arquitectura actual (Abr 2026)

Este documento refleja **el estado real implementado hoy** en este repo.

## Stack real

### Frontend (`client/`)
- React 19 + TypeScript + Vite
- TanStack Router
- Zustand (estado auth + matchmaking + UI runtime)
- Axios
- Socket.io client
- Tailwind v4 + CSS custom del proyecto
- React Hook Form + Zod (formularios clave)

### Backend (`server/`)
- Express + TypeScript
- Prisma + PostgreSQL (Neon)
- Redis (cola matchmaking + estado runtime de match)
- Socket.io (eventos realtime por usuario y por match)
- JWT access + refresh token cookie
- Helmet + CORS allowlist + rate limits
- Zod (validación de payloads)

---

## Estructura del repo (real)

```txt
client/
  src/
    components/
    layouts/
    lib/
    pages/
    stores/

server/
  prisma/
    schema.prisma
    migrations/
  src/
    infrastructure/
      database/
      http/
      logging/
      redis/
      socket/
    modules/
      admin/
      auth/
      leaderboard/
      matches/
      matchmaking/
      users/
    shared/
      env.ts
      errors/
      middlewares/
    main.ts

docs/
package.json
.env.example
docker-compose.yml
```

---

## Flujo principal implementado

1. Usuario autenticado entra a `/api/matchmaking/queue/join`
2. Cola en Redis (región actual SA)
3. Al formar match:
   - evento `matchmaking:found` a room `user:{userId}`
   - ventana de aceptación (`match:accept` / `match:decline`)
4. Si todos aceptan:
   - se crea/sincroniza estado de match
   - room `match:{matchId}` para veto/chat/ready/vote
5. Lifecycle de match:
   - `ACCEPTING → VETOING → PLAYING → VOTING → COMPLETED`
   - o `CANCELLED` según casos admin/abandono/timeout

---

## Estado de auth actual

- Email/password: **implementado**
- Discord OAuth login/link: **implementado**
- Google OAuth: **placeholder**
- Battle.net OAuth: **placeholder**
- Refresh token httpOnly en cookie con revocación por DB

---

## Configuración y startup

- `server/src/shared/env.ts` valida env al boot (fail-fast).
- Variables críticas requeridas:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
- `CLIENT_URLS` (coma-separado) es la allowlist principal para CORS/OAuth fallback.

---

## Scripts de verificación

En raíz:

- `npm run typecheck`
  - typecheck server + client
- `npm run check`
  - typecheck completo + build del client

Estos dos comandos son la ruta rápida de validación antes de merge/deploy.
