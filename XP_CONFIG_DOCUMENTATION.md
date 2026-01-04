# Configuración de Factores de XP - Adventure Streak

Este documento detalla los factores utilizados por las Firebase Functions para el cálculo de XP (Puntos de Experiencia) de los usuarios. Estos valores están configurados por defecto en el código, pero pueden ser sobrescritos desde la colección `config/gamification` en Firestore.

## Factores de Actividad Base

| Factor | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `minDistanceKm` | 0.5 km | Distancia mínima requerida para que una actividad procese XP base. |
| `minDurationSeconds` | 300 s (5 min) | Tiempo mínimo de actividad requerido para ganar XP. |
| `baseFactorPerKm` | 10.0 | Puntos de XP base otorgados por cada kilómetro recorrido. |
| `dailyBaseXPCap` | 300 XP | Límite máximo de XP que un usuario puede ganar al día por actividad base. |

### Multiplicadores por Tipo de Actividad
El XP base se calcula como: `Distancia * baseFactorPerKm * Multiplicador`.

| Actividad | Multiplicador |
| :--- | :--- |
| **Carrera (Run)** | 1.2 |
| **Ciclismo (Bike)** | 0.7 |
| **Caminata (Walk/Hike)** | 0.9 |
| **Otros (Other/Outdoor)** | 1.0 |
| **Indoor** | 0.5 |

---

## Factores de Territorio

| Factor | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `xpPerNewCell` | 8 XP | XP por cada celda nueva descubierta en el mapa. |
| `xpPerDefendedCell` | 3 XP | XP por defender una celda ya poseída. |
| `xpPerRecapturedCell` | 12 XP | XP por recuperar una celda propia que ya había expirado. |
| `xpPerStolenCell` | 20 XP | XP por robar una celda activa que pertenece a otro usuario (Territory Theft). |
| `maxNewCellsXPPerActivity` | 50 celdas | Límite máximo de celdas nuevas que otorgan XP en una única actividad. |
| `lastMinuteDefenseBonus` | +2 XP | Bono adicional por defender una celda cerca de su expiración. |

> [!NOTE]
> **Diferencia entre Recaptura y Robo**:
> - **Recaptura (`xpPerRecapturedCell`)**: El territorio era tuyo, expiró, y lo vuelves a tomar.
> - **Robo (`xpPerStolenCell`)**: El territorio pertenece activamente a otro usuario y se lo quitas.

---

## Bonos de Racha y Récords

| Factor | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `baseStreakXPPerWeek` | 10 XP | Bono por semana de racha. (XP = 10 * número de semanas de racha). |
| `weeklyRecordBaseXP` | 30 XP | Bono base por superar el récord personal de distancia semanal. |
| `weeklyRecordPerKmDiffXP`| 5 XP | XP adicional por cada kilómetro que supere el récord anterior. |
| `minWeeklyRecordKm` | 5.0 km | Distancia mínima semanal para que los récords empiecen a contar. |

---

## Misiones y Otros

| Factor | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `vengeanceXPReward` | 25 XP | XP otorgado al completar una misión de venganza (Vengeance Target). Reemplaza al XP por robo. |
| `legendaryThresholdCells` | 20 celdas | Umbral de celdas necesarias para misiones de categoría Legendaria. |
| `levelGrowth` | 1000 XP | Cantidad de XP necesaria para subir de nivel (Nivel = 1 + XP / 1000). |

> [!IMPORTANT]
> **Prioridad de Venganza**:
> Si recuperas un territorio sobre el que tenías un objetivo de venganza, recibirás únicamente los **25 XP** (o el valor de `vengeanceXPReward`). Esta acción **anula** los puntos estándar por robo (`xpPerStolenCell`) para evitar la duplicidad de puntos.

---
*Nota: Este documento ha sido generado automáticamente analizando la configuración actual. Todos estos valores son ahora editables desde Firestore.*
