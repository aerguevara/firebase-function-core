import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function check() {
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

    const activities = await db.collection("activities").where("endDate", "<", cutOffDate).get();
    console.log(`Found ${activities.size} activities BEFORE Dec 1st in PRE.`);

    for (const doc of activities.docs) {
        const data = doc.data();
        console.log(`- ID: ${doc.id}, Date: ${data.endDate.toDate().toISOString()}, User: ${data.userId}`);
    }

    const archived = await db.collection("activities_archive").get();
    console.log(`Found ${archived.size} activities in ARCHIVE.`);
}

check().catch(console.error);
