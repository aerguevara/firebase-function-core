import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function verifyDates() {
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

    alert("🚀 Verifying dates...");

    // 1. Specific Activity
    const activityId = "AB1E9C16-8767-416D-A7F3-061CE84E568B";
    const doc = await db.collection("activities").doc(activityId).get();
    if (doc.exists) {
        const endDate = doc.data()?.endDate;
        const endDateObj = endDate.toDate();
        console.log(`Activity ${activityId}:`);
        console.log(`- endDate (Raw): ${JSON.stringify(endDate)}`);
        console.log(`- endDate (JS): ${endDateObj.toISOString()}`);
        console.log(`- cutOffDate (JS): ${cutOffDate.toISOString()}`);
        console.log(`- endDate < cutOffDate: ${endDateObj < cutOffDate}`);
        console.log(`- endDate >= cutOffDate: ${endDateObj >= cutOffDate}`);
    } else {
        console.log(`Activity ${activityId} not found in activities.`);
    }

    // 2. Global check for ANY activity < cutOffDate
    const strays = await db.collection("activities").where("endDate", "<", cutOffDate).get();
    console.log(`\nGlobal check: Found ${strays.size} activities < cutOffDate`);
    strays.docs.forEach(d => {
        console.log(`- ${d.id} (${d.data().userId}) - ${d.data().endDate.toDate().toISOString()}`);
    });
}

function alert(msg: string) { console.log(msg); }

verifyDates().catch(console.error);
