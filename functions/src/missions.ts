/* eslint-disable */
import { XPConfigData, XPContext, TerritoryStats } from "./xp_config";

export type MissionCategory = "territorial" | "progression" | "physicalEffort";
export type MissionRarity = "common" | "rare" | "epic" | "legendary";

export interface Mission {
    userId: string;
    category: MissionCategory;
    name: string;
    description: string;
    rarity: MissionRarity;
    completedAt?: any; // Firestore Timestamp
}

export class MissionEngine {

    static classifyMissions(
        activity: any,
        territoryStats: TerritoryStats,
        context: XPContext,
        config: XPConfigData
    ): Mission[] {
        const missions: Mission[] = [];
        const userId = context.userId;

        // 1. Territorial Missions
        if (territoryStats.newCellsCount > 0) {
            missions.push(this.createTerritorialMission(userId, territoryStats, config));
        }

        // 2. Recapture Mission (Epic)
        if (territoryStats.recapturedCellsCount > 0) {
            missions.push(this.createRecaptureMission(userId, territoryStats));
        }

        // 3. Streak Mission
        if (context.currentStreakWeeks > 0) {
            missions.push(this.createStreakMission(userId, context.currentStreakWeeks));
        }

        // 4. Weekly Record Mission
        const distanceKm = (activity.distanceMeters || 0) / 1000.0;
        const newWeekDistance = context.currentWeekDistanceKm + distanceKm;

        if (context.bestWeeklyDistanceKm && newWeekDistance > context.bestWeeklyDistanceKm) {
            missions.push(this.createWeeklyRecordMission(
                userId,
                newWeekDistance,
                context.bestWeeklyDistanceKm
            ));
        }

        // 5. Physical Effort Mission (High intensity)
        if (this.isHighIntensity(activity)) {
            missions.push(this.createPhysicalEffortMission(userId, activity));
        }

        return missions;
    }

    private static createTerritorialMission(userId: string, stats: TerritoryStats, config: XPConfigData): Mission {
        const cellCount = stats.newCellsCount;
        let rarity: MissionRarity;
        let name: string;
        let description: string;

        if (cellCount < 5) {
            rarity = "common";
            name = "Exploración Inicial";
            description = `Has conquistado ${cellCount} nuevos territorios`;
        } else if (cellCount < 15) {
            rarity = "rare";
            name = "Expedición";
            description = `Has expandido tu dominio con ${cellCount} territorios`;
        } else if (cellCount < config.legendaryThresholdCells) {
            rarity = "epic";
            name = "Conquista Épica";
            description = `¡Impresionante! ${cellCount} territorios conquistados`;
        } else {
            rarity = "legendary";
            name = "Dominio Legendario";
            description = `¡Hazaña legendaria! ${cellCount} territorios bajo tu control`;
        }

        return {
            userId,
            category: "territorial",
            name,
            description,
            rarity
        };
    }

    private static createRecaptureMission(userId: string, stats: TerritoryStats): Mission {
        return {
            userId,
            category: "territorial",
            name: "Reconquista",
            description: `Has recuperado ${stats.recapturedCellsCount} territorios perdidos`,
            rarity: "epic"
        };
    }

    private static createStreakMission(userId: string, streakWeeks: number): Mission {
        const rarity: MissionRarity = streakWeeks >= 4 ? "epic" : "rare";
        return {
            userId,
            category: "progression",
            name: "Racha Activa",
            description: `Semana #${streakWeeks} de tu racha`,
            rarity
        };
    }

    private static createWeeklyRecordMission(userId: string, newDistance: number, previousBest: number): Mission {
        const improvement = newDistance - previousBest;
        const rarity: MissionRarity = improvement > 10 ? "legendary" : "epic";
        return {
            userId,
            category: "progression",
            name: "Nuevo Récord Semanal",
            description: `¡${newDistance.toFixed(1)} km esta semana! Superaste tu récord`,
            rarity
        };
    }

    private static createPhysicalEffortMission(userId: string, activity: any): Mission {
        const distanceKm = (activity.distanceMeters || 0) / 1000.0;
        const durationSeconds = activity.durationSeconds || 0;

        // Avoid division by zero
        if (distanceKm === 0) return {
            userId,
            category: "physicalEffort",
            name: "Esfuerzo",
            description: "Actividad completada",
            rarity: "common"
        };


        const pace = durationSeconds / distanceKm; // seconds per km
        const isRun = (activity.activityType === "run");
        const isSprintPace = isRun && pace < 360; // < 6 min/km

        return {
            userId,
            category: "physicalEffort",
            name: isSprintPace ? "Sprint Intenso" : "Esfuerzo Destacado",
            description: "Entrenamiento de alta intensidad completado",
            rarity: isSprintPace ? "rare" : "common"
        };
    }

    private static isHighIntensity(activity: any): boolean {
        const distanceKm = (activity.distanceMeters || 0) / 1000.0;
        const durationSeconds = activity.durationSeconds || 0;

        if (distanceKm <= 0) return false;

        const pace = durationSeconds / distanceKm; // seconds per km
        const type = activity.activityType;

        switch (type) {
            case "run":
                return pace < 360; // < 6 min/km
            case "bike":
                return pace < 180; // < 3 min/km (20 km/h)
            case "walk":
            case "hike":
                return pace < 720; // < 12 min/km
            default:
                return false;
        }
    }
}
