import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function cleanupStray() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";
    const cutOffDate = new Date("2025-12-01T00:00:00Z");

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);

    console.log("🧹 Starting DEEP CLEANUP of stray pre-Dec 1st data...");

    // 1. Activities
    const strayActivities = await db.collection("activities").where("endDate", "<", cutOffDate).get();
    console.log(`Found ${strayActivities.size} stray activities.`);
    for (const doc of strayActivities.docs) {
        console.log(`🗑️ Deleting activity ${doc.id}...`);
        await deleteDocDeep(doc.ref);
    }

    // 2. Feed
    const strayFeed = await db.collection("feed").where("date", "<", cutOffDate).get();
    console.log(`Found ${strayFeed.size} stray feed events.`);
    for (const doc of strayFeed.docs) {
        console.log(`🗑️ Deleting feed item ${doc.id}...`);
        await deleteDocDeep(doc.ref);
    }

    console.log("🏁 Cleanup complete.");
}

async function deleteDocDeep(docRef: admin.firestore.DocumentReference) {
    const collections = await docRef.listCollections();
    for (const collection of collections) {
        const docs = await collection.get();
        for (const doc of docs.docs) {
            await deleteDocDeep(doc.ref);
        }
    }
    await docRef.delete();
}

cleanupStray().catch(console.error);
