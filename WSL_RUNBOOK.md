# HOTS / NexusGG en WSL

Migrado desde Windows:

- Origen: `/mnt/c/Users/Tuki/projects/hots`
- Destino WSL: `/home/tuki/projects/hots`

Notas de migración:

- No se sobrescribió `/home/tuki/hots` porque ya contiene otro proyecto (`stormaxis`, Next.js).
- Se copiaron fuentes, docs, assets, `server/.env`, Prisma migrations y configuración.
- No se copiaron `node_modules`, `.next`, `dist` ni `build`; se regeneran dentro de WSL.

## Comandos principales

```bash
cd /home/tuki/projects/hots
nvm use
npm install
npm run db:generate --workspace=server
npm run dev
```

## Pendientes inmediatos del proyecto

Ver también `PROJECT_AUDIT.md`, sección **Runbook inmediato / siguientes pasos**.

### 1. Estado de migraciones Prisma (actualizado 2026-04-22)

✅ Quedó reconciliado:

- Se agregó `migration.sql` no-op en `server/prisma/migrations/20260421201000_add_user_onboarding_state/`.
- Se volvió idempotente `20260422172000_add_mvp_votes` para convivir con cambios que ya estaban en Neon por `db push`.
- Se ejecutó `prisma migrate resolve --rolled-back 20260422172000_add_mvp_votes` y luego deploy exitoso.

Verificación:

```bash
npm run db:migrate:prod --workspace=server
```

### 2. Probar flujo competitivo completo

Validar con bots/admin tools:

```text
cola → accept → veto → playing → ready → finish → voto ganador → voto MVP → completed
```

También validar que un espectador en MatchRoom recibe fases/vetos/votos en vivo sin recargar.

### 3. Discord match voice

Siguiente feature grande:

- crear bot/app Discord.
- configurar env vars:
  - `DISCORD_BOT_TOKEN`
  - `DISCORD_GUILD_ID`
  - `DISCORD_STAFF_ROLE_ID`
  - `DISCORD_MATCH_CATEGORY_PARENT_ID`
  - `DISCORD_MATCH_CHANNEL_TTL_MINUTES`
- crear categoría temporal por match.
- crear voice channel privado para Team Azul y Team Rojo.
- mostrar links por equipo en MatchRoom.
- cleanup automático al finalizar/cancelar.

## Redis / Docker

El `docker-compose.yml` del proyecto levanta Redis local en `6379`:

```bash
cd /home/tuki/projects/hots
npm run redis:up
# o directo:
docker compose up -d redis
```

Si `docker` no existe dentro de WSL, activar Docker Desktop → Settings → Resources → WSL integration → habilitar esta distro, o instalar Docker Engine dentro de WSL.

Workaround sin sudo/Docker usado para verificar el backend:

```bash
cd /home/tuki/projects/hots
./scripts/wsl-redis.sh
```

Ese script descarga paquetes `.deb` de Redis a `/tmp/hots-redis`, los extrae sin instalar a nivel sistema, y arranca Redis en `6379`.

## Cloudflare Tunnel

El frontend Vite queda en `http://localhost:5173/`. Para exponerlo:

```bash
npm run tunnel
# o directo:
./bin/cloudflared tunnel --url http://localhost:5173
```

El `server/.env` ya incluye `CLIENT_URLS` con:

```text
https://extraction-alone-europe-avoiding.trycloudflare.com
```

Si se usa un quick tunnel nuevo, Cloudflare suele generar otra URL; agregarla también a `CLIENT_URLS` y ajustar OAuth callbacks si aplica.

## Cloudflare Images (Prioridad 0)

### 1) Activar en dashboard

En la zona productiva:

1. **Speed > Optimization > Polish**: activar `Lossy` + `WebP`.
2. (Opcional avanzado) **Cache > Configuration Rules** o API de **Vary for Images** si se quiere manejo explícito de variantes `jpeg/jpg -> webp,avif`.
3. Purgar cache luego de activar (`Caching > Configuration > Purge Everything`) para evitar respuestas viejas.

### 2) Validar headers desde terminal

```bash
cd /home/tuki/projects/hots
npm run cf:verify-images -- https://TU_DOMINIO
```

Se espera ver, para assets estáticos:

- `cache-control: public, max-age=31536000, immutable` (definido en `public/_headers`)
- `cf-cache-status: HIT` (al menos en segundas requests)
- `cf-polished: ...` cuando Polish aplica sobre el asset

### 3) Validar presupuesto de imágenes en repo

```bash
cd /home/tuki/projects/hots
npm run assets:budget
```

Presupuesto actual configurado:

- Total assets referenciados <= `10 MB`
- Asset individual <= `2 MB`

## Estado verificado el 2026-04-21

- Node en WSL inicial: `v24.14.1` (fallaba con Prisma 5.22).
- Node validado para este proyecto: `v22.22.2` vía nvm (`.nvmrc`).
- npm validado: `10.9.7`.
- `npm install` completó correctamente.
- Vite client arranca en `5173`.
- Docker Desktop está disponible desde WSL y `docker compose` funciona; Redis fue verificado healthy en Docker.
- `cloudflared` está instalado localmente en `./bin/cloudflared` (`2026.3.0`).
- Resuelto el bloqueo de Prisma: con Node `v24.14.1`, `prisma generate` salía con código 0 pero no generaba el cliente; con Node LTS `v22.22.2`, genera correctamente `@prisma/client`. Usar `nvm use` antes de trabajar en el repo.
- TypeScript ya reporta errores estrictos en client/server; se dejaron sin modificar para no cambiar comportamiento durante la migración.
