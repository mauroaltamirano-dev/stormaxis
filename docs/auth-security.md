# NexusGG — Auth & Seguridad

## Flujos de Autenticación

### 1. Discord OAuth (recomendado para MVP)
```
1. Usuario click "Login con Discord"
2. Redirect a Discord → usuario autoriza scopes: identify, email, guilds (anti-smurfing)
3. Discord callback → server recibe code
4. Server intercambia code por access token de Discord
5. Fetch user data: id, username, email, avatar, account_created_at
6. Anti-smurfing check:
   a. account_created_at < 60 días → rechazar o marcar como sospechoso
   b. Verificar si ese discord_id ya está vinculado a otra cuenta → rechazar
7. Crear/actualizar User en DB, generar JWT + refresh token
8. Redirect al client con tokens

Scopes mínimos: identify, email
Scopes extra (anti-smurfing): guilds (ver servidores del usuario)
```

### 2. Battle.net OAuth
```
Scopes: openid, profile, email (básico)
Uso: linking post-registro, NO login principal en MVP
(La API de Battle.net tiene limitaciones para obtener datos de HotS)

Flow de linking:
1. Usuario autenticado va a Profile Settings → "Vincular Battle.net"
2. OAuth flow → obtener bnet_id, battletag
3. Verificar que ese bnet_id no esté vinculado a otra cuenta NexusGG
4. Guardar en tabla `accounts` asociada al user
```

Decisión de arquitectura relacionada:
- Battle.net se usa para identidad y linking
- HOTS data se resuelve por una fuente separada / backend adapter
- Ver `docs/battlenet-hots-data-strategy.md`

Documentación oficial:
- Getting started: https://community.developer.battle.net/documentation/guides/getting-started
- OAuth: https://community.developer.battle.net/documentation/guides/using-oauth

### 3. Google OAuth
```
Scopes: openid, email, profile
Uso: alternativa de login si no tienen Discord
Mismo flow que Discord pero sin el chequeo de account age
```

### 4. Email / Password
```
Registro:
- Email único, validado con regex + no-disposable-email list
- Password: mínimo 8 chars, bcrypt cost 12
- Verificación de email (envío de token)
- Rate limit: 5 intentos de registro por IP por hora

Login:
- Rate limit: 10 intentos fallidos → bloqueo 15 minutos
- Timing attack prevention: bcrypt compare siempre (no short-circuit)
```

---

## Gestión de Tokens

### Access Token (JWT)
```json
{
  "sub": "user_uuid",
  "role": "USER | ADMIN",
  "iat": 1714000000,
  "exp": 1714000900
}
```
- Vida: **15 minutos**
- Almacenado en: memoria del cliente (Zustand store)
- Header: `Authorization: Bearer <token>`

### Refresh Token (JWT)
- Vida: **30 días**
- Almacenado en: **httpOnly cookie** (SameSite=Strict, Secure en prod)
- Rotación: nuevo refresh token en cada uso (invalidar el anterior)
- Guardado en DB: tabla `refresh_tokens` con `jti` para blacklisting

### Flow de Refresh
```
1. Access token expira (401 del server)
2. Cliente detecta 401 → interceptor de axios llama a /api/auth/refresh
3. Server valida refresh token cookie, emite nuevos tokens
4. Cliente reintenta la request original
5. Si refresh también expiró → logout forzado
```

---

## Anti-Smurfing

### Capa 1: Discord Account Age
```typescript
// Al linkear Discord
if (discordAccountAge < 60 * 24 * 60 * 60 * 1000) {
  // Cuenta de Discord < 60 días
  throw new AppError('DISCORD_ACCOUNT_TOO_NEW', 403)
}
```

### Capa 2: Detección de Multi-cuenta
```sql
-- Verificar Discord ID único
SELECT id FROM users WHERE discord_id = $1 AND id != $currentUserId

-- Verificar Battle.net ID único  
SELECT id FROM users WHERE bnet_id = $1 AND id != $currentUserId
```

### Capa 3: IP Tracking
```typescript
// Al login/registro, guardar IP
// Si la misma IP tiene >2 cuentas activas → flag como sospechoso
// No bloqueo automático, alerta para el admin
```

### Capa 4: Device Fingerprinting (frontend)
```typescript
// FingerprintJS (open source)
import FingerprintJS from '@fingerprintjs/fingerprintjs'
// Enviar visitorId al server al login → guardar en DB
// Si fingerprint ya está asociado a otra cuenta → flag
```

### Capa 5: Email Desechable
```typescript
// Lista de dominios desechables (disposable-email-domains)
const BLOCKED_DOMAINS = ['mailinator.com', 'guerrillamail.com', ...]
```

---

## Headers de Seguridad (helmet.js)
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "https://discord.com", "https://battle.net"],
      imgSrc: ["'self'", "data:", "https://cdn.discordapp.com", "https://blz-contentstack.com"],
    }
  },
  crossOriginEmbedderPolicy: false, // Para Discord avatars
}))
```

## Rate Limiting
```typescript
// Global: 100 req/15min por IP
// Auth routes: 10 req/15min por IP
// Queue join: 1 req/5s por usuario
// Chat: 10 mensajes/10s por usuario por room
// Veto action: 1 req/s por usuario (anti-spam)
```

## CORS
```typescript
cors({
  origin: process.env.CLIENT_URL,
  credentials: true, // Necesario para cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
})
```

---

## Roles de Usuario
| Role | Descripción |
|------|-------------|
| `USER` | Jugador normal |
| `MODERATOR` | Puede resolver disputes, ver matches |
| `ADMIN` | Acceso total al panel |
| `BANNED` | Bloqueado, puede ver pero no jugar |
