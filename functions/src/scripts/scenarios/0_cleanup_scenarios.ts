import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function cleanup() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);

    const idsToDelete = [
        "scenario_hotspot_ifema",
        "scenario_expiring_soon",
        "scenario_defense_bonus",
        "scenario_expired_state"
    ];

    const batch = db.batch();

    idsToDelete.forEach(id => { // Corrected: closing parenthesis for forEach
        batch.delete(db.collection("remote_territories").doc(id));
    });

    await batch.commit();
    console.log("🧹 All scenario data cleaned up.");
}

cleanup().catch(console.error);
