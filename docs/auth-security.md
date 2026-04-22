# HOTS / NexusGG — Auth & Seguridad (estado real)

## Auth implementada hoy

### 1) Email + password
- `POST /api/auth/register`
- `POST /api/auth/login`
- Password hash con `bcrypt` (cost 12)
- Rate limit específico en auth

### 2) Refresh token
- `POST /api/auth/refresh`
- Refresh token en cookie `httpOnly` (`/api/auth`)
- Rotación/revocación persistida en DB (`RefreshToken`)
- `POST /api/auth/logout` revoca token activo

### 3) Discord OAuth
- `GET /api/auth/discord`
- `GET /api/auth/link/discord` (usuario autenticado)
- `GET /api/auth/discord/callback`
- Validación de `state` por cookie (`oauth_state`)
- Intent OAuth en cookie (`oauth_intent`) para login/link

> Google/Battle.net todavía están en placeholder.

---

## Controles de seguridad activos

- `helmet` con CSP base
- CORS allowlist por `CLIENT_URLS` / `CLIENT_URL`
- Rate limit global + limiters puntuales (auth, client-errors, polling matchmaking)
- JWT access token para API y socket auth
- Cookies seguras según entorno:
  - refresh: `sameSite: strict`
  - oauth: `sameSite: lax`
- Validación de payloads con Zod
- Guardas de rol (`requireAdmin`)

---

## Variables y hardening de arranque

Existe validación centralizada de env en:
- `server/src/shared/env.ts`

Fail-fast si faltan:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Y se valida consistencia de Discord:
- `DISCORD_CLIENT_ID` y `DISCORD_CLIENT_SECRET` deben existir juntos.

---

## Riesgos/deuda abierta (aún no resuelta)

- CSRF strategy explícita para endpoints cookie-based
- OAuth Google/Battle.net real
- Validaciones y límites más finos para chat/veto/vote
- Audit log formal para acciones admin
- Anti-smurf más fuerte (hoy hay señales parciales, no sistema completo)
