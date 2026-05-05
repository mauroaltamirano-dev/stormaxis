# Dashboard V2 1:1 (Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` to match the approved 1:1 desktop reference using existing StormAxis data flows, while removing the right-side app shell panel.

**Architecture:** Keep routing/data sources intact and refactor only presentation layers. `AppLayout` becomes a two-region shell (left sidebar + content outlet). `Dashboard.tsx` is reorganized into composable neon blocks (topbar, hero, right cards, live table, queue-by-role) consuming existing stores/endpoints.

**Tech Stack:** React 19, TypeScript, TanStack Router, Zustand, inline style objects, lucide-react icons.

---

## File Structure / Responsibilities

- **Modify:** `client/src/layouts/AppLayout.tsx`
  - Remove right spine/panel and related UI state/components from shell.
  - Keep left nav and outlet stable for all routes.

- **Modify:** `client/src/pages/Dashboard.tsx`
  - Replace current layout composition with approved V2 desktop grid.
  - Keep existing data hooks and socket behavior.

- **Create:** `client/src/pages/dashboard-v2.styles.ts` (optional but recommended)
  - Centralize large style maps to keep `Dashboard.tsx` readable.

- **Create:** `client/src/pages/dashboard-v2.blocks.tsx` (optional but recommended)
  - Extract reusable presentational blocks (TopBar, HeroStats, LiveNowCard, QueueByRoleCard, BetaPanel).

- **Verify:** root scripts
  - `npm run typecheck`
  - `npm run check`
  - `npm run test --workspace=server`

> If optional files are created, imports in `Dashboard.tsx` must be updated accordingly.

---

### Task 1: Simplify App Shell (remove right panel)

**Files:**
- Modify: `client/src/layouts/AppLayout.tsx`

- [ ] **Step 1: Remove right-spine-only state and render branches**

Delete the state/render for `activeSpinePanel`, `playerSpine`, `SpineFlyout`, and action buttons that belong exclusively to the right panel.

```tsx
// remove from AppLayout state:
// const [activeSpinePanel, setActiveSpinePanel] = useState<...>(null);

// remove these render blocks entirely:
// {activeSpinePanel === "history" && <SpineFlyout ... />}
// {activeSpinePanel === "friends" && <SpineFlyout ... />}
// <aside style={styles.playerSpine}>...</aside>
```

- [ ] **Step 2: Convert shell grid from 3 columns to 2 columns**

```tsx
shell: {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "248px minmax(0, 1fr)",
  background: "radial-gradient(...), var(--nexus-bg)",
  color: "var(--nexus-text)",
}
```

- [ ] **Step 3: Keep left sidebar nav behavior unchanged**

Preserve:
- route activation logic (`isNavActive`)
- queue state indicator on `/dashboard`
- logout, search, and primary/account nav links

- [ ] **Step 4: Typecheck only client layout changes**

Run: `npm run typecheck --workspace=client`  
Expected: `Found 0 errors` (or command exits 0 with no TS errors).

---

### Task 2: Add Dashboard V2 composition scaffold

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Create (optional): `client/src/pages/dashboard-v2.styles.ts`

- [ ] **Step 1: Add top-level V2 wrapper sections**

```tsx
return (
  <section style={v2.page}>
    <TopBarV2 ... />
    <div style={v2.mainGrid}>
      <div style={v2.leftColumn}>{/* hero + live matches */}</div>
      <div style={v2.rightColumn}>{/* live-now + beta + queue-by-role + beta notes */}</div>
    </div>
  </section>
);
```

- [ ] **Step 2: Apply desktop-first breakpoints in code**

```tsx
const isDesktop = viewportWidth >= 1280;
const mainGridStyle = {
  ...v2.mainGrid,
  gridTemplateColumns: isDesktop ? "minmax(0, 1.65fr) 420px" : "1fr",
};
```

- [ ] **Step 3: Hero background assignment (single deterministic image)**

```tsx
background:
  "linear-gradient(100deg, rgba(3,7,16,0.94), rgba(8,10,28,0.72) 55%, rgba(20,10,40,0.35)), url('/images/617568.webp') center/cover",
```

- [ ] **Step 4: Panel background assignment (fixed secondary image)**

```tsx
background:
  "linear-gradient(160deg, rgba(5,10,22,0.9), rgba(8,10,30,0.78)), url('/images/Mephisto_1920x1200.webp') center/cover",
backgroundBlendMode: "normal, overlay",
```

---

### Task 3: Build TopBar V2 (visual-first, partial data)

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Create (optional): `client/src/pages/dashboard-v2.blocks.tsx`

- [ ] **Step 1: Render topbar left filters as visual controls**

```tsx
<div style={v2.topFilters}>
  <TopFilter label="Sudamérica" icon={<Globe size={14} />} />
  <TopFilter label="Temporada Beta" icon={<Shield size={14} />} />
  <TopFilter label="Competitivo 5v5" icon={<Swords size={14} />} />
</div>
```

- [ ] **Step 2: Render topbar right identity cluster with real user data**

```tsx
<div style={v2.topIdentity}>
  <button style={v2.topIconBtn}><Bell size={16} /></button>
  <button style={v2.topIconBtn}><Settings size={16} /></button>
  <div style={v2.profilePill}>
    <Avatar username={user.username} avatar={user.avatar} size={38} />
    <div>
      <strong>{user.username}</strong>
      <span>● Listo</span>
    </div>
    <img src={rankMeta.iconSrc} alt={rankMeta.label} />
    <span>{rankMeta.label} · {user.mmr.toLocaleString("es-AR")} MMR</span>
  </div>
</div>
```

- [ ] **Step 3: Verify topbar does not alter queue/join flow**

Run app manually and confirm `Buscar partida`/`Cancelar` button logic still works.

---

### Task 4: Build Hero + CTA + stats strip

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace hero title stack and mode tabs**

```tsx
<h1 style={v2.heroTitle}>BUSCAR PARTIDA</h1>
<p style={v2.heroSubtitle}>ÚNETE A LA BATALLA EN EL NEXO</p>
<ModeTabs
  modes={["Competitivo 5v5", "No clasificatoria", "ARAM", "Personalizada"]}
  active={selectedMode}
  onChange={setSelectedMode}
/>
```

- [ ] **Step 2: Keep existing queue action wired to current handler**

```tsx
<button onClick={toggleQueue} style={v2.ctaButton}>
  {isSearching ? "CANCELAR BÚSQUEDA" : "ENCONTRAR PARTIDA"}
</button>
```

- [ ] **Step 3: Render four stat cards using existing values**

```tsx
<StatCard label="Winrate" value={userWinrate} sub={`${user.wins}W / ${user.losses}L`} />
<StatCard label="MMR" value={user.mmr.toLocaleString("es-AR")} sub={rankMeta.label} />
<StatCard label="Partidas" value={(user.wins + user.losses).toString()} sub="Totales" />
<StatCard label="Racha" value={currentStreak > 0 ? `+${currentStreak}` : "—"} sub={streakLabel} />
```

- [ ] **Step 4: Confirm accept modal still appears from global store**

Trigger `matchmaking:found` in normal flow and verify `MatchFoundModal` is still shown from `AppLayout`.

---

### Task 5: Build right column cards (Live now + Beta event + Queue by role + replacement panel)

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Use: `client/src/lib/roles.ts`

- [ ] **Step 1: Implement “EN VIVO AHORA” card with real metrics**

```tsx
const liveNowPlayers = queueSize ?? queuePreviewForDisplay.length;
const liveNowEta = queueEtaSeconds != null ? `${queueEtaSeconds}s` : "—";
const liveNowMatches = liveMatches.length;
```

Render fields:
- Jugadores en cola
- Tiempo estimado
- Partidas en vivo
- Pico de actividad (derived label: Bajo/Medio/Alto by queue size)

- [ ] **Step 2: Implement “EVENTO ACTIVO” card as BETA state**

```tsx
<BetaEventCard
  title="FASE BETA COMPETITIVA"
  subtitle="Estamos afinando matchmaking, scrims y UX del matchroom."
  countdown="Actualización continua"
/>
```

- [ ] **Step 3: Implement queue-by-role card using `roles.ts` metadata**

```tsx
const ROLE_ORDER: PlayerRole[] = ["TANK", "OFFLANE", "RANGED", "HEALER", "FLEX"];
const roleRows = ROLE_ORDER.map((role) => {
  const count = countPlayersWithRole(queuePreviewForDisplay, role);
  const meta = getRoleMeta(role);
  return { role, count, label: meta?.label ?? role, accent: meta?.accent ?? "#7dd3fc" };
});
```

- [ ] **Step 4: Replace old servers panel with beta roadmap panel**

```tsx
<InfoPanel
  title="HOJA DE RUTA BETA"
  items={[
    "Smoke multiusuario Teams/Scrims",
    "Pulido UX premium dashboard",
    "Historial scrim por equipo v1",
  ]}
/>
```

---

### Task 6: Rebuild live matches table block to reference look

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Keep existing liveMatches source, refactor rendering only**

```tsx
<section style={v2.liveMatchesCard}>
  <header>PARTIDAS EN VIVO</header>
  <table>{/* mapa, mmr prom, tiempo, estado, espectadores */}</table>
</section>
```

- [ ] **Step 2: Preserve click-to-open behavior for active rooms**

```tsx
<button
  type="button"
  onClick={() => navigate({ to: "/match/$matchId", params: { matchId: match.id } })}
>
  Observar
</button>
```

- [ ] **Step 3: Add footer CTA button**

```tsx
<button style={v2.liveMatchesFooterBtn}>VER TODAS LAS PARTIDAS EN VIVO</button>
```

---

### Task 7: Verification and polish pass

**Files:**
- Modify if needed: `client/src/layouts/AppLayout.tsx`, `client/src/pages/Dashboard.tsx`, optional V2 files

- [ ] **Step 1: Run full verification commands**

Run:
```bash
npm run typecheck
npm run check
npm run test --workspace=server
```
Expected:
- TypeScript passes in server+client
- Client build passes
- Server tests pass

- [ ] **Step 2: Desktop smoke checklist (manual)**

Confirm on `/dashboard` desktop:
- Left sidebar nav works
- Topbar renders with user/rank/MMR
- Hero CTA queues/cancels correctly
- Live now card reflects queue/lives values
- Beta event card visible
- Queue-by-role card uses role labels/colors from `roles.ts`
- Live matches table renders and observe navigation works
- No right-side panel remains in app shell

- [ ] **Step 3: Stage/commit with focused message**

```bash
git add client/src/layouts/AppLayout.tsx client/src/pages/Dashboard.tsx client/src/pages/dashboard-v2.*.ts*
git commit -m "feat(dashboard): ship desktop-first v2 neon shell and 1:1 layout"
```

If commit hook blocks due missing `AGENTS.md`, create `AGENTS.md` with project coding rules first, then retry commit.

---

## Self-Review

### Spec coverage
- ✅ Shell sin panel derecho: Task 1
- ✅ Dashboard 1:1 desktop blocks: Tasks 2, 4, 5, 6
- ✅ Evento BETA + reemplazo de servidores: Task 5
- ✅ Cola por roles usando `roles.ts`: Task 5
- ✅ Data existente/hardening de regresión: Tasks 3, 4, 6, 7

### Placeholder scan
- No `TODO/TBD` operational gaps in tasks.
- Visual-first decisions are explicitly bounded to phase 1, with concrete rendering targets.

### Type consistency
- Role mapping aligns with `PlayerRole` usage and `getRoleMeta` contract from existing code.

