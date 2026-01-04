# Documentación del Sistema de Insignias - Adventure Streak

Este documento detalla las insignias (badges) implementadas en el sistema de Firebase Functions, los criterios técnicos para su obtención y el estado actual de cada una.

## Resumen del Sistema
Las insignias se procesan principalmente en dos momentos:
1. **Al finalizar una actividad**: Mediante el servicio `BadgeService.checkActivityBadges` (llamado desde `territories.ts`).
2. **Al recibir/dar una reacción**: Mediante `BadgeService.checkSocialBadges` (llamado desde `reactions.ts`).

---

## 🛡️ Categoría: Agresiva (Territorial)

Insignias relacionadas con la conquista y robo de territorios a otros usuarios.

| ID | Nombre | Requisito Técnico | Procedimiento de Obtención |
| :--- | :--- | :--- | :--- |
| `shadow_hunter` | **Cazador de Sombras** | Robar ≥ 5 celdas a un mismo usuario. | Durante una actividad, roba al menos 5 celdas que pertenezcan a un único dueño anterior. |
| `chaos_lord` | **Señor del Caos** | Robar a ≥ 3 usuarios diferentes. | En una misma actividad (o día), realiza robos a 3 o más usuarios distintos. |
| `takeover` | **Toma de Posesión** | Robar celda defendida < 24h. | Roba una celda que haya sido conquistada o defendida por otro usuario hace menos de 24 horas. |
| `reconquest_king` | **Rey de la Reconquista** | Acumular 100 XP en reconquistas. | Recupera tus propias celdas expiradas. Cada reconquista otorga 12 XP; necesitas llegar a 100 XP acumulados. |
| `uninvited` | **Sin Invitación** | Robo en actividad > 10km. | Completa una actividad de más de 10km de distancia que incluya al menos un robo de celda. |
| `white_glove` | **Ladrón de Guante Blanco** | Robar una celda épica (>30 días). | Localiza y roba una celda que el dueño actual haya mantenido en su poder por más de 30 días seguidos. |
| `summit_looter` | **Saqueador de Cumbres** | Robo con > 200m de desnivel. | Realiza una actividad de montaña o con desnivel acumulado > 200m y efectúa al menos un robo. |

---

## 🤝 Categoría: Social

Insignias basadas en la interacción con la comunidad y otros atletas.

| ID | Nombre | Requisito Técnico | Procedimiento de Obtención |
| :--- | :--- | :--- | :--- |
| `steel_influencer` | **Influencer de Acero** | Recibir 50 reacciones en un post. | Publica una actividad que sea lo suficientemente popular como para acumular 50 reacciones de otros usuarios. |
| `war_correspondent` | **Corresponsal de Guerra** | Publicar post con 3 robos. | Publica una actividad en el feed que contenga al menos 3 robos de territorio. |
| `sports_spirit` | **Espíritu Deportivo** | Dar 10 reacciones. | Reacciona a las actividades de otros usuarios (actualmente requiere 10 reacciones totales). |

---

## 🏃 Categoría: Entrenamiento (Training)

Insignias enfocadas en el rendimiento deportivo y la constancia.

| ID | Nombre | Requisito Técnico | Procedimiento de Obtención |
| :--- | :--- | :--- | :--- |
| `early_bird` | **Madrugador** | Entrenamiento > 5km antes 7AM. | Inicia y completa una sesión de más de 5km de distancia antes de las 07:00 AM. |
| `iron_stamina` | **Resistencia de Hierro** | Indoor > 90 minutos. | Registra una actividad de tipo *Indoor* (gimnasio, rodillo, etc.) con una duración superior a una hora y media. |
| `elite_sprinter` | **Velocista de Élite** | Ritmo < 4:30 min/km en 5km. | Corre al menos 5km manteniendo un ritmo medio por debajo de 4:30 minutos por kilómetro. |
| `km_eater` | **Devora Kilómetros** | Superar récord semanal por > 10km. | Supera tu mejor marca histórica de distancia semanal en más de 10 kilómetros. |
| `pure_consistency` | **Constancia Pura** | Racha de 12 semanas. | Entrena al menos una vez por semana durante 12 semanas consecutivas. |
| `max_efficiency` | **Eficiencia Máxima** | Ganar > 500 XP en una actividad. | Maximiza tus ganancias de XP en una sola sesión (con distancia, bonus y conquistas) hasta superar los 500 XP. |
| `deep_explorer` | **Explorador de Fondo** | 30 celdas nuevas en > 15km. | Conquista 30 celdas donde nunca antes habías estado en una actividad de larga distancia (> 15km). |
| `level_10_express` | **Nivel 10 Express** | Nivel 10 en < 30 días. | Sube de nivel rápidamente hasta alcanzar el nivel 10 antes de cumplir el primer mes en la app. |

---

## ⏳ Insignias Pendientes (No Implementadas)

Las siguientes insignias están definidas en el sistema pero actualmente **no tienen lógica de activación** en el backend:

- `human_boomerang` (Búmeran Humano)
- `invader_silent` (Invasor Silencioso)
- `streak_breaker` (Interrupción de Racha)
- `lightning_counter` (Contraataque Relámpago)
- `community_voice` (Voz de la Comunidad)
- `trust_circle` (Círculo de Confianza)
- `xp_machine` (Máquina de XP)
- `triathlete` (Triatleta en Ciernes)

---

## 🛠️ Procedimiento Técnico de Adjudicación

Cuando un usuario finaliza una actividad, el flujo es el siguiente:

1. El cliente sube la actividad con `processingStatus = 'pending'`.
2. El trigger `onDocumentUpdated` en `territories.ts` se activa.
3. Se calculan las estadísticas de territorio (conquistas, robos, defensas).
4. Se llama a `BadgeService.checkActivityBadges` pasando todo el contexto.
5. Si se cumple un requisito:
   - Se añade el ID de la insignia al array `badges` del documento del usuario.
   - Se crea un documento en la colección `notifications` de tipo `achievement`.
