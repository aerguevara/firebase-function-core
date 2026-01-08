/* eslint-disable */
/**
 * Season Manager for Adventure Streak 2026
 * Handles seasonal dates, XP multipliers, and mission assignments.
 */

export type SeasonID = "T1_2026" | "T2_2026" | "T3_2026" | "T4_2026";

export interface SeasonConfig {
    id: SeasonID;
    name: string;
    startDate: Date;
    endDate: Date;
    missionId: string;
    missionName: string;
    missionIcon: string;
    badgeId: string;
}

export const SEASONS_2026: SeasonConfig[] = [
    {
        id: "T1_2026",
        name: "Despertar del Explorador",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-03-31T23:59:59Z"),
        missionId: "royal_cartographer",
        missionName: "Cartógrafo Real",
        missionIcon: "snow",
        badgeId: "winter_pioneer"
    },
    {
        id: "T2_2026",
        name: "Racha de Primavera",
        startDate: new Date("2026-04-01T00:00:00Z"),
        endDate: new Date("2026-06-30T23:59:59Z"),
        missionId: "iron_chain",
        missionName: "Cadena de Hierro",
        missionIcon: "leaf.fill",
        badgeId: "spring_streak"
    },
    {
        id: "T3_2026",
        name: "Dominio de Verano",
        startDate: new Date("2026-07-01T00:00:00Z"),
        endDate: new Date("2026-09-30T23:59:59Z"),
        missionId: "king_of_hill",
        missionName: "Rey de la Colina",
        missionIcon: "sun.max.fill",
        badgeId: "summer_conqueror"
    },
    {
        id: "T4_2026",
        name: "El Gran Récord",
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        missionId: "last_breath",
        missionName: "Último Aliento",
        missionIcon: "trophy.fill",
        badgeId: "year_end_hero"
    }
];

export class SeasonManager {
    static getCurrentSeason(date: Date = new Date()): SeasonConfig | null {
        return SEASONS_2026.find(s => date >= s.startDate && date <= s.endDate) || null;
    }

    static getSeasonById(id: SeasonID): SeasonConfig | undefined {
        return SEASONS_2026.find(s => s.id === id);
    }
}
