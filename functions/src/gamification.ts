import { XPConfigData, XPContext, XPBreakdown, TerritoryStats } from "./xp_config";

export class GamificationService {
  static computeXP(
    activity: any, // Typed as any for now, matches Activity structure
    territoryStats: TerritoryStats,
    context: XPContext,
    config: XPConfigData
  ): XPBreakdown {
    // 1. Base XP
    const xpBase = this.computeBaseXP(activity, context, config);

    // 2. Territory XP
    const xpTerritory = this.computeTerritoryXP(territoryStats, config);

    // 3. Streak Bonus
    // Logic: If activity duration > min and it's a new week (simplified for MVP: always check context)
    const durationSeconds = activity.durationSeconds || 0;
    const maintainsStreak = durationSeconds >= config.minDurationSeconds;
    const xpStreak = this.computeStreakBonus(context, maintainsStreak, config);

    // 4. Weekly Record
    const distanceKm = (activity.distanceMeters || 0) / 1000.0;
    const newWeekDistance = context.currentWeekDistanceKm + distanceKm;
    const xpWeeklyRecord = this.computeWeeklyRecordBonus(context, newWeekDistance, config);

    // 5. Badges (Placeholder)
    const xpBadges = 0;

    return {
      xpBase,
      xpTerritory,
      xpStreak,
      xpWeeklyRecord,
      xpBadges,
      total: xpBase + xpTerritory + xpStreak + xpWeeklyRecord + xpBadges,
    };
  }

  private static computeBaseXP(activity: any, context: XPContext, config: XPConfigData): number {
    const distanceKm = (activity.distanceMeters || 0) / 1000.0;
    const durationSeconds = activity.durationSeconds || 0;
    const activityType = activity.activityType || "unknown";

    // Indoor without distance: calculate by minutes
    if (activityType === "indoor") {
      if (durationSeconds < config.minDurationSeconds) return 0;
      const minutes = durationSeconds / 60.0;
      const rawXP = Math.floor(minutes * config.indoorXPPerMinute);
      const remainingCap = Math.max(0, config.dailyBaseXPCap - context.todayBaseXPEarned);
      return Math.min(rawXP, remainingCap);
    }

    if (distanceKm < config.minDistanceKm || durationSeconds < config.minDurationSeconds) {
      return 0;
    }

    let factor = config.baseFactorPerKm;
    switch (activityType) {
      case "run": factor *= config.factorRun; break;
      case "bike": factor *= config.factorBike; break;
      case "walk": factor *= config.factorWalk; break;
      case "hike": factor *= config.factorWalk; break;
      case "otherOutdoor": factor *= config.factorOther; break;
      case "indoor": factor *= config.factorIndoor; break;
    }

    const rawXP = Math.floor(distanceKm * factor);
    const remainingCap = Math.max(0, config.dailyBaseXPCap - context.todayBaseXPEarned);
    return Math.min(rawXP, remainingCap);
  }

  private static computeTerritoryXP(stats: TerritoryStats, config: XPConfigData): number {
    const effectiveNewCells = Math.min(stats.newCellsCount, config.maxNewCellsXPPerActivity);

    const xpNew = effectiveNewCells * config.xpPerNewCell;
    const xpDef = stats.defendedCellsCount * config.xpPerDefendedCell;
    const xpRec = stats.recapturedCellsCount * config.xpPerRecapturedCell;
    const xpStolen = stats.stolenCellsCount * config.xpPerStolenCell;
    const xpVengeance = (stats.vengeanceCellsCount || 0) * config.vengeanceXPReward;
    const xpLastMinute = (stats.lastMinuteDefenseCount || 0) * config.lastMinuteDefenseBonus;

    // New Hardened & Loot values
    const xpLoot = stats.totalLootXP || 0;
    const xpConsolidation = stats.totalConsolidationXP || 0;

    // Streak Interruption (If we stole any cell from a user with a streak)
    // Note: This logic depends on whether we detected a streak interruption in territories.ts
    // For now, we add the total provided by stats if we decide to pre-calculate it,
    // or we can add a flag to stats if it happened.
    // Let's assume we add a field `streakInterruptionCount` or similar if needed.
    // Actually, I'll add xpStreakInterruption if any steal happened and we detected the victim had a streak.

    // In this MVP, we assume totalLootXP already contains the days-based looting.
    const xpStreakInterruption = stats.totalStreakInterruptionXP || 0;

    return xpNew + xpDef + xpRec + xpStolen + xpVengeance + xpLastMinute + xpLoot + xpConsolidation + xpStreakInterruption;
  }

  private static computeStreakBonus(context: XPContext, maintainsStreak: boolean, config: XPConfigData): number {
    if (!maintainsStreak) return 0;
    return config.baseStreakXPPerWeek * context.currentStreakWeeks;
  }

  private static computeWeeklyRecordBonus(context: XPContext, newWeekDistanceKm: number, config: XPConfigData): number {
    const best = context.bestWeeklyDistanceKm;
    if (!best || best < config.minWeeklyRecordKm) {
      return 0;
    }

    if (newWeekDistanceKm > best) {
      const diff = newWeekDistanceKm - best;
      return Math.floor(config.weeklyRecordBaseXP + (diff * config.weeklyRecordPerKmDiffXP));
    }
    return 0;
  }

  static getLevel(totalXP: number): number {
    return 1 + Math.floor(totalXP / 1000); // Fixed scaling (if not in config) or we can move 1000 to config later
  }
}
