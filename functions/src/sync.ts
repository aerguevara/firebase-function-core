import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Scheduled function to sync data from PROD (default) to PRE (adventure-streak-pre)
 * every day at 00:00.
 * 
 * Logic:
 * 1. Sync all users from PROD to PRE.
 * 2. Crossover: Sync user CVZ... (PROD) to DQN... (PRE).
 * 3. Sync activities, feed, and territories for all users.
 */

const DEST_DATABASE = "adventure-streak-pre";
const ADMIN_UID = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
const CROSSOVER_DEST_UID = "DQN1tyypsEZouksWzmFeSIYip7b2";
const CONCURRENCY_LIMIT = 50;
const BATCH_SIZE = 500;

export const dailyUserSync = onSchedule("0 0 * * *", async (event) => {
    console.log("🚀 Starting daily PROD -> PRE synchronization...");

    const dbProd = getFirestore();
    const dbPre = getFirestore(DEST_DATABASE);

    try {
        // 1. Enable Silent Mode in PRE to avoid notification leaks
        console.log("🔧 Enabling Silent Mode in PRE...");
        await dbPre.collection("config").doc("maintenance").set({ silentMode: true }, { merge: true });

        const collectionsToSync = [
            "activities", "activity_reaction_stats", "activity_reactions",
            "config", "debug_mock_workouts", "feed", "notifications",
            "remote_territories", "reserved_icons", "users",
            "activities_archive", "feed_archive", "notifications_archive",
            "activity_reactions_archive", "remote_territories_archive"
        ];

        // 2. Clear PRE collections before sync (Nuclear Reset)
        console.log("🧹 Clearing collections in PRE environment...");
        for (const colName of collectionsToSync) {
            console.log(`   Cleaning collection: ${colName}...`);
            await dbPre.recursiveDelete(dbPre.collection(colName));
        }

        // 3. Sync collections from PROD to PRE in parallel
        console.log("📦 Starting parallel synchronization from PROD...");
        for (const colName of collectionsToSync) {
            console.log(`   Syncing ${colName}...`);
            const snapshot = await dbProd.collection(colName).get();

            if (snapshot.empty) continue;

            await runInParallel(snapshot.docs, async (doc) => {
                await copyDocRecursive(doc, dbPre);
            });
            console.log(`   ✅ Finished syncing ${colName}.`);
        }

        console.log("🏁 Daily Sync Complete.");
    } catch (error) {
        console.error("❌ Daily Sync failed:", error);
    } finally {
        // Ensure Silent Mode is disabled unless it was explicitly requested to stay on
        // Actually, for daily sync, we should probably restore it or just turn it off
        // The user emphasized its importance during the sync.
        console.log("🔧 Disabling Silent Mode in PRE...");
        await dbPre.collection("config").doc("maintenance").set({ silentMode: false }, { merge: true });
    }
});

async function copyDocRecursive(doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot, targetDb: admin.firestore.Firestore) {
    const data = doc.data();
    if (!data) return;

    // SKIP syncing 'config/maintenance' to preserve Silent Mode control
    if (doc.ref.path.endsWith("config/maintenance")) return;

    // SECURITY: Strip FCM tokens from all users except Admin
    if (doc.ref.path.startsWith("users/") && doc.ref.path.split("/").length === 2) {
        if (doc.id !== ADMIN_UID) {
            const sensitiveFields = [
                "fcmToken", "apnsToken", "fcmTokens", "apnsTokens",
                "fcmTokenUpdatedAt", "needsTokenRefresh"
            ];
            sensitiveFields.forEach(field => {
                if (data[field]) delete data[field];
            });
        }
    }

    // Special handling for crossover user if needed (mirroring stats from Admin to Simulator user)
    // Note: In a full sync, DQN... might already exist in PROD or be created.
    // The previous logic had specific crossover logic. Keeping it for compatibility.
    let targetPath = doc.ref.path;
    let targetData = { ...data };

    if (doc.ref.path === `users/${ADMIN_UID}`) {
        // We sync Admin to Admin, and ALSO Admin to Simulator User (crossover)
        await targetDb.doc(`users/${CROSSOVER_DEST_UID}`).set(targetData, { merge: true });
    }

    await targetDb.doc(targetPath).set(targetData);

    // Copy subcollections
    const subCollections = await doc.ref.listCollections();
    await runInParallel(subCollections, async (subCol) => {
        const subSnapshot = await subCol.get();
        if (subSnapshot.empty) return;

        const chunks = chunk(subSnapshot.docs, BATCH_SIZE);
        for (const batchDocs of chunks) {
            const batch = targetDb.batch();
            batchDocs.forEach(sd => {
                batch.set(targetDb.doc(sd.ref.path), sd.data());
            });
            await batch.commit();
        }
    });
}

async function runInParallel<T>(items: T[], fn: (item: T) => Promise<void>) {
    const chunks = chunk(items, CONCURRENCY_LIMIT);
    for (const c of chunks) {
        await Promise.all(c.map(fn));
    }
}

function chunk<T>(array: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, i * size + size));
}
