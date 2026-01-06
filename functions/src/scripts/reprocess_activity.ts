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
    const activityId = "EE920140-B2E0-4905-A763-E30DF6ECF38D";
    const db = getFirestore("(default)");

    console.log(`🚀 Starting robust re-processing for activity: ${activityId}`);

    const activityRef = db.collection("activities").doc(activityId);
    const activityDoc = await activityRef.get();

    if (!activityDoc.exists) {
        console.error("❌ Activity not found!");
        return;
    }

    const activityData = activityDoc.data()!;
    const userId = activityData.userId;
    const xpToSubtract = activityData.xpBreakdown?.total || 0;
    const distanceToSubtract = (activityData.distanceMeters || 0) / 1000.0;
    const stats = activityData.territoryStats || {};

    console.log(`👤 User: ${userId}`);
    console.log(`📉 Reverting - XP: ${xpToSubtract}, Distance: ${distanceToSubtract}km`);

    const userRef = db.collection("users").doc(userId);

    // Undo previous increments
    const userUpdate: any = {
        xp: FieldValue.increment(-xpToSubtract),
        totalActivities: FieldValue.increment(-1),
        currentWeekDistanceKm: FieldValue.increment(-distanceToSubtract),
        totalDistanceKm: FieldValue.increment(-distanceToSubtract),
        totalConqueredTerritories: FieldValue.increment(-(stats.newCellsCount || 0)),
        totalStolenTerritories: FieldValue.increment(-(stats.stolenCellsCount || 0)),
        totalDefendedTerritories: FieldValue.increment(-(stats.defendedCellsCount || 0)),
        totalRecapturedTerritories: FieldValue.increment(-(stats.recapturedCellsCount || 0)),
        lastUpdated: FieldValue.serverTimestamp()
    };

    await userRef.update(userUpdate);
    console.log("✅ User stats reverted.");

    // Reset activity to pending
    await activityRef.update({
        processingStatus: "pending",
        lastUpdatedAt: FieldValue.serverTimestamp(),
        // Clear previous results to avoid confusion
        conqueredVictims: FieldValue.delete(),
        territoryStats: FieldValue.delete(),
        xpBreakdown: FieldValue.delete(),
        missions: FieldValue.delete()
    });

    console.log("✅ Activity status set to 'pending'. Function will re-process it correctly now.");
}

run().catch(console.error);
