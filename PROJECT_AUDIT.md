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
- Este directorio no parece ser repo git inicializado actualmente (`.git` no existe en la raíz).

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
- [ ] Inicializar git si este será el repo real.
- [ ] Agregar script root `typecheck` o `check`.
- [ ] Agregar lint/build combinado.

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
- [ ] Replay import/snapshots.

---

## 10. Próximo paso recomendado

Después de esta auditoría, el próximo trabajo de código debería ser:

1. Crear `.env.example`.
2. Empezar rediseño de `AppLayout`.
3. Agregar search de jugadores en sidebar izquierda.
4. Convertir panel derecho en `PlayerSpine` con nivel, MMR, progreso, historial y Discord CTA.

Esto crea la base visual y de navegación para ordenar todo lo demás.
