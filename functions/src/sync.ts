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
const CROSSOVER_SRC_UID = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
const CROSSOVER_DEST_UID = "DQN1tyypsEZouksWzmFeSIYip7b2";

export const dailyUserSync = onSchedule("0 0 * * *", async (event) => {
    console.log("🚀 Starting daily PROD -> PRE sync...");

    const dbProd = getFirestore();
    const dbPre = getFirestore(DEST_DATABASE);

    try {
        // Enable Silent Mode in PRE
        await dbPre.collection("config").doc("maintenance").set({ silentMode: true }, { merge: true });

        // Get target crossover user profile for feed updates
        const crossoverDestDoc = await dbPre.collection("users").doc(CROSSOVER_DEST_UID).get();
        const crossoverDestData = crossoverDestDoc.data();
        const crossoverDestName = crossoverDestData?.displayName || "Usuario simulador iOS";
        const crossoverDestAvatar = crossoverDestData?.avatarURL || null;

        const collectionsToSync = ["users", "activities", "feed", "remote_territories"];

        for (const colName of collectionsToSync) {
            console.log(`📦 Syncing collection: ${colName}...`);
            const snapshot = await dbProd.collection(colName).get();

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let targetId = doc.id;
                let targetData = { ...data };

                // Handle Crossover Case
                if (colName === "users" && doc.id === CROSSOVER_SRC_UID) {
                    targetId = CROSSOVER_DEST_UID;
                    // Preserve some local PRE fields for the simulator user if needed
                    // For now, we overwrite stats as requested
                } else if (data.userId === CROSSOVER_SRC_UID) {
                    targetData.userId = CROSSOVER_DEST_UID;
                    if (colName === "feed") {
                        targetData.relatedUserName = crossoverDestName;
                        targetData.userAvatarURL = crossoverDestAvatar;
                    }
                } else if (data.ownerId === CROSSOVER_SRC_UID) { // in remote_territories it might be ownerId in some versions, but check index showed userId
                    targetData.userId = CROSSOVER_DEST_UID;
                }

                // If it's a "users" doc sync and NOT the crossover, we sync directly.
                // If it IS the crossover, we update DQN... with CVZ...'s stats.

                await dbPre.collection(colName).doc(targetId).set(targetData, { merge: true });

                // Copy subcollections for activities
                if (colName === "activities") {
                    await copySubcollections(doc.ref, dbPre.collection(colName).doc(targetId));
                }
            }
        }

        console.log("🏁 Daily Sync Complete.");
    } catch (error) {
        console.error("❌ Daily Sync failed:", error);
    } finally {
        await dbPre.collection("config").doc("maintenance").set({ silentMode: false }, { merge: true });
    }
});

async function copySubcollections(srcRef: admin.firestore.DocumentReference, destRef: admin.firestore.DocumentReference) {
    const subCollections = await srcRef.listCollections();
    for (const subCol of subCollections) {
        const snapshot = await subCol.get();
        for (const doc of snapshot.docs) {
            await destRef.collection(subCol.id).doc(doc.id).set(doc.data(), { merge: true });
        }
    }
}
