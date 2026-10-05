import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getFirestore, BulkWriter } from "firebase-admin/firestore";

/**
 * Scheduled function to sync data from PROD (default) to PRE (adventure-streak-pre)
 * every day at 00:00.
 * 
 * Performance Optimizations:
 * 1. BulkWriter: Max throughput for writes.
 * 2. Streaming: Low memory footprint for reading large collections.
 * 3. 2GiB RAM / 540s timeout: Support large database migrations.
 */

const DEST_DATABASE = "adventure-streak-pre";
const ADMIN_UID = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
const CROSSOVER_DEST_UID = "DQN1tyypsEZouksWzmFeSIYip7b2";

// Top-level collections to synchronize from PROD to PRE
const COLLECTIONS_TO_SYNC = [
    "activities",
    "activity_reaction_stats",
    "activity_reactions",
    "config",
    "feed",
    "fraud_detections",
    "global_invitations",
    "incidents",
    "invitations",
    "notifications",
    "remote_territories",
    "reserved_icons",
    "users"
];

export const dailyUserSync = onSchedule({
    schedule: "0 0 * * *",
    memory: "2GiB",
    timeoutSeconds: 540,
    retryCount: 0
}, async (event) => {
    console.log("🚀 Starting Optimized PROD -> PRE synchronization...");

    const dbProd = getFirestore();
    const dbPre = getFirestore(DEST_DATABASE);
    const writer = dbPre.bulkWriter();

    // Configure BulkWriter to handle logging/errors
    writer.onWriteError((error) => {
        console.error(`❌ BulkWriter error: ${error.message} at ${error.documentRef.path}`);
        return false; // Do not retry
    });

    try {
        // 1. Enable Silent Mode in PRE
        console.log("🔧 Enabling Silent Mode in PRE...");
        await dbPre.collection("config").doc("maintenance").set({ silentMode: true }, { merge: true });

        // 2. Clear PRE collections before sync (Nuclear Reset)
        console.log("🧹 Clearing collections in PRE environment...");
        for (const colId of COLLECTIONS_TO_SYNC) {
            console.log(`   Cleaning collection: ${colId}...`);
            const colRef = dbPre.collection(colId);
            await dbPre.recursiveDelete(colRef);
        }

        // 3. Sync collections from PROD to PRE
        for (const colId of COLLECTIONS_TO_SYNC) {
            console.log(`📦 Syncing ${colId}...`);
            let count = 0;
            
            await new Promise((resolve, reject) => {
                const stream = dbProd.collection(colId).stream();
                
                stream.on("data", async (doc) => {
                    count++;
                    if (count % 500 === 0) console.log(`   Processed ${count} docs in ${colId}...`);
                    
                    // Process document and its subcollections recursively
                    await syncDocumentRecursive(doc, dbPre, writer);
                });

                stream.on("end", resolve);
                stream.on("error", reject);
            });

            console.log(`   ✅ Finished ${colId}. Total: ${count} docs.`);
        }

        await writer.close();
        console.log("🏁 Daily Sync Complete.");
    } catch (error) {
        console.error("❌ Daily Sync failed:", error);
        await writer.close();
    } finally {
        // Ensure Silent Mode is disabled
        console.log("🔧 Disabling Silent Mode in PRE...");
        await dbPre.collection("config").doc("maintenance").set({ silentMode: false }, { merge: true });
    }
});

async function syncDocumentRecursive(
    doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot, 
    targetDb: admin.firestore.Firestore, 
    writer: BulkWriter
) {
    const data = doc.data();
    if (!data) return;

    // SKIP syncing 'config/maintenance' to preserve Silent Mode control
    if (doc.ref.path.endsWith("config/maintenance")) return;

    // SECURITY: Strip FCM tokens from all users except Admin
    let processedData = { ...data };
    if (doc.ref.path.startsWith("users/") && doc.ref.path.split("/").length === 2) {
        if (doc.id !== ADMIN_UID) {
            const sensitiveFields = [
                "fcmToken", "apnsToken", "fcmTokens", "apnsTokens",
                "fcmTokenUpdatedAt", "needsTokenRefresh"
            ];
            sensitiveFields.forEach(field => {
                if (processedData[field]) delete processedData[field];
            });
        }
    }

    // Special handling for crossover user
    if (doc.ref.path === `users/${ADMIN_UID}`) {
        writer.set(targetDb.doc(`users/${CROSSOVER_DEST_UID}`), processedData);
    }

    // Write the document to PRE
    writer.set(targetDb.doc(doc.ref.path), processedData);

    // Optimized Subcollection Handling
    // Known subcollections that are heavy or critical
    const path = doc.ref.path;
    const subColIds: string[] = [];

    if (path.startsWith("activities/")) {
        subColIds.push("routes");
    } else if (path.startsWith("users/")) {
        // Only get common subcollections for users to avoid slow listCollections()
        subColIds.push("badges", "notifications", "feed", "territories");
    }

    // If we have known subcollections, sync them
    for (const subId of subColIds) {
        const subSnapshot = await doc.ref.collection(subId).get();
        for (const subDoc of subSnapshot.docs) {
            await syncDocumentRecursive(subDoc, targetDb, writer);
        }
    }
}
