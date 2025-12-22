import * as admin from "firebase-admin";
import * as fs from "fs";

// Initialize Firebase Admin (adjust path to service account if running locally)
const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/tests/e2e_territories/service-account.json";
if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.log("⚠️ No serviceAccountKey.json found. Attempting default credentials for 'adventure-streak'...");
    admin.initializeApp({
        projectId: "adventure-streak"
    });
}

const db = admin.firestore();

// --- logic from territories.ts (simplified for backfill) ---

const CELL_SIZE_DEGREES = 0.002;

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
    lastConqueredAt: Date; // Renamed for iOS alignment
    userId: string;
    activityId?: string;
}

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
        { latitude: centerLat + halfSize, longitude: centerLon - halfSize },
        { latitude: centerLat + halfSize, longitude: centerLon + halfSize },
        { latitude: centerLat - halfSize, longitude: centerLon + halfSize },
        { latitude: centerLat - halfSize, longitude: centerLon - halfSize },
    ];
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
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

function getCellsBetween(start: RoutePoint, end: RoutePoint, now: Date, userId: string, activityId: string): Map<string, TerritoryCell> {
    const cells = new Map<string, TerritoryCell>();
    const dist = distanceMeters(start.latitude, start.longitude, end.latitude, end.longitude);
    const expirationDays = 7; // Default for backfill

    if (dist < 10) {
        const { x, y } = getCellIndex(start.latitude, start.longitude);
        const id = getCellId(x, y);
        cells.set(id, createCell(x, y, now, userId, activityId, expirationDays));
        return cells;
    }

    const stepSize = 20.0;
    const steps = Math.ceil(dist / stepSize);

    for (let i = 0; i <= steps; i++) {
        const fraction = i / steps;
        const lat = start.latitude + (end.latitude - start.latitude) * fraction;
        const lon = start.longitude + (end.longitude - start.longitude) * fraction;

        const { x, y } = getCellIndex(lat, lon);
        const id = getCellId(x, y);
        if (!cells.has(id)) {
            cells.set(id, createCell(x, y, now, userId, activityId, expirationDays));
        }
    }
    return cells;
}

function createCell(x: number, y: number, now: Date, userId: string, activityId: string, expirationDays: number): TerritoryCell {
    const center = getCellCenter(x, y);
    const expiresAt = new Date(now.getTime() + (expirationDays * 24 * 60 * 60 * 1000));

    return {
        id: getCellId(x, y),
        centerLatitude: center.latitude,
        centerLongitude: center.longitude,
        boundary: getBoundary(center.latitude, center.longitude),
        expiresAt: expiresAt,
        lastConqueredAt: now, // Renamed for iOS alignment
        userId: userId,
        activityId: activityId,
    };
}

// --- Main Backfill Logic ---

async function backfillTerritories() {
    console.log("🚀 Starting Territory Backfill...");

    // 1. Fetch all activities
    // Optimization: You might want to paginate this if you have thousands of activities
    const activitiesSnapshot = await db.collection("activities").get();
    console.log(`Found ${activitiesSnapshot.size} total activities.`);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of activitiesSnapshot.docs) {
        const activityId = doc.id;
        const data = doc.data();

        // Skip if already has territory chunks (unless you want to force overwrite)
        if (data.territoryChunkCount && data.territoryChunkCount > 0) {
            skippedCount++;
            continue;
        }

        // Check if outdoor activity (rough check, assuming 'distanceMeters' > 0 implies movement)
        if (!data.distanceMeters || data.distanceMeters < 10) {
            skippedCount++;
            continue;
        }

        console.log(`Processing ${activityId}...`);

        try {
            // Fetch routes
            const routesSnapshot = await db.collection(`activities/${activityId}/routes`).get();
            if (routesSnapshot.empty) {
                console.log(`   No routes found for ${activityId}. Skipping.`);
                skippedCount++;
                continue;
            }

            // Reconstruct points
            let allPoints: RoutePoint[] = [];
            const chunks = routesSnapshot.docs.map((d: any) => d.data())
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

            for (const chunk of chunks) {
                if (chunk.points && Array.isArray(chunk.points)) {
                    allPoints = allPoints.concat(chunk.points.map((p: any) => ({
                        latitude: p.latitude,
                        longitude: p.longitude,
                        timestamp: p.timestamp && p.timestamp.toDate ? p.timestamp.toDate() : new Date(),
                    })));
                }
            }

            if (allPoints.length === 0) {
                console.log(`   No points in route for ${activityId}. Skipping.`);
                skippedCount++;
                continue;
            }

            // Calculate cells
            const userId = data.userId || "unknown";
            const endDate = data.endDate && data.endDate.toDate ? data.endDate.toDate() : new Date();

            const traversedCells = new Map<string, TerritoryCell>();

            // Init start
            const startIdx = getCellIndex(allPoints[0].latitude, allPoints[0].longitude);
            const startId = getCellId(startIdx.x, startIdx.y);
            const dummyExp = 7;
            traversedCells.set(startId, createCell(startIdx.x, startIdx.y, endDate, userId, activityId, dummyExp));

            // Traverse
            for (let i = 0; i < allPoints.length - 1; i++) {
                const segCells = getCellsBetween(allPoints[i], allPoints[i + 1], endDate, userId, activityId);
                segCells.forEach((cell, id) => traversedCells.set(id, cell));
            }

            const territoryCellsArray = Array.from(traversedCells.values());
            console.log(`   Calculated ${territoryCellsArray.length} cells.`);

            if (territoryCellsArray.length > 0) {
                const chunkSize = 200;
                const batch = db.batch();
                let subColOpCount = 0;

                for (let i = 0; i < territoryCellsArray.length; i += chunkSize) {
                    const slice = territoryCellsArray.slice(i, i + chunkSize);
                    const chunkIndex = Math.floor(i / chunkSize);
                    const chunkRef = db.collection(`activities/${activityId}/territories`).doc(`chunk_${chunkIndex}`);

                    batch.set(chunkRef, {
                        order: chunkIndex,
                        cells: slice,
                        cellCount: slice.length
                    });
                    subColOpCount++;
                }

                // Update activity metadata
                const activityRef = db.collection("activities").doc(activityId);
                batch.update(activityRef, {
                    territoryChunkCount: subColOpCount,
                    territoryPointsCount: territoryCellsArray.length
                });

                await batch.commit();
                console.log(`   ✅ Saved ${subColOpCount} chunks.`);
                processedCount++;
            } else {
                skippedCount++;
            }

        } catch (e) {
            console.error(`   ❌ Error processing ${activityId}:`, e);
            errorCount++;
        }
    }

    console.log(`\n--- Backfill Complete ---`);
    console.log(`Processed: ${processedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
}

// Run
backfillTerritories()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
