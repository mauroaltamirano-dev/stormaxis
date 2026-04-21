# NexusGG — MVP Scope

## Objetivo del MVP
Permitir que testers experimenten el flujo competitivo COMPLETO de NexusGG, desde el registro hasta ver el historial de una partida, con real-time en cada paso.

---

## Flujos de Usuario (MVP)

### Flujo 1: Onboarding
1. Llega a la **landing page** → descubre la plataforma, CTA "Unirse"
2. Se registra con **Discord OAuth** (recomendado) o email/pass
3. Elige su **MMR inicial** (para MVP: selector manual del 1 al 10 como testers)
4. Ve su **perfil** con rango asignado y stats vacíos

### Flujo 2: Buscar Partida
1. Va a **"Buscar Partida"** (dashboard principal)
2. Selecciona modo (Competitivo) y rol(es) preferido(s)
3. Hace click en **"Buscar Partida"** → entra a la cola
4. Ve el timer de búsqueda en tiempo real
5. Cuando se encuentran 10 jugadores → **modal de accept** aparece (30s timer)
6. Acepta → espera que los 9 restantes también acepten
7. Si todos aceptan → va al Match Room

### Flujo 3: Match Room — Veto de Mapas
1. Llega al **Match Room** con ambos equipos visibles
2. Se muestran los **capitanes** de cada equipo
3. Sistema de veto inicia:
   - Capitán del equipo A veta un mapa (30s) 
   - Capitán del equipo B veta un mapa (30s)
   - ... hasta que queda 1 mapa
4. **Mapa elegido** se muestra con animación
5. Chat en vivo disponible desde que entra al room
6. Los jugadores van a jugar el partido en HotS

### Flujo 4: Resultados
1. Al volver del partido, los jugadores ven una **ventana emergente de votación**
2. Votan a cuál equipo ganó (A o B)
3. El equipo con más votos (de los 10 players) gana
4. Aparece pantalla de resultados: ELO ganado/perdido, estadísticas básicas
5. El historial se actualiza en tiempo real

### Flujo 5: Perfil
1. Ve su **historial de partidas** con ELO delta por partida
2. Ve su **rango actual** y progreso al siguiente nivel
3. Puede **vincular cuentas** adicionales (Battle.net, Google)

---

## Features del MVP — Priorización

### P0 — Core (bloqueante)
- [ ] Auth completo: Discord OAuth + email/pass + JWT
- [ ] Perfil básico con MMR inicial seleccionable
- [ ] Dashboard principal (mockup actualizado con React)
- [ ] Matchmaking queue con Socket.io
- [ ] Accept/decline modal con timer
- [ ] Match Room con ambos equipos
- [ ] Sistema de veto de mapas (timer, auto-veto, Socket.io)
- [ ] Chat en tiempo real en el match room
- [ ] Votación de ganador (popup post-game)
- [ ] Cálculo y update de ELO en tiempo real
- [ ] Historial de partidas básico

### P1 — Importante para testers
- [ ] Google OAuth
- [ ] Landing page informativa
- [ ] Leaderboard básico
- [ ] Admin panel (gestión de usuarios, override MMR, crear matches)
- [ ] Panel de amigos online (sidebar derecha del mockup)
- [ ] Anti-smurfing básico (Discord account age)

### P2 — Post-MVP
- [ ] Battle.net OAuth linking
- [ ] HeroesProfile API integration
- [ ] Replay ingestion / custom game monitoring por vía propia o proveedor externo (no asumir soporte oficial de Battle.net para HOTS)
- [ ] Torneos
- [ ] Stats detalladas por héroe
- [ ] Clans/Equipos
- [ ] Notificaciones push/email
- [ ] Temporadas

---

## Pantallas del MVP

| Pantalla | Descripción |
|----------|-------------|
| `/` | Landing page pública — info plataforma, sistema ELO, CTA Discord |
| `/login` | Login con Discord / Google / email |
| `/register` | Registro con email o OAuth |
| `/dashboard` | Hub principal — buscar partida, stats, historial reciente |
| `/matchmaking` | Estado de cola (puede ser overlay/modal en dashboard) |
| `/match/:id` | Match Room — equipos, veto, chat, votación |
| `/profile/:username` | Perfil público — stats, historial |
| `/profile/settings` | Editar perfil, vincular cuentas |
| `/leaderboard` | Rankings globales |
| `/admin/*` | Panel de administración (roleprotegido) |

---

## Diseño Visual

### Identidad NexusGG
- **Palette**: Ver mockup — dark (#080c14), surface (#0d1422), card (#111927)
- **Accent**: #00c8ff (cyan) — interacciones, activo, links
- **Gold**: #f0a500 — rangos, achievements  
- **Green**: #00e676 — victorias, online, positivo
- **Red**: #ff4757 — derrotas, errores, negativo
- **Purple**: #7c4dff — roles específicos, features premium
- **Fuentes**: Rajdhani (headings, UI labels) + Exo 2 (body text)
- **Iconografía**: Hexágonos para rangos, grid animado de fondo
- **Efectos**: Glow sutil en elementos activos, pulse en logo, fadeIn en transiciones

### Inspiración para referencias adicionales
- FACEIT: layout de dashboard, match room, veto UI
- GamersCLub: landing page, sistema de rangos, historial  
- ESEA: admin panel structure
- Design system: Shadcn UI como base de componentes, customizado con la palette NexusGG

---

## Discord CTA
- **Nav**: Badge pequeño de Discord con "Únete" → link al servidor
- **Landing**: Sección dedicada "Comunidad" con preview del servidor, canal #anuncios, #feedback
- **Footer**: Link al servidor con invite permanente
- **Match Room**: Link discreto al canal de soporte
