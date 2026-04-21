# NexusGG — Sistema de ELO / MMR

## Niveles del Sistema (fuente de verdad: ELO/MMR)

En NexusGG no usamos Bronce/Plata/Oro como progresión real del producto.
Eso se usa solo para calibración inicial durante el onboarding.

| Nivel | MMR Range | Referencia HotS (solo mapeo inicial) |
|-------|-----------|----------------------------------------|
| 1 | 0 – 199 | Bronce 5-1 |
| 2 | 200 – 399 | Plata 5-1 |
| 3 | 400 – 599 | Oro 5-3 |
| 4 | 600 – 799 | Oro 2-1 |
| 5 | 800 – 999 | Platino 5-3 |
| 6 | 1000 – 1199 | Platino 2-1 |
| 7 | 1200 – 1499 | Diamante 5-3 |
| 8 | 1500 – 1699 | Diamante 2-1 |
| 9 | 1700 – 1899 | Maestro |
| 10 | 1900+ | Gran Maestro |

### MMR Inicial (MVP — selector manual)
Para el MVP los testers pueden asignarse su MMR manualmente al registrarse:
- Selección de rango en el formulario de onboarding
- El sistema les asigna el MMR del punto medio del rango elegido
- Los admins pueden override el MMR desde el panel

---

## Cálculo de ELO

### Fórmula Base (Elo estándar)
```
ELO_new = ELO_old + K × (Score - Expected)

Score:    1 si ganó, 0 si perdió
Expected: 1 / (1 + 10^((ELO_oponente - ELO_jugador) / 400))
ELO_oponente: MMR promedio del equipo contrario
```

### Factor K por tramo de MMR
| MMR | K-Factor | Razón |
|-----|----------|-------|
| < 800 | 40 | Más volatilidad para nuevos jugadores |
| 800 – 1199 | 35 | |
| 1200 – 1599 | 30 | |
| 1600 – 1999 | 25 | |
| 2000 – 2399 | 20 | Más estable en niveles altos |
| 2400 – 2799 | 16 | |
| 2800+ | 12 | Máxima estabilidad |

### Ejemplos de Cálculo
```
Jugador: 1800 MMR (Platino I)
Oponente avg: 1750 MMR

Expected = 1 / (1 + 10^((1750 - 1800) / 400))
         = 1 / (1 + 10^(-0.125))
         = 1 / (1 + 0.749)
         = 0.572

Victoria: 1800 + 25 × (1 - 0.572) = 1800 + 10.7 ≈ +11 MMR
Derrota:  1800 + 25 × (0 - 0.572) = 1800 - 14.3 ≈ -14 MMR
```

### Puntos de Pantalla (display)
Para mostrar al usuario en la UI:
- Cada nivel tiene 0-100% de progreso interno
- `progreso = (MMR - piso_nivel) / ancho_nivel * 100`
- Ej: 1350 MMR en Lvl 7 (1200-1499) → progreso ≈ 50%

---

## MVP — Asignación Inicial
En el formulario de registro o primer login:
```
"¿En qué rango estás en HotS?"
○ Bronce      ○ Plata
○ Oro         ○ Platino  
○ Diamante    ○ Master
```
El sistema asigna el MMR del punto medio del rango seleccionado.

---

## Eventos en Tiempo Real
Cuando el ELO se recalcula después de un match:
1. Backend emite `user:elo_update` con `{ newMMR, delta, newRank, oldRank, promoted }`
2. Si cambió de tramo: se refleja automáticamente en `LVL_X`
3. El cliente actualiza el store de Zustand → re-render del MMR bar y badge de nivel
