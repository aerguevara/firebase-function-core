import * as admin from 'firebase-admin';
import * as path from 'path';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        projectId: "adventure-streak"
    });
}

async function run() {
    const db = getFirestore("adventure-streak-pre");
    const anyeloId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    const albanysId = "JaSFY1oPRUfJmuIgFf1LUzl6yOp2";
    const activityId = "A09BB1FD-C143-44EF-8C1C-B9BE9B23ECD5";

    const vengeanceCells = ["-1836_20192", "-1837_20192"];

    console.log("🧐 Step 1: Reseting User stats in PRE for clean test...");
    await db.collection("users").doc(anyeloId).update({
        totalStolenTerritories: 0,
        xp: 1500 // Reset to a baseline
    });

    console.log("🛠️ Step 2: Setting up Vengeance Targets in PRE...");
    const batch = db.batch();
    for (const cellId of vengeanceCells) {
        // Albanys owns them
        batch.set(db.collection("remote_territories").doc(cellId), {
            userId: albanysId,
            id: cellId,
            centerLatitude: 40, // doesn't matter much for stats
            centerLongitude: -3,
            lastConqueredAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-09T10:00:00Z")),
            expiresAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-16T10:00:00Z")),
            activityId: "EXTERNAL_ACTIVITY"
        });

        // Anyelo has them as targets
        batch.set(db.collection("users").doc(anyeloId).collection("vengeance_targets").doc(cellId), {
            cellId: cellId,
            thiefId: albanysId,
            stolenAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-09T10:00:00Z")),
            expiresAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-16T10:00:00Z")),
            xpReward: 25
        });
    }
    await batch.commit();

    console.log("🔄 Step 3: Triggering reprocessing for activity...");
    // Force reset everything for the activity
    await db.collection("activities").doc(activityId).update({
        processingStatus: "pending",
        lastUpdatedAt: FieldValue.serverTimestamp(),
        conqueredVictims: FieldValue.delete(),
        territoryStats: FieldValue.delete(),
        xpBreakdown: FieldValue.delete(),
        missions: FieldValue.delete()
    });

    // Clean territories subcollection
    const territoriesSnapshot = await db.collection("activities").doc(activityId).collection("territories").get();
    const cleanBatch = db.batch();
    territoriesSnapshot.docs.forEach(doc => cleanBatch.delete(doc.ref));
    await cleanBatch.commit();

    console.log("⏳ Step 4: Waiting for processing completion (approx 10s)...");
    let completed = false;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const snap = await db.collection("activities").doc(activityId).get();
        if (snap.data()?.processingStatus === "completed") {
            completed = true;
            break;
        }
    }

    if (completed) {
        console.log("✅ Activity processed! Fetching results...");
        const userSnap = await db.collection("users").doc(anyeloId).get();
        const userData = userSnap.data();
        const activitySnap = await db.collection("activities").doc(activityId).get();
        const activityData = activitySnap.data();

        console.log("\n--- TEST RESULTS ---");
        console.log(`User Stolen Territories: ${userData?.totalStolenTerritories}`);
        console.log(`Activity Vengeance Count: ${activityData?.territoryStats?.vengeanceCellsCount}`);
        console.log(`Activity Stolen Count: ${activityData?.territoryStats?.stolenCellsCount}`);
        console.log("---------------------\n");

        if (userData?.totalStolenTerritories === 2) {
            console.log("✨ SUCCESS: Vengeance cells are correctly counted as stolen territories!");
        } else {
            console.log("❌ FAILURE: Stats did not match expected values.");
        }
    } else {
        console.log("❌ Timeout waiting for activity processing.");
    }
}

run().catch(console.error);
