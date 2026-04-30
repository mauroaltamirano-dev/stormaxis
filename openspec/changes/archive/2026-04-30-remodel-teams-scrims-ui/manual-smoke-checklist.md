# Manual Smoke Checklist — `/teams` + `/scrims`

Date: 2026-04-30
Change: `remodel-teams-scrims-ui`

## Preconditions

- `npm run check` passed locally.
- Backend and client running (`npm run dev`).
- Ideal: 2 usuarios reales (owner/captain + teammate) para validar eventos live.

## 5.3 Functional Smoke

### A) `/teams`

- [ ] Header + summary muestra estado (`Activo`/`Sin equipo`) y métricas (miembros, online, invites, solicitudes).
- [ ] Estado loading muestra skeleton (no panel plano de texto).
- [ ] Crear/editar equipo sigue funcionando (guardar perfil + feedback success/error).
- [ ] Invitar jugador desde búsqueda funciona y refresca lista.
- [ ] Cambiar `competitiveRole` en roster funciona para owner.
- [ ] Aceptar/rechazar invitaciones funciona.
- [ ] Solicitar/cancelar ingreso funciona en directorio.
- [ ] Aceptar/rechazar join requests funciona (captain/owner).
- [ ] Estados vacíos se ven claros (sin invites, sin requests, sin equipos).

### B) `/scrims`

- [ ] Header + command center muestran readiness y métricas (entrantes/salientes/catálogo).
- [ ] Estado loading muestra skeleton.
- [ ] Roster picker mantiene reglas: max 5 titulares, coach/obs válidos, estados disabled correctos.
- [ ] Publicar búsqueda funciona y muestra sala publicada.
- [ ] Catálogo muestra cards premium con razón de disabled cuando aplica.
- [ ] Enviar solicitud funciona cuando hay sala publicada.
- [ ] Aceptar reto crea matchroom y navega correctamente.
- [ ] Rechazar reto actualiza estado y feedback.
- [ ] Outbox y estados vacíos se renderizan correctamente.

## 5.4 Responsive Smoke

Verificar visual + usabilidad en:

- [ ] 375px (mobile)
- [ ] 768px (tablet)
- [ ] 1024px (laptop)
- [ ] desktop (>= 1280px)

Criterios por breakpoint:

- [ ] Sin horizontal scroll accidental.
- [ ] Botones y toggles clickeables/tappeables.
- [ ] Jerarquía visual clara (no solapes, no clipping de texto).
- [ ] Focus/hover/active visibles en controles interactivos.

## Result

- Status: ⏳ Pending manual run
- Notes:
  -
