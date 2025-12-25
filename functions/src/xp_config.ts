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
    maxNewCellsXPPerActivity: number;
    baseStreakXPPerWeek: number;
    weeklyRecordBaseXP: number;
    weeklyRecordPerKmDiffXP: number;
    minWeeklyRecordKm: number;
    legendaryThresholdCells: number;
}

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
    maxNewCellsXPPerActivity: 50,

    baseStreakXPPerWeek: 10,  // XP = 10 * currentStreakWeeks

    weeklyRecordBaseXP: 30,
    weeklyRecordPerKmDiffXP: 5,
    minWeeklyRecordKm: 5.0,

    // Mission thresholds
    legendaryThresholdCells: 20
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
}
