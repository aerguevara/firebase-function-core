import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function setup() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";
    const targetUserId = "DQN1tyypsEZouksWzmFeSIYip7b2";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);

    // Create Expired Territory (Expired 4 hours ago)
    const expiresAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const lat = 40.450;
    const lon = -3.600;

    const docRef = db.collection("remote_territories").doc("scenario_expired_state");

    await docRef.set({
        id: "scenario_expired_state",
        userId: targetUserId,
        centerLatitude: lat,
        centerLongitude: lon,
        boundary: [
            { latitude: lat + 0.001, longitude: lon + 0.001 },
            { latitude: lat - 0.001, longitude: lon + 0.001 },
            { latitude: lat - 0.001, longitude: lon - 0.001 },
            { latitude: lat + 0.001, longitude: lon - 0.001 }
        ],
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        lastConqueredAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 - 4 * 3600 * 1000)),
        isHotSpot: false,
        activityId: "SCENARIO_SETUP"
    });

    console.log("✅ SCENARIO 4: Expired State created.");
    console.log("   - ID: scenario_expired_state");
    console.log("   - Expired: 4 hours ago");
    console.log("   - Should show 'YA EXPIRADO' in gray in the list.");
}

setup().catch(console.error);
