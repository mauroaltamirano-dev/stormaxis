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
