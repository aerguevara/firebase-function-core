import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function verifyQuery() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);
    const cutOffDate = new Date("2025-12-01T00:00:00Z");

    const activities = await db.collection("activities")
        .where("endDate", ">=", cutOffDate)
        .orderBy("endDate", "asc")
        .get();

    console.log(`Phase 4 would find ${activities.size} activities.`);

    let foundOld = 0;
    for (const doc of activities.docs) {
        const date = doc.data().endDate.toDate();
        if (date < cutOffDate) {
            console.log(`⚠️  FOUND OLD ACTIVITY IN PHASE 4 QUERY! ID: ${doc.id}, Date: ${date.toISOString()}`);
            foundOld++;
        }
    }
    console.log(`Total old activities found in Phase 4 query: ${foundOld}`);
}

verifyQuery().catch(console.error);
