# Documentación de Territorios - Adventure Streak

Este documento describe los conceptos clave relacionados con la gestión de territorios en Adventure Streak y dónde se almacenan los datos correspondientes en Firebase.

## Tipos de Interacción con Territorios

Existen **4 tipos** de interacciones posibles cuando un usuario recorre un territorio:

1.  **Nuevos / Conquistados (`conquest`)**
    *   **Definición**: Territorios que no tenían dueño o cuya posesión había expirado (y el usuario actual NO era el dueño anterior).
    *   **Significado**: Expansión del dominio del usuario a nuevas áreas.

2.  **Robados (`steal`)**
    *   **Definición**: Territorios que pertenecían a otro usuario, cuya posesión estaba activa (no expirada), y han sido tomados por el usuario actual.
    *   **Significado**: Conflicto directo y competencia con otros jugadores.

3.  **Defendidos (`defense`)**
    *   **Definición**: Territorios que ya pertenecían al usuario actual y cuya posesión aún estaba activa.
    *   **Significado**: Mantenimiento del dominio y refuerzo de áreas clave.

4.  **Recuperados (`recapture`)**
    *   **Definición**: Territorios que pertenecían al usuario actual en el pasado, pero cuya posesión había expirado, y ahora son reclamados nuevamente.
    *   **Significado**: Recuperación de áreas perdidas por inactividad.

---

## Ubicación de los Datos

Los datos de los territorios se almacenan en tres niveles principales en Firestore:

### 1. Nivel Global (Perfil de Usuario)
*   **Ubicación**: Colección `users` -> Documento `{userId}`
*   **Propósito**: Acumular el histórico total de interacciones del usuario.
*   **Campos**:
    *   `totalConqueredTerritories`: Sumatoria histórica de territorios *Nuevos*.
    *   `totalStolenTerritories`: Sumatoria histórica de territorios *Robados*.
    *   `totalDefendedTerritories`: Sumatoria histórica de territorios *Defendidos*.
    *   `totalRecapturedTerritories`: Sumatoria histórica de territorios *Recuperados*.

### 2. Nivel de Actividad (Resumen de Sesión)
*   **Ubicación**: Colección `activities` -> Documento `{activityId}`
*   **Propósito**: Mostrar el rendimiento de una sesión de ejercicio específica.
*   **Campo**: `territoryStats` (Objeto)
    *   `newCellsCount`: Cantidad de nuevos en esta actividad.
    *   `stolenCellsCount`: Cantidad de robados en esta actividad.
    *   `defendedCellsCount`: Cantidad de defendidos en esta actividad.
    *   `recapturedCellsCount`: Cantidad de recuperados en esta actividad.

### 3. Nivel de Territorio (Estado Individual)
*   **Ubicación**: Colección `remote_territories` -> Documento `{cellId}`
*   **Propósito**: Mantener el estado actual de cada cuadrícula del mapa en tiempo real.
*   **Campos**:
    *   `userId`: Dueño actual.
    *   `expiresAt`: Fecha de expiración de la posesión.
    *   `lastInteraction`: Tipo de la última interacción (`conquest`, `steal`, etc.).
    *   **Subcolección `history`**: Registro detallado de cada cambio de manos en ese territorio específico.
