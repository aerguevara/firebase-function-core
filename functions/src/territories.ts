/* eslint-disable */
import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { XPContext, TerritoryStats, fetchXPConfig } from "./xp_config";
import { GamificationService } from "./gamification";

import { MissionEngine } from "./missions";
import { BadgeService } from "./badges";
import { SeasonManager } from "./seasons";
import * as geofire from "geofire-common";

// Grid configuration matching TerritoryGrid.swift
const CELL_SIZE_DEGREES = 0.002;
const MAX_INTERPOLATION_DISTANCE_METERS = 300; // Skip interpolation if jump > 300m (Signal loss or vehicle)

interface RoutePoint {
    latitude: number;
    longitude: number;
    timestamp: Date;
}

interface TerritoryCell {
    id: string;
    centerLatitude: number;
    centerLongitude: number;
    boundary: { latitude: number; longitude: number; }[];
    expiresAt: Date;
    lastConqueredAt: Date; // Renamed from activityEndAt for iOS alignment
    userId: string;
    activityId?: string;
    isHotSpot?: boolean;
    locationLabel?: string; // NEW: Store location label
    firstConqueredAt?: admin.firestore.Timestamp; // Track continuous control
    defenseCount?: number; // Total defenses on this cell
    geohash?: string; // NEW: Added for efficient spatial queries
}

interface Rival {
    userId: string;
    displayName: string;
    avatarURL: string | null;
    lastInteractionAt: Date;
    count: number;
}

// Helper: Calculate Cell ID from coordinates
function getCellIndex(latitude: number, longitude: number): { x: number, y: number } {
    const x = Math.floor(longitude / CELL_SIZE_DEGREES);
    const y = Math.floor(latitude / CELL_SIZE_DEGREES);
    return { x, y };
}

function getCellId(x: number, y: number): string {
    return `${x}_${y}`;
}

function getCellCenter(x: number, y: number): { latitude: number, longitude: number } {
    const lon = (x + 0.5) * CELL_SIZE_DEGREES;
    const lat = (y + 0.5) * CELL_SIZE_DEGREES;
    return { latitude: lat, longitude: lon };
}

function getBoundary(centerLat: number, centerLon: number) {
    const halfSize = CELL_SIZE_DEGREES / 2.0;
    return [
        { latitude: centerLat + halfSize, longitude: centerLon - halfSize }, // Top Left
        { latitude: centerLat + halfSize, longitude: centerLon + halfSize }, // Top Right
        { latitude: centerLat - halfSize, longitude: centerLon + halfSize }, // Bottom Right
        { latitude: centerLat - halfSize, longitude: centerLon - halfSize }, // Bottom Left
    ];
}

// Distance in meters between two coordinates (Haversine formula approximation)
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Interpolate points between start and end to ensure we hit all cells
function getCellsBetween(start: RoutePoint, end: RoutePoint, now: Date, userId: string, activityId: string, expirationDays: number, locationLabel: string | null): Map<string, TerritoryCell> {
    const cells = new Map<string, TerritoryCell>();
    const dist = distanceMeters(start.latitude, start.longitude, end.latitude, end.longitude);

    if (dist < 10) {
        const { x, y } = getCellIndex(start.latitude, start.longitude);
        const id = getCellId(x, y);
        cells.set(id, createCell(x, y, now, userId, activityId, expirationDays, locationLabel));
        return cells;
    }

    // --- SAFETY GUARD: Prevent ghost territories during major GPS jumps ---
    if (dist > MAX_INTERPOLATION_DISTANCE_METERS) {
        console.log(`[GPS] Jump of ${dist.toFixed(0)}m detected (> ${MAX_INTERPOLATION_DISTANCE_METERS}m). Skipping interpolation for this segment.`);
        // Just return the endpoints to avoid "teleporting" through intermediate territories
        const startIdx = getCellIndex(start.latitude, start.longitude);
        const endIdx = getCellIndex(end.latitude, end.longitude);

        const sId = getCellId(startIdx.x, startIdx.y);
        const eId = getCellId(endIdx.x, endIdx.y);

        cells.set(sId, createCell(startIdx.x, startIdx.y, now, userId, activityId, expirationDays, locationLabel));
        cells.set(eId, createCell(endIdx.x, endIdx.y, now, userId, activityId, expirationDays, locationLabel));

        return cells;
    }
    // ----------------------------------------------------------------------

    const stepSize = 20.0; // 20 meters
    const steps = Math.ceil(dist / stepSize);

    for (let i = 0; i <= steps; i++) {
        const fraction = i / steps;
        const lat = start.latitude + (end.latitude - start.latitude) * fraction;
        const lon = start.longitude + (end.longitude - start.longitude) * fraction;

        const { x, y } = getCellIndex(lat, lon);
        const id = getCellId(x, y);
        if (!cells.has(id)) {
            cells.set(id, createCell(x, y, now, userId, activityId, expirationDays, locationLabel));
        }
    }
    return cells;
}

function createCell(x: number, y: number, now: Date, userId: string, activityId: string, expirationDays: number, locationLabel: string | null): TerritoryCell {
    const center = getCellCenter(x, y);
    // Use dynamic expirationDays passed from config
    const expiresAt = new Date(now.getTime() + (expirationDays * 24 * 60 * 60 * 1000));

    return {
        id: getCellId(x, y),
        centerLatitude: center.latitude,
        centerLongitude: center.longitude,
        boundary: getBoundary(center.latitude, center.longitude),
        expiresAt: expiresAt,
        lastConqueredAt: now, // Renamed from activityEndAt for iOS alignment
        userId: userId,
        activityId: activityId,
        locationLabel: locationLabel || undefined,
        firstConqueredAt: admin.firestore.Timestamp.fromDate(now),
        defenseCount: 0,
        geohash: geofire.geohashForLocation([center.latitude, center.longitude])
    } as any;
}

/**
 * Calculates the bounding box region for a set of territory cells
 * to be used in the social feed stories minimap.
 */
function calculateMiniMapRegion(cells: TerritoryCell[]): {
    centerLatitude: number,
    centerLongitude: number,
    spanLatitudeDelta: number,
    spanLongitudeDelta: number
} | null {
    if (cells.length === 0) return null;

    let minLat = cells[0].centerLatitude;
    let maxLat = cells[0].centerLatitude;
    let minLon = cells[0].centerLongitude;
    let maxLon = cells[0].centerLongitude;

    for (const cell of cells) {
        minLat = Math.min(minLat, cell.centerLatitude);
        maxLat = Math.max(maxLat, cell.centerLatitude);
        minLon = Math.min(minLon, cell.centerLongitude);
        maxLon = Math.max(maxLon, cell.centerLongitude);
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    // Default span if only one cell or very close. 
    // 0.01 degrees is roughly 1km, which provides a good minimal context.
    const latDelta = Math.max(0.01, (maxLat - minLat) * 1.8);
    const lonDelta = Math.max(0.01, (maxLon - minLon) * 1.8);

    return {
        centerLatitude: centerLat,
        centerLongitude: centerLon,
        spanLatitudeDelta: latDelta,
        spanLongitudeDelta: lonDelta
    };
}

// Factory to create the trigger for a specific database
export const createProcessActivityComplete = (databaseId: string | undefined = undefined) =>
    onDocumentUpdated({
        document: "activities/{activityId}",
        database: databaseId
    }, async (event) => {
        const change = event.data;
        if (!change) return;

        const beforeData = change.before.data();
        const afterData = change.after.data();
        const activityId = event.params.activityId;
        console.log(`ANTIGRAVITY DEBUG: Processing Activity ${activityId}`);

        if (!afterData) return;

        // Trigger only when status changes to 'pending'
        const beforeStatus = beforeData?.processingStatus;
        const afterStatus = afterData?.processingStatus;

        if (afterStatus !== "pending" || beforeStatus === "pending") {
            return;
        }

        const db = databaseId ? getFirestore(databaseId) : getFirestore();
        const activityRef = db.collection("activities").doc(activityId);

        // --- CONCURRENCY GUARD ---
        // Atomic check-and-set to 'processing'
        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(activityRef);
                const status = doc.data()?.processingStatus;
                if (status !== "pending") {
                    throw new Error("Activity already processing or completed");
                }
                transaction.update(activityRef, { processingStatus: "processing" });
            });
        } catch (e: any) {
            console.log(`[Abort] Activity ${activityId} is already being handled: ${e.message}`);
            return;
        }
        // -------------------------

        const userId = afterData.userId;
        const activityData = afterData;

        if (!userId) {
            console.log(`No userId in activity ${activityId}`);
            return;
        }

        const locationLabel = activityData.locationLabel || null;
        const activityDistanceKm = (afterData.distanceMeters || 0) / 1000.0;

        // --- CHECK GPS PRESENCE EARLY ---
        const routesSnapshot = await db.collection("activities").doc(activityId).collection("routes").limit(1).get();
        const hasGps = !routesSnapshot.empty;
        // --------------------------------

        const xpConfig = await fetchXPConfig(db);

        // Ensure endDate is a Date object for calculations
        const endDate = activityData.endDate instanceof admin.firestore.Timestamp
            ? activityData.endDate.toDate()
            : new Date(activityData.endDate || Date.now());

        // --- SAFETY GUARD: REJECT LEGACY ACTIVITIES ---
        // Prevents client from re-uploading old activities (e.g. November) after a Reset.
        const RESET_CUTOFF_DATE = new Date("2025-12-01T00:00:00Z");
        if (endDate < RESET_CUTOFF_DATE) {
            console.warn(`[GUARD] Activity ${activityId} rejected (Date: ${endDate.toISOString()} < ${RESET_CUTOFF_DATE.toISOString()}). Moving to 'activities_legacy_rejected'.`);

            const db = databaseId ? getFirestore(databaseId) : getFirestore();
            await db.collection("activities_legacy_rejected").doc(activityId).set({
                ...activityData,
                rejectedAt: FieldValue.serverTimestamp(),
                reason: "Legacy activity re-uploaded by client after reset"
            });
            await db.collection("activities").doc(activityId).delete();
            return;
        }
        // ----------------------------------------------

        // 0. Fetch User Profile & Stats (Context)
        let userName = activityData.userName || "Adventurer";
        let userAvatar = activityData.userAvatarURL || null;
        let xpContext: XPContext | null = null;
        let currentUserLevel = 1;

        try {
            const userDoc = await db.collection("users").doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data() || {};
                if (userData.displayName) userName = userData.displayName;
                if (userData.avatarURL) userAvatar = userData.avatarURL;
                else if (userData.photoURL) userAvatar = userData.photoURL;

                currentUserLevel = userData.level || 1;

                // --- PRE-FETCH VENGEANCE TARGETS ---
                const vengeanceSnapshot = await db.collection("users").doc(userId).collection("vengeance_targets").get();
                const userVengeanceIds = new Set(vengeanceSnapshot.docs.map(doc => doc.id));
                // ------------------------------------

                const lastActivityDate = userData.lastActivityDate || null;
                const calendarRef = new Date("2025-12-29T00:00:00Z"); // Lunes previo al inicio de 2026
                const getWeekIndex = (date: Date) => {
                    const diffTime = date.getTime() - calendarRef.getTime();
                    if (diffTime < 0) return -1; // Activities before the reference week
                    return Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
                };

                const currentWeekIdx = getWeekIndex(endDate);
                let effectiveWeeklyDistance = userData.currentWeekDistanceKm || 0;
                let effectiveWeeklyDistanceNoGps = userData.currentWeekDistanceNoGpsKm || 0;
                let calculatedStreak = userData.currentStreakWeeks || 0;

                if (lastActivityDate) {
                    const lastDate = lastActivityDate instanceof admin.firestore.Timestamp ? lastActivityDate.toDate() : new Date(lastActivityDate);
                    const lastWeekIdx = getWeekIndex(lastDate);

                    if (currentWeekIdx > lastWeekIdx) {
                        // New week: Reset BOTH distances for the new bucket logic
                        effectiveWeeklyDistance = 0;
                        effectiveWeeklyDistanceNoGps = 0;

                        if (hasGps) {
                            if (currentWeekIdx === lastWeekIdx + 1) {
                                calculatedStreak += 1;
                            } else {
                                calculatedStreak = 1;
                            }
                        }
                    } else {
                        // Same week: Maintain streak if it's a GPS activity
                        if (hasGps && calculatedStreak === 0) calculatedStreak = 1;
                    }
                } else {
                    // First activity
                    effectiveWeeklyDistance = 0;
                    effectiveWeeklyDistanceNoGps = 0;
                    if (hasGps) calculatedStreak = 1;
                }

                xpContext = {
                    userId,
                    currentWeekDistanceKm: effectiveWeeklyDistance,
                    bestWeeklyDistanceKm: userData.bestWeeklyDistanceKm || null,
                    currentStreakWeeks: calculatedStreak,
                    todayBaseXPEarned: 0, // Simplified for MVP
                    gamificationState: {
                        totalXP: userData.xp || 0,
                        level: currentUserLevel,
                        currentStreakWeeks: calculatedStreak
                    },
                    lastActivityDate: lastActivityDate,
                    userVengeanceIds // Pass the pre-fetched IDs
                };

                // Store the post-activity values for the final update
                (xpContext as any).newWeeklyDistance = hasGps ? (effectiveWeeklyDistance + activityDistanceKm) : effectiveWeeklyDistance;
                (xpContext as any).newWeeklyDistanceNoGps = !hasGps ? (effectiveWeeklyDistanceNoGps + activityDistanceKm) : effectiveWeeklyDistanceNoGps;
                (xpContext as any).newStreak = calculatedStreak;
            }
        } catch (e) {
            console.log("Error fetching user profile:", e);
        }

        if (!xpContext) {
            console.log("Could not build XP Context. Aborting.");
            return;
        }


        // 1a. Fetch Config
        let expirationDays = 7;
        try {
            const configDoc = await db.collection("config").doc("gameplay").get();
            if (configDoc.exists) {
                const config = configDoc.data();
                if (config && config.territoryExpirationDays) {
                    expirationDays = config.territoryExpirationDays;
                }
            }
        } catch (e) {
            console.error("Error fetching gameplay config:", e);
        }

        // 1. Reassemble Route
        let allPoints: RoutePoint[] = [];

        // Fetch full routes snapshot (ignoring the 'limit(1)' preview used for hasGps)
        const fullRoutesSnapshot = await db.collection("activities").doc(activityId).collection("routes").orderBy("order", "asc").get();
        const chunks = fullRoutesSnapshot.docs.map((d: any) => d.data());

        for (const chunk of chunks) {
            if (chunk.points && Array.isArray(chunk.points)) {
                allPoints = allPoints.concat(chunk.points.map((p: any) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                    timestamp: p.timestamp && p.timestamp.toDate ? p.timestamp.toDate() : new Date(),
                })));
            }
        }

        // 2. Calculate Territories
        const traversedCells = new Map<string, TerritoryCell>();
        if (allPoints.length > 0) {
            const startIdx = getCellIndex(allPoints[0].latitude, allPoints[0].longitude);
            const startId = getCellId(startIdx.x, startIdx.y);
            traversedCells.set(startId, createCell(startIdx.x, startIdx.y, endDate, userId, activityId, expirationDays, locationLabel));

            for (let i = 0; i < allPoints.length - 1; i++) {
                const segCells = getCellsBetween(allPoints[i], allPoints[i + 1], endDate, userId, activityId, expirationDays, locationLabel);
                segCells.forEach((cell, id) => traversedCells.set(id, cell));
            }
        }

        // 3. Check Existing Owners & Determine Status
        const cellIds = Array.from(traversedCells.keys());
        const existingRemotes = new Map<string, any>();
        const chunkedIds = [];
        for (let i = 0; i < cellIds.length; i += 30) {
            chunkedIds.push(cellIds.slice(i, i + 30));
        }

        for (const chunk of chunkedIds) {
            const q = await db.collection("remote_territories").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
            q.docs.forEach((d: any) => existingRemotes.set(d.id, d.data()));
        }

        const victimSteals = new Map<string, number>();
        let conquestCount = 0;
        let defenseCount = 0;
        let recapturedCount = 0;
        let stealCount = 0;
        let vengeanceCount = 0;
        let lastMinuteDefenseCount = 0;
        let totalLootXP = 0;
        let totalConsolidationXP = 0;
        let totalStreakInterruptionXP = 0;

        // 3b. Prepare Batches for Territory Updates
        let currentBatch = db.batch();
        let currentOpCount = 0;

        for (const [cellId, newCell] of traversedCells.entries()) {
            const existing = existingRemotes.get(cellId);
            let interaction: "conquest" | "defense" | "steal" | "recapture" = "conquest";
            let victimId: string | null = null;

            if (existing) {
                const isOwner = existing.userId === userId;
                const existingTime = (existing.lastConqueredAt || existing.activityEndAt) ? (existing.lastConqueredAt || existing.activityEndAt).toDate() : new Date(0);
                const isExpired = existing.expiresAt ? existing.expiresAt.toDate() < endDate : true;
                const hoursLeft = existing.expiresAt ? (existing.expiresAt.toDate().getTime() - endDate.getTime()) / (1000 * 60 * 60) : 0;

                if (!isOwner && !isExpired && existingTime >= endDate) {
                    continue;
                }

                // CRITICAL FIX: If the client (or previous run) already wrote this cell for THIS activity,
                // treat it as non-existent to correctly classify it as a NEW conquest, not a defense.
                if (existing.activityId === activityId) {
                    conquestCount++;
                    const ref = db.collection("remote_territories").doc(cellId);
                    const cellWithStatus = { ...newCell, lastInteraction: "conquest" };
                    currentBatch.set(ref, cellWithStatus);
                    currentOpCount++;

                    // History (Self-Collision case -> Conquest)
                    const historyRef = ref.collection("history").doc();
                    currentBatch.set(historyRef, {
                        userId: userId,
                        activityId: activityId,
                        interaction: "conquest",
                        timestamp: FieldValue.serverTimestamp(),
                        previousOwnerId: null
                    });
                    currentOpCount++;
                    continue; // Skip the rest of the existing logic
                }

                if (isExpired) {
                    interaction = isOwner ? "recapture" : "conquest";
                    if (!isOwner) conquestCount++;
                    if (isOwner) recapturedCount++;
                } else if (!isOwner) {
                    interaction = "steal";
                    victimId = existing.userId;

                    // --- ACCUMULATED LOOT CALCULATION ---
                    const firstConqTS = existing.firstConqueredAt || existing.lastConqueredAt || existing.activityEndAt;
                    const firstConqDate = firstConqTS instanceof admin.firestore.Timestamp ? firstConqTS.toDate() : new Date(firstConqTS);
                    const ageInDays = Math.floor((endDate.getTime() - firstConqDate.getTime()) / (1000 * 60 * 60 * 24));

                    if (ageInDays > 0) {
                        totalLootXP += ageInDays * xpConfig.xpLootPerDay;
                    }
                    // -------------------------------------

                    // --- EXCLUSIVE VENGEANCE LOGIC ---
                    if (xpContext.userVengeanceIds?.has(cellId)) {
                        vengeanceCount++;
                    } else {
                        stealCount++;
                    }
                    // ---------------------------------
                } else {
                    interaction = "defense";
                    defenseCount++;

                    // --- CONSOLIDATION BONUS CALCULATION ---
                    const firstConqTS = existing.firstConqueredAt || existing.lastConqueredAt || existing.activityEndAt;
                    const firstConqDate = firstConqTS instanceof admin.firestore.Timestamp ? firstConqTS.toDate() : new Date(firstConqTS);
                    const ageInDays = Math.floor((endDate.getTime() - firstConqDate.getTime()) / (1000 * 60 * 60 * 24));

                    if (ageInDays >= 25) {
                        totalConsolidationXP += xpConfig.xpConsolidation25DayBonus;
                    } else if (ageInDays >= 15) {
                        totalConsolidationXP += xpConfig.xpConsolidation15DayBonus;
                    }
                    // ---------------------------------------

                    if (hoursLeft > 0 && hoursLeft < 6) {
                        lastMinuteDefenseCount++;
                    }
                }
            } else {
                conquestCount++;
            }

            const ref = db.collection("remote_territories").doc(cellId);

            // Check History for "Hot Spot" status (> 3 owners in last 7 days)
            let isHotSpot = false;
            try {
                const sevenDaysAgo = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000));
                const historySnap = await ref.collection("history")
                    .where("timestamp", ">", sevenDaysAgo)
                    .orderBy("timestamp", "desc")
                    .limit(5)
                    .get();

                // Count distinct userIds in the last ownership changes
                const recentOwners = new Set(historySnap.docs.map(d => d.data().userId));
                if (recentOwners.size >= 3) {
                    isHotSpot = true;
                }
            } catch (e) {
                console.error(`Error checking hot spot for ${cellId}:`, e);
            }

            const cellWithStatus = { ...newCell, lastInteraction: interaction, isHotSpot };
            currentBatch.set(ref, cellWithStatus);
            currentOpCount++;

            // History
            const historyRef = ref.collection("history").doc();
            currentBatch.set(historyRef, {
                userId: userId,
                activityId: activityId,
                interaction: interaction,
                timestamp: FieldValue.serverTimestamp(),
                previousOwnerId: victimId || null
            });
            currentOpCount++;

            // Update cell with new fields
            const finalProcessedCell = {
                ...newCell,
                lastInteraction: interaction,
                isHotSpot,
                firstConqueredAt: (interaction === "defense") ? (existing.firstConqueredAt || existing.lastConqueredAt || newCell.firstConqueredAt) : newCell.firstConqueredAt,
                defenseCount: (interaction === "defense") ? (existing.defenseCount || 0) + 1 : 0
            };
            currentBatch.set(ref, finalProcessedCell);
            currentOpCount++;

            // --- NEW: Vengeance Targets Logic ---

            // 1. ALWAYS clean up vengeance for the current user if they are interacting with this cell
            // (fixes the "steal back" bug where vengeance wasn't removed if the interaction was 'steal')
            const selfVengeanceRef = db.collection("users").doc(userId).collection("vengeance_targets").doc(cellId);
            currentBatch.delete(selfVengeanceRef);
            currentOpCount++;

            if (interaction === "steal" && victimId) {
                const vengeanceRef = db.collection("users").doc(victimId).collection("vengeance_targets").doc(cellId);
                const vengeanceExpiration = new Date(endDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days TTL (1 week)
                currentBatch.set(vengeanceRef, {
                    cellId: cellId,
                    activityId: activityId,
                    centerLatitude: newCell.centerLatitude,
                    centerLongitude: newCell.centerLongitude,
                    thiefId: userId,
                    thiefName: userName,
                    stolenAt: endDate,
                    expiresAt: vengeanceExpiration, // NEW: For TTL cleanup
                    locationLabel: locationLabel,
                    xpReward: xpConfig.vengeanceXPReward // Use value from config
                });
                currentOpCount++;
            }

            if (interaction === "steal" && victimId) {
                victimSteals.set(victimId, (victimSteals.get(victimId) || 0) + 1);
            }

            // Commit in chunks of 450 (safe limit for doubled writes per loop)
            if (currentOpCount >= 450) {
                await currentBatch.commit();
                console.log(`[Batch] Intermediate commit: ${currentOpCount} docs`);
                currentBatch = db.batch();
                currentOpCount = 0; // Reset counter after commit
            }
        }

        // Final Intermediate Batch Commit
        // Write global territory updates
        if (currentOpCount > 0) {
            await currentBatch.commit();
            console.log(`[Batch] Final intermediate commit: ${currentOpCount} docs`);
        }

        // 4. Persist calculated territories to the activity's subcollection
        // needed for the client-side mini-map (requested by user to be server-side)
        const territoryCellsArray = Array.from(traversedCells.values());
        if (territoryCellsArray.length > 0) {
            const chunkSize = 200;
            const subColBatch = db.batch();
            let subColOpCount = 0;

            for (let i = 0; i < territoryCellsArray.length; i += chunkSize) {
                const slice = territoryCellsArray.slice(i, i + chunkSize);
                const chunkIndex = Math.floor(i / chunkSize);
                const chunkRef = db.collection(`activities/${activityId}/territories`).doc(`chunk_${chunkIndex}`);

                subColBatch.set(chunkRef, {
                    order: chunkIndex,
                    cells: slice, // Firestore handles array of objects
                    cellCount: slice.length
                });
                subColOpCount++;
            }

            // Also update territoryChunkCount meta-data on the activity doc
            const activityRef = db.collection("activities").doc(activityId);
            subColBatch.update(activityRef, {
                territoryChunkCount: subColOpCount,
                territoryPointsCount: territoryCellsArray.length
            });

            await subColBatch.commit();
            console.log(`Persisted ${territoryCellsArray.length} cells in ${subColOpCount} chunks to activity ${activityId}`);
        }

        // 5. XP & Missions Calculation
        const territoryStats: TerritoryStats = {
            newCellsCount: conquestCount,
            defendedCellsCount: defenseCount,
            recapturedCellsCount: recapturedCount,
            stolenCellsCount: stealCount,
            vengeanceCellsCount: vengeanceCount,
            lastMinuteDefenseCount: lastMinuteDefenseCount,
            totalLootXP: totalLootXP,
            totalConsolidationXP: totalConsolidationXP,
            totalStreakInterruptionXP: totalStreakInterruptionXP
        };

        // --- FETCH VICTIM PROFILES FOR STREAK INTERRUPTION ---
        const victimIds = Array.from(victimSteals.keys());
        const victimProfiles = new Map<string, any>();
        if (victimIds.length > 0) {
            const victimDocs = await Promise.all(victimIds.map(id => db.collection("users").doc(id).get()));
            victimDocs.forEach(doc => {
                if (doc.exists) victimProfiles.set(doc.id, doc.data());
            });

            // Recalculate streak interruption bonus now that we have victim profiles
            // Actually, it's better to do this inside the loop if possible, 
            // but we need the profiles.
            // Let's do a second pass or check it here
            for (const [cellId] of traversedCells.entries()) {
                const existing = existingRemotes.get(cellId);
                if (existing && existing.userId !== userId && !existing.isExpired) {
                    const victim = victimProfiles.get(existing.userId);
                    if (victim && (victim.currentStreakWeeks || 0) > 0) {
                        totalStreakInterruptionXP += xpConfig.xpStreakInterruptionBonus;
                    }
                }
            }
            territoryStats.totalStreakInterruptionXP = totalStreakInterruptionXP;
        }
        // -----------------------------------------------------

        const currentSeason = SeasonManager.getCurrentSeason(endDate);
        const xpBreakdown = GamificationService.computeXP(activityData, territoryStats, xpContext, xpConfig, currentSeason);
        const missions = MissionEngine.classifyMissions(activityData, territoryStats, xpContext, xpConfig, currentSeason);

        let victimNames: string[] = [];
        if (victimSteals.size > 0) {
            const victimIds = Array.from(victimSteals.keys());
            try {
                const victimDocs = await Promise.all(
                    victimIds.map(id => db.collection("users").doc(id).get())
                );
                victimNames = victimDocs
                    .filter(d => d.exists && d.data()?.displayName)
                    .map(d => d.data()?.displayName as string);
            } catch (e) {
                console.log("Error fetching victim names:", e);
            }
        }

        // Calculate new total XP and Level
        const newTotalXP = xpContext.gamificationState.totalXP + xpBreakdown.total;
        const newLevel = GamificationService.getLevel(newTotalXP);

        // 5b. Update User Profile (XP, Level, Last Updated, cumulative counters)
        const newStreak = (xpContext as any).newStreak;
        const newWeeklyDistance = (xpContext as any).newWeeklyDistance;

        // CRITICAL: Calculate current active owned cells count from backend
        let activeOwnedCount = 0;
        try {
            const ownedSnapshot = await db.collection("remote_territories")
                .where("userId", "==", userId)
                .where("expiresAt", ">", endDate)
                .count()
                .get();
            activeOwnedCount = ownedSnapshot.data().count;
        } catch (e) {
            console.error("Error counting active territories:", e);
        }

        const updateData: any = {
            xp: newTotalXP,
            level: newLevel,
            lastActivityDate: endDate,
            currentStreakWeeks: newStreak,
            currentWeekDistanceKm: newWeeklyDistance,
            currentWeekDistanceNoGpsKm: (xpContext as any).newWeeklyDistanceNoGps,
            totalActivities: FieldValue.increment(1),
            totalCellsOwned: activeOwnedCount,
            totalConqueredTerritories: FieldValue.increment(conquestCount),
            totalStolenTerritories: FieldValue.increment(stealCount + vengeanceCount),
            totalDefendedTerritories: FieldValue.increment(defenseCount),
            totalRecapturedTerritories: FieldValue.increment(recapturedCount),
            lastUpdated: FieldValue.serverTimestamp()
        };

        const oldBest = (xpContext as any).bestWeeklyDistanceKm || 0;
        if (newWeeklyDistance > oldBest) {
            updateData.bestWeeklyDistanceKm = newWeeklyDistance;
        }

        if (hasGps) {
            updateData.totalDistanceKm = FieldValue.increment(activityDistanceKm);
        } else {
            updateData.totalDistanceNoGpsKm = FieldValue.increment(activityDistanceKm);
        }

        await db.collection("users").doc(userId).update(updateData);

        // C. Update Activity (with results)
        const activityUpdate: Record<string, unknown> = {
            xpBreakdown: xpBreakdown,
            missions: missions,
            processingStatus: "completed", // customizable
            territoryStats: territoryStats
        };
        if (victimNames.length > 0) {
            activityUpdate.conqueredVictims = victimNames;
        }
        await db.collection("activities").doc(activityId).update(activityUpdate);

        // D. Notifications
        // Level Up
        if (newLevel > currentUserLevel) {
            await db.collection("notifications").add({
                recipientId: userId,
                type: "achievement",
                badgeId: `level_up_${newLevel}`,
                senderId: "system",
                senderName: "Adventure Streak",
                timestamp: FieldValue.serverTimestamp(),
                isRead: false
            });
        }

        // Territory Notifications (Victims)
        for (const [victimId, count] of victimSteals) {
            if (victimId === userId) continue;
            await db.collection("notifications").add({
                recipientId: victimId,
                type: "territory_stolen",
                senderId: userId,
                senderName: userName,
                senderAvatarURL: userAvatar,
                activityId: activityId,
                locationLabel: locationLabel,
                timestamp: FieldValue.serverTimestamp(),
                isRead: false,
                message: `¡Te ha robado ${count} territorios!`
            });
        }

        // Territory Notifications (Attacker/Thief)
        if (victimSteals.size > 0) {
            let totalStolen = 0;
            victimSteals.forEach(count => totalStolen += count);

            let theftMessage = `¡Has robado ${totalStolen} territorios!`;
            if (victimNames.length > 0) {
                const primaryVictim = victimNames[0];
                if (victimNames.length === 1) {
                    theftMessage = `¡Has robado ${totalStolen} territorios a ${primaryVictim}!`;
                } else {
                    theftMessage = `¡Has robado territorios a ${primaryVictim} y ${victimNames.length - 1} más!`;
                }
            }

            await db.collection("notifications").add({
                recipientId: userId,
                type: "territory_stolen_success",
                senderId: "system",
                senderName: "Adventure Streak",
                senderAvatarURL: "",
                activityId: activityId,
                timestamp: FieldValue.serverTimestamp(),
                isRead: false,
                message: theftMessage
            });
        }

        // Territory Notifications (Self)
        if (conquestCount > 0) {
            await db.collection("notifications").add({
                recipientId: userId,
                type: "territory_conquered",
                senderId: "system",
                senderName: "Adventure Streak",
                activityId: activityId,
                locationLabel: locationLabel,
                timestamp: FieldValue.serverTimestamp(),
                isRead: false
            });
        }

        // Follower Notifications
        if (conquestCount > 0 || stealCount > 0) {
            try {
                const followersSnapshot = await db.collection("users").doc(userId).collection("followers").get();
                if (!followersSnapshot.empty) {
                    const followerNotifications = followersSnapshot.docs.map(doc => {
                        const followerId = doc.id;
                        return db.collection("notifications").add({
                            recipientId: followerId,
                            type: "follower_territory_activity",
                            senderId: userId,
                            senderName: userName,
                            senderAvatarURL: userAvatar,
                            activityId: activityId,
                            locationLabel: locationLabel,
                            conquestCount: conquestCount,
                            stealCount: stealCount,
                            timestamp: FieldValue.serverTimestamp(),
                            isRead: false
                        });
                    });
                    await Promise.all(followerNotifications);
                    console.log(`Sent activity notifications to ${followersSnapshot.size} followers.`);
                }
            } catch (e) {
                console.error("Error sending follower notifications:", e);
            }
        }


        // --- BADGES INTEGRATION ---
        try {
            await BadgeService.checkActivityBadges(
                db,
                userId,
                activityData,
                territoryStats,
                xpContext,
                xpBreakdown,
                victimSteals,
                existingRemotes,
                traversedCells,
                victimProfiles
            );
        } catch (e) {
            console.error("Error checking badges:", e);
        }

        // --- NEW: Update Recent Rivals (Theft) ---
        if (victimSteals.size > 0) {
            try {
                // Helper to merge and limit rivals
                const updateRecentRivals = (currentList: Rival[], newRivals: Rival[]): Rival[] => {
                    const combined = [...currentList];
                    for (const newRival of newRivals) {
                        const existingIdx = combined.findIndex(r => r.userId === newRival.userId);
                        if (existingIdx >= 0) {
                            const existing = combined[existingIdx];
                            combined[existingIdx] = {
                                ...newRival,
                                count: (existing.count || 0) + newRival.count,
                                avatarURL: newRival.avatarURL ?? existing.avatarURL
                            };
                        } else {
                            combined.push(newRival);
                        }
                    }
                    // Sort by date desc
                    combined.sort((a, b) => {
                        const da = a.lastInteractionAt instanceof admin.firestore.Timestamp ? a.lastInteractionAt.toDate() : new Date(a.lastInteractionAt);
                        const db = b.lastInteractionAt instanceof admin.firestore.Timestamp ? b.lastInteractionAt.toDate() : new Date(b.lastInteractionAt);
                        return db.getTime() - da.getTime();
                    });
                    return combined.slice(0, 5);
                };

                // 1. Prepare Victim Data for Current User (Thief)
                const victimIds = Array.from(victimSteals.keys());
                const newVictims: Rival[] = [];

                // Fetch victim details (name, avatar)
                const victimDocsForRivals = await Promise.all(
                    victimIds.map(id => db.collection("users").doc(id).get())
                );

                const victimMap = new Map<string, { name: string, avatar: string | null }>();
                victimDocsForRivals.forEach(d => {
                    if (d.exists) {
                        const vd = d.data();
                        victimMap.set(d.id, {
                            name: vd?.displayName || "Desconocido",
                            avatar: vd?.avatarURL || vd?.photoURL || null
                        });
                    }
                });

                victimSteals.forEach((count, victimId) => {
                    const vData = victimMap.get(victimId);
                    if (vData) {
                        newVictims.push({
                            userId: victimId,
                            displayName: vData.name,
                            avatarURL: vData.avatar,
                            lastInteractionAt: endDate,
                            count: count
                        });
                    }
                });

                if (newVictims.length > 0) {
                    await db.runTransaction(async (t) => {
                        // 1. READ ALL INVOLVED DOCUMENTS
                        const userRef = db.collection("users").doc(userId);
                        const victimRefs = victimIds.map(id => db.collection("users").doc(id));

                        const userDoc = await t.get(userRef);
                        const victimDocs = await Promise.all(victimRefs.map(ref => t.get(ref)));

                        // 2. PREPARE UPDATES

                        // Update Current User (Thief) -> recentTheftVictims
                        if (userDoc.exists) {
                            const data = userDoc.data() || {};
                            const currentVictims: Rival[] = data.recentTheftVictims || [];
                            const updatedVictims = updateRecentRivals(currentVictims, newVictims);
                            t.update(userRef, { recentTheftVictims: updatedVictims });
                        }

                        // Update Each Victim -> recentThieves
                        const thiefRivalOrSelf: Rival = {
                            userId: userId,
                            displayName: userName,
                            avatarURL: userAvatar,
                            lastInteractionAt: endDate,
                            count: 0 // To be set per victim
                        };

                        victimDocs.forEach((vDoc, index) => {
                            if (vDoc.exists) {
                                const victimId = vDoc.id;
                                const count = victimSteals.get(victimId) || 0;
                                const thiefEntry = { ...thiefRivalOrSelf, count: count };

                                const vData = vDoc.data() || {};
                                const currentThieves: Rival[] = vData.recentThieves || [];
                                const updatedThieves = updateRecentRivals(currentThieves, [thiefEntry]);
                                t.update(vDoc.ref, { recentThieves: updatedThieves });
                            }
                        });
                    });
                }
            } catch (e: any) {
                console.error("Error updating rival lists:", e);
            }
        }

        // E. Create Feed Event
        // Construct Feed Event matching FeedModels.swift logic
        const missionNames = missions.map(m => m.name).join(" · ");
        const primaryMission = missions.length > 0 ? missions[0] : null;

        let title = primaryMission ? primaryMission.name : (locationLabel || "Actividad completada");
        let eventType = "distance_record"; // default
        if (recapturedCount > 0) eventType = "territory_recaptured";
        else if (conquestCount > 0) eventType = "territory_conquered";
        else if (defenseCount > 0) eventType = "territory_conquered"; // Mapping defense to conquered type for icon? Check swift.
        // Swift check: defense -> territoryConquered type. Yes.

        const territoryHighlights = [];
        if (conquestCount > 0) territoryHighlights.push(`${conquestCount} territorios conquistados`);
        if (defenseCount > 0) territoryHighlights.push(`${defenseCount} territorios defendidos`);
        if (recapturedCount > 0) territoryHighlights.push(`${recapturedCount} territorios recuperados`);

        const combinedSteals = stealCount + vengeanceCount;
        if (combinedSteals > 0) territoryHighlights.push(`${combinedSteals} territorios robados`);

        const subtitles = [];
        if (missionNames) subtitles.push(`Misiones: ${missionNames}`);
        if (territoryHighlights.length > 0) subtitles.push(territoryHighlights.join(" · "));
        const subtitle = subtitles.join(" · ");

        const activityDataPayload: Record<string, unknown> = {
            activityType: activityData.activityType,
            distanceMeters: activityData.distanceMeters,
            durationSeconds: activityData.durationSeconds,
            xpEarned: xpBreakdown.total,
            newZonesCount: conquestCount,
            defendedZonesCount: defenseCount,
            recapturedZonesCount: recapturedCount,
            stolenZonesCount: stealCount + vengeanceCount,
            vengeanceZonesCount: vengeanceCount,
            calories: activityData.calories || 0,
            averageHeartRate: activityData.averageHeartRate || 0,
            locationLabel: locationLabel
        };
        if (victimNames.length > 0) {
            activityDataPayload.stolenVictimNames = victimNames;
        }

        const feedEvent = {
            id: `activity-${activityId}-summary`,
            type: eventType,
            date: endDate,
            activityId: activityId,
            title: title,
            subtitle: subtitle,
            xpEarned: xpBreakdown.total,
            userId: userId,
            relatedUserName: userName,
            userLevel: newLevel,
            userAvatarURL: userAvatar,
            activityData: activityDataPayload,
            rarity: primaryMission ? primaryMission.rarity : null,
            miniMapRegion: calculateMiniMapRegion(territoryCellsArray),
            isPersonal: true,
            timestamp: FieldValue.serverTimestamp() // For ordering
        };

        await db.collection("feed").doc(feedEvent.id).set(feedEvent);
        console.log("Feed event updated/created with stable ID.");
    });
