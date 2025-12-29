import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * RESET DEC 2025 SCRIPT
 * 
 * PHASES:
 * 1. Migration & Archive: Move pre-Dec 1st data to _archive collections.
 * 2. Total Cleanup: Clear territories, feed, notifications, reactions.
 * 3. User Reset: Initial stats (Level 1, 0 XP, etc.)
 * 4. Reprocessing: Re-trigger activity processing sequentially for post-Dec 1st data.
 */

async function main() {
    const phaseArg = process.argv[2];
    const targetPhase = phaseArg ? parseInt(phaseArg) : null;

    console.log(`🔥 Starting RESET DEC 2025 (on PRE) - ${targetPhase ? `Phase ${targetPhase}` : 'ALL PHASES'}...`);

    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre"; // FOR TESTING

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);
    const cutOffDate = new Date("2025-12-01T00:00:00Z");

    try {
        // ALWAYS enable Silent Mode at the start for safety
        await setSilentMode(db, true);

        if (!targetPhase || targetPhase === 1) {
            await phase1Archive(db, cutOffDate);
        }

        if (!targetPhase || targetPhase === 2) {
            await phase2Cleanup(db);
        }

        if (!targetPhase || targetPhase === 3) {
            await phase3UserReset(db);
        }

        if (!targetPhase || targetPhase === 4) {
            await phase4Reprocess(db, cutOffDate);
            await setSilentMode(db, false);
        }

        console.log(`🏁 RESET DEC 2025 - ${targetPhase ? `PHASE ${targetPhase}` : 'ALL PHASES'} COMPLETE.`);
    } catch (err) {
        console.error("❌ Reset failed:", err);
        await setSilentMode(db, false);
        process.exit(1);
    }
}

async function setSilentMode(db: admin.firestore.Firestore, active: boolean) {
    console.log(`🔧 Setting Silent Mode to ${active}...`);
    await db.collection("config").doc("maintenance").set({ silentMode: active }, { merge: true });
}

async function phase1Archive(db: admin.firestore.Firestore, cutOffDate: Date) {
    console.log("📁 Phase 1: Archiving pre-Dec 1st data...");

    // 1. Activities
    console.log("   Archiving activities...");
    const activities = await db.collection("activities").where("endDate", "<", cutOffDate).get();
    console.log(`      Found ${activities.size} activities to archive.`);
    for (const doc of activities.docs) {
        await copyDocRecursive(doc, db, "activities_archive");
        await deleteDocRecursive(doc.ref);
    }

    // 2. Feed
    console.log("   Archiving feed events...");
    const feed = await db.collection("feed").where("date", "<", cutOffDate).get();
    console.log(`      Found ${feed.size} feed events to archive.`);
    for (const doc of feed.docs) {
        await db.collection("feed_archive").doc(doc.id).set(doc.data());
        await doc.ref.delete();
    }

    // 3. Notifications
    console.log("   Archiving notifications...");
    const notifications = await db.collection("notifications").where("timestamp", "<", cutOffDate).get();
    console.log(`      Found ${notifications.size} notifications to archive.`);
    for (const doc of notifications.docs) {
        await db.collection("notifications_archive").doc(doc.id).set(doc.data());
        await doc.ref.delete();
    }
}

async function phase2Cleanup(db: admin.firestore.Firestore) {
    console.log("扫 Phase 2: Total Cleanup...");

    const collectionsToClear = [
        "remote_territories",
        "feed",
        "notifications",
        "activity_reactions",
        "activity_reaction_stats"
    ];

    for (const colName of collectionsToClear) {
        console.log(`   Clearing ${colName}...`);
        const snapshot = await db.collection(colName).get();
        console.log(`      Found ${snapshot.size} documents to delete.`);
        for (const doc of snapshot.docs) {
            await deleteDocRecursive(doc.ref);
        }
    }
}

async function phase3UserReset(db: admin.firestore.Firestore) {
    console.log("👤 Phase 3: User Reset (Tabula Rasa)...");
    const users = await db.collection("users").get();
    console.log(`   Resetting ${users.size} users.`);
    for (const doc of users.docs) {
        await doc.ref.update({
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
    }
}

async function phase4Reprocess(db: admin.firestore.Firestore, cutOffDate: Date) {
    console.log("🔄 Phase 4: Reprocessing activities...");

    // 0. Adjust Configuration Dynamically
    await adjustLookbackConfiguration(db, cutOffDate);

    const activities = await db.collection("activities")
        .where("endDate", ">=", cutOffDate)
        .orderBy("endDate", "asc")
        .get();

    console.log(`   Found ${activities.size} activities to reprocess.`);
    for (const doc of activities.docs) {
        const activityId = doc.id;
        const info = doc.data();
        console.log(`   Reprocessing activity: ${activityId} (Date: ${info.endDate?.toDate()?.toISOString() || 'N/A'})...`);

        // 1. Reset activity territories subcollection
        const territories = await doc.ref.collection("territories").get();
        for (const tDoc of territories.docs) {
            await tDoc.ref.delete();
        }

        // 2. Clear computed stats and trigger reprocessing
        await doc.ref.update({
            xpBreakdown: admin.firestore.FieldValue.delete(),
            missions: admin.firestore.FieldValue.delete(),
            territoryStats: admin.firestore.FieldValue.delete(),
            conqueredVictims: admin.firestore.FieldValue.delete(),
            processingStatus: "pending"
        });

        // 3. WAIT for processing (poll every 1s, max 30s)
        await waitForProcessing(doc.ref);

        // 4. Mark generated notifications as read (SILENT MODE)
        await markActivityNotificationsAsRead(db, activityId);
    }
}

async function markActivityNotificationsAsRead(db: admin.firestore.Firestore, activityId: string) {
    const notifications = await db.collection("notifications").where("activityId", "==", activityId).get();
    if (notifications.empty) return;

    console.log(`      🧹 Marking ${notifications.size} notifications as read...`);
    const batch = db.batch();
    notifications.docs.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
    });
    await batch.commit();
}

async function waitForProcessing(docRef: admin.firestore.DocumentReference) {
    const maxAttempts = 90; // Increased to 90s to avoid timeouts on heavy activities
    for (let i = 0; i < maxAttempts; i++) {
        const snap = await docRef.get();
        const status = snap.data()?.processingStatus;
        if (status === "completed") {
            console.log(`      ✓ Completed.`);
            return;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    console.warn(`      ⚠️ Timeout waiting for activity ${docRef.id}`);
}

async function copyDocRecursive(doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot, db: admin.firestore.Firestore, targetCollection: string) {
    const data = doc.data();
    if (!data) return;
    await db.collection(targetCollection).doc(doc.id).set(data);
    const subCols = await doc.ref.listCollections();
    for (const subCol of subCols) {
        const subSnapshot = await subCol.get();
        for (const subDoc of subSnapshot.docs) {
            await db.collection(targetCollection).doc(doc.id).collection(subCol.id).doc(subDoc.id).set(subDoc.data());
        }
    }
}

async function deleteDocRecursive(docRef: admin.firestore.DocumentReference) {
    const subCols = await docRef.listCollections();
    for (const subCol of subCols) {
        const subSnapshot = await subCol.get();
        for (const subDoc of subSnapshot.docs) {
            await deleteDocRecursive(subDoc.ref);
        }
    }
    await docRef.delete();
}


async function adjustLookbackConfiguration(db: admin.firestore.Firestore, cutOffDate: Date) {
    console.log("   ⚙️ Adjusting 'workoutLookbackDays' configuration...");
    const now = new Date();

    // Calculate days difference (rounding down to stay strictly within the limit)
    const diffTime = Math.abs(now.getTime() - cutOffDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Safety buffer: Subtract 1 day to be extremely conservative ? 
    // No, exact day difference ensures Today - Diff = Cutoff.
    // Example: Today Dec 29, Cutoff Dec 1. Diff = 28. 29 - 28 = 1. Perfect.

    console.log(`      Current Date: ${now.toISOString().split('T')[0]}`);
    console.log(`      Cutoff Date: ${cutOffDate.toISOString().split('T')[0]}`);
    console.log(`      Calculated Lookback: ${diffDays} days`);

    if (diffDays < 0) {
        console.warn("      ⚠️ Cutoff date is in the future? Skipping adjustment.");
        return;
    }

    await db.collection("config").doc("gameplay").update({
        workoutLookbackDays: diffDays
    });
    console.log(`      ✅ Updated 'workoutLookbackDays' to ${diffDays}.`);
}

main().catch(console.error);
