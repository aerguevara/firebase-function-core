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

    // IFEMA Coordinates
    const lat = 40.466;
    const lon = -3.614;

    // Create Hot Spot Territory
    // We make it expiring in 23 hours so it shows up in "Alert" list as well, 
    // to verify the "Flame" icon appears in the widget.
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);

    const docRef = db.collection("remote_territories").doc("scenario_hotspot_ifema");

    await docRef.set({
        id: "scenario_hotspot_ifema",
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
        lastConqueredAt: admin.firestore.Timestamp.now(),
        isHotSpot: true, // CRITICAL
        activityId: "SCENARIO_SETUP"
    });

    console.log("✅ SCENARIO 1: Hot Spot created at IFEMA (40.466, -3.614).");
    console.log("   - ID: scenario_hotspot_ifema");
    console.log("   - Expires in: 23 hours (Should appear in Alert list)");
    console.log("   - isHotSpot: true");
}

setup().catch(console.error);
