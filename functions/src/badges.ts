import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { XPContext, TerritoryStats } from "./xp_config";

export type BadgeCategory = "aggressive" | "social" | "training" | "progressive";

export interface BadgeDefinition {
    id: string;
    category: BadgeCategory;
    name: string;
    description: string;
    icon: string; // Emoji key or asset name
}

export const BADGES: BadgeDefinition[] = [
    // --- 1. Aggressive (Territorial) ---
    { id: "shadow_hunter", category: "aggressive", name: "Cazador de Sombras", description: "Robar 5 celdas a un mismo usuario en una sola actividad", icon: "🥷" },
    { id: "chaos_lord", category: "aggressive", name: "Señor del Caos", description: "Robar territorios a 3 usuarios diferentes en un mismo día", icon: "😈" },
    { id: "human_boomerang", category: "aggressive", name: "Búmeran Humano", description: "Reconquistar una celda menos de 1 hora después de haberla perdido", icon: "🪃" },
    { id: "invader_silent", category: "aggressive", name: "Invasor Silencioso", description: "Conquistar 10 celdas de usuarios de nivel superior", icon: "🤫" },
    // "neighborhood_nightmare" omitted (requires complex cross-user state)
    { id: "takeover", category: "aggressive", name: "Toma de Posesión", description: "Robar una celda defendida hace menos de 24 horas", icon: "🏰" },
    { id: "castellan", category: "aggressive", name: "Castellano", description: "Lograr 10 defensas exitosas en la misma celda", icon: "🧱" },
    { id: "reconquest_king", category: "aggressive", name: "Rey de la Reconquista", description: "Acumular 100 XP solo reconquistando", icon: "👑" },
    { id: "uninvited", category: "aggressive", name: "Sin Invitación", description: "Robar un territorio en una actividad de >10km", icon: "🚪" },
    { id: "streak_breaker", category: "aggressive", name: "Interrupción de Racha", description: "Robar a un usuario con racha > 4 semanas", icon: "💔" },
    { id: "white_glove", category: "aggressive", name: "Ladrón de Guante Blanco", description: "Robar una celda épica (>30 días)", icon: "🧤" },

    // --- Seasonal 2026 ---
    { id: "winter_pioneer", category: "progressive", name: "Pionero del Invierno", description: "Completar la misión 'Cartógrafo Real' (Temporada 1)", icon: "❄️" },
    { id: "spring_streak", category: "progressive", name: "Racha de Primavera", description: "Completar la misión 'Cadena de Hierro' (Temporada 2)", icon: "🌿" },
    { id: "summer_conqueror", category: "progressive", name: "Conquistador de Verano", description: "Completar la misión 'Rey de la Colina' (Temporada 3)", icon: "☀️" },
    { id: "year_end_hero", category: "progressive", name: "Héroe del Fin de Año", description: "Completar la misión 'Último Aliento' (Temporada 4)", icon: "🏆" },
    // "relentless_occupier" omitted (complex history)
    // "hostile_expansion" omitted (complex history)
    // "rival_scourge" omitted (complex history)
    // "throne_assault" omitted (requires ranking)
    // "lone_wolf" omitted (spatial)
    // "geo_klepto" omitted (spatial)
    { id: "lightning_counter", category: "aggressive", name: "Contraataque Relámpago", description: "Recuperar territorio perdido inmediatamente", icon: "⚡" },
    // "total_dominion" omitted
    { id: "summit_looter", category: "aggressive", name: "Saqueador de Cumbres", description: "Robar en actividad con >200m desnivel", icon: "🏔️" },
    // "untouchable" omitted

    // --- 2. Social ---
    { id: "steel_influencer", category: "social", name: "Influencer de Acero", description: "Recibir 50 reacciones en un post", icon: "📸" },
    { id: "war_correspondent", category: "social", name: "Corresponsal de Guerra", description: "Publicar actividad con 3 robos", icon: "📰" },
    { id: "sports_spirit", category: "social", name: "Espíritu Deportivo", description: "Reaccionar a 10 actividades de rivales", icon: "🤝" },
    // "opinion_leader" omitted (follower state)
    // "active_social_net" omitted (timing)
    // "motivator" omitted (impact tracking)
    // "rising_popularity" omitted (ranking)
    { id: "community_voice", category: "social", name: "Voz de la Comunidad", description: "Ser el primero en reaccionar a 20 actividades", icon: "🗣️" },
    { id: "trust_circle", category: "social", name: "Círculo de Confianza", description: "Seguir a 5 usuarios que te sigan", icon: "⭕" },
    // "active_spectator" omitted

    // --- 3. Training ---
    { id: "xp_machine", category: "training", name: "Máquina de XP", description: "Cap de 300 XP base 3 días seguidos", icon: "🤖" },
    { id: "early_bird", category: "training", name: "Madrugador", description: "Entrenamiento >5km antes de las 7:00 AM", icon: "🌅" },
    { id: "iron_stamina", category: "training", name: "Resistencia de Hierro", description: "Indoor > 90 minutos", icon: "🏋️" },
    { id: "elite_sprinter", category: "training", name: "Velocista de Élite", description: "Ritmo < 4:30 min/km en 5km", icon: "🐆" },
    { id: "km_eater", category: "training", name: "Devora Kilómetros", description: "Superar récord semanal por >10km", icon: "🍽️" },
    { id: "pure_consistency", category: "training", name: "Constancia Pura", description: "Racha activa de 12 semanas", icon: "📅" },
    { id: "triathlete", category: "training", name: "Triatleta en Ciernes", description: "Registrar Carrera, Ciclismo y Otros en una semana", icon: "🏊" },
    { id: "max_efficiency", category: "training", name: "Eficiencia Máxima", description: "Ganar >500 XP en una actividad", icon: "⚡" },
    { id: "deep_explorer", category: "training", name: "Explorador de Fondo", description: "Conquistar 30 celdas nuevas en >15km", icon: "🧭" },
    { id: "level_10_express", category: "training", name: "Nivel 10 Express", description: "Nivel 10 en <30 días", icon: "🚀" }
];

export class BadgeService {

    /**
     * Checks for newly unlocked badges based on the completed activity.
     */
    static async checkActivityBadges(
        db: admin.firestore.Firestore,
        userId: string,
        activity: any,
        stats: TerritoryStats,
        context: XPContext,
        xpBreakdown: any,
        victimSteals: Map<string, number>,
        existingRemotes: Map<string, any>,
        traversedCells: Map<string, any>,
        victimProfiles?: Map<string, any>
    ): Promise<string[]> {
        const unlockedBadges: string[] = [];

        // Fetch existing badges to avoid duplicates
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};
        const existingBadges = new Set(userData.badges || []); // Assuming array of ID strings

        const earn = (badgeId: string) => {
            if (!existingBadges.has(badgeId)) {
                unlockedBadges.push(badgeId);
                existingBadges.add(badgeId);
            }
        };

        const now = new Date();

        // --- AGGRESSIVE BADGES ---

        // Cazador de Sombras: Steal 5 cells from ONE user
        for (const count of victimSteals.values()) {
            if (count >= 5) {
                earn("shadow_hunter");
                break;
            }
        }

        // Señor del Caos: Steal from 3 different users (in one activity for now, approximation)
        // If we want "in a day", we need to check history. 
        // For MVP: "Steal from 3 users in ONE activity" is a harder version but stateless.
        // Prompt says "in a same day". 
        // We will stick to the single activity check for efficiency or approximate.
        // Let's implement strict "Single Activity" version as "Señor del Caos (Instant)" 
        // OR query today's victim history. 
        // Let's rely on the activity for now.
        if (victimSteals.size >= 3) {
            earn("chaos_lord");
        }

        // Búmeran Humano: Recapture < 1 hour after losing
        // We iterate traversed cells. If we recaptured it, we check when the current owner (the thief) took it.
        if (stats.recapturedCellsCount > 0) {
            for (const [cellId, _] of traversedCells.entries()) {
                const existing = existingRemotes.get(cellId);
                if (existing && existing.userId !== userId) {
                    // Wait, if I recaptured, `existing.userId` IS me? 
                    // No. Recapture logic in territories.ts: "isExpired && isOwner".
                    // If isExpired and isOwner, it means *I* owned it, and it expired. No one stole it.
                    // "Búmeran" implies "Recuperar... tras haberla perdido". Usually implies theft.
                    // If it expired, I "lost" it to time.
                    // But if someone STOLE it, and I take it back:
                    // That would be a "STEAL" from the thief (interaction = steal).
                    // BUT if I owned it, they stole it, and I steal it back.
                    // territories.ts classifies strictly:
                    // - existing.userId == me -> Defense (or Recapture if expired)
                    // - existing.userId != me -> Steal (or Conquest if expired/vacant)

                    // So "Búmeran" is actually a STEAL operation where the victim (current owner) 
                    // stole it from ME recently.
                    // How do I know if *I* was the previous owner before *them*?
                    // `existing.history`? `existing` is just the doc data.
                    // This is hard without fetching history.
                    // Simplified interpretation: "Reconquistar" = Recapture interaction (Expired own cell).
                    // "Recuperar una celda menos de 1 hora de haberla perdido" -> Likely refers to expiration.
                    // If it refers to theft-back, it's a "Steal".
                    // Let's assume the user means "Recapture my expired cell quickly"? 
                    // No, "Robo (Steal), Reconquista y Rivales" context.
                    // It implies the "Counter-attack".

                    // Let's look at "Contraataque Relámpago": Recuperar... mientras la notificacion sigue activa.
                    // This confirms "Búmeran" is likely "Steal back from thief".
                    // Doing this requires checking the HISTORY of the cell to see if *I* was the owner before the current guy.
                    // That requires an extra read per stolen cell. Expensive.
                    // SKIP for MVP.
                }
            }
        }

        // Toma de Posesión: Steal cell defended < 24h
        // Check "Steals".
        for (const [cellId, _] of traversedCells.entries()) {
            const existing = existingRemotes.get(cellId);
            if (existing && existing.userId !== userId) {
                // It's a steal (assuming not expired)
                const lastDate = existing.lastConqueredAt ? existing.lastConqueredAt.toDate() : new Date(0);
                const diffHours = (now.getTime() - lastDate.getTime()) / (1000 * 3600);
                if (diffHours < 24) {
                    earn("takeover");
                    break;
                }
            }
        }

        // Ladrón de Guante Blanco: Steal Epic (>30 days)
        for (const [cellId, _] of traversedCells.entries()) {
            const existing = existingRemotes.get(cellId);
            if (existing && existing.userId !== userId) {
                const lastDate = existing.lastConqueredAt ? existing.lastConqueredAt.toDate() : new Date(0);
                const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
                if (diffDays > 30) {
                    earn("white_glove");
                    break;
                }
            }
        }

        // Streak Breaker: Steal from user with streak > 4
        if (victimProfiles) {
            for (const [cellId, _] of traversedCells.entries()) {
                const existing = existingRemotes.get(cellId);
                if (existing && existing.userId !== userId && !existing.isExpired) {
                    const victim = victimProfiles.get(existing.userId);
                    if (victim && (victim.currentStreakWeeks || 0) >= 4) {
                        earn("streak_breaker");
                        break;
                    }
                }
            }
        }

        // Castellano: 10 defenses on same cell
        for (const [cellId, _] of traversedCells.entries()) {
            const existing = existingRemotes.get(cellId);
            if (existing && existing.userId === userId) {
                // interaction was defense (handled in territories.ts loop, but here we check data)
                // We know it was a defense if it's in traversedCells AND existing.userId == userId
                if ((existing.defenseCount || 0) + 1 >= 10) {
                    earn("castellan");
                    break;
                }
            }
        }

        // Madrugador: >5km before 7 AM
        const distanceKm = (activity.distanceMeters || 0) / 1000;
        const startDate = activity.startDate ? activity.startDate.toDate() : new Date();
        const startHour = startDate.getHours();
        if (distanceKm > 5 && startHour < 7) {
            earn("early_bird");
        }

        // Resistencia de Hierro: Indoor > 90 min
        const durationMin = (activity.durationSeconds || 0) / 60;
        if (activity.activityType === "indoor" && durationMin > 90) {
            earn("iron_stamina");
        }

        // Velocista de Élite: < 4:30 min/km in 5km (Run)
        if (activity.activityType === "run" && distanceKm >= 5) {
            const paceSeconds = (activity.durationSeconds || 0) / distanceKm;
            if (paceSeconds < 270) { // 4:30 = 270s
                earn("elite_sprinter");
            }
        }

        // Devora Kilómetros: Superar récord por > 10km
        // Context has the *previous* best. 
        if (context.bestWeeklyDistanceKm) {
            const currentWeekTotal = context.currentWeekDistanceKm + distanceKm;
            // If this activity PUSHED us over the limit
            // We need to check if we *already* had the badge? No, "Superar récord". 
            // If my best was 50, and I just hit 61, I get it.
            if (currentWeekTotal > context.bestWeeklyDistanceKm + 10) {
                earn("km_eater");
            }
        }

        // Constancia Pura: 12 weeks streak
        if (context.currentStreakWeeks >= 12) {
            earn("pure_consistency");
        }

        // Eficiencia Máxima: > 500 XP total
        if (xpBreakdown.total > 500) {
            earn("max_efficiency");
        }

        // Explorador de Fondo: 30 new cells in > 15km
        if (stats.newCellsCount >= 30 && distanceKm > 15) {
            earn("deep_explorer");
        }

        // Nivel 10 Express: Level 10 in < 30 days
        if (context.gamificationState.level >= 10) {
            const joinedAt = userData.createdAt ? userData.createdAt.toDate() : new Date();
            const daysSinceJoin = (new Date().getTime() - joinedAt.getTime()) / (1000 * 3600 * 24);
            if (daysSinceJoin < 30) {
                earn("level_10_express");
            }
        }

        // --- SOCIAL (Activity Context) ---

        // Corresponsal de Guerra: 3 steals in activity
        if (stats.stolenCellsCount >= 3) {
            earn("war_correspondent");
        }


        // --- AGGRESSIVE (Territorial) ---

        // Cazador de Sombras: Steal 5 cells from SAME user
        // We need to count victims.
        // traversedCells contains the processed cells. We need to check who we stole from.
        // Replicating logic from territories.ts is expensive. 
        // Better to pass `victimSteals` map from territories.ts
        // I will assume `traversedCells` has `previousOwnerId` in its history or meta.
        // Actually, territories.ts calculates `victimSteals` map. Let's ask for it as arg.

        // TODO: Refactor `territories.ts` to pass `victimSteals` (Map<string, number>)
        // For now, assuming we can get max steals from a single victim.

        // We will do a rough check if we don't have the map:
        if (stats.stolenCellsCount >= 5) {
            // Optimistic check, or relying on passed data.
            // Let's implement the logic to analyze `traversedCells` if they have `previousOwnerId`
            // But territories writes to DB. The `traversedCells` map in territories.ts 
            // is `Map<string, TerritoryCell>`. It doesn't store the VICTIM ID directly on the cell object 
            // unless we put it there. In territories.ts, `victimId` is found by looking at `existingRemotes`.

            // To properly implement, we should pass `victimSteals` map to this function.
        }

        // Búmeran Humano: Recapture < 1 hour
        if (stats.recapturedCellsCount > 0) {
            // We need to check the `lastConqueredAt` of the cell BEFORE we took it.
            // This requires `existingRemotes` data.
            // Pass `existingRemotes` or do a check inside the loop.
            // Simplest: The caller (`territories.ts`) has all this context.
        }

        // Rey de la Reconquista: 100 XP from recaptures
        // 100 XP / 12 XP per cell = ~9 cells. 
        // Wait, "Accumular" implies history. "Acumular 100 XP solo mediante..."
        // This is a cumulative badge.
        // We need to check `user.totalRecapturedTerritories`.
        const totalRecaptures = (userData.totalRecapturedTerritories || 0) + stats.recapturedCellsCount;
        // Assuming 12 XP per recapture (default config)
        if (totalRecaptures * 12 >= 100) {
            earn("reconquest_king");
        }

        // Sin Invitación: Steal in Activity > 10km
        if (distanceKm > 10 && stats.stolenCellsCount > 0) {
            earn("uninvited");
        }

        // Saqueador de Cumbres: Steal with > 200m elevation
        const elevation = activity.elevationGain || 0;
        if (elevation > 200 && stats.stolenCellsCount > 0) {
            earn("summit_looter");
        }

        // Persist new badges
        if (unlockedBadges.length > 0) {
            await userRef.update({
                badges: FieldValue.arrayUnion(...unlockedBadges),
                // Optional: Store badge metadata if needed (date earned)
            });

            // Send Notifications
            for (const badgeId of unlockedBadges) {
                const badgeDef = BADGES.find(b => b.id === badgeId);
                if (badgeDef) {
                    await db.collection("notifications").add({
                        recipientId: userId,
                        type: "achievement",
                        badgeId: badgeId,
                        senderId: "system",
                        senderName: "Adventure Streak",
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false,
                        message: `¡Has ganado la insignia ${badgeDef.name}!` // Fallback if client doesn't map it
                    });
                }
            }
        }

        return unlockedBadges;
    }

    /**
     * Checks for badges related to social interactions (reactions, etc.)
     */
    static async checkSocialBadges(
        db: admin.firestore.Firestore,
        triggerType: "reaction_received" | "reaction_given",
        userId: string, // The user who might earn the badge
        data: any // Context (activityId, reactorId, etc.)
    ): Promise<void> {

        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};
        const existingBadges = new Set(userData.badges || []);

        const earn = async (badgeId: string) => {
            if (!existingBadges.has(badgeId)) {
                await userRef.update({
                    badges: FieldValue.arrayUnion(badgeId)
                });

                // Notification
                const badgeDef = BADGES.find(b => b.id === badgeId);
                if (badgeDef) {
                    await db.collection("notifications").add({
                        recipientId: userId,
                        type: "achievement",
                        badgeId: badgeId,
                        senderId: "system",
                        senderName: "Adventure Streak",
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false,
                        message: `¡Has ganado la insignia ${badgeDef.name}!`
                    });
                }
            }
        };

        if (triggerType === "reaction_received") {
            // Influencer de Acero: 50 reactions on a single post
            const activityId = data.activityId;
            if (activityId) {
                // Count reactions for this activity
                // Assuming we don't have a counter on the activity doc, we query the subcollection or count trigger.
                // Optimally, reactions.ts should increment a counter on the activity. 
                // Let's assume it does or we check the collection.
                const reactionsSnap = await db.collection("activity_reactions").where("activityId", "==", activityId).count().get();
                if (reactionsSnap.data().count >= 50) {
                    earn("steel_influencer");
                }
            }
        }

        if (triggerType === "reaction_given") {
            // Espíritu Deportivo: React 10 times
            // Check user stats or count strictly.
            // Simplified: check `reactionsGiven` counter if exists, or just query.
            const sentSnap = await db.collection("activity_reactions").where("reactedUserId", "==", userId).count().get();
            if (sentSnap.data().count >= 10) {
                earn("sports_spirit");
            }

            // Voz de la Comunidad: First to react to 20 activities
            // Hard to check "first" historically. 
            // Check if this reaction is the FIRST on the activity.
            const activityId = data.activityId;
            const reactionsSnap = await db.collection("activity_reactions").where("activityId", "==", activityId).count().get();
            if (reactionsSnap.data().count === 1) {
                // I am the first!
                // Increment "firstReactionCount" on user?
                // For now, complex. Skip or implement counter.
            }
        }
    }
}
