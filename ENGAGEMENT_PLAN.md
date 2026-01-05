# Plan de Notificaciones: Engagement sin Spam

Este plan propone nuevas notificaciones diseñadas para aumentar la retención y la interacción social, evitando el ruido innecesario. Se centran en valor real, urgencia y refuerzo positivo.

## 1. Notificaciones de Retención (Automáticas/Programadas)

### A. El Salvador de Racha (The Streak Saver)
*   **Valor**: Evita la frustración de perder una racha de semanas acumulada.
*   **Activador**: Sábado a las 11:00 AM si el usuario tiene una racha activa (>2 semanas) pero no ha registrado ninguna actividad en la semana actual.
*   **Mensaje**: `"¡No dejes que tu racha de {weeks} semanas se congele! ❄️ Solo necesitas un entrenamiento para mantenerla viva."`

### B. Alerta de Mantenimiento Crítico (The Guardian)
*   **Valor**: Ayuda al usuario a mantener sus territorios más valiosos sin estar pendiente 24/7.
*   **Activador**: Cuando un territorio de tipo "Epic" (>30 días) o un "Hot Spot" va a expirar en menos de 12 horas.
*   **Mensaje**: `"Tu territorio épico en {Location} está a punto de expirar. ⏳ ¡Haz una carrera de mantenimiento para reforzarlo!"`

---

## 2. Notificaciones de Interacción Social (Triggers)

### C. El Contraataque (Vengeance Reminder)
*   **Valor**: Fomenta el gameplay cíclico (robo/recuperación).
*   **Activador**: 24 horas después de haber sido robado, si el usuario aún no ha realizado una actividad de venganza.
*   **Mensaje**: `"Tienes {count} oportunidades de venganza contra {RivalName}. ⚔️ ¿Listo para recuperar lo que es tuyo?"`

### D. Radar de Rivales (Rivalry Heat)
*   **Valor**: Crea sensación de mundo vivo y competencia local.
*   **Activador**: Cuando un "Rival" (alguien con quien ya has tenido interacciones de robo) conquista una celda a menos de 1km de tu última posición conocida.
*   **Mensaje**: `"{RivalName} está explorando tu zona. 🚩 ¡Vigila tus fronteras!"`

---

## 3. Refuerzo Positivo (Resumen Semanal)

### E. Resumen de Conquistas (Weekly Recap)
*   **Valor**: Muestra progreso a largo plazo.
*   **Activador**: Lunes a las 9:00 AM.
*   **Mensaje**: `"¡Vaya semana! Has conquistado {count} celdas y ganado {XP} XP. 🏆 ¡Sigue así, Aventurero!"`

---

## Estrategia Anti-Spam (Reglas de Oro)

1.  **Cap de Notificaciones**: Un máximo de 1 notificación de "sistema/engagement" por día (excluyendo reacciones directas de amigos).
2.  **Silencio Nocturno**: Ninguna notificación programada se enviará entre las 22:00 y las 08:00.
3.  **Relevancia**: No notificar cada territorio que expira, solo los más importantes (Epic o Hot Spots).
4.  **Botón de Configuración**: Permitir al usuario desactivar cada categoría desde el perfil en la app.

## Siguientes Pasos
1.  **Backend**: Implementar una nueva función `scheduledEngagement` en Firebase que se ejecute cada hora para revisar estas condiciones.
2.  **Firestore**: Añadir campos `lastNotificationSent` en el perfil del usuario para respetar el Cap diario.
