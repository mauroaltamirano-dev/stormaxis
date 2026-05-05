# Team Public Profile FACEIT Remodel Design

## Goal
Remodelar `/teams/$slug` como perfil público competitivo estilo FACEIT y agregar soft delete de equipos para owners.

## Scope
- Perfil con portada, logo/emblema, nombre, país y ELO promedio del equipo.
- Navegación por tabs: `Descripción general`, `Estadísticas`, y `Ajustes` solo cuando el viewer es `OWNER`.
- Descripción general pública: miembros con username, país, roles de juego, ELO y rol competitivo; panel `About` con días de treino/disponibilidad, recruiting, roles buscados, redes sociales e info básica.
- Estadísticas públicas: total de scrims completados, winrate, últimos 5 resultados, stats por mapa, gráfico de rendimiento de equipo e historial paginado de 10 en 10 con carga al llegar al fondo.
- Soft delete: `DELETE /teams/:teamId` archiva el equipo en vez de eliminar físicamente.

## Data model
Extender `Team` con campos públicos opcionales:
- `countryCode` (`VARCHAR(2)`): país principal del equipo.
- `about` (`VARCHAR(700)`): sobre nosotros / info básica.
- `isRecruiting` (`BOOLEAN`): si busca jugadores.
- `recruitingRoles` (`JSONB`): roles buscados (`RANGED`, `HEALER`, `OFFLANE`, `FLEX`, `TANK`).
- `socialLinks` (`JSONB`): objetos `{ label, url }` sanitizados.

`description` seguirá siendo tagline corto; `availabilityDays` representa días de treino/disponibilidad.

## Backend
- `GET /teams/public/:slug` seguirá autenticado por layout actual, pero devolverá `viewerRole` y `canEdit` derivados del usuario autenticado.
- `PATCH /teams/:teamId` acepta los nuevos campos solo para owner.
- `DELETE /teams/:teamId` solo owner: marca `Team.status=ARCHIVED`, miembros `LEFT`, invitaciones/solicitudes pendientes `EXPIRED`, búsquedas abiertas/challenged `EXPIRED`, challenges pendientes asociados `EXPIRED`.
- `GET /teams/public/:slug/stats?limit=10&cursor=<createdAt>` devuelve summary + matches paginados:
  - `summary`: total, wins, losses, winrate, recentResults.
  - `mapStats`: map, matches, wins, winrate.
  - `performance`: puntos cronológicos de rolling winrate del equipo.
  - `matches`: últimos scrims completados de ese team con map, result, winner, score placeholder, createdAt.
  - `nextCursor`: fecha para siguiente página si hay más.

## Frontend
- Reemplazar layout card-like por shell ancho centrado (`maxWidth` ~1800, padding lateral).
- Hero: portada oscura con overlay, logo circular flotante sin doble recuadro, nombre + bandera, línea secundaria con ELO promedio.
- Tabs full-width estilo FACEIT; `Ajustes` aparece solo para owner.
- `Descripción general`: roster público y About.
- `Estadísticas`: cards, map table, SVG line chart simple sin librería nueva, historial incremental.
- `Ajustes`: formulario para identidad/About/recruiting/redes y botón peligro de borrar equipo con confirmación.

## Testing
- Server unit tests para soft delete y stats de scrims por team.
- Client helper tests para visibilidad de ajustes y resumen de stats.
- Verificación: tests targeted + `npm run check` si el entorno lo permite.
