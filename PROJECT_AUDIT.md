# HOTS Competitive Platform — Project Audit & Roadmap

Fecha: 2026-04-21  
Base actual: `/home/tuki/projects/hots`  
Estado: proyecto nuevo en monorepo Vite + Express.

---

## 1. Objetivo del producto

Crear una plataforma competitiva de matchmaking para **Heroes of the Storm** inspirada en FACEIT, GamersClub, ESEA y Portal, pero con identidad propia para HOTS.

Como Battle.net no ofrece una API pública oficial útil para datos completos de HOTS, el MVP funciona con flujo manual asistido:

1. Usuario entra a cola.
2. Sistema arma partida.
3. Jugadores aceptan/rechazan.
4. Se abre match room.
5. Capitanes hacen veto de mapas.
6. Jugadores crean partida personalizada dentro del juego.
7. Jugadores confirman disponibilidad/conexión.
8. Capitanes solicitan finalizar.
9. Jugadores votan ganador.
10. Sistema actualiza MMR/ELO y guarda historial.

A futuro, HeroesProfile Developer puede aportar datos reales de perfiles, replays, héroes, mapas, MMR externo y estadísticas.

---

## 2. Estado técnico actual

### Stack actual

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | TanStack Router |
| Estado cliente | Zustand |
| HTTP | Axios |
| Realtime | Socket.io client/server |
| Backend | Express + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL/Neon |
| Runtime realtime/cache | Redis |
| Auth | JWT access token + refresh token cookie |
| Validación | Zod |
| Seguridad | Helmet, CORS, rate limit, bcrypt |
| UI libs | lucide-react, framer-motion, clsx, tailwind-merge |

### Verificación actual

```txt
npm run build --workspace=client      ✅ pasa
npm run typecheck --workspace=server  ✅ pasa
```

Notas:

- El build frontend fue reparado en esta auditoría.
- Vite avisa que el bundle principal supera 500 kB. No bloquea, pero sugiere code splitting más adelante.
- El directorio **sí** está inicializado como repo git (`.git` presente en la raíz).

---

## 3. Estructura real del proyecto

```txt
client/
  src/
    components/
    components/matchmaking/
    layouts/AppLayout.tsx
    pages/
      Landing.tsx
      Login.tsx
      Register.tsx
      Dashboard.tsx
      Leaderboard.tsx
      Profile.tsx
      MatchRoom.tsx
    stores/
    lib/

server/
  prisma/schema.prisma
  src/
    infrastructure/
    modules/
      admin/
      auth/
      leaderboard/
      matches/
      matchmaking/
      users/
    shared/

packages/shared/
  src/index.js
  src/index.d.ts

public/
  brand/
  images/
  maps/

docs/
```

### Observación importante

Los docs existentes describen parcialmente una arquitectura futura/ideal. La implementación real actual es más simple y page-based en frontend. Hay que actualizar documentación para que no confunda.

---

## 4. Funcionalidades existentes

### Auth

Existe:

- Registro email/password.
- Login email/password.
- Discord OAuth/login/linking parcial/real.
- Refresh token httpOnly cookie.
- JWT access token.
- Logout.
- Password con bcrypt.
- Rate limit en auth.
- Roles: `USER`, `MODERATOR`, `ADMIN`, `BANNED`.

Falta:

- Google OAuth real.
- Battle.net OAuth/linking real.
- Email verification.
- Password reset.
- Device/IP anti-smurfing.
- Env validation al startup.
- CSRF strategy explícita para endpoints cookie-based.

### Usuarios / Perfil

Existe:

- `/users/me`.
- Perfil público por username.
- Actualización de username/avatar/mainRole/secondaryRole.
- Búsqueda de usuarios por username.
- Historial básico de matches.
- Linked accounts derivadas desde columnas del usuario.
- Level/progreso calculado desde MMR.

Falta:

- Profile más inmersivo.
- Estadísticas avanzadas.
- Hero pool.
- Roles con iconografía propia.
- Season stats.
- Match history clickeable y más visual.
- Friends.
- Presencia online.
- Perfil público con identidad competitiva real.

### Matchmaking

Existe:

- Cola Redis por región `SA`.
- Join/leave queue.
- Prevención de doble cola.
- Bloqueo si usuario ya tiene match activo.
- Queue ETA/position básico.
- Snapshot de cola.
- Bots para QA.
- Accept flow.
- Match creation.
- Team assignment.
- Captains.
- Veto de mapas.
- Ready confirmation.
- Finish request por capitanes.
- Voting.
- Match completion.
- MMR update.
- Socket events.

Falta:

- Balance real por roles.
- Usar `mainRole`/`secondaryRole` del perfil como fuente principal.
- No pedir roles al buscar partida salvo como override opcional.
- Mejor visualización del estado de cada jugador.
- Reconnect/resume UX más fuerte.
- Disputes.
- Abandono/AFK penalties.
- Logs persistentes del lifecycle.
- Tests automatizados del flujo.

### Match room

Existe:

- Pantalla `/match/:matchId`.
- Equipos.
- Capitanes.
- Veto.
- Mapa elegido.
- Chat.
- Ready state.
- Finish state.
- Voting.
- Resultado.

Falta:

- Diseño más original/war-room.
- Mejor guía paso a paso para jugadores.
- Estado persistente más claro post-completed.
- Vista histórica readonly del match finalizado.
- Stats finales más ricas.
- Eventos/logs visibles.
- CTA a Discord/soporte.

### Leaderboard

Existe:

- Top 100 por MMR.
- Excluye banned.
- Muestra level/progreso.

Falta:

- Filtros por rol/región/temporada.
- Búsqueda.
- Separación mensual/seasonal/all-time.
- Badges/rangos visuales.

### Admin

Existe backend para:

- Usuarios.
- Cambio de MMR.
- Ban.
- Cambio de role.
- Matches.
- Cancel/delete match.
- Queue snapshot.
- Fill queue con bots.
- Client error monitoring.

Existe UI admin mezclada dentro del Dashboard si el usuario es admin.

Falta:

- Panel admin dedicado `/admin`.
- Queue monitor live.
- Match lifecycle controls visuales.
- Simular popeo.
- Forzar accept/reject.
- Resolver disputes.
- Revertir resultado.
- Audit log.
- Moderación anti-smurf.
- Ver usuarios conectados.
- Ver partidas live.
- Ver testers buscando/aceptando/rechazando.

---

## 5. Base de datos actual

Modelos actuales:

- `User`
- `RefreshToken`
- `Match`
- `MatchPlayer`
- `MapVeto`
- `Vote`
- `ChatMessage`

### Modelos recomendados a agregar

#### P0/P1

- `RatingHistory` / `MmrTransaction`
  - historial formal de cambios de MMR.
  - evita depender solo de `MatchPlayer.mmrDelta`.
- `AdminAuditLog`
  - quién cambió MMR, baneó, canceló match, forzó resultado, etc.
- `MatchEventLog`
  - eventos de accept, reject, veto, ready, finish, vote, complete.
- `Friendship`
  - amigos/agregar amigos.
- `Notification`
  - match found, friend request, result, announcements.
- `UserPresence`
  - online/offline/queue/in-match.

#### P2

- `Season`
- `SeasonRating`
- `Team` / `Clan`
- `Tournament`
- `NewsPost` / `DiscordAnnouncementCache`
- `ExternalAccount` separado de `User`
- `Hero`
- `HeroStat`
- `ReplayImport`
- `HeroesProfileSnapshot`
- `MatchDispute`

---

## 6. Seguridad y riesgos

### Ya existe

- Helmet.
- CORS allowlist.
- Rate limit global.
- Rate limit auth.
- JWT access token.
- Refresh token httpOnly.
- Refresh token persistido y revocable.
- bcrypt cost 12.
- Zod en inputs importantes.
- Admin guard.

### Riesgos / deuda

1. **`server/.env` está en el árbol local.** Confirmar que nunca se suba a git.
2. Falta `.env.example` actualizado.
3. Falta validación centralizada de env vars al startup.
4. Falta CSRF protection/strategy para refresh/logout con cookies.
5. Falta rate limit fino para chat/veto/vote/queue/profile.
6. Falta audit log para acciones admin.
7. Falta anti-smurfing real.
8. Falta sanitización/política de contenido para chat.
9. Falta separación más granular de permisos `ADMIN` vs `MODERATOR`.
10. Falta tests de seguridad para endpoints críticos.

---

## 7. Diseño/UI — diagnóstico

### Problema actual

La app funciona como MVP técnico, pero visualmente todavía se siente como una mezcla de paneles:

- mucho estilo inline,
- patrón visual inconsistente,
- paneles rectangulares genéricos,
- poca identidad HOTS,
- dashboard/admin/profile no comparten suficiente sistema,
- demasiadas superficies tipo card,
- navegación incompleta.

### Dirección visual recomendada

No copiar FACEIT literal. Usarlo como referencia de estructura, pero crear una identidad propia:

**Concepto:** `Nexus War Room` / `Nexus Rail`  
Una interfaz competitiva oscura, arcana, energética, con líneas de poder, paneles angulares, orbes de nivel, mapas como zonas de combate y estados de partida como circuito operativo.

### Vocabulario visual

- Nexus.
- Tormenta.
- Energía arcana.
- War room.
- Draft table.
- Capitanes.
- Veto.
- Mapa final.
- Rango/ascenso.
- Cola competitiva.
- Historial de batalla.

### Paleta recomendada

- Base: negro azulado profundo.
- Surface: azul carbón.
- Energía principal: cyan Nexus.
- Acción: naranja/lava.
- Élite: violeta/magenta.
- Victoria/ready: verde vital.
- Derrota/dispute: rojo demoníaco.
- Rango: dorado.

### Reglas de UI

- Evitar rounded cards genéricas.
- Usar bordes sutiles, cortes, rails y barras de energía.
- Los roles deben verse como insignias/placas.
- Los mapas deben usar imágenes siempre que sea posible.
- El panel derecho debe sentirse como `player spine`, no como otra sidebar común.
- La navegación izquierda debe sentirse como command rail.

---

## 8. Layout objetivo

### Sidebar izquierda

Debe incluir:

- Logo de la web.
- Search global.
  - P0: buscar jugadores.
  - P1: equipos/torneos.
- Jugar / Buscar partida.
- Leaderboard.
- Estadísticas.
- Noticias.
- Mi perfil.
- Configuración.
- Cerrar sesión.

### Panel derecho estilo FACEIT, adaptado a HOTS

Debe incluir:

- Avatar.
- Nivel.
- MMR/ELO.
- Barra de progreso.
- Puntos faltantes para subir.
- Historial desplegable.
  - W/L.
  - delta MMR.
  - mapa.
  - link a matchroom histórico.
- Amigos/agregar amigos.
- CTA Discord.
- Socket/presencia en pequeño.

### Dashboard central

Debe incluir:

- Estado de cola.
- Party slots / player card.
- Roles del jugador desde perfil.
- Jugadores buscando partida.
- Partidas live.
- Logs beta tester.
- CTA principal de buscar/cancelar.
- Info clara del flujo manual HOTS.

---

## 9. Roadmap recomendado

### Fase 0 — Estabilización técnica

- [x] Arreglar build frontend.
- [x] Confirmar typecheck backend.
- [ ] Crear `.env.example` actualizado.
- [ ] Actualizar docs para reflejar repo actual.
- [x] Inicializar git si este será el repo real.
- [ ] Agregar script root `typecheck` o `check`.
- [ ] Agregar lint/build combinado.
- [ ] Reparar higiene de migraciones Prisma:
  - `prisma migrate deploy` falla porque existe el directorio `server/prisma/migrations/20260421201000_add_user_onboarding_state/` sin `migration.sql`.
  - Decidir si restaurar ese `migration.sql`, borrar el directorio vacío/incompleto, o crear una migración de reconciliación.
  - MVP voting ya fue sincronizado en Neon con `prisma db push`, pero hay que dejar `migrate deploy` funcional antes de seguir acumulando cambios de DB.

### Fase 1 — Layout y sistema visual

- [ ] Rediseñar `AppLayout` como command rail + player spine.
- [ ] Crear tokens CSS de producto.
- [ ] Extraer componentes base:
  - `Button`
  - `Panel`
  - `PlayerCard`
  - `LevelOrb`
  - `RoleBadge`
  - `ProgressRail`
  - `MatchHistoryItem`
- [ ] Implementar search de jugadores en sidebar.
- [ ] Agregar Discord CTA.
- [ ] Agregar navegación para Stats/News/Settings aunque estén placeholder.

### Fase 2 — Perfil competitivo

- [ ] Mejorar profile overview.
- [ ] Roles visuales.
- [ ] Historial más inmersivo.
- [ ] Linked accounts mejor presentado.
- [ ] Preparar slots para Battle.net/HeroesProfile.

### Fase 3 — Matchmaking UX

- [ ] Mover roles fuera del formulario de queue como fuente principal.
- [ ] Mostrar roles en tarjetas de jugador.
- [ ] Mejorar queue status.
- [ ] Mostrar live testers/logs.
- [ ] Mejorar accept modal.
- [ ] Mejorar empty/active/completed states.
- [x] Mostrar partidas live en Dashboard con acceso a matchroom.
- [x] Permitir modo espectador readonly en MatchRoom.
- [x] Corregir realtime de espectadores para vetos/fases/votos.
- [x] Agregar votación MVP posterior a votación de ganador.
- [ ] Probar end-to-end con bots:
  - cola → accept → veto → playing → ready → finish → voto ganador → voto MVP → completed.
  - verificar espectador observando cambios live sin recargar.

### Fase 3.5 — Discord competitivo por match

- [x] Crear configuración Discord en `.env.example` y `server/.env`:
  - `DISCORD_BOT_TOKEN`
  - `DISCORD_GUILD_ID`
  - `DISCORD_STAFF_ROLE_ID`
  - `DISCORD_MATCH_CATEGORY_PARENT_ID` si se usa categoría raíz.
  - `DISCORD_MATCH_CHANNEL_TTL_MINUTES`
- [x] Crear servicio backend Discord REST:
  - crear categoría temporal por match.
  - crear 2 voice channels privados: Team Azul y Team Rojo.
  - generar invites/links.
  - aplicar permission overwrites para `@everyone`, staff y miembros del equipo.
- [ ] Definir requisito de cuenta Discord vinculada:
  - si un jugador no tiene `discordId`, mostrar warning y CTA `Vincular Discord`.
  - permitir jugar sin voice como fallback durante MVP cerrado.
- [x] Persistir metadata Discord del match:
  - categoría/channel IDs.
  - invite URLs.
  - estado de cleanup.
- [x] Mostrar en MatchRoom:
  - botón `Entrar voz equipo azul/rojo` sólo para participantes de ese equipo.
  - espectadores no ven links privados.
- [x] Cleanup automático:
  - al completar/cancelar match, borrar canales/categoría después del TTL.
  - agregar comando admin/manual para limpiar recursos huérfanos.

### Fase 4 — Admin panel real

- [ ] Crear `/admin`.
- [ ] Queue monitor.
- [ ] Match monitor.
- [ ] User tools.
- [ ] ELO tools.
- [ ] Lifecycle simulator.
- [ ] Audit logs.
- [ ] Client errors.
- [ ] Anti-smurf flags.

### Fase 5 — Datos externos

- [ ] Battle.net linking.
- [ ] HeroesProfile backend adapter.
- [ ] Cache y normalización.
- [ ] Stats reales.
- [ ] Hero pool.

### Próximo paso pactado (jueves, 2026-04-23)

- [ ] Spike técnico: implementar **Battle.net linking** (start/callback, guardar identidad Battle.net y mapping con usuario interno).
- [ ] Replay import/snapshots.

---

## 10. Runbook inmediato / siguientes pasos

### Prioridad 0 — Performance de imágenes (CRÍTICO, en curso)

Estado: **EN PROGRESO** (bloqueante para carga rápida vía Cloudflare).

1. [x] Convertir imágenes pesadas de `public/images`, `public/ranked` y `public/brand` a **WebP/AVIF**.
2. [x] Definir variantes por asset (`thumb` + `full`) para evitar descargar tamaño completo en cards/historial.
3. [x] Aplicar `loading=\"lazy\"` + `decoding=\"async\"` en listas e historial.
4. [x] Ajustar cache para estáticos (`Cache-Control: public, max-age=31536000, immutable` en assets versionados).
5. [ ] Activar y validar optimizaciones de Cloudflare (Polish/WebP/AVIF + cache rules).
6. [x] Fijar presupuesto de peso y objetivo: bajar el transfer inicial de imágenes de ~45 MB a <10 MB.

Notas de avance (2026-04-22):
- Script agregado: `npm run assets:optimize` (`scripts/optimize-assets.mjs`) genera `*.webp`, `*.avif`, `*.thumb.webp`, `*.thumb.avif`.
- Resultado inicial de conversión: **22 assets procesados**, fuente ~41.79 MB → WebP ~4.55 MB / AVIF ~2.09 MB.
- Se migraron referencias críticas del frontend a WebP/Thumb y se añadió `public/_headers` para cache larga en Cloudflare Pages.
- Presupuesto operativo agregado: `npm run assets:budget` (límite por defecto: total referenciado <= **10 MB**, asset individual <= **2 MB**). Resultado actual: **1.26 MB** total referenciado (PASS).
- Checklist de validación Cloudflare agregado: `npm run cf:verify-images -- https://TU_DOMINIO` para revisar `cf-cache-status`, `cache-control` y `cf-polished` sobre assets reales en edge.

7. [x] Mejorar persistencia en tiempo real de BUSCANDO AHORA y el número de jugadores
   - 2026-04-22: agregado broadcast socket público `matchmaking:queue_public_update` + persistencia local en store + polling continuo de snapshot en Dashboard.

### Prioridad 1 — Dejar DB/migraciones sanas

1. [x] Revisar `server/prisma/migrations/20260421201000_add_user_onboarding_state/`.
2. [x] Restaurar o eliminar la migración incompleta.
3. [x] Confirmar que `npm run db:migrate:prod --workspace=server` vuelve a pasar.
4. [x] No seguir agregando cambios de schema hasta resolver esto.
   - 2026-04-22: se creó migración de reconciliación no-op faltante y se hizo idempotente `20260422172000_add_mvp_votes`; deploy validado en Neon.

### Prioridad 2 — Probar flujo competitivo actual

1. Levantar Redis.
2. Levantar server/client.
3. Completar cola con bots/admin tools.
4. Validar:
   - accept modal.
   - veto.
   - matchroom playing.
   - ready/finalizar.
   - voto ganador.
   - voto MVP.
   - completed con MMR/MVP.
   - espectador recibiendo updates live.

### Prioridad 3 — Discord match voice

1. Crear app/bot Discord y agregarlo al server con permisos de gestión de canales/invites.
2. Añadir env vars.
3. Implementar servicio Discord.
4. Crear canales por match al pasar de accept a veto/playing.
5. Mostrar links por equipo en MatchRoom.
6. Programar cleanup.

### Prioridad 4 — Battle.net

Mantener el spike de **Battle.net linking** marcado para jueves 2026-04-23, después de estabilizar migraciones y Discord básico.

---

## 11. Próximo paso recomendado histórico

Después de esta auditoría, el próximo trabajo de código debería ser:

1. Crear `.env.example`.
2. Empezar rediseño de `AppLayout`.
3. Agregar search de jugadores en sidebar izquierda.
4. Convertir panel derecho en `PlayerSpine` con nivel, MMR, progreso, historial y Discord CTA.

Esto crea la base visual y de navegación para ordenar todo lo demás.
