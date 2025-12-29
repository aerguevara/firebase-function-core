import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function fixUser() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";
    const userId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    const cutOffDate = new Date("2025-12-01T00:00:00Z");

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);

    console.log(`🛠️ Fixing user ${userId} in PRE...`);

    // 1. Reset user doc (Tabula Rasa)
    await db.collection("users").doc(userId).update({
        xp: 0,
        level: 1,
        totalConqueredTerritories: 0,
        totalStolenTerritories: 0,
        totalDefendedTerritories: 0,
        totalRecapturedTerritories: 0,
        totalCellsOwned: 0,
        recentTerritories: 0,
        currentWeekDistanceKm: 0,
        bestWeeklyDistanceKm: 0,
        currentStreakWeeks: 0,
        prestige: 0,
        hasAcknowledgedDecReset: false,
        recentTheftVictims: [],
        recentThieves: [],
        lastActivityDate: admin.firestore.FieldValue.delete()
    });
    console.log("✅ User profile reset to zero.");

    // 2. Identify post-Dec 1st activities for THIS user
    const allActivities = await db.collection("activities")
        .where("userId", "==", userId)
        .get();

    const activitiesToProcess = allActivities.docs
        .filter(doc => {
            const date = doc.data().endDate;
            const endDateObj = date.toDate ? date.toDate() : new Date(date);
            return endDateObj >= cutOffDate;
        })
        .sort((a, b) => {
            const dateA = a.data().endDate.toDate ? a.data().endDate.toDate() : new Date(a.data().endDate);
            const dateB = b.data().endDate.toDate ? b.data().endDate.toDate() : new Date(b.data().endDate);
            return dateA.getTime() - dateB.getTime();
        });

    console.log(`🔄 Found ${activitiesToProcess.length} activities to reprocess for ${userId}.`);

    // 3. Sequential Reprocessing
    for (const doc of activitiesToProcess) {
        const activityId = doc.id;
        console.log(`   Reprocessing ${activityId} (${doc.data().endDate.toDate().toISOString()})...`);

        // Clear subcollection
        const territories = await doc.ref.collection("territories").get();
        for (const tDoc of territories.docs) {
            await tDoc.ref.delete();
        }

        // Trigger
        await doc.ref.update({
            xpBreakdown: admin.firestore.FieldValue.delete(),
            missions: admin.firestore.FieldValue.delete(),
            territoryStats: admin.firestore.FieldValue.delete(),
            conqueredVictims: admin.firestore.FieldValue.delete(),
            processingStatus: "pending"
        });

        // Wait
        await waitForProcessing(doc.ref);

        // Mark as read
        await markNotificationsAsRead(db, activityId);
    }

    console.log("🏁 User reprocessing complete.");

    // Final Stats check
    const finalDoc = await db.collection("users").doc(userId).get();
    const fd = finalDoc.data() || {};
    console.log(`\nFinal Stats for ${userId}:`);
    console.log(`- Level: ${fd.level}, XP: ${fd.xp}`);
    console.log(`- Territories Conquered: ${fd.totalConqueredTerritories}`);
    console.log(`- Last Activity Date: ${fd.lastActivityDate?.toDate()?.toISOString() || 'N/A'}`);
}

async function waitForProcessing(docRef: admin.firestore.DocumentReference) {
    for (let i = 0; i < 45; i++) {
        const snap = await docRef.get();
        if (snap.data()?.processingStatus === "completed") {
            console.log(`      ✓ Completed.`);
            return;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    console.warn(`      ⚠️ Timeout waiting for activity ${docRef.id}`);
}

async function markNotificationsAsRead(db: admin.firestore.Firestore, activityId: string) {
    const notifications = await db.collection("notifications").where("activityId", "==", activityId).get();
    if (notifications.empty) return;
    const batch = db.batch();
    notifications.docs.forEach(doc => batch.update(doc.ref, { isRead: true }));
    await batch.commit();
}

fixUser().catch(console.error);
