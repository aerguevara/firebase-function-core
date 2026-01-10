import { GamificationService } from "../gamification";
import { defaultXPConfig, XPContext, TerritoryStats } from "../xp_config";

describe("GamificationService - Legacy XP Logic", () => {
    const mockConfig = { ...defaultXPConfig };

    const baseContext: XPContext = {
        userId: "test-user",
        currentWeekDistanceKm: 0,
        bestWeeklyDistanceKm: 10,
        currentStreakWeeks: 1,
        todayBaseXPEarned: 0,
        gamificationState: { totalXP: 0, level: 1, currentStreakWeeks: 1 }
    };

    const emptyStats: TerritoryStats = {
        newCellsCount: 0,
        defendedCellsCount: 0,
        recapturedCellsCount: 0,
        stolenCellsCount: 0,
        vengeanceCellsCount: 0,
        lastMinuteDefenseCount: 0,
        totalLootXP: 0,
        totalConsolidationXP: 0,
        totalStreakInterruptionXP: 0
    };

    test("XP Base: 5km Run should give 5 * 10 * 1.2 = 60 XP", () => {
        const activity = {
            distanceMeters: 5000,
            durationSeconds: 1800, // 30 min
            activityType: "run"
        };
        const breakdown = GamificationService.computeXP(activity, emptyStats, baseContext, mockConfig);
        expect(breakdown.xpBase).toBe(60);
    });

    test("XP Base: 10km Bike should give 10 * 10 * 0.7 = 70 XP", () => {
        const activity = {
            distanceMeters: 10000,
            durationSeconds: 1800,
            activityType: "bike"
        };
        const breakdown = GamificationService.computeXP(activity, emptyStats, baseContext, mockConfig);
        expect(breakdown.xpBase).toBe(70);
    });

    test("XP Base: Daily Cap (300) should be respected", () => {
        const contextWithHighXP: XPContext = { ...baseContext, todayBaseXPEarned: 280 };
        const activity = {
            distanceMeters: 10000, // 10 * 10 * 1.2 = 120 potential
            durationSeconds: 3600,
            activityType: "run"
        };
        const breakdown = GamificationService.computeXP(activity, emptyStats, contextWithHighXP, mockConfig);
        expect(breakdown.xpBase).toBe(20); // 300 - 280
    });

    test("XP Base: Indoor without distance should give 3 XP per minute", () => {
        const activity = {
            distanceMeters: 0,
            durationSeconds: 3600, // 60 min
            activityType: "indoor"
        };
        const breakdown = GamificationService.computeXP(activity, emptyStats, baseContext, mockConfig);
        expect(breakdown.xpBase).toBe(90); // 60 * 1.5
    });

    test("XP Territory: New, Stolen, Defended, Recaptured", () => {
        const stats: TerritoryStats = {
            ...emptyStats,
            newCellsCount: 2,      // 2 * 8 = 16
            stolenCellsCount: 1,   // 1 * 20 = 20
            defendedCellsCount: 3, // 3 * 3 = 9
            recapturedCellsCount: 1 // 1 * 12 = 12
        };
        const activity = { distanceMeters: 1000, durationSeconds: 600, activityType: "run" };
        const breakdown = GamificationService.computeXP(activity, stats, baseContext, mockConfig);
        expect(breakdown.xpTerritory).toBe(16 + 20 + 9 + 12); // 57
    });

    test("XP Streak: 5 weeks streak bonus should be 10 * 5 = 50", () => {
        const contextWithStreak: XPContext = { ...baseContext, currentStreakWeeks: 5 };
        const activity = { durationSeconds: 600, activityType: "run" };
        const breakdown = GamificationService.computeXP(activity, emptyStats, contextWithStreak, mockConfig);
        expect(breakdown.xpStreak).toBe(50);
    });

    test("XP Weekly Record: Breaking a 10km record with 12km should give 30 + (2 * 5) = 40", () => {
        const contextWithRecord: XPContext = { ...baseContext, bestWeeklyDistanceKm: 10, currentWeekDistanceKm: 0 };
        const activity = { distanceMeters: 12000, durationSeconds: 3600, activityType: "run" };
        const breakdown = GamificationService.computeXP(activity, emptyStats, contextWithRecord, mockConfig);
        expect(breakdown.xpWeeklyRecord).toBe(40);
    });

    test("XP Advanced: Vengeance, Loot, Consolidation, Streak Interruption", () => {
        const stats: TerritoryStats = {
            ...emptyStats,
            vengeanceCellsCount: 1,      // 1 * 25 = 25
            totalLootXP: 10,             // 5 days * 2 XP/day = 10
            totalConsolidationXP: 8,     // 25 days defense bonus = 8
            totalStreakInterruptionXP: 15 // Victim had streak = 15
        };
        const activity = { distanceMeters: 1000, durationSeconds: 600, activityType: "run" }; // 12 XP base
        const breakdown = GamificationService.computeXP(activity, stats, baseContext, mockConfig);

        // Territory part = 25 + 10 + 8 + 15 = 58
        // Base part (1km run) = 12
        // Streak part (1 week) = 10
        // Total = 80
        expect(breakdown.xpTerritory).toBe(58);
        expect(breakdown.total).toBe(80);
    });

    test("XP Defense: Standard + Last Minute Bonus", () => {
        const stats: TerritoryStats = {
            ...emptyStats,
            defendedCellsCount: 5,        // 5 * 3 = 15
            lastMinuteDefenseCount: 2     // 2 * 2 = 4
        };
        const activity = { distanceMeters: 1000, durationSeconds: 600, activityType: "run" }; // 12 XP base + 10 streak
        const breakdown = GamificationService.computeXP(activity, stats, baseContext, mockConfig);

        expect(breakdown.xpTerritory).toBe(19); // 15 + 4
        expect(breakdown.total).toBe(19 + 12 + 10); // 41
    });

    test("XP Streak: Requirement & Scaling", () => {
        const activityShort = { durationSeconds: 60, activityType: "indoor" }; // < 5 min
        const breakdownShort = GamificationService.computeXP(activityShort, emptyStats, baseContext, mockConfig);
        expect(breakdownShort.xpBase).toBe(0);
        expect(breakdownShort.xpStreak).toBe(0);

        const contextW10: XPContext = { ...baseContext, currentStreakWeeks: 10 };
        const activityLong = { durationSeconds: 600, activityType: "run" };
        const breakdownLong = GamificationService.computeXP(activityLong, emptyStats, contextW10, mockConfig);
        expect(breakdownLong.xpStreak).toBe(100); // 10 * 10
    });
});
