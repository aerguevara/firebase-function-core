import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Script to migrate user activities and data in PRE environment.
 * From: CVZ34x99UuU6fCrOEc8Wg5nPYX82 (Anyelo Reyes)
 * To:   DQN1tyypsEZouksWzmFeSIYip7b2 (Simulator User)
 */

async function migrateUserData() {
    console.log("🚀 Starting User Data Migration...");

    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const srcUserId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    const destUserId = "DQN1tyypsEZouksWzmFeSIYip7b2";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore("adventure-streak-pre");

    try {
        // 1. Enable Silent Mode
        console.log("🔧 Enabling Silent Mode...");
        await db.collection("config").doc("maintenance").set({ silentMode: true }, { merge: true });

        // Get target user profile for feed updates
        const destUserDoc = await db.collection("users").doc(destUserId).get();
        const destUserData = destUserDoc.data();
        if (!destUserData) {
            throw new Error(`Target user ${destUserId} not found`);
        }

        // 2. Migrate Activities
        console.log("📦 Migrating Activities...");
        const activitiesSnapshot = await db.collection("activities")
            .where("userId", "==", srcUserId)
            .get();

        console.log(`   Found ${activitiesSnapshot.size} activities to migrate.`);
        for (const doc of activitiesSnapshot.docs) {
            await doc.ref.update({ userId: destUserId });
        }

        // 3. Migrate Feed Items
        console.log("📦 Migrating Feed Items...");
        const feedSnapshot = await db.collection("feed")
            .where("userId", "==", srcUserId)
            .get();

        console.log(`   Found ${feedSnapshot.size} feed items to migrate.`);
        for (const doc of feedSnapshot.docs) {
            await doc.ref.update({
                userId: destUserId,
                relatedUserName: destUserData.displayName || "Usuario simulador iOS",
                userAvatarURL: destUserData.avatarURL || null
            });
        }

        // 4. Migrate Remote Territories
        console.log("📦 Migrating Remote Territories...");
        const territoriesSnapshot = await db.collection("remote_territories")
            .where("userId", "==", srcUserId)
            .get();

        console.log(`   Found ${territoriesSnapshot.size} territories to migrate.`);
        for (const doc of territoriesSnapshot.docs) {
            await doc.ref.update({ userId: destUserId });
        }

        // 5. Sync User Stats
        console.log("👤 Syncing User Stats...");
        const srcUserDoc = await db.collection("users").doc(srcUserId).get();
        const srcUserData = srcUserDoc.data();

        if (srcUserData) {
            const statsToSync = {
                xp: srcUserData.xp || 0,
                level: srcUserData.level || 1,
                prestige: srcUserData.prestige || 0,
                mapIcon: srcUserData.mapIcon || "🚩",
                totalConqueredTerritories: srcUserData.totalConqueredTerritories || 0,
                totalDefendedTerritories: srcUserData.totalDefendedTerritories || 0,
                totalStolenTerritories: srcUserData.totalStolenTerritories || 0,
                recentTerritories: srcUserData.recentTerritories || 0,
                totalCellsOwned: srcUserData.totalCellsOwned || 0,
                recentTheftVictims: srcUserData.recentTheftVictims || [],
                recentThieves: srcUserData.recentThieves || [],
                lastActivityDate: srcUserData.lastActivityDate || null,
                hasAcknowledgedDecReset: srcUserData.hasAcknowledgedDecReset || false
            };

            await db.collection("users").doc(destUserId).update(statsToSync);
            console.log("   Stats synced successfully.");
        }

        console.log("🏁 Migration Complete.");
    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        console.log("🔧 Disabling Silent Mode...");
        await db.collection("config").doc("maintenance").set({ silentMode: false }, { merge: true });
    }
}

migrateUserData().catch(err => {
    console.error("❌ Script failed:", err);
    process.exit(1);
});
