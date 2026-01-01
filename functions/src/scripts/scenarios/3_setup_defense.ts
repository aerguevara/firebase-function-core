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

    // Create Standard Territory for Defense
    // Set expiry to 4 days (not alert) but available for defense
    const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const lat = 40.430;
    const lon = -3.690;

    const docRef = db.collection("remote_territories").doc("scenario_defense_bonus");

    await docRef.set({
        id: "scenario_defense_bonus",
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
        lastConqueredAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)),
        isHotSpot: false,
        activityId: "SCENARIO_SETUP"
    });

    console.log("✅ SCENARIO 3: Territory ready for Defense Bonus check.");
    console.log("   - ID: scenario_defense_bonus");
    console.log("   - Expires in: 4 days");
    console.log("   - Go run here to verify +2 XP logic.");
}

setup().catch(console.error);
