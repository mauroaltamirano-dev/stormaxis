# StormAxis Beta Readiness Audit — 2026-05-04

## 0. Alcance y objetivo

Auditoría de reconocimiento para preparar beta de StormAxis/HOTS. Se revisó estructura completa del repo, UI/UX, rutas principales, matchroom, búsqueda de partidas, scrims, equipos, realtime, seguridad, CORS, sanitización, persistencia y deudas técnicas detectables por código y comandos locales.

> Este documento **no implementa cambios**: consolida hallazgos, riesgos, logs y un backlog priorizado para poder ejecutar SDD por cambios pequeños.

---

## 1. Evidencia de comandos / logs

### 1.1 Stack detectado

- Monorepo npm workspaces: `client`, `server`, `packages/*`.
- Frontend: React 19, TypeScript, Vite 8, TanStack Router, Zustand, Socket.io Client, React Hook Form/Zod, CSS propio/Tailwind v4 dependency.
- Backend: Express 4, TypeScript, Prisma/PostgreSQL, Redis/ioredis, Socket.io, JWT, bcrypt, Helmet, CORS, rate limit, multer, hots-parser.
- SDD activo: `openspec/config.yaml` existe con `strict_tdd: true`.

### 1.2 Validación automática ejecutada

| Comando | Resultado | Notas |
|---|---:|---|
| `npm run typecheck` | ✅ Pasa | Server + client TypeScript OK. |
| `npm run test --workspace=server` | ✅ Pasa | 52/52 tests OK. Incluye auth CSRF-ish guard, chat policy, matchmaking, scrims, teams, auth middleware. |
| `npm run check` | ✅ Pasa | Typecheck + build client OK. |
| `npm run lint --workspace=client` | ❌ Falla | 71 problemas: 65 errores, 6 warnings. |

### 1.3 Build output relevante

Build Vite exitoso. Chunks grandes detectados:

- `Landing-*.js`: 176.23 kB gzip 53.84 kB.
- `MatchRoom-*.js`: 92.36 kB gzip 24.59 kB.
- `schemas-*.js`: 81.79 kB gzip 24.40 kB.
- `auth.store-*.js`: 58.07 kB gzip 18.60 kB.
- `Profile-*.js`: 38.24 kB gzip 9.84 kB.

### 1.4 Lint debt principal

Errores destacados:

- `client/src/components/matchmaking/ActiveMatchRoom.tsx:285` — `Date.now()` impuro usado en render/state initializer.
- `ActiveMatchRoom.tsx:1462`, `MatchFoundModal.tsx:65`, `Admin.tsx:337`, `Heroes.tsx:89`, `Stats.tsx:174`, `Teams.tsx:135`, `Scrims.tsx:121` — regla React 19/Compiler: `setState`/acciones síncronas en effects.
- `ActiveMatchRoom.tsx:4348`, `4716`, `4802` — `_tone` no usado.
- `Admin.tsx`, `Login.tsx`, `MatchRoom.tsx`, `Teams.tsx`, `Scrims.tsx` — múltiples `any` explícitos.
- `Teams.tsx:81/86` — memoización manual no preservable por React Compiler.

**Conclusión:** el build pasa, pero **no conviene lanzar beta con lint rojo** porque React 19/Compiler está marcando patrones que pueden producir renders cascada o comportamiento inestable.

---

## 2. Inventario de rutas y módulos

### 2.1 Rutas frontend

- Públicas: `/`, `/login`, `/register`, `/auth/callback`.
- Protegidas: `/onboarding`, `/dashboard`, `/teams`, `/scrims`, `/admin`, `/leaderboard`, `/stats`, `/heroes`, `/profile`, `/profile/$username`, `/match/$matchId`.
- Rutas deshabilitadas en nav: `Noticias`, `Configuración`.

### 2.2 Endpoints backend principales

- Auth: register, login, refresh, logout, Discord OAuth, Battle.net OAuth, me.
- Users: me, onboarding, update profile, unlink accounts, search, public profile, public matches.
- Matchmaking: queue join/leave/status/snapshot, active, session cleanup.
- Matches: live, match details, replay upload/list, ready, vote, MVP vote, chat.
- Teams: hub, create, invites, join requests, remove member, update profile, competitive role.
- Scrims: list, create/cancel search, create/accept/decline/cancel challenge.
- Admin: users, bans/suspect/mmr/role, scrims, bots, matches, queue, audit, monitoring, stats.

---

## 3. UI/UX — hallazgos globales

### 3.1 Identidad visual inconsistente

Hay dos capas visuales coexistiendo:

- `stormaxis-v2.css` con identidad StormAxis nueva.
- `index.css` con tokens antiguos `--nexus-*` y clase `nx-interactive`.
- Muchas pages tienen `style={...}` masivo y constantes `CSSProperties` locales.

Archivos más grandes y riesgosos:

| Archivo | Líneas | Riesgo |
|---|---:|---|
| `ActiveMatchRoom.tsx` | 5588 | Demasiada lógica + UI + estilos en un componente. |
| `Landing.tsx` | 2553 | Landing monolítica, mucho inline style. |
| `Profile.tsx` | 2331 | Perfil mezcla edición, historial, búsqueda, OAuth y estilos. |
| `Admin.tsx` | 1497 | Panel admin monolítico con muchas acciones sensibles. |
| `MatchFoundModal.tsx` | 803 | Modal crítico con lógica realtime/accept y UI. |
| `Scrims.tsx` | 635 | UI + lógica de scrim en page. |
| `Teams.tsx` | 619 | UI + lógica de equipo en page. |

**Recomendación:** crear un design system interno y extraer componentes antes de tocar flujos complejos.

### 3.2 Design system recomendado

Basado en búsqueda UI/UX para gaming/esports beta:

- Fondo: `#020617`, superficies `#0F172A` / `#1E293B`.
- Texto: `#F8FAFC`.
- CTA positivo/acción: `#22C55E`.
- Estilo: dark esports competitivo con neón controlado; evitar exceso de glitch/CRT por fatiga visual.
- Tipografía sugerida: headings tipo `Russo One`, body `Chakra Petch` o mantener fuente actual pero normalizar escalas.
- Reglas obligatorias:
  - hover/active/focus-visible en todo interactivo,
  - `cursor-pointer` sólo en clickeables reales,
  - disabled con `cursor-not-allowed`, explicación o tooltip/hint,
  - tab order lógico,
  - loading/skeletons en async,
  - `prefers-reduced-motion` respetado,
  - responsive validado 375/768/1024/1440.

### 3.3 Clickability y navegación lógica

Hallazgo fuerte: la app tiene ruta pública `/profile/$username`, pero muchos nombres de jugadores/usuarios no son links.

Ejemplos detectados:

- `/dashboard`: tarjeta de usuario actual parece perfil pero no navega; iconos de notificaciones/ajustes parecen botones pero no hacen nada útil.
- `/teams`: resultados de búsqueda, miembros, owners, invitaciones y solicitudes muestran usernames sin link a perfil.
- `/scrims`: roster, salas y avatars muestran jugadores/equipos sin navegación.
- `MatchFoundModal`: jugadores aceptando match no enlazan a perfil.
- `ActiveMatchRoom`: player cards, captain labels, replay rows y MVP candidates no enlazan a perfil.
- `/leaderboard`: filas/nombres de ranking no enlazan a perfil.
- `/admin`: usuarios y targets no tienen navegación consistente.

**Regla beta propuesta:** todo `username` visible debe renderizarse con un componente `PlayerLink` que apunte a `/profile/$username`, salvo bots/placeholders. Todo equipo visible debe usar `TeamLink` cuando exista ruta de detalle de equipo; si no existe, no debe parecer clickable.

### 3.4 Botones/paneles inactivos

- `AppLayout`: `Noticias` y `Configuración` disabled. Decidir: ocultar para beta o crear páginas mínimas.
- `/dashboard`: `Ver todas las partidas en vivo · Próximamente` disabled. Para beta, mejor link a `/stats`/`/leaderboard` o quitar.
- `/dashboard`: campana de notificaciones y ajustes son visuales sin acción clara.
- Varios disabled en teams/scrims son correctos por reglas de negocio, pero necesitan tooltip/hint uniforme.

---

## 4. Matchroom y flujo de encontrar partidas

### 4.1 Matchmaking común

Actual:

- Dashboard hace join/leave queue.
- AppLayout escucha socket `matchmaking:found`, `veto:start`, `matchmaking:cancelled`.
- AppLayout también hace polling de `/matchmaking/queue/status`, `/queue/snapshot` cada 8s y `/matchmaking/active` cada 5s.
- MatchFoundModal global permite aceptar/rechazar.
- Active match se puede reabrir desde dashboard.

Riesgos:

- Estado duplicado por socket + polling + localStorage (`matchmaking.store`) puede causar UI fantasma si Redis/DB divergen.
- `window.alert` en Dashboard para errores de cola: mala UX y no consistente.
- Sólo modo `COMPETITIVE` está habilitado; otros tabs deshabilitados pueden parecer producto incompleto.
- No hay E2E multiusuario para race conditions de accept/timeout/reconnect.

Acciones P0:

1. Reemplazar alertas por toast/notice global.
2. Crear componente `QueueStatusCard` y hooks `useQueueStatus`, `useActiveMatch` para centralizar socket/poll fallback.
3. Añadir smoke manual multiusuario documentado: join 10, accept timeout, reject, reconnect, active match recovery.
4. Añadir tests de servicio para reconexión/cleanup si se detectan bugs.

### 4.2 Matchroom

Actual:

- `ActiveMatchRoom.tsx` contiene estados de veto, ready, playing, finish, voting, MVP, replay upload, telemetry, timeline, roster, mapas, responsive y estilos.
- Está funcionalmente avanzado pero demasiado monolítico.

Riesgos:

- 5588 líneas hacen muy difícil corregir bugs sin regresiones.
- Estilos y lógica están acoplados; mover una UI puede romper flujo.
- No todos los nombres/jugadores son navegables.
- Los estados post-match/replay pueden abrumar al usuario y deberían dividirse por tabs/sections más pequeñas.

Extracciones recomendadas:

- `MatchRoomHeader`
- `MatchTeamsBoard`
- `MatchPlayerCard` + `PlayerLink`
- `VetoPanel`
- `ReadyPanel`
- `FinishFlowPanel`
- `WinnerVotePanel`
- `MvpVotePanel`
- `ReplayUploadPanel`
- `ReplayStatsPanel`
- hooks: `useMatchClock`, `useReplayUpload`, `useMatchDerivedState`

---

## 5. Scrims — lógica y UX

### 5.1 Lo que está bien

- Backend valida que un scrim tenga exactamente 5 starters.
- Coach/observers no pueden ser titulares.
- Coach/observers deben ser reales y online.
- Starters humanos deben estar online; bots permitidos para completar, pero al menos 1 humano online por team.
- Challenge aceptado crea match `TEAM` con origin `SCRIM_SELF_SERVE` y pending accept en Redis.
- Access rows para coach/observer existen.
- Tests server cubren create search, bots, accept challenge, access rows.

### 5.2 Riesgos / faltantes

- No se observa expiración automática de `ScrimSearch`/`ScrimChallenge` abiertos en UI/servicio, pese a enums `EXPIRED`.
- `createTeamScrimChallenge` no parece bloquear duplicados pending entre los mismos searches/equipos; podría haber spam de desafíos.
- `createTeamScrimChallenge` no revalida que ambos rosters sigan válidos/online hasta aceptar; se valida en accept, pero UX puede mostrar desafíos que fallan tarde.
- No hay historial de scrims por equipo, ya listado en `STORMAXIS_MASTER_PLAN.md` como P0.
- `/scrims` no usa enlaces a perfiles en roster/salas.

Acciones P0/P1:

1. Añadir unicidad lógica de challenges pending o bloqueo por pair `fromSearchId/toSearchId`.
2. Definir TTL/expiración de searches/challenges y job/cleanup endpoint seguro.
3. Mostrar motivo exacto cuando no se puede aceptar/publicar.
4. Crear historial scrim de equipo v1.
5. Integrar branding/logos de equipo en matchroom scrim.

---

## 6. Equipos — sistema y UX

### 6.1 Lo que está bien

- Un usuario sólo puede tener un equipo activo.
- Owner se crea como miembro al crear equipo.
- Owner/Captain pueden invitar; Owner controla perfil y roles competitivos.
- Máximo 1 captain competitivo y 5 starters.
- Invitaciones/solicitudes aceptadas expiran duplicados pendientes.
- Tests server cubren reglas de membresía, invitaciones, solicitudes, roles, kicks y bots.

### 6.2 Riesgos / faltantes

- No hay ruta dedicada de detalle público de equipo (`/teams/$slug` o `/team/$slug`), pese a tener `slug` en DB. Esto limita clickability de team names.
- Owner/captain de team de negocio (`TeamRole`) y captain competitivo (`TeamCompetitiveRole`) pueden confundir al usuario; necesitan copy/chips más claros.
- `logoUrl`/`bannerUrl` aceptan cualquier URL válida; en beta conviene política anti tracking/mixed-content: sólo https, límite de dominios o proxy/image upload.
- `cleanNullableUrl` en service sólo trim/slice; la validación URL real está en router. Si el service se usa fuera del router/admin/tests, no valida URL.
- No hay soft archive/leave team visible en UI para owner/member; existe kick, pero falta flujo explícito de abandonar/transferir owner/archivar.
- No hay auditoría admin/user-facing para cambios sensibles de equipo.

Acciones P0/P1:

1. Crear `TeamCard`, `TeamMemberCard`, `TeamRoleChip`, `TeamActionButton`, `TeamLink`.
2. Añadir página detalle equipo o decidir que team names no serán clickeables hasta crearla.
3. Validar URLs en service también, exigir `https:` para producción.
4. Añadir transferencia de owner / abandonar equipo / archivar equipo si aplica a beta.
5. Añadir audit logs para roles competitivos, kicks, invites aceptadas y cambios de perfil.

---

## 7. Seguridad, CORS, sanitización y datos sensibles

### 7.1 Fortalezas detectadas

- `helmet` activo con CSP base.
- CORS con allowlist `CLIENT_URLS`/`CLIENT_URL`; LAN dev sólo fuera de producción.
- Socket.io usa la misma allowlist de origins y JWT en handshake.
- Refresh token en cookie httpOnly, secure en producción.
- Guard `requireTrustedCookieRequest` en `/auth/refresh` y `/auth/logout`, con tests.
- Password hash con bcrypt; login corre bcrypt dummy para mitigar timing básico.
- Error handler no expone stack en 500.
- Inputs principales usan Zod en routers.
- Chat tiene sanitización dedicada y tests.
- Replay upload limita a 1 archivo y tamaño configurable; nombre se normaliza; extensión `.StormReplay` validada.

### 7.2 Riesgos P0/P1

1. **Access token en URL OAuth callback**
   - Discord/Battle.net callbacks redirigen con `accessToken` en query string a `/auth/callback`.
   - Riesgo: token queda en historial, logs, referers, analytics o screenshots.
   - Recomendación P0: usar cookie/session exchange one-time code o fragment hash mínimo; ideal: callback setea cookie/session y frontend llama `/auth/me`.

2. **Access token persistido en localStorage**
   - `auth.store.ts` persiste `accessToken` en localStorage.
   - Riesgo ante XSS: token robable.
   - Recomendación P0/P1: access token sólo en memoria + refresh httpOnly; rehidratar vía `/auth/refresh`.

3. **CSP incompleta para beta real**
   - `imgSrc` permite `http:` y `https:` global. Para prod conviene quitar `http:`.
   - No se observan `scriptSrc`, `styleSrc`, `frameAncestors`, `baseUri`, `formAction` explícitos.

4. **OAuth intent cookie no firmada**
   - Tiene state anti-CSRF y httpOnly, pero el payload intent no está firmado. Evaluar firmar/HMAC para evitar manipulación si algún vector altera cookie.

5. **Rate limits granulares faltantes**
   - Global limit existe, auth limit existe, client errors existe, polling especial existe.
   - Falta rate limit por chat, vote, ready, replay upload, team mutations, scrim challenge, user search.

6. **Exposición de datos auth user**
   - `presentUser` expone `email`, provider ids (`discordId`, `bnetId`, `googleId`) y linked account providerUserId al cliente autenticado. Para “no mostrar sensible”, en UI está bien para “mi perfil”, pero no debe filtrarse en logs ni rutas públicas. Public select no expone email/provider ids.

7. **Admin audit SQL bug potencial**
   - En `recordAdminAudit`, el INSERT enumera columnas: `entityType`, `entityId`, pero los VALUES incluyen `payload.entityType` dos veces antes de `entityId`. Esto parece mismatch de valores/columnas y puede romper auditoría o guardar mal datos.

8. **Replay upload file type débil**
   - Sólo extensión `.stormreplay`; para beta puede bastar, pero conviene magic/header sniff o parse-safe isolation si parser falla con archivos maliciosos.

9. **Datos realtime onlineUserIds**
   - `/teams/hub` y `/scrims` devuelven todos los online IDs. Es útil, pero para privacidad debería limitarse a miembros/equipos relevantes o devolver presencia resumida si escala.

---

## 8. Persistencia y realtime

### Actual

- PostgreSQL/Prisma para usuarios, equipos, matches, scrims, replay metadata.
- Redis para queue, pending accept, ready/voting/veto/cancel/finish runtime, client error events.
- Socket.io para eventos personales y salas.
- Poll fallback en AppLayout y Dashboard.

### Riesgos

- Redis contiene estado crítico de lifecycle; si Redis se reinicia, algunas ventanas runtime pueden perderse y DB puede quedar en estado intermedio (`ACCEPTING`, `VETOING`, etc.).
- Falta documento operativo de recuperación: qué hacer si Redis cae o si una match queda colgada.
- Eventos `teams:updated`, `scrims:*` sólo indican “actualiza”; UI re-fetch completo. Simple y robusto, pero puede generar bursts si hay muchos usuarios.

Acciones recomendadas:

1. Crear “reconciler” de matches en estados transitorios con Redis faltante.
2. Admin action segura para recomputar/cancelar matches colgadas con audit log correcto.
3. Documentar runbook beta: Redis down, DB migration, replay parser failures, queue stuck.
4. Agregar métricas de socket/reconnect/client-errors al dashboard admin con thresholds.

---

## 9. Backlog priorizado para beta

### P0 — Bloqueantes antes de beta pública

- [ ] Corregir lint rojo o ajustar reglas conscientemente; no lanzar con React Compiler warnings críticos sin decisión.
- [ ] Eliminar access token en URL OAuth callback.
- [ ] Decidir estrategia de token: access token en memoria vs localStorage.
- [ ] Corregir/auditar `recordAdminAudit` en `admin.router.ts`.
- [ ] Añadir `PlayerLink` y aplicarlo donde aparece un username visible: dashboard, leaderboard, teams, scrims, match modal, matchroom, profile search, admin.
- [ ] Quitar/ocultar o implementar botones fake: Noticias, Configuración, Dashboard notificaciones/ajustes, “Ver todas las partidas en vivo”.
- [ ] Crear smoke manual multiusuario de matchmaking común + scrims self-serve.
- [ ] Añadir rate limits a mutaciones críticas: chat, vote, ready, replay upload, team/scrim mutations, user search.
- [ ] Definir runbook de recuperación Redis/matches colgadas.

### P1 — Muy recomendado para beta cerrada

- [ ] Extraer componentes de `ActiveMatchRoom` para reducir riesgo de bugs.
- [ ] Extraer lógica de pages a hooks (`useTeamsHub`, `useScrimsHub`, `useQueueStatus`, `useProfileData`).
- [ ] Crear design primitives compartidos: `Button`, `Panel`, `Chip`, `TextInput`, `Textarea`, `Select`, `EmptyState`, `Skeleton`, `Notice`, `PlayerAvatar`, `PlayerLink`.
- [ ] Crear página detalle equipo o regla explícita de no-click para teams hasta que exista.
- [ ] Expiración de scrim searches/challenges y bloqueo de challenge duplicado.
- [ ] Historial scrim de equipo v1.
- [ ] Harden CSP productiva y restringir imágenes http.
- [ ] Validar/proxy de `logoUrl`/`bannerUrl`.

### P2 — Post beta o beta avanzada

- [ ] Friends/social layer.
- [ ] Notificaciones reales.
- [ ] Configuración real de usuario.
- [ ] Calendar de scrims programadas.
- [ ] Seasons/rewards.
- [ ] E2E con Playwright para flujos críticos multiusuario.

---

## 10. Plan SDD recomendado

Dividir en cambios pequeños para no romper todo:

1. `beta-security-token-hardening`
   - OAuth callback sin token en query.
   - access token memory-only.
   - CSP prod.

2. `beta-admin-audit-and-rate-limits`
   - Corregir `recordAdminAudit`.
   - Rate limits por dominio.
   - Audit logs equipos/scrims.

3. `beta-clickable-identity-primitives`
   - `PlayerLink`, `PlayerAvatar`, `TeamLink` o `TeamName` no clickable.
   - Aplicar en todas las vistas.

4. `beta-ui-system-components`
   - `Button`, `Panel`, `Chip`, `FormField`, `Notice`, `Skeleton`.
   - Migrar Teams/Scrims/Profile/Leaderboard primero.

5. `beta-matchroom-decomposition`
   - Extraer matchroom por paneles sin cambiar lógica.
   - Agregar tests/helpers de derived state.

6. `beta-scrims-teams-completion`
   - Challenge duplicate/expiry.
   - Team detail/history.
   - Manual smoke y runbook.

---

## 11. Archivos clave para próximas sesiones

- `client/src/components/matchmaking/ActiveMatchRoom.tsx` — matchroom monolítica crítica.
- `client/src/components/matchmaking/MatchFoundModal.tsx` — accept flow global.
- `client/src/layouts/AppLayout.tsx` — nav, pending match modal, active match polling, queue polling.
- `client/src/pages/Dashboard.tsx` — búsqueda partida común y live matches.
- `client/src/pages/Teams.tsx` — UI/lógica de equipos.
- `client/src/pages/Scrims.tsx` — UI/lógica self-serve scrims.
- `client/src/pages/Profile.tsx` — perfil propio/público, búsqueda, OAuth links.
- `server/src/infrastructure/http/app.ts` — CORS, Helmet, rate limits, client errors.
- `server/src/infrastructure/socket/server.ts` — socket auth/origins/presence.
- `server/src/modules/auth/auth.router.ts` — cookies, OAuth callback, refresh/logout guard.
- `server/src/modules/users/user.presenter.ts` — frontera auth/public user data.
- `server/src/modules/matchmaking/matchmaking.service.ts` — queue/accept/veto runtime.
- `server/src/modules/matches/matches.service.ts` — lifecycle match/voting/replay decisions.
- `server/src/modules/teams/teams.service.ts` — reglas de equipos.
- `server/src/modules/scrims/scrims.service.ts` — scrim search/challenge/match creation.
- `server/src/modules/admin/admin.router.ts` — admin actions/audit/monitoring.

---

## 12. Veredicto beta

**Estado actual:** funcional y buildable, con tests server sólidos.  
**Recomendación:** no lanzar beta pública todavía. Sí se puede avanzar a beta interna/controlada después de corregir P0 de seguridad, clickability básica, botones fake, lint rojo y smoke multiusuario.

**Mayor riesgo técnico:** `ActiveMatchRoom` y `Profile` monolíticos + estado realtime duplicado.  
**Mayor riesgo seguridad:** tokens en query/localStorage y rate limits insuficientes en mutaciones.  
**Mayor riesgo UX:** UI inconsistente y elementos que parecen clickeables pero no navegan.
