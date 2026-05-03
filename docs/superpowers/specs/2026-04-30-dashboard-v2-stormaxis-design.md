# StormAxis Dashboard V2 (Desktop 1:1) — Design Spec

**Date:** 2026-04-30  
**Scope:** `/dashboard` only (phase 1)  
**Status:** Draft validated with user (ready for implementation planning)

## 1) Goal
Replicar de forma **1:1 en desktop** (referencia visual provista por el usuario) el dashboard principal de StormAxis, adoptando identidad neón/tormentosa y nueva distribución UI.

## 2) Constraints & Decisions
- Se usa **SDD** y se implementa por fases.
- No usar visual companion; trabajo directo en repo.
- Alcance actual: **solo `/dashboard`**.
- Prioridad: desktop 1920x1080 (responsive básico no bloqueante).
- Topbar fase 1: visual-first, funcionalidad parcial con datos reales existentes.
- Fondos determinísticos: una imagen para hero y otra para paneles (desde `public/images`).
- Reutilizar data y parámetros existentes (stores/hooks/endpoints vigentes).
- Eliminar panel derecho legado del app shell.

## 3) Target Layout (Desktop-first)

### App Shell
- Sidebar izquierdo fijo (navegación principal).
- Topbar superior (controles + perfil/rango) sobre el área de contenido.
- Sin panel derecho/spine.

### Dashboard body (grid principal)
1. Hero principal (izquierda):
   - Título “BUSCAR PARTIDA”
   - Subtítulo competitivo
   - Tabs de modo
   - CTA “ENCONTRAR PARTIDA”
   - 4 stat cards (Winrate, MMR, Partidas, Racha)

2. Columna derecha superior:
   - “EN VIVO AHORA” (cola, ETA, partidas, actividad)
   - “EVENTO ACTIVO” → contenido BETA (fase actual)

3. Fila inferior izquierda:
   - “PARTIDAS EN VIVO” (tabla + botón ver todas)

4. Fila inferior derecha:
   - “COLA EN TIEMPO REAL” usando metadatos/roles de `roles.ts`
   - Reemplazo del panel “estado de servidores” por panel informativo de producto (ej. hitos beta / novedades)

## 4) Technical Design by File

### `client/src/layouts/AppLayout.tsx`
- Remover el panel derecho/spine y flyouts asociados del layout global.
- Mantener sidebar izquierdo y outlet principal.
- Preservar navegación existente y comportamiento de sesión/socket sin regresiones.
- Permitir que `/dashboard` renderice su propio topbar de nueva identidad.

### `client/src/pages/Dashboard.tsx`
- Reestructurar completamente la composición visual para reflejar la referencia.
- Mantener hooks/store calls existentes para:
  - estado de cola / matchmaking
  - snapshot/preview de cola
  - live matches
  - datos del usuario (MMR, W/L, rank, racha)
- Mapear métricas y paneles nuevos a datos ya disponibles; placeholders sólo donde no exista fuente directa.
- Reusar `roles.ts` para iconografía/labels/accentos en “cola en tiempo real”.

## 5) Data Mapping (Existing Sources)
- `useAuthStore()` → perfil, MMR, W/L, rank derivado.
- `useMatchmakingStore()` → estado de búsqueda/accept/tiempos/queue size.
- Endpoints ya usados por dashboard actual:
  - `GET /matchmaking/queue/status`
  - `GET /matchmaking/queue/snapshot`
  - `GET /matches/live`
  - `GET /matchmaking/active`
- `client/src/lib/roles.ts` → taxonomía visual de roles para distribución de cola.

## 6) UX/Visual Rules
- Estética neón tormentosa: gradientes oscuros, glow controlado, bordes finos luminosos.
- Jerarquía clara: hero dominante, cards de soporte, tablas con densidad legible.
- Interacciones sutiles: hover/focus sin desplazar layout.
- Mantener consistencia tipográfica y tokens de color actuales cuando sea posible.

## 7) Error Handling / Fallbacks
- Si falta data en tiempo real: mostrar estado vacío elegante (“sin datos aún”).
- Si fallan snapshots/colas: degradar a placeholders informativos sin romper el layout.
- Cualquier bloque sin backend actual se deja explícito como visual-first (fase 1).

## 8) Testing & Verification
- Verificación técnica obligatoria post-cambio:
  - `npm run typecheck`
  - `npm run check`
  - `npm run test --workspace=server`
- Smoke manual desktop:
  - navegación sidebar
  - render topbar
  - búsqueda/cola/accept modal
  - tabla live matches
  - panel roles en tiempo real

## 9) Out of Scope (Phase 1)
- Refactor de `/teams` y `/scrims`.
- Funcionalidad completa de todos los controles del topbar.
- mobile-first refinado.

## 10) Follow-up
Una vez validado visualmente en `/dashboard`, extraer patrones compartibles para migrar identidad a `/teams`, `/scrims` y vistas competitivas.
