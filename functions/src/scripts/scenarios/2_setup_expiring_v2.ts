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

    // Create Expiring Soon Territory (2 hours remaining)
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const lat = 40.416; // Sol/Center
    const lon = -3.703;

    const docRef = db.collection("remote_territories").doc("scenario_expiring_soon_v2");

    await docRef.set({
        id: "scenario_expiring_soon_v2",
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
        lastConqueredAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)),
        isHotSpot: false,
        activityId: "SCENARIO_SETUP_UNIQUE_2" // Unique ID
    });

    console.log("✅ SCENARIO 2 (V2): Expiring Soon created.");
    console.log("   - ID: scenario_expiring_soon_v2");
    console.log("   - Expires in: 2 hours");
}

setup().catch(console.error);
