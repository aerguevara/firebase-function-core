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

export const dailyUserSync = onSchedule("0 0 * * *", async (event) => {
    console.log("🚀 Starting daily PROD -> PRE synchronization...");

    const dbProd = getFirestore();
    const dbPre = getFirestore(DEST_DATABASE);

    try {
        // 1. Enable Silent Mode in PRE to avoid notification leaks
        console.log("🔧 Enabling Silent Mode in PRE...");
        await dbPre.collection("config").doc("maintenance").set({ silentMode: true }, { merge: true });

        const collections = await dbProd.listCollections();

        // 2. Clear PRE collections before sync (Nuclear Reset)
        console.log("🧹 Clearing collections in PRE environment...");
        for (const colRef of collections) {
            console.log(`   Cleaning collection: ${colRef.id}...`);
            await dbPre.recursiveDelete(colRef);
        }

        // 3. Sync collections from PROD to PRE in parallel
        console.log("📦 Starting parallel synchronization from PROD...");
        for (const colRef of collections) {
            const colName = colRef.id;
            console.log(`   Syncing ${colName}...`);
            const snapshot = await colRef.get();

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
        // Ensure Silent Mode is disabled
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

    // Special handling for crossover user
    let targetData = { ...data };

    if (doc.ref.path === `users/${ADMIN_UID}`) {
        await targetDb.doc(`users/${CROSSOVER_DEST_UID}`).set(targetData, { merge: true });
    }

    await targetDb.doc(doc.ref.path).set(targetData);

    // List all sub-collections
    const subCollections = await doc.ref.listCollections();

    // Copy subcollections recursively
    await runInParallel(subCollections, async (subCol) => {
        const subSnapshot = await subCol.get();
        if (subSnapshot.empty) return;

        // For each document in the subcollection, recurse
        await runInParallel(subSnapshot.docs, async (subDoc) => {
            await copyDocRecursive(subDoc, targetDb);
        });
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
