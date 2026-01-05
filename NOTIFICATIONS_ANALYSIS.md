# Análisis de Notificaciones - Adventure Streak

Este documento detalla todas las notificaciones push generadas por el sistema, su lógica de activador y el contenido actual (título y cuerpo).

## Resumen de Notificaciones

| Tipo (Type) | Activador (Trigger) | Recipiente | Título (Actual) | Cuerpo (Actual) | Ejemplo de Contenido |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `reaction` | Cuando alguien reacciona a tu actividad | Autor de la actividad | `¡Nueva reacción! 🔥` | `{senderName} reaccionó con {reactionType} a tu actividad.` | `Juan reaccionó con 🔥 a tu actividad.` |
| `follow` | Cuando alguien comienza a seguirte | Usuario seguido | `¡Nuevo seguidor! 👥` | `{senderName} ahora sigue tus aventuras.` | `Ana ahora sigue tus aventuras.` |
| `achievement` (Badge) | Al ganar una insignia específica | Usuario que gana | `¡Logro desbloqueado! 🏆` | `¡Has ganado la insignia {badgeId}!` | `¡Has ganado la insignia shadow_hunter!` |
| `achievement` (Level) | Al alcanzar un nuevo nivel de XP | Usuario que sube | `¡Logro desbloqueado! 🏆` | `¡Felicidades! ¡Has alcanzado el Nivel {level}!` | `¡Felicidades! ¡Has alcanzado el Nivel 10!` |
| `territory_conquered` | Al conquistar celdas libres o vacías | El usuario que entrena | `¡Conquista en {Label}! 🚩` | `Has conquistado nuevos territorios en {Label}. ¡Sigue así!` | `¡Conquista en Madrid! 🚩` |
| `territory_stolen` | Cuando otro usuario te roba territorio activo | Víctima del robo | `¡Territorio Robado! ⚔️` | `¡{senderName} te ha robado un territorio en {Label}! ¡Recupéralo!` | `¡Pedro te ha robado un territorio en Retiro! ¡Recupéralo!` |
| `territory_stolen_success` | Cuando robas territorio a uno o más usuarios | El atacante | `¡Territorio Robado! 🏴‍☠️` | `¡Has robado {count} territorios a {victima}! ` | `¡Has robado 5 territorios a Juan!` |
| `follower_territory_activity` | Al completar actividad, notifica a seguidores | Seguidores | `¡Actividad de {senderName}! 🚩` | `{senderName} ha obtenido {countText} en {Label}.` | `Juan ha obtenido 10 conquistados en Madrid.` |
| `territory_defended` | Al defender celdas propias | Dueño | `¡Territorio Defendido! 🛡️` | `Tu territorio ha sido defendido con éxito.` | `Tu territorio ha sido defendido...` |

---

## Observaciones y Errores Detectados

Tras el análisis del código en `index.ts`, `territories.ts` y `badges.ts`, se han identificado los siguientes puntos de mejora:

### 1. IDs de Insignias en Inglés/Técnico
En la notificación de tipo `achievement`, el sistema usa el `badgeId` directamente en el cuerpo del mensaje si no es un subida de nivel.
- **Problema**: El usuario recibe: *"¡Has ganado la insignia shadow_hunter!"* en lugar de *"¡Has ganado la insignia Cazador de Sombras!"*.
- **Ubicación**: `index.ts` (línea 91).

### 2. Mensajes de Robo Sufrido Inexactos
Cuando un usuario sufre un robo, el sistema en `territories.ts` calcula exactamente cuántos territorios perdió, pero el activador central en `index.ts` usa un texto estático ("un territorio").
- **Problema**: Si te roban 50 celdas, la notificación dice: *"¡Juan te ha robado **un** territorio..."*.
- **Ubicación**: `index.ts` (línea 102-104).

### 3. Falta de Sentido en Títulos de Conquista
Si la actividad no tiene una etiqueta de localización (`locationLabel`), el título es *"¡Territorio Conquistado! 🚩"*, pero si la tiene, intenta meterla en el título, lo cual puede quedar redundante con el cuerpo.
- **Ubicación**: `index.ts` (línea 94-98).

### 4. Notificación de Defensa (Individual)
Aunque existe el caso `territory_defended` en el switch de `index.ts`, en `territories.ts` no se está disparando una notificación por cada celda defendida (lo cual es bueno para evitar spam), pero no hay una notificación de "Has defendido X territorios" al final, similar a la de robo exitoso.

---

## Archivos Analizados
- [index.ts](file:///Users/aerguevara/Documents/develop/Adventure%20Streak/functions/firebase-function-notifications/functions/src/index.ts): Lógica central de construcción de mensajes.
- [territories.ts](file:///Users/aerguevara/Documents/develop/Adventure%20Streak/functions/firebase-function-notifications/functions/src/territories.ts): Lógica de robo y conquista.
- [badges.ts](file:///Users/aerguevara/Documents/develop/Adventure%20Streak/functions/firebase-function-notifications/functions/src/badges.ts): Definición de insignias y logros.
- [reactions.ts](file:///Users/aerguevara/Documents/develop/Adventure%20Streak/functions/firebase-function-notifications/functions/src/reactions.ts): Notificaciones de interacción social.
