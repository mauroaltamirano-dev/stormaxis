# HOTS Competitive Platform — Project Audit & Roadmap

Fecha de reorganización: **2026-04-27**  
Base actual: `/home/tuki/projects/hots`  
Estado general: **MVP competitivo funcional**, con matchmaking, matchroom, Discord voice por equipo, replay upload/parser con reglas de confianza, panel admin separado, onboarding competitivo, perfil, leaderboard, Hero Lab y optimización inicial de assets.

> Convención de estado: `[x]` hecho en repo, `[~]` parcial / requiere validación externa, `[ ]` pendiente.

---

## 1. Objetivo del producto

Crear una plataforma competitiva de matchmaking para **Heroes of the Storm** inspirada en FACEIT, GamersClub, ESEA y Portal, pero con identidad propia para HOTS.

Como Battle.net no ofrece una API pública oficial completa para datos de HOTS, el MVP usa flujo manual asistido + evidencia por replay:

1. Usuario entra a cola.
2. Sistema arma partida.
3. Jugadores aceptan/rechazan.
4. Se abre match room.
5. Capitanes hacen veto de mapas.
6. Jugadores crean partida personalizada dentro del juego.
7. Jugadores confirman disponibilidad/conexión.
8. Se juega la partida.
9. Capitán/admin sube `.StormReplay` desde matchroom.
10. El replay se parsea y, si supera validación de confianza, puede fijar ganador automáticamente.
11. Si no hay replay confiable, jugadores votan ganador; luego votan MVP.
12. Sistema actualiza MMR/ELO y guarda historial.

A futuro, HeroesProfile Developer queda como integración opcional. Para beta, el camino preferido es procesar `.StormReplay` propio sin depender de un plan pago externo.

---

## 2. Snapshot técnico actual

### Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | TanStack Router con `lazyRouteComponent` |
| Estado cliente | Zustand |
| HTTP | Axios |
| Realtime | Socket.io client/server |
| Backend | Express + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL/Neon |
| Runtime realtime/cache | Redis |
| Auth | JWT access token + refresh token cookie |
| Validación | Zod |
| Seguridad base | Helmet, CORS, rate limit, bcrypt |
| UI libs | lucide-react, framer-motion, clsx, tailwind-merge |

### Scripts raíz disponibles

- [x] `npm run dev`
- [x] `npm run dev:server`
- [x] `npm run dev:client`
- [x] `npm run typecheck`
- [x] `npm run check` — typecheck server/client + build client.
- [x] `npm run assets:optimize`
- [x] `npm run assets:budget`
- [x] `npm run cf:verify-images -- https://TU_DOMINIO`
- [x] `npm run db:migrate --workspace=server`
- [x] `npm run db:migrate:prod --workspace=server`
- [x] `npm run db:recalculate-stats --workspace=server`

### Estado de verificación

- [x] El repo está inicializado en git.
- [x] El bundle frontend fue dividido por ruta con `lazyRouteComponent` y dejó de depender de un chunk inicial gigante.
- [x] Migraciones Prisma tienen `migration.sql` presente en los directorios relevantes.
- [x] `npm run check` ejecutado el 2026-04-27: typecheck server/client + build client OK.

---

## 3. Estructura relevante real

```txt
client/src/
  components/
  components/matchmaking/
    ActiveMatchRoom.tsx
    MatchFoundModal.tsx
  layouts/AppLayout.tsx
  pages/
    Admin.tsx
    AuthCallback.tsx
    Dashboard.tsx
    Heroes.tsx
    Leaderboard.tsx
    Login.tsx
    MatchRoom.tsx
    Onboarding.tsx
    Profile.tsx
    Register.tsx
    Stats.tsx
  stores/
  lib/

server/prisma/
  schema.prisma
  migrations/

server/src/
  infrastructure/
  modules/
    admin/
    auth/
    leaderboard/
    matches/
      discord-match-voice.service.ts
      replay-processor.service.ts
      replay-storage.service.ts
    matchmaking/
    users/
  shared/
    env.ts

packages/shared/src/
public/
scripts/
docs/
```

---

## 4. Implementado por dominio

### 4.1 Auth / cuentas

Hecho:

- [x] Registro/login por email + password.
- [x] Password con bcrypt.
- [x] Access token JWT.
- [x] Refresh token httpOnly persistido y revocable.
- [x] Logout.
- [x] Rate limit en endpoints de auth.
- [x] Roles: `USER`, `MODERATOR`, `ADMIN`, `BANNED`.
- [x] Bloqueo de usuario baneado en login OAuth.
- [x] Discord OAuth login/link.
- [x] Battle.net OAuth login/link.
- [x] Link token para iniciar vinculación OAuth desde Profile.
- [x] Desvincular Discord/Battle.net/Google sin romper el último método de acceso.
- [x] `AuthCallback` consume el access token de callback antes de redirigir.
- [x] `.env.example` documenta `DISCORD_*`, `BNET_*`, URLs cliente y replay storage.

Parcial / requiere validar:

- [~] Google OAuth: existe campo `googleId` y placeholder `/auth/google`, pero no flujo real.
- [x] Validación de env vars al startup cubre núcleo, Discord, Battle.net y replay storage (`server/src/shared/env.ts`, 2026-04-27).
- [~] Credenciales reales Battle.net deben configurarse en Developer Portal y validarse con cuenta real.

Pendiente:

- [ ] Email verification.
- [ ] Password reset.
- [x] Estrategia CSRF explícita para endpoints cookie-based críticos: origin/referer guard en `refresh` y `logout` (2026-04-27).

### 4.2 Usuarios / Perfil

Hecho:

- [x] Perfil propio.
- [x] Perfil público por username.
- [x] Onboarding competitivo con roles principales/secundarios.
- [x] País/nacionalidad (`countryCode`) en DB, onboarding, perfil, matchmaking dashboard y leaderboard.
- [x] Historial de partidas por usuario.
- [x] Búsqueda de jugadores en layout/sidebar.
- [x] Progresión/rank/level derivada de MMR.
- [x] Account linking UI para Discord/Battle.net.
- [x] Callout en Profile para vincular Discord cuando falta voice privado.
- [x] Hero Lab básico en `/heroes`.

Pendiente:

- [ ] Perfil competitivo más profundo: héroes preferidos, mapas, winrate por rol/mapa/héroe.
- [ ] Sistema de friends/follow.
- [ ] Historial más inmersivo con filtros y detalle post-match.
- [ ] Notificaciones/eventos del usuario.

### 4.3 Matchmaking

Hecho:

- [x] Cola competitiva vía Redis.
- [x] Snapshot público de cola y persistencia local de “Buscando ahora”.
- [x] Broadcast socket `matchmaking:queue_public_update`.
- [x] Accept modal.
- [x] Cancelación si alguien rechaza/no acepta.
- [x] Creación automática de match con equipos.
- [x] Capitanes.
- [x] Veto de mapas.
- [x] Bots/admin tools para llenar cola en testing.
- [x] Roles y MMR considerados en el armado.
- [x] Active match tracking en layout/player spine.

Pendiente:

- [ ] QA con más jugadores reales, no sólo testing local/admin.
- [ ] Ventanas configurables de expansión de MMR para comunidades chicas.
- [ ] Penalidades por dodge/abandono/no-accept.
- [ ] Métricas históricas de calidad de match.
- [ ] Rate limits finos por queue/veto/vote/chat.

### 4.4 Match room / flujo competitivo

Hecho:

- [x] Match room por partida.
- [x] Modo espectador readonly con updates live.
- [x] Veto de mapas.
- [x] Ready/finalizar.
- [x] Votación de ganador.
- [x] Votación MVP.
- [x] Cálculo MMR post-match.
- [x] Chat por match con canal global/equipo.
- [x] Discord voice privado por equipo.
- [x] CTA hacia `/profile?tab=accounts` cuando falta Discord vinculado.
- [x] UI activa refinada: replay sólo en `COMPLETED`, Discord sólo en `PLAYING`, cards de veto más altas, flujo compacto, roster tipo duelo con paneles individuales, side derecho espejado y barra táctica compacta.
- [x] Panel de estadísticas/replay post-match estilo telemetry, incluyendo archivo final con vetos, votos de ganador y votos MVP visibles.
- [x] Retratos de héroes en filas de estadísticas StormReplay, con fallback por iniciales.

Pendiente:

- [ ] QA end-to-end con 10 usuarios reales: accept → veto → playing → replay/vote → MVP → completed.
- [x] Mejor feedback cuando un jugador cae/reconecta durante veto/playing: presencia Socket.IO por match, panel online/offline y badges por jugador.
- [x] Moderación/sanitización formal del chat: política server-side para whitespace/control chars/zero-width/longitud/spam repetitivo.

### 4.5 Replay import / StormReplay

Hecho:

- [x] Upload de `.StormReplay` desde matchroom.
- [x] Modelo `MatchReplayUpload` con metadata, sha256, parse status y `parsedSummary`.
- [x] Parser `hots-parser` integrado.
- [x] Validación de mapa, ganador, roster mínimo, BattleTag/username y equipo.
- [x] `trustScore`, confidence e issues de identidad.
- [x] Auto-winner si el replay supera las reglas de confianza.
- [x] Discrepancy handling si replay contradice ganador manual.
- [x] Validado contra replays reales del usuario.
- [x] Storage configurable `REPLAY_STORAGE_DRIVER=local|r2|s3`.
- [x] Política MVP `REPLAY_RAW_RETENTION=delete_after_parse`: se conserva snapshot JSON y se elimina replay cruda por defecto.

Pendiente / externo:

- [ ] Cargar credenciales reales R2/S3 si se decide conservar replay cruda para torneos/disputas.
- [ ] Ampliar matriz de replays reales: mapas, modos, idiomas/regiones, players sin BattleTag.
- [ ] UI admin para revisar discrepancias de replay.

### 4.6 Leaderboard / stats

Hecho:

- [x] Leaderboard básico por MMR/rank.
- [x] Estadísticas base: wins, losses, winrate.
- [x] Flags/país en presentación.
- [x] Filtros frontend de leaderboard por país, rol y banda de rango; backend expone roles (2026-04-27).
- [x] Ruta `/stats` beta.
- [x] Stats UI muestra tendencia MMR aproximada, forma reciente, map pool y conteo de replays parseados (2026-04-27).

Pendiente:

- [~] Filtros por región/país/rol/rango: país/rol/rango implementado; región queda pendiente si se agrega región real al modelo.
- [ ] Temporadas.
- [ ] Rankings por héroe/mapa/rol.
- [ ] Export/compartir perfil/ranking.

### 4.7 Admin / moderación

Hecho:

- [x] Panel Admin separado en `/admin`.
- [x] Guard frontend + backend para `ADMIN`.
- [x] Listado de usuarios.
- [x] Heurística anti-smurf/suspicious users basada en señales disponibles.
- [x] Marcar/desmarcar sospechoso.
- [x] Ban/unban.
- [x] Cambiar role.
- [x] Ajustar MMR.
- [x] Listar/cancelar/borrar matches.
- [x] Ver/limpiar/llenar cola.
- [x] Métricas de matchmaking.
- [x] Admin audit log persistente para acciones críticas.
- [x] Client error monitoring básico.
- [x] Stats admin globales.

Pendiente:

- [ ] Separación granular `ADMIN` vs `MODERATOR` en permisos reales.
- [ ] Dashboard de disputas/replays discrepantes.
- [ ] Cola de reportes de jugadores.
- [ ] Acciones bulk seguras con confirmación.
- [ ] Auditoría expandida para todos los endpoints críticos.

### 4.8 Base de datos / migraciones

Hecho:

- [x] Prisma schema con usuarios, refresh tokens, matches, players, vetoes, votes, MVP votes, chat, replay uploads y admin audit logs.
- [x] Migración faltante `20260421201000_add_user_onboarding_state` reparada.
- [x] Migración MVP voting idempotente.
- [x] Migración admin audit logs.
- [x] Migración match chat channels.
- [x] Migración replay uploads.
- [x] Migración country code.
- [x] Script `db:recalculate-stats`.

Pendiente:

- [ ] Ejecutar `npm run db:migrate:prod --workspace=server` antes de cada deploy productivo.
- [ ] Revisar índices si crece actividad: `Match(status, createdAt)`, `MatchPlayer(userId)`, replay discrepancy queries, admin logs.
- [ ] Definir estrategia de backups/restore de Neon.

### 4.9 Seguridad / hardening

Ya existe:

- [x] Helmet.
- [x] CORS allowlist por `CLIENT_URLS`/`CLIENT_URL`.
- [x] `trust proxy` configurado para entorno proxy.
- [x] Rate limit global + auth + endpoints de polling/client errors.
- [x] bcrypt cost 12.
- [x] Refresh token persistido y revocable.
- [x] Zod en inputs importantes.
- [x] Admin guard.
- [x] Banned role / ban fields.

Pendiente:

- [ ] Completar env validation para `BNET_*`, replay storage y flags de producción.
- [x] CSRF strategy explícita para cookies de auth: `refresh`/`logout` requieren origin/referer permitido en producción.
- [ ] Rate limits finos por dominio: chat, veto, vote, queue, profile.
- [x] Sanitización/política de contenido para chat: `sanitizeMatchChatMessage` + tests.
- [ ] Device/IP/session fingerprint anti-smurf con privacidad documentada.
- [~] Tests de seguridad iniciados: cobertura unitaria del guard CSRF/origin en auth `refresh`/`logout`; faltan más endpoints críticos.
- [ ] Confirmar que `server/.env` nunca se suba a git.

---

## 5. Roadmap histórico — marcado actualizado

### Fase 0 — Estabilización técnica

- [x] Arreglar build frontend.
- [x] Confirmar typecheck backend/frontend históricamente.
- [x] Crear `.env.example` actualizado.
- [x] Inicializar git.
- [x] Agregar script root `typecheck`.
- [x] Agregar script root `check`.
- [x] Reparar higiene de migraciones Prisma.
- [~] Actualizar docs completas para reflejar repo actual: este audit fue actualizado, pero `docs/` aún puede quedar viejo.

### Fase 1 — Layout y sistema visual

- [x] Rediseñar `AppLayout` como command rail + player spine.
- [x] Crear navegación principal: Jugar, Leaderboard, Stats, Hero Lab, Profile, Admin.
- [x] Panel derecho colapsable / player spine con nivel, MMR, progreso e historial reciente.
- [x] Búsqueda de jugadores en sidebar/layout.
- [x] Tokens CSS/base visual inicial en `index.css`.
- [~] Pulido visual final pendiente por iteración con uso real.

### Fase 2 — Perfil competitivo

- [x] Onboarding competitivo.
- [x] Roles principal/secundario.
- [x] País/nacionalidad.
- [x] Account linking Discord/Battle.net.
- [x] Historial base.
- [~] Stats/profile avanzado pendiente.

### Fase 3 — Matchmaking UX

- [x] Queue public snapshot + realtime.
- [x] Accept modal.
- [x] Match room live.
- [x] Spectator live.
- [x] MVP voting.
- [x] Replay upload/snapshot.
- [x] Replay auto-winner con reglas de confianza.
- [~] Validación con más gente real pendiente; sanity check de match simulado en front reportado OK el 2026-04-27.

### Fase 3.5 — Discord competitivo por match

- [x] Discord bot/service.
- [x] Canales/invites por equipo.
- [x] Mostrar links por equipo en MatchRoom.
- [x] Cleanup programado.
- [x] UX para usuario sin Discord vinculado.
- [~] Validación productiva con bot real y permisos reales pendiente.

### Fase 4 — Admin panel real

- [x] `/admin` separado.
- [x] Usuarios, roles, bans, suspect, MMR.
- [x] Matches, queue, bots, métricas.
- [x] Audit logs.
- [x] Client errors.
- [~] Moderator permissions y disputas/reports pendientes.

### Fase 5 — Datos externos

- [x] Battle.net OAuth base.
- [x] BattleTag guardado para identidad/replay trust.
- [ ] Validar Battle.net con credenciales reales.
- [ ] Google OAuth real, si se mantiene como opción.
- [ ] HeroesProfile externo, sólo si aporta valor claro después del MVP.

---

## 6. Runbook inmediato actualizado

### P0 — Validación antes de deploy / siguiente sesión corta

1. [x] Correr `npm run check` — OK el 2026-04-27.
2. [ ] Correr `npm run db:migrate:prod --workspace=server` contra la DB objetivo antes de deploy.
3. [ ] Confirmar variables productivas:
   - `CLIENT_URLS` / `CLIENT_URL`
   - `DATABASE_URL`
   - `REDIS_URL`
   - `JWT_SECRET` / `JWT_REFRESH_SECRET`
   - `DISCORD_*` OAuth + bot/voice
   - `BNET_*`
   - `REPLAY_RAW_RETENTION`
   - `REPLAY_STORAGE_DRIVER` y, si aplica, `REPLAY_STORAGE_*`
4. [ ] Validar Cloudflare cache/images con `npm run cf:verify-images -- https://DOMINIO_REAL`.
5. [ ] Hacer smoke test manual completo con 2 navegadores + bots:
   - login
   - onboarding
   - queue
   - accept
   - veto
   - playing
   - Discord CTA
   - completed por replay o voto
   - MVP
   - leaderboard/profile actualizado

### P1 — Próximo bloque recomendado de código

1. [x] Completar `server/src/shared/env.ts` para cubrir Battle.net y replay storage — hecho el 2026-04-27.
2. [ ] Agregar checklist/endpoint admin para discrepancias de replay.
3. [ ] Endurecer rate limits por dominio: queue, vote, veto, chat, profile.
4. [x] Definir CSRF strategy para endpoints con cookie — origin/referer guard en auth `refresh`/`logout`, 2026-04-27.
5. [x] Crear tests mínimos de rutas críticas — cobertura inicial en `auth.router.test.ts` (CSRF/origin), `matches.service.test.ts` (replay decision + match completion), `authenticate.test.ts` (admin guard) y `matchmaking.service.test.ts` (joinQueue).

### P2 — Producto / UX

1. [ ] QA con jugadores reales y anotar fricciones.
2. [ ] Pulir Admin para moderación diaria: filtros, confirmaciones, reportes, disputas.
3. [~] Mejorar Profile/Stats: `/profile` ya redujo repetición y agrega preparación competitiva; `/stats` tiene trend MMR, forma reciente, map pool y replay evidence; faltan rol/héroe y persistencia estadística más profunda.
4. [~] Mejorar Leaderboard con filtros país/rol/rango/temporada — país/rol/rango implementado; temporada pendiente.
5. [ ] Revisar MatchRoom visual en mobile/tablet.

### P3 — Features futuras

1. [ ] Friends/follow/party queue.
2. [ ] Temporadas y rewards.
3. [ ] Email verification/password reset.
4. [ ] Google OAuth real, si sigue siendo necesario.
5. [ ] Integración externa HeroesProfile sólo si el replay propio no alcanza.

---

## 7. Lo que ya NO debería tratarse como pendiente

Estos puntos aparecían como pendientes en versiones anteriores del audit, pero ya están implementados o cerrados en el repo:

- [x] Crear `.env.example` base.
- [x] Root scripts `typecheck`/`check`.
- [x] Reparar migraciones Prisma incompletas.
- [x] Separar Admin de Dashboard.
- [x] Crear panel derecho colapsable / player spine.
- [x] Player search en layout.
- [x] Battle.net OAuth base.
- [x] Discord match voice.
- [x] Replay upload/snapshot/parser.
- [x] Replay trust scoring + auto-winner.
- [x] Storage replay configurable R2/S3/local.
- [x] País/nacionalidad en perfil/onboarding/leaderboard/matchmaking.
- [x] Hero Lab beta.
- [x] Optimización inicial de assets WebP/AVIF + presupuesto.

---

## 8. Decisión recomendada para continuar

Siguiente cambio recomendado: **hardening productivo + QA del flujo competitivo**.

Orden sugerido:

1. Ejecutar `npm run check` y corregir cualquier drift.
2. Validar migraciones prod/staging.
3. Probar flujo completo con bots + 2 navegadores.
4. Abrir bloque anti-smurf real: señales IP/device/session + UI admin de revisión.

Esto deja la plataforma lista para una beta chica sin seguir acumulando features sobre bases productivas inciertas.
