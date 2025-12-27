import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = require("/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json");

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const dbId = process.argv[2] || "(default)";
const db = getFirestore(dbId);

console.log(`📡 Using Database: ${dbId}`);

interface TerritoryCell {
    centerLatitude: number;
    centerLongitude: number;
}

function calculateMiniMapRegion(cells: TerritoryCell[]) {
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

    const latDelta = Math.max(0.01, (maxLat - minLat) * 1.8);
    const lonDelta = Math.max(0.01, (maxLon - minLon) * 1.8);

    return {
        centerLatitude: centerLat,
        centerLongitude: centerLon,
        spanLatitudeDelta: latDelta,
        spanLongitudeDelta: lonDelta
    };
}

async function backfillFeedMaps() {
    console.log("🚀 Starting Feed Maps Backfill...");

    try {
        const feedSnapshot = await db.collection("feed")
            .where("type", "in", ["territory_conquered", "territory_recaptured", "distance_record"])
            .get();

        console.log(`📦 Found ${feedSnapshot.size} potential feed events to update.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const doc of feedSnapshot.docs) {
            const feedData = doc.data();

            // Skip if already has region
            if (feedData.miniMapRegion) {
                skippedCount++;
                continue;
            }

            const activityId = feedData.activityId;
            if (!activityId) continue;

            // Fetch territory chunks
            const territoriesSnapshot = await db.collection(`activities/${activityId}/territories`).get();
            if (territoriesSnapshot.empty) {
                console.log(`ℹ️ No territories found for activity ${activityId} (Event ${doc.id})`);
                continue;
            }

            let allCells: TerritoryCell[] = [];
            territoriesSnapshot.docs.forEach((tDoc: admin.firestore.QueryDocumentSnapshot) => {
                const data = tDoc.data();
                if (data.cells && Array.isArray(data.cells)) {
                    allCells = allCells.concat(data.cells);
                }
            });

            const region = calculateMiniMapRegion(allCells);
            if (region) {
                await doc.ref.update({ miniMapRegion: region });
                updatedCount++;
                console.log(`✅ Updated map for event ${doc.id} (Activity ${activityId})`);
            }
        }

        console.log("🏁 Backfill Complete.");
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped: ${skippedCount}`);

    } catch (error) {
        console.error("🔥 Fatal error during backfill:", error);
    }
}

backfillFeedMaps();
