# Documentación de Reset Oficial (Diciembre 2025)

Este documento describe el proceso de reinicio oficial para establecer una "Nueva Era" en la aplicación, asegurando que solo los datos a partir del 1 de Diciembre de 2025 sean considerados para el estado activo (XP, niveles, territorios).

## Estructura de Scripts

Los scripts se encuentran en `functions/src/scripts/` y deben ejecutarse usando `npx ts-node`.

### Fase 0: Limpieza Total de PRE
**Script:** `clear_pre_database.ts`
**Propósito:** Eliminar absolutamente todos los datos de PRE para asegurar un entorno vacío antes del volcado.
**Ejecución:** `npx ts-node src/scripts/clear_pre_database.ts`

### Fase 0.5: Sincronización (Volcado PRO -> PRE)
**Script:** `sync_prod_to_pre.ts`
**Propósito:** Clonar la base de datos de producción a pre-producción (con Modo Silencioso).
**Ejecución:** `npx ts-node src/scripts/sync_prod_to_pre.ts`

### Fase 1: Archivado (Legacy Data)
**Script:** `reset_dec_2025.ts 1`
**Propósito:** Mueve actividades, feed y notificaciones anteriores al 1/Dic a las colecciones `_archive`.
**Ejecución:** `npx ts-node src/scripts/reset_dec_2025.ts 1`

### Fase 2: Limpieza de Estado (Mundo Vacío)
**Script:** `reset_dec_2025.ts 2`
**Propósito:** Borra territorios (`remote_territories`), feed activo, notificaciones y reacciones globales. Deja el mundo listo para ser reconstruido.
**Ejecución:** `npx ts-node src/scripts/reset_dec_2025.ts 2`

### Fase 3: Reset de Usuario (Tabula Rasa)
**Script:** `reset_dec_2025.ts 3`
**Propósito:** Resetea XP a 0, Nivel a 1 y activa el flag de reinicio para todos los usuarios.
**Ejecución:** `npx ts-node src/scripts/reset_dec_2025.ts 3`

### Fase 4: Re-procesamiento Maestro (Reconstrucción)
**Script:** `reset_dec_2025.ts 4`
**Propósito:** Escanea todas las actividades post-1/Dic y las procesa secuencialmente para reconstruir territorios, feed y XP de forma limpia.
**Ejecución:** `npx ts-node src/scripts/reset_dec_2025.ts 4`

### Fase 5: Verificación Automática
**Script:** `verify_full_reset.ts`
**Propósito:** Auditoría final para confirmar la integridad del proceso.
**Ejecución:** `npx ts-node src/scripts/verify_full_reset.ts`

---
**Nota:** Durante el proceso (Fases 1-4), el sistema entra en `Silent Mode` (vía `config/maintenance`) para evitar el envío de notificaciones push ruidosas durante el re-procesamiento.
