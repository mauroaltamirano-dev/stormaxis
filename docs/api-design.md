# NexusGG — API Design

## REST Endpoints

### Auth — `/api/auth`
| Method | Path | Descripción |
|--------|------|-------------|
| POST | `/login` | Login email/pass → tokens |
| POST | `/register` | Registro email/pass |
| POST | `/refresh` | Refresh access token (cookie) |
| POST | `/logout` | Invalida refresh token |
| GET | `/discord` | Redirect a Discord OAuth |
| GET | `/discord/callback` | Callback Discord OAuth |
| GET | `/bnet` | Redirect a Battle.net OAuth |
| GET | `/bnet/callback` | Callback Battle.net OAuth |
| GET | `/google` | Redirect a Google OAuth |
| GET | `/google/callback` | Callback Google OAuth |
| POST | `/link/discord` | Vincular Discord a cuenta existente |
| POST | `/link/bnet` | Vincular Battle.net |
| DELETE | `/link/:provider` | Desvincular una cuenta OAuth |

### Users — `/api/users`
| Method | Path | Descripción |
|--------|------|-------------|
| GET | `/me` | Perfil del usuario autenticado |
| PUT | `/me` | Actualizar perfil (username, avatar) |
| GET | `/:username` | Perfil público de un usuario |
| GET | `/:username/matches` | Historial de partidas |
| GET | `/:username/stats` | Estadísticas del usuario |

### Matchmaking — `/api/matchmaking`
| Method | Path | Descripción |
|--------|------|-------------|
| POST | `/queue/join` | Entrar a la cola |
| POST | `/queue/leave` | Salir de la cola |
| GET | `/queue/status` | Estado actual de la cola del usuario |
| POST | `/match/:matchId/accept` | Aceptar el match encontrado |
| POST | `/match/:matchId/decline` | Rechazar el match |

### Matches — `/api/matches`
| Method | Path | Descripción |
|--------|------|-------------|
| GET | `/:matchId` | Datos del match |
| GET | `/:matchId/veto` | Estado actual del veto |
| POST | `/:matchId/veto` | Acción de veto (capitán only) |
| POST | `/:matchId/vote` | Votar al ganador |
| GET | `/:matchId/chat` | Historial de mensajes del chat |

### Leaderboard — `/api/leaderboard`
| Method | Path | Descripción |
|--------|------|-------------|
| GET | `/` | Top 100 jugadores por MMR |
| GET | `/region/:region` | Leaderboard por región |

### Admin — `/api/admin` (role: ADMIN)
| Method | Path | Descripción |
|--------|------|-------------|
| GET | `/users` | Lista paginada de usuarios |
| GET | `/users/:id` | Detalle de usuario |
| PATCH | `/users/:id/mmr` | Override de MMR |
| PATCH | `/users/:id/role` | Cambiar rol |
| PATCH | `/users/:id/ban` | Banear usuario |
| GET | `/matches` | Lista de matches (activos/histórico) |
| POST | `/matches/mock` | Crear match mockup entre usuarios |
| POST | `/matches/:id/force-result` | Forzar resultado (testing) |
| GET | `/queue` | Ver cola actual en tiempo real |
| GET | `/stats` | Stats globales de la plataforma |

---

## WebSocket Events (Socket.io)

### Namespace: `/` (global, requiere auth)

#### Emitidos por el SERVER al cliente:
| Evento | Payload | Descripción |
|--------|---------|-------------|
| `matchmaking:found` | `{ matchId, expiresAt, teams }` | Match encontrado, mostrar accept |
| `matchmaking:cancelled` | `{ reason }` | Match cancelado (alguien rechazó/timeout) |
| `matchmaking:queue_update` | `{ position, eta }` | Update de posición en cola |
| `user:elo_update` | `{ newMMR, delta, newRank, oldRank, promoted }` | ELO actualizado (`newRank`/`oldRank` en formato `LVL_X`) |
| `user:rank_up` | `{ newRank, oldRank }` | Promotion a nuevo nivel |
| `notification:new` | `{ type, message, data }` | Notificación genérica |
| `friend:status_change` | `{ userId, status }` | Amigo cambió de estado |

#### Emitidos por el CLIENTE al servidor:
| Evento | Payload | Descripción |
|--------|---------|-------------|
| `matchmaking:join` | `{ mode, roles }` | Entrar a la cola |
| `matchmaking:leave` | — | Salir de la cola |
| `match:accept` | `{ matchId }` | Aceptar match |
| `match:decline` | `{ matchId }` | Rechazar match |

---

### Room: `match:{matchId}` (requiere ser participante)

#### SERVER → cliente:
| Evento | Payload | Descripción |
|--------|---------|-------------|
| `match:state` | `{ status, teams, veto, chat }` | Estado completo al unirse |
| `veto:start` | `{ captains, maps, order }` | Inicio del veto |
| `veto:turn` | `{ team, captainId, timeoutAt, remainingMaps }` | Turno actual |
| `veto:action` | `{ team, mapId, mapName, actorId, auto }` | Mapa vetado |
| `veto:complete` | `{ selectedMap }` | Mapa final elegido |
| `chat:message` | `{ id, userId, username, avatar, content, timestamp }` | Mensaje nuevo |
| `vote:open` | `{ expiresAt }` | Abrir votación de ganador |
| `vote:update` | `{ team1Votes, team2Votes, total }` | Update de votos |
| `vote:result` | `{ winner, team1Votes, team2Votes, eloDeltas }` | Resultado final |
| `match:complete` | `{ winner, duration, eloDeltas }` | Match cerrado |
| `player:ready` | `{ userId }` | Jugador confirmó presencia en room |

#### CLIENTE → servidor:
| Evento | Payload | Descripción |
|--------|---------|-------------|
| `veto:ban` | `{ mapId }` | Capitán veta un mapa |
| `chat:send` | `{ content }` | Enviar mensaje al chat |
| `vote:cast` | `{ winner: 'team1' | 'team2' }` | Votar al ganador |

---

## Prisma Schema (Draft)

```prisma
model User {
  id          String   @id @default(cuid())
  username    String   @unique
  email       String   @unique
  password    String?  // null si solo tiene OAuth
  avatar      String?
  role        Role     @default(USER)
  mmr         Int      @default(1200)
  rank        String   @default("LVL_7")
  wins        Int      @default(0)
  losses      Int      @default(0)
  
  // OAuth IDs
  discordId   String?  @unique
  bnetId      String?  @unique
  googleId    String?  @unique
  
  // Anti-smurfing
  discordCreatedAt DateTime?
  ipHistory   String[] // últimas IPs
  fingerprints String[] // device fingerprints
  isBanned    Boolean  @default(false)
  isSuspect   Boolean  @default(false)
  
  // Relations
  refreshTokens RefreshToken[]
  matchPlayers  MatchPlayer[]
  chatMessages  ChatMessage[]
  votes         Vote[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model RefreshToken {
  id        String   @id @default(cuid())
  jti       String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  isRevoked Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Match {
  id        String      @id @default(cuid())
  status    MatchStatus @default(PENDING)
  mode      GameMode    @default(COMPETITIVE)
  region    String      @default("SA")
  map       String?     // mapa elegido post-veto
  winner    Int?        // 1 o 2 (team)
  duration  Int?        // segundos
  
  players   MatchPlayer[]
  vetoes    MapVeto[]
  messages  ChatMessage[]
  votes     Vote[]
  
  createdAt DateTime @default(now())
  startedAt DateTime?
  endedAt   DateTime?
}

model MatchPlayer {
  id          String  @id @default(cuid())
  matchId     String
  match       Match   @relation(fields: [matchId], references: [id])
  userId      String
  user        User    @relation(fields: [userId], references: [id])
  team        Int     // 1 o 2
  isCaptain   Boolean @default(false)
  mmrBefore   Int
  mmrAfter    Int?
  mmrDelta    Int?
  accepted    Boolean? // null = pendiente, true = aceptó, false = rechazó
}

model MapVeto {
  id        String   @id @default(cuid())
  matchId   String
  match     Match    @relation(fields: [matchId], references: [id])
  mapId     String
  mapName   String
  team      Int      // qué equipo vetó
  auto      Boolean  @default(false) // si fue auto-veto por timeout
  order     Int      // orden del veto
  createdAt DateTime @default(now())
}

model Vote {
  id        String   @id @default(cuid())
  matchId   String
  match     Match    @relation(fields: [matchId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  winner    Int      // 1 o 2
  createdAt DateTime @default(now())

  @@unique([matchId, userId])
}

model ChatMessage {
  id        String   @id @default(cuid())
  matchId   String
  match     Match    @relation(fields: [matchId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  content   String
  createdAt DateTime @default(now())
}

enum Role { USER MODERATOR ADMIN BANNED }
enum MatchStatus { PENDING ACCEPTING VETOING PLAYING VOTING COMPLETED CANCELLED }
enum GameMode { COMPETITIVE UNRANKED TEAM }
```
