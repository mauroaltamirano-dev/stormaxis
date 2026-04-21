# NexusGG — Battle.net + HOTS Data Strategy

_Verificado con documentación oficial y pública el **20 de abril de 2026**._

## Decisión Ejecutiva

Para este proyecto, la estrategia recomendada es:

1. **Battle.net = identidad y account linking**
2. **HeroesProfile = fuente externa de datos HOTS**
3. **NexusGG backend = capa de normalización, cache y reglas de negocio**

La razón es simple: **Battle.net no expone una API pública oficial documentada para datos de Heroes of the Storm**, mientras que **HeroesProfile sí expone endpoints específicos de HOTS**, incluyendo perfiles, replays, MMR y estadísticas.

---

## 1. Qué aporta Battle.net

Battle.net sí nos sirve para:

- login con OAuth / OIDC
- vinculación de cuenta Battle.net con un usuario interno
- obtener identidad estable del usuario
- sostener un modelo de auth serio del lado servidor

### Endpoints / capacidades verificadas

El discovery OIDC oficial de Battle.net publica:

- `authorization_endpoint`
- `token_endpoint`
- `userinfo_endpoint`
- `jwks_uri`
- `revocation_endpoint`
- `introspection_endpoint`
- `end_session_endpoint`
- `device_authorization_endpoint`

También publica firma `RS256`, lo cual es correcto para validación backend.

### Límite práctico

Aunque Battle.net sirve muy bien para identidad, **no encontramos documentación pública oficial de APIs de HOTS** en el portal de Blizzard.  
La documentación pública visible se concentra en:

- Battle.net OAuth
- Diablo III
- Hearthstone
- StarCraft II
- World of Warcraft

Además, el portal público muestra ejemplos de scopes como `wow.profile` y `sc2.profile`, pero **no evidencia equivalente para HOTS**.

### Restricciones legales relevantes de Blizzard

Los términos del Blizzard Developer API imponen, entre otras cosas:

- máximo de **36.000 requests por hora**
- retención máxima de datos de **30 días**
- privacy policy obligatoria
- prohibición de usar esos datos para marketing/publicidad
- prohibición de monetizar o “premium-gatear” features basadas en esas APIs

**Conclusión:** Battle.net debe entrar como **SSO / linking**, no como fuente principal de datos HOTS.

---

## 2. Qué aporta HeroesProfile

HeroesProfile **sí sirve** para este proyecto. Y sí: **es pago si queremos usarlo bien en un producto**.

### Capacidades verificadas

La API pública/documentada de HeroesProfile expone endpoints para:

- héroes
- mapas
- patches
- perfiles de jugador
- replays de jugador
- MMR de jugador / héroe / rol
- replay upload
- replay download
- replay data
- replay bans
- hero stats
- hero matchups
- talent builds
- datos de NGS / CCL

Esto ya está en el terreno de “HOTS real”, no solo identidad.

### Pricing verificado al 20 de abril de 2026

- **Basic**: **USD 5/mes**
- **Intermediate**: **USD 10/mes**
- **Developer**: **USD 25/mes**

### Punto CLAVE de arquitectura

HeroesProfile documenta explícitamente que:

- **Basic** e **Intermediate** **no** pueden ser llamados directamente desde una aplicación para servir datos
- en esos tiers, los datos deben ser **pull + stored** en infraestructura propia
- la **integración directa de endpoints** está disponible en **Developer**

Eso significa:

- si queremos backend-to-backend limpio para una app/web, el tier realista es **Developer**
- si quisiéramos abaratar, podríamos usar un tier menor, pero con una arquitectura más incómoda y menos apta para servir tráfico de producto

### Cosas a favor

- está enfocado 100% en HOTS
- ya resuelve parsing de replays y estadísticas derivadas
- reduce muchísimo el costo de construir un pipeline propio desde cero
- permite empezar rápido con features reales de perfil, stats y matchmaking intelligence

### Cosas en contra

- es un **third-party dependency**
- el pricing y los límites pueden cambiar
- no tenemos control sobre su SLA ni continuidad
- el token viaja en query string según su doc, así que hay que proteger logs y nunca exponerlo al cliente
- su modelo de datos no debe contaminar nuestro dominio interno

---

## 3. Recomendación de arquitectura

### Recomendación final

**Sí, considerar HeroesProfile es correcto.**  
De hecho, hoy es la opción más realista para llevar HOTS a un producto sin inventar magia donde Blizzard no la ofrece.

### Arquitectura propuesta

```text
Cliente
  -> NexusGG API
      -> Auth / session / account linking
      -> Battle.net OAuth / OIDC
      -> HeroesProfile adapter
      -> Cache / DB propia
      -> Endpoints internos normalizados
```

### Reglas importantes

1. **Nunca** llamar HeroesProfile directamente desde el frontend
2. Guardar `api_token` solo en backend
3. Crear una capa `HeroesProfileService` / adapter
4. Normalizar respuestas a DTOs internos
5. Cachear respuestas costosas
6. Diseñar fallback si HeroesProfile no responde
7. No acoplar el dominio a nombres/formatos del proveedor

### Datos que sí conviene persistir en nuestra DB

- usuarios vinculados a Battle.net
- mapping `user_id -> bnet account -> battletag -> blizz_id -> region`
- snapshots de MMR relevantes
- replays importados / procesados
- agregados calculados propios
- metadata necesaria para leaderboard, perfil y matchmaking

### Datos que NO conviene depender de leer “live” siempre

- replay data pesada
- player MMR para pantallas de alto tráfico
- hero stats globales
- matchups y talents agregados

Eso debe quedar con cache o persistencia local. Si no, quedamos rehenes del proveedor.

---

## 4. Estrategia recomendada por fases

### Fase 1 — MVP sólido

- Battle.net solo para linking
- Discord o email como login principal
- HeroesProfile solo desde backend
- importar perfil / battletag / region
- traer stats básicas y MMR

### Fase 2 — Perfil HOTS serio

- importar historial de replays
- mostrar hero pool, winrate, comfort picks
- enriquecer matchmaking y draft tools

### Fase 3 — Si HeroesProfile queda corto

- conservar adapter desacoplado
- permitir reemplazo parcial por pipeline propio de replay ingestion
- mantener el contrato interno del dominio sin romper frontend

---

## 5. Decisiones asentadas

### Decisión 1
**Battle.net no será la fuente principal de datos HOTS.**

### Decisión 2
**Battle.net se usará para OAuth/OIDC, identidad y account linking.**

### Decisión 3
**HeroesProfile es el candidato principal para datos HOTS externos.**

### Decisión 4
**Si se implementa HeroesProfile, el tier objetivo debe evaluarse desde `Developer`, no desde `Basic` o `Intermediate`, porque esos tiers no están pensados para servir datos directamente desde una app.**

### Decisión 5
**Toda integración con HeroesProfile debe pasar por backend propio con cache, normalización y control de errores.**

---

## 6. Fuentes

- Blizzard Getting Started  
  https://community.developer.battle.net/documentation/guides/getting-started
- Blizzard OAuth Guide  
  https://community.developer.battle.net/documentation/guides/using-oauth
- Blizzard OAuth / Battle.net APIs  
  https://community.developer.battle.net/documentation/battle-net/oauth-apis
- Blizzard OIDC discovery  
  https://oauth.battle.net/.well-known/openid-configuration
- Blizzard Developer API Terms  
  https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use
- HeroesProfile API pricing  
  https://api.heroesprofile.com/Api
- HeroesProfile API docs  
  https://api.heroesprofile.com/docs
- HeroesProfile upload endpoint  
  https://api.heroesprofile.com/docs/1.0/upload/
- HeroesProfile heroes endpoint  
  https://api.heroesprofile.com/docs/1.0/Heroes

