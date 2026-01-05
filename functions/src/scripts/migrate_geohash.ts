import * as admin from "firebase-admin";
import { getFirestore } from 'firebase-admin/firestore';
import * as geofire from "geofire-common";
import * as fs from 'fs';

/**
 * Migration script to add a 'geohash' field to all existing 'remote_territories' documents.
 * Run this script to enable efficient spatial queries for legacy data.
 */
async function migrateGeohash(databaseId: string) {
    console.log(`🚀 Starting Geohash migration for database: ${databaseId}...`);

    // Initialize Firebase Admin with Service Account
    const serviceAccountPath = '/Users/aerguevara/Documents/develop/Adventure Streak/backend-admin/secrets/serviceAccount.json';

    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Admin initialized with service account.");
        }
    } else {
        console.error("❌ Service account not found at:", serviceAccountPath);
        process.exit(1);
    }

    const db = databaseId === '(default)' ? getFirestore() : getFirestore(databaseId);
    const collectionRef = db.collection("remote_territories");

    let processedCount = 0;
    let updatedCount = 0;

    try {
        console.log("📡 Fetching documents from 'remote_territories'...");
        const snapshot = await collectionRef.get();
        console.log(`Found ${snapshot.size} documents to process.`);

        let batch = db.batch();
        let batchSize = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const lat = data.centerLatitude;
            const lon = data.centerLongitude;

            if (lat !== undefined && lon !== undefined) {
                const geohash = geofire.geohashForLocation([lat, lon]);

                // Only update if geohash is missing or different
                if (data.geohash !== geohash) {
                    batch.update(doc.ref, { geohash });
                    batchSize++;
                    updatedCount++;
                }
            }

            processedCount++;

            // Commit in batches of 400
            if (batchSize >= 400) {
                await batch.commit();
                console.log(`✅ Committed batch. Processed: ${processedCount}, Updated: ${updatedCount}`);
                batch = db.batch();
                batchSize = 0;
            }
        }

        // Commit remaining
        if (batchSize > 0) {
            await batch.commit();
            console.log(`✅ Committed final batch. Processed: ${processedCount}, Updated: ${updatedCount}`);
        }

        console.log("🏁 Migration complete!");
    } catch (error) {
        console.error("❌ Migration failed:", error);
    }
}

// Check if running as a script
if (require.main === module) {
    const databaseId = process.argv[2] || 'adventure-streak-pre';
    migrateGeohash(databaseId).catch(console.error);
}

export { migrateGeohash };
