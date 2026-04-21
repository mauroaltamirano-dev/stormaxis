# NexusGG — Arquitectura del Sistema

## Stack Tecnológico

### Frontend — `client/`
| Librería | Rol |
|----------|-----|
| React 19 + TypeScript | UI framework |
| Vite | Build tool |
| TanStack Router | Routing type-safe |
| TanStack Query | Server state (cache, refetch, optimistic updates) |
| Zustand | Client state (auth, matchmaking, socket) |
| Socket.io-client | Real-time bidireccional |
| TailwindCSS v4 | Styling con variables CSS |
| Framer Motion | Animaciones (match accept, veto timer, etc.) |
| React Hook Form + Zod | Formularios + validación |

### Backend — `server/`
| Librería | Rol |
|----------|-----|
| Node.js + Express + TypeScript | HTTP server |
| Socket.io | WebSocket server, rooms por match |
| Prisma | ORM + migrations |
| PostgreSQL | Base de datos principal |
| Redis | Cola de matchmaking, sessions, pub/sub, rate limiting |
| Passport.js | OAuth strategies (Discord, Battle.net, Google) |
| jsonwebtoken | Access tokens (15min) |
| bcrypt | Hash de passwords |
| helmet | Security headers |
| express-rate-limit | Rate limiting por IP/usuario |
| zod | Validación de inputs en el servidor |

### Infraestructura
- Docker + docker-compose (PostgreSQL + Redis + backend + frontend dev)
- nginx como reverse proxy (producción)
- Environment variables con dotenv + validación Zod al startup

---

## Estructura de Directorios

```
nexusgg/
├── client/                         # React frontend
│   ├── src/
│   │   ├── features/               # Feature-based architecture
│   │   │   ├── auth/               # Login, register, OAuth callbacks
│   │   │   ├── matchmaking/        # Queue, accept modal, countdown
│   │   │   ├── match-room/         # Veto, chat, voting
│   │   │   ├── profile/            # Perfil, linked accounts, historial
│   │   │   ├── leaderboard/        # Rankings, top players
│   │   │   ├── landing/            # Landing page pública
│   │   │   └── admin/              # Panel de administración
│   │   ├── components/
│   │   │   ├── ui/                 # Base: Button, Card, Badge, Avatar, Modal
│   │   │   ├── layout/             # Nav, Sidebar, AppShell
│   │   │   └── nexus/              # Brand components: RankGem, MMRBar, etc.
│   │   ├── lib/
│   │   │   ├── socket.ts           # Socket.io client singleton
│   │   │   ├── api.ts              # Axios instance con interceptors
│   │   │   └── utils.ts
│   │   ├── stores/
│   │   │   ├── auth.store.ts       # Usuario, token, estado de sesión
│   │   │   ├── matchmaking.store.ts # Estado de cola, match pendiente
│   │   │   └── socket.store.ts     # Conexión, eventos globales
│   │   ├── hooks/                  # Custom hooks
│   │   └── types/                  # Types globales, DTOs
│
├── server/                         # Node.js backend
│   ├── src/
│   │   ├── modules/                # Domain modules
│   │   │   ├── auth/               # Login, OAuth, JWT, refresh tokens
│   │   │   ├── users/              # CRUD, profile, account linking
│   │   │   ├── matchmaking/        # Queue service, matching algorithm
│   │   │   ├── matches/            # Match lifecycle, veto, voting
│   │   │   ├── chat/               # Match room chat
│   │   │   ├── elo/                # ELO calculation, rank updates
│   │   │   └── admin/              # Admin endpoints
│   │   ├── infrastructure/
│   │   │   ├── database/           # Prisma client, seed
│   │   │   ├── redis/              # Redis client, helpers
│   │   │   ├── socket/             # Socket.io server, namespaces, rooms
│   │   │   └── http/               # Express app, middlewares globales
│   │   ├── shared/
│   │   │   ├── middlewares/        # auth, rate-limit, roles, validate
│   │   │   ├── errors/             # AppError, error handler
│   │   │   └── types/              # Types compartidos
│   │   └── main.ts                 # Entry point
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│
├── docs/                           # Documentación de planificación
│   ├── architecture.md             # Este archivo
│   ├── mvp-scope.md
│   ├── elo-system.md
│   ├── api-design.md
│   ├── auth-security.md
│   └── battlenet-hots-data-strategy.md
│
├── docker-compose.yml
├── .env.example
└── package.json                    # Workspaces (monorepo)
```

---

## Sistemas Principales

### 1. Auth + Sessions
- **Access token**: JWT firmado, 15 minutos de vida, en memoria del cliente
- **Refresh token**: JWT en httpOnly cookie, 30 días, rotación en cada uso
- **OAuth**: Discord, Battle.net, Google — Passport.js strategies
- **Email/pass**: bcrypt, validación Zod, rate limiting en login
- **Account linking**: Un usuario puede tener múltiples OAuth providers vinculados
- **HOTS data strategy**: Battle.net para identidad; HeroesProfile/backend propio para datos HOTS (ver `docs/battlenet-hots-data-strategy.md`)

### 2. Anti-Smurfing
- Discord: validar account age ≥ 60 días al vincular
- Battle.net: usar linking como señal de identidad; **no** depender de un perfil HOTS oficial porque no hay API pública documentada para eso
- IP tracking: alertar si >1 cuenta activa desde la misma IP
- Device fingerprinting (client-side, FingerprintJS open source)
- Email desechable: blacklist de dominios

### 3. Matchmaking (Redis-based)
```
Usuario busca partida → ZADD queue:{region} {mmr} {userId}
                      ↓
Matchmaker worker (cada 5s) → busca 10 jugadores con MMR cercano
                      ↓
Match encontrado → PUBLISH match:found → Socket.io notifica a los 10
                      ↓
Accept screen (30s timer) → todos aceptan → match creado en DB
                      ↓
Cualquiera rechaza/timeout → quienes aceptaron vuelven a cola
```

### 4. Match Room (Socket.io rooms)
- Room ID: `match:{matchId}`
- Eventos:
  - `veto:start` — inicia el veto, anuncia capitanes
  - `veto:turn` — turno del capitán con timer 30s
  - `veto:action` — capitán veta un mapa
  - `veto:timeout` — auto-veto aleatorio
  - `veto:complete` — mapa final elegido
  - `chat:message` — mensaje en el chat del room
  - `vote:open` — abre votación del ganador (post-game)
  - `vote:cast` — un jugador vota
  - `vote:result` — resultado final (8/10 votos o todos votaron)
  - `match:complete` — partida cerrada, ELO actualizado

### 5. Sistema de Veto de Mapas
- Mapas disponibles en HotS: ~20 mapas
- Formato: ambos equipos velan mapas alternadamente hasta dejar 1
- Capitán = jugador con mayor MMR del equipo
- Timer: 30 segundos por veto
- Si timer expira: veto aleatorio del pool restante, pasa al siguiente capitán
- Estado del veto guardado en Redis (TTL = duración del match)

### 6. ELO / MMR
- Ver docs/elo-system.md para el detalle completo
- Fórmula K-factor variable por nivel
- Updates via evento Socket.io al finalizar el match

### 7. Admin Panel
- Rutas protegidas por role: `ADMIN`
- Features:
  - Ver/buscar usuarios
  - Override de MMR
  - Ver matches activos
  - Crear match mockup (sin pasar por la cola)
  - Forzar resultados (para testing)
  - Ver logs de actividad
  - Ver queue en tiempo real (jugadores buscando)

---

## Real-Time — Eventos Globales del Usuario
Cuando el usuario está conectado (fuera de un match):
- `matchmaking:found` — se encontró match, mostrar accept modal
- `matchmaking:cancelled` — match cancelado (alguien rechazó)
- `user:elo_update` — ELO cambió (de match anterior)
- `notification:new` — notificación nueva

---

## Variables de Entorno (.env.example)

### Base de datos — Neon
1. Crear proyecto en https://neon.tech (free tier)
2. Dashboard → Connection Details → copiar ambas URLs

```env
# Database — Neon (https://neon.tech)
# DATABASE_URL  → "Pooled connection" (usa PgBouncer, para queries)
# DIRECT_URL    → "Direct connection" (sin pooling, para migrations)
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/nexusgg?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/nexusgg?sslmode=require&pgbouncer=false

# Redis (local con Docker)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# OAuth — Discord
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_CALLBACK_URL=http://localhost:3000/api/auth/discord/callback

# OAuth — Battle.net
BNET_CLIENT_ID=
BNET_CLIENT_SECRET=
BNET_CALLBACK_URL=http://localhost:3000/api/auth/bnet/callback
BNET_REGION=us

# OAuth — Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# App
CLIENT_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```
