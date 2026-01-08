import { XPConfigData, XPContext, XPBreakdown, TerritoryStats } from "./xp_config";
import { SeasonConfig } from "./seasons";

export class GamificationService {
  static computeXP(
    activity: any,
    territoryStats: TerritoryStats,
    context: XPContext,
    config: XPConfigData,
    season: SeasonConfig | null = null
  ): XPBreakdown {
    // 1. Base XP
    const xpBase = this.computeBaseXP(activity, context, config, season);

    // 2. Territory XP
    const xpTerritory = this.computeTerritoryXP(territoryStats, config, season);

    // 3. Streak Bonus
    const durationSeconds = activity.durationSeconds || 0;
    const maintainsStreak = durationSeconds >= config.minDurationSeconds;
    const xpStreak = this.computeStreakBonus(context, maintainsStreak, config, season);

    // 4. Weekly Record
    const distanceKm = (activity.distanceMeters || 0) / 1000.0;
    const newWeekDistance = context.currentWeekDistanceKm + distanceKm;
    const xpWeeklyRecord = this.computeWeeklyRecordBonus(context, newWeekDistance, config, season);

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

  private static computeBaseXP(activity: any, context: XPContext, config: XPConfigData, season: SeasonConfig | null): number {
    const distanceKm = (activity.distanceMeters || 0) / 1000.0;
    const durationSeconds = activity.durationSeconds || 0;
    const activityType = activity.activityType || "unknown";

    let dailyCap = config.dailyBaseXPCap;

    // Indoor without distance: calculate by minutes
    if (activityType === "indoor") {
      if (durationSeconds < config.minDurationSeconds) return 0;
      const minutes = durationSeconds / 60.0;

      let indoorFactor = config.indoorXPPerMinute;

      const rawXP = Math.floor(minutes * indoorFactor);
      const remainingCap = Math.max(0, dailyCap - context.todayBaseXPEarned);
      return Math.min(rawXP, remainingCap);
    }

    if (distanceKm < config.minDistanceKm || durationSeconds < config.minDurationSeconds) {
      return 0;
    }

    let factor = config.baseFactorPerKm;
    switch (activityType) {
      case "run": factor *= config.factorRun; break;
      case "bike": factor *= config.factorBike; break;
      case "walk":
      case "hike":
        factor *= config.factorWalk;
        break;
      case "otherOutdoor": factor *= config.factorOther; break;
      case "indoor":
        factor *= config.factorIndoor;
        break;
    }

    let rawXP = Math.floor(distanceKm * factor);

    const remainingCap = Math.max(0, dailyCap - context.todayBaseXPEarned);
    return Math.min(rawXP, remainingCap);
  }

  private static computeTerritoryXP(stats: TerritoryStats, config: XPConfigData, season: SeasonConfig | null): number {
    const effectiveNewCells = Math.min(stats.newCellsCount, config.maxNewCellsXPPerActivity);

    const xpNewFactor = config.xpPerNewCell;
    const xpStealFactor = config.xpPerStolenCell;

    const xpNew = effectiveNewCells * xpNewFactor;
    const xpDef = stats.defendedCellsCount * config.xpPerDefendedCell;
    const xpRec = stats.recapturedCellsCount * config.xpPerRecapturedCell;
    const xpStolen = stats.stolenCellsCount * xpStealFactor;
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

  private static computeStreakBonus(context: XPContext, maintainsStreak: boolean, config: XPConfigData, season: SeasonConfig | null): number {
    if (!maintainsStreak) return 0;
    const factor = config.baseStreakXPPerWeek;
    return factor * context.currentStreakWeeks;
  }

  private static computeWeeklyRecordBonus(context: XPContext, newWeekDistanceKm: number, config: XPConfigData, season: SeasonConfig | null): number {
    const best = context.bestWeeklyDistanceKm;
    if (!best || best < config.minWeeklyRecordKm) {
      return 0;
    }

    if (newWeekDistanceKm > best) {
      const diff = newWeekDistanceKm - best;
      const perKmFactor = config.weeklyRecordPerKmDiffXP;
      return Math.floor(config.weeklyRecordBaseXP + (diff * perKmFactor));
    }
    return 0;
  }

  static getLevel(totalXP: number): number {
    return 1 + Math.floor(totalXP / 1000); // Fixed scaling (if not in config) or we can move 1000 to config later
  }
}
