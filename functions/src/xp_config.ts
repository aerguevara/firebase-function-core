/* eslint-disable */
// XP Configuration and Types (Ported from XPModels.swift)

import * as admin from "firebase-admin";

export interface XPConfigData {
    minDistanceKm: number;
    minDurationSeconds: number;
    baseFactorPerKm: number;
    factorRun: number;
    factorBike: number;
    factorWalk: number;
    factorOther: number;
    factorIndoor: number;
    indoorXPPerMinute: number;
    dailyBaseXPCap: number;
    xpPerNewCell: number;
    xpPerDefendedCell: number;
    xpPerRecapturedCell: number;
    xpPerStolenCell: number;
    maxNewCellsXPPerActivity: number;
    baseStreakXPPerWeek: number;
    weeklyRecordBaseXP: number;
    weeklyRecordPerKmDiffXP: number;
    minWeeklyRecordKm: number;
    legendaryThresholdCells: number;
    lastMinuteDefenseBonus: number;
    vengeanceXPReward: number;
    xpLootPerDay: number;
    xpConsolidation15DayBonus: number;
    xpConsolidation25DayBonus: number;
    xpStreakInterruptionBonus: number;
}

export const XPConfigDescriptions: Record<keyof XPConfigData, string> = {
    minDistanceKm: "Distancia mínima requerida para procesar XP base (en km).",
    minDurationSeconds: "Duración mínima requerida para procesar XP (en segundos).",
    baseFactorPerKm: "Puntos de XP base por cada kilómetro recorrido.",
    factorRun: "Multiplicador para actividades de carrera.",
    factorBike: "Multiplicador para actividades de ciclismo.",
    factorWalk: "Multiplicador para actividades de caminata/senderismo.",
    factorOther: "Multiplicador para otras actividades al aire libre.",
    factorIndoor: "Multiplicador para actividades en interiores con distancia.",
    indoorXPPerMinute: "XP por cada minuto en actividades de interior (sin distancia).",
    dailyBaseXPCap: "Límite máximo diario de XP base.",
    xpPerNewCell: "XP por cada nueva celda conquistada.",
    xpPerDefendedCell: "XP por defender una celda propia.",
    xpPerRecapturedCell: "XP por recuperar una celda propia que había expirado.",
    xpPerStolenCell: "XP por robar una celda activa a otro usuario.",
    maxNewCellsXPPerActivity: "Máximo de celdas nuevas que otorgan XP por actividad.",
    baseStreakXPPerWeek: "XP base por cada semana de racha activa.",
    weeklyRecordBaseXP: "Bono base por superar el récord semanal de distancia.",
    weeklyRecordPerKmDiffXP: "XP adicional por cada km que supere el récord anterior.",
    minWeeklyRecordKm: "Kilómetros mínimos necesarios para activar récords semanales.",
    legendaryThresholdCells: "Celdas mínimas para considerar una misión territorial como legendaria.",
    lastMinuteDefenseBonus: "Bono adicional por defender una celda cerca de expirar.",
    vengeanceXPReward: "XP otorgado al completar una misión de venganza (Vengeance Target).",
    xpLootPerDay: "XP que acumula una celda por día de control para el dueño (saqueable por un rival).",
    xpConsolidation15DayBonus: "XP extra por defender una celda con más de 15 días de control continuo.",
    xpConsolidation25DayBonus: "XP extra por defender una celda con más de 25 días de control continuo.",
    xpStreakInterruptionBonus: "XP extra por robar una celda a un usuario con racha semanal activa."
};

export const defaultXPConfig: XPConfigData = {
    minDistanceKm: 0.5,
    minDurationSeconds: 5 * 60,

    baseFactorPerKm: 10.0,
    factorRun: 1.2,
    factorBike: 0.7,
    factorWalk: 0.9,
    factorOther: 1.0,
    factorIndoor: 0.5,
    indoorXPPerMinute: 3.0,

    dailyBaseXPCap: 300,

    xpPerNewCell: 8,
    xpPerDefendedCell: 3,
    xpPerRecapturedCell: 12,
    xpPerStolenCell: 20,
    maxNewCellsXPPerActivity: 50,

    baseStreakXPPerWeek: 10,  // XP = 10 * currentStreakWeeks

    weeklyRecordBaseXP: 30,
    weeklyRecordPerKmDiffXP: 5,
    minWeeklyRecordKm: 5.0,

    // Mission thresholds
    legendaryThresholdCells: 20,

    // Added factors
    lastMinuteDefenseBonus: 2,
    vengeanceXPReward: 25,

    // New Hardened & Loot values
    xpLootPerDay: 2,
    xpConsolidation15DayBonus: 5,
    xpConsolidation25DayBonus: 8,
    xpStreakInterruptionBonus: 15
};

export async function fetchXPConfig(db: admin.firestore.Firestore): Promise<XPConfigData> {
    try {
        const doc = await db.collection("config").doc("gamification").get();
        if (doc.exists) {
            const data = doc.data();
            console.log("✅ Loaded XP Config from Firestore");
            return { ...defaultXPConfig, ...data } as XPConfigData;
        }
    } catch (e) {
        console.error("⚠️ Failed to fetch XP config from Firestore, using defaults:", e);
    }
    return defaultXPConfig;
}

export interface XPBreakdown {
    xpBase: number;
    xpTerritory: number;
    xpStreak: number;
    xpWeeklyRecord: number;
    xpBadges: number;
    total: number;
}

export interface XPContext {
    userId: string;
    currentWeekDistanceKm: number;
    bestWeeklyDistanceKm: number | null;
    currentStreakWeeks: number;
    todayBaseXPEarned: number;
    gamificationState: GamificationState;
    userVengeanceIds?: Set<string>;
}

export interface GamificationState {
    totalXP: number;
    level: number;
    currentStreakWeeks: number;
}

export interface TerritoryStats {
    newCellsCount: number;
    defendedCellsCount: number;
    recapturedCellsCount: number;
    stolenCellsCount: number;
    vengeanceCellsCount: number;
    lastMinuteDefenseCount: number;
    totalLootXP: number;
    totalConsolidationXP: number;
    totalStreakInterruptionXP: number;
}
