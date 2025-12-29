import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function verifyFullReset() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";
    const cutOffDate = new Date("2025-12-01T00:00:00Z");
    const userId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);
    console.log("🔍 Running FINAL Verification (PRE)...");

    let errors = 0;

    // 1. Verify No Stray Data
    const strayActivities = await db.collection("activities").where("endDate", "<", cutOffDate).count().get();
    if (strayActivities.data().count > 0) {
        console.error(`❌ Stray Data: Found ${strayActivities.data().count} pre-Dec 1st activities.`);
        errors++;
    } else {
        console.log("✅ No pre-Dec 1st activities found.");
    }

    // 2. Verify Reprocessing Status
    const allUserActivities = await db.collection("activities").where("userId", "==", userId).get();
    const activities = allUserActivities.docs.filter(doc => {
        const d = doc.data();
        const date = d.endDate && (d.endDate.toDate ? d.endDate.toDate() : new Date(d.endDate));
        return date >= cutOffDate;
    });

    let pendingCount = 0;
    let completedCount = 0;
    activities.forEach(doc => {
        if (doc.data().processingStatus === "completed") completedCount++;
        else pendingCount++;
    });
    console.log(`📊 Activities: ${completedCount} completed, ${pendingCount} pending/failed.`);
    if (pendingCount > 0) {
        console.warn("⚠️ Some activities did not complete processing.");
        errors++; // Warning
    }

    // 3. Verify User Stats (Should NOT be zero if reprocessing worked)
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    if (userData) {
        console.log(`👤 User Stats: Level ${userData.level}, XP ${userData.xp}`);
        console.log(`   Territories: ${userData.totalConqueredTerritories} Conquered, ${userData.totalCellsOwned} Owned`);

        if (userData.xp === 0 || userData.level === 1) {
            console.error("❌ User stats are still zero! Reprocessing might have failed to update profile.");
            errors++;
        } else {
            console.log("✅ User stats successfully rebuilt.");
        }
    } else {
        console.error("❌ User document not found.");
        errors++;
    }

    // 4. Verify Feed and Notifications
    const feedCount = await db.collection("feed").where("userId", "==", userId).count().get();
    const notifCount = await db.collection("notifications").where("recipientId", "==", userId).count().get();

    console.log(`📝 Feed Items: ${feedCount.data().count}`);
    console.log(`🔔 Notifications: ${notifCount.data().count}`);

    if (feedCount.data().count === 0) {
        console.warn("⚠️ Feed is empty for this user.");
        errors++;
    }

    // 5. Verify Silent Mode is OFF
    const config = await db.collection("config").doc("maintenance").get();
    if (config.exists && config.data()?.silentMode === true) {
        console.error("❌ Silent Mode is still ACTIVE.");
        errors++;
    } else {
        console.log("✅ Silent Mode is OFF.");
    }

    if (errors === 0) {
        console.log("\n✨ FULL RESET VERIFICATION PASSED PERFECTLY.");
        process.exit(0);
    } else {
        console.log(`\n⚠️ Verification finished with ${errors} issues.`);
        process.exit(1);
    }
}

verifyFullReset().catch(console.error);
