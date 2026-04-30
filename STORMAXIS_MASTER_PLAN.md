# STORMAXIS — MASTER PLAN ÚNICO

Fecha de consolidación: **2026-04-29**  
Estado actual: **MVP competitivo funcional + sistema de equipos/scrims v1 avanzado**

---

## 1) Resumen ejecutivo

StormAxis ya tiene el circuito competitivo principal funcionando (auth, matchmaking, accept, veto, matchroom, votación, MVP, replay parsing, admin).  
El foco actual está en cerrar totalmente la capa **Teams + Scrims** con UX premium, consistencia live y validación real multiusuario.

---

## 2) Qué está implementado (hecho)

## 2.1 Core competitivo
- Auth JWT + refresh token + onboarding competitivo.
- Matchmaking realtime con cola, accept, cancelación, creación de match y lifecycle competitivo.
- MatchRoom activa con flujo end-to-end: veto → playing → voting → MVP/completed.
- Upload/parse de `.StormReplay` con reglas de confianza.
- Admin panel operativo con auditoría y monitoreo base.

## 2.2 Equipos + Scrims
- Scrims admin/manual (base beta visual).
- Self-serve scrims por equipos (catálogo + challenge + aceptación).
- Página separada `/teams` para gestión de equipo.
- Página `/scrims` enfocada a operación de búsqueda de partida.
- Modal de accept global (ya no limitada a dashboard).
- Eventos live/semi-live en teams/scrims.
- Emisión socket segmentada por `user:{id}` con payload versionado.
- Distinción contextual SCRIM vs QUEUE en matchroom.
- Solicitudes/invitaciones con limpieza transaccional para evitar estados ilógicos.

## 2.3 Reglas de roles competitivos (backend)
- Máximo 1 `CAPTAIN` competitivo activo por equipo.
- Máximo 5 `STARTER` activos por equipo.
- Asignación sólo en miembros activos y bajo permisos de owner.

## 2.4 Validación técnica
- `npm run test --workspace=server` ✅
- `npm run typecheck` ✅
- `npm run check` ✅

---

## 3) Pendiente inmediato (prioridad alta)

## 3.1 Cierre operativo del bloque Teams/Scrims
- Ejecutar smoke manual multiusuario completo (2+ usuarios reales).
- Confirmar flujo real: solicitudes, invitaciones, challenge, accept global, matchroom scrim, cierre e historial.

## 3.2 Pulido visual premium (UX/UI)
- Reducir texto plano y aumentar jerarquía visual por módulos.
- Añadir más iconografía contextual y assets visuales.
- Mejorar estados vacíos, loading, skeletons y feedback.
- Homogeneizar chips/etiquetas de roles (permiso + competitivo).
- Afinar responsive tablet/mobile en `/teams`, `/scrims`, `ActiveMatchRoom`.

## 3.3 Datos y contexto en matchroom
- Mostrar logos/branding de equipos en paneles del matchroom.
- Reforzar data presentation de roles/rank/elo en cards de equipo/jugador.

---

## 4) Backlog funcional priorizado

## P0 — Historial y analítica de scrims por equipo
- Página/listado de historial scrim de equipo.
- Filtros (rival, estado, fecha, mapa).
- Resultado, MVP, replay, acceso al matchroom histórico.

## P1 — Social layer (friends)
- Add friend / remove friend.
- Solicitudes de amistad (enviar/aceptar/rechazar/cancelar).
- Presencia social: online/offline/en partida.
- Invite friends para formar grupos operativos.

## P2 — Scrims programadas (calendar)
- Calendario real de disponibilidad y propuestas de scrim.
- Flujo capitán ↔ capitán con confirmación de horario.
- Estados scheduled/confirmed/cancelled/expired + recordatorios.

## P3 — Temporadas y recompensas
- Estructura de seasons.
- Sistema de recompensas por participación/rendimiento/rango.
- Logros e insignias.

## P4 — Secciones adicionales
- Torneos/eventos.
- Noticias/updates de plataforma.
- Centro de notificaciones.
- Analytics avanzadas por equipo y jugador.

---

## 5) Backlog técnico y seguridad

- Rate limits granulares por dominio (chat/veto/vote/queue/profile mutaciones).
- Separación fuerte de permisos `ADMIN` vs `MODERATOR`.
- Flujo de disputas y discrepancias de replay en admin.
- Hardening de auditoría en endpoints críticos faltantes.
- Validación productiva de migraciones, backup y restore DB.

---

## 6) Plan de ejecución recomendado

## Fase A — Cierre Teams/Scrims v1
1. Smoke manual multiusuario completo.
2. Correcciones de bugs detectados en smoke.
3. Pulido visual premium en `/teams`, `/scrims`, matchroom scrim.

## Fase B — Historial de equipo + branding
1. Historial scrim de equipo v1.
2. Logos/portadas en contextos clave de matchroom y catálogo.

## Fase C — Social básico
1. Friends v1 + solicitudes.
2. Estado online/social + invites de sesión.

## Fase D — Calendar scrims
1. Modelo y UI de scrims programadas.
2. Recordatorios/estados operativos.

## Fase E — Seasons y rewards
1. Diseño de temporada.
2. Recompensas, insignias, progresión extendida.

---

## 7) Checklist de control por sesión

En cada sesión:
- Qué se completó.
- Qué se validó (tests/check/smoke).
- Qué quedó bloqueado.
- Qué cambió de prioridad.

---

## 8) Regla de prioridad actual

Antes de abrir bloques grandes (calendar, rewards, torneos), cerrar primero:
1. smoke multiusuario real de Teams/Scrims,
2. polish UX/UI premium mínimo,
3. historial scrim de equipo v1.

