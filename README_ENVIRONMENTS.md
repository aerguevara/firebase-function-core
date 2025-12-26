# Sistema de Entornos (PRE y PROD) - Adventure Streak

Este documento describe la implementación del sistema de entornos dinámicos para Adventure Streak, permitiendo el desarrollo y pruebas en un entorno aislado (PRE) sin afectar a los usuarios reales (PROD).

## 1. Arquitectura de Base de Datos

Ambos entornos comparten el mismo Proyecto de Firebase (`adventure-streak`), pero utilizan instancias de base de datos Firestore independientes:

- **PROD**: Instancia por defecto `(default)`.
- **PRE**: Instancia con nombre `adventure-streak-pre`.

### Selección Dinámica en iOS
La aplicación de iOS decide a qué base de datos conectarse basándose en el esquema de compilación:

- **DEBUG**: Se conecta automáticamente a `adventure-streak-pre`.
- **RELEASE**: Se conecta automáticamente a la instancia por defecto (`adventure-streak`).

Esta lógica está centralizada en `Firestore+Shared.swift` mediante la propiedad `Firestore.shared`.

## 2. Cloud Functions Independientes

Para mantener la lógica de procesamiento (XP, territorios, notificaciones) también aislada, las funciones se han replicado utilizando un patrón **Factory**.

- **Código Base**: Localizado en `functions/src/territories.ts`, `reactions.ts` e `index.ts`.
- **Triggers**: Se exportan dos versiones de cada función en el archivo principal:
    - `onNotificationCreated` (Escucha base PROD)
    - `onNotificationCreatedPRE` (Escucha base PRE)

### Despliegue Independiente

Puedes actualizar un entorno sin tocar el otro utilizando despliegues selectivos de Firebase CLI:

#### Desplegar solo en PRE:
```bash
firebase deploy --only functions:onNotificationCreatedPRE,functions:processActivityCompletePRE,functions:onReactionCreatedPRE
```

#### Desplegar solo en PROD:
```bash
firebase deploy --only functions:onNotificationCreated,functions:processActivityComplete,functions:onReactionCreated
```

## 3. Scripts de Utilidad

Se han incluido scripts en la carpeta `scripts/` para facilitar la gestión de datos:

- **Migración de Datos**: `scripts/migrate-production-to-pre.js`. Copia con seguridad todos los datos de PROD a PRE (usuarios, actividades, territorios, etc.).
- **Seguimiento Masivo**: `scripts/follow-all-users.js`. Hace que todos los usuarios existentes se sigan entre sí (útil para probar el feed social en PRE).

## 4. Flujo de Trabajo Recomendado

1. Asegúrate de que Xcode esté en el esquema de **Debug**.
2. Realiza tus sesiones de entrenamiento en el simulador o dispositivo físico.
3. Observa los logs y cambios en la base de datos `adventure-streak-pre`.
4. Una vez validada la nueva funcionalidad, despliega únicamente las funciones de PROD y publica la app en modo Release.
