# HOTS / NexusGG — API actual (Abr 2026)

> Base URL backend local: `http://localhost:3000`
> Prefijo API: `/api`

## Auth (`/api/auth`)

| Método | Ruta | Auth | Estado |
|---|---|---|---|
| POST | `/register` | No | Implementado |
| POST | `/login` | No | Implementado |
| POST | `/refresh` | Cookie | Implementado |
| POST | `/logout` | Sí | Implementado |
| GET | `/discord` | No | Implementado |
| GET | `/link/discord` | Sí | Implementado |
| GET | `/discord/callback` | No | Implementado |
| GET | `/google` | No | Placeholder |
| GET | `/bnet` | No | Placeholder |
| GET | `/me` | Sí | Implementado |

## Users (`/api/users`)

| Método | Ruta | Auth | Estado |
|---|---|---|---|
| GET | `/me` | Sí | Implementado |
| POST | `/me/onboarding` | Sí | Implementado |
| PATCH | `/me` | Sí | Implementado |
| DELETE | `/me/accounts/:provider` | Sí | Implementado (`discord/google/bnet`) |
| GET | `/search?q=` | No | Implementado |
| GET | `/:username` | No | Implementado |
| GET | `/:username/matches` | No | Implementado |

## Matchmaking (`/api/matchmaking`)

> Todas requieren auth.

| Método | Ruta | Estado |
|---|---|---|
| POST | `/queue/join` | Implementado |
| POST | `/queue/leave` | Implementado |
| GET | `/queue/status` | Implementado |
| GET | `/queue/snapshot` | Implementado |
| GET | `/active` | Implementado |
| POST | `/session/cleanup` | Implementado |

## Matches (`/api/matches`)

> Todas requieren auth.

| Método | Ruta | Estado |
|---|---|---|
| GET | `/:matchId` | Implementado |
| POST | `/:matchId/ready` | Implementado |
| POST | `/:matchId/vote` | Implementado |
| GET | `/:matchId/chat` | Implementado |

## Leaderboard (`/api/leaderboard`)

| Método | Ruta | Auth | Estado |
|---|---|---|---|
| GET | `/` | No | Implementado |

## Admin (`/api/admin`)

> Todas requieren `ADMIN`.

| Método | Ruta | Estado |
|---|---|---|
| GET | `/users` | Implementado |
| PATCH | `/users/:id/mmr` | Implementado |
| PATCH | `/users/:id/ban` | Implementado |
| PATCH | `/users/:id/role` | Implementado |
| GET | `/matches` | Implementado |
| PATCH | `/matches/:id/cancel` | Implementado |
| DELETE | `/matches/:id` | Implementado |
| GET | `/queue` | Implementado |
| POST | `/queue/clear` | Implementado |
| POST | `/queue/fill-bots` | Implementado |
| GET | `/monitoring/client-errors` | Implementado |
| GET | `/stats` | Implementado |

---

## Socket.io (eventos principales)

### Cliente → servidor
- `match:accept`
- `match:decline`
- `match:join`
- `match:ready`
- `match:finish`
- `match:cancel_request`
- `veto:ban`
- `chat:send`
- `vote:cast`

### Servidor → cliente
- `matchmaking:queue_update`
- `matchmaking:found`
- `matchmaking:cancelled`
- `match:accept:update`
- `veto:start`
- `veto:turn`
- `veto:action`
- `veto:complete`
- `match:ready_update`
- `match:finish:update`
- `vote:start`
- `vote:update`
- `vote:result`
- `match:complete`
- `match:cancel:update`
- `match:cancelled`
- `chat:message`
- `user:elo_update`
