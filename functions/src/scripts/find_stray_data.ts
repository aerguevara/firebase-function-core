import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function findStray() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";
    const userId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    const cutOffDate = new Date("2025-12-01T00:00:00Z");

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);

    console.log(`🔍 Searching for stray data for ${userId} before Dec 1st...`);

    // 1. Activities
    const allActivities = await db.collection("activities")
        .where("userId", "==", userId)
        .get();

    const strayActivities = allActivities.docs.filter(doc => {
        const date = doc.data().endDate;
        return date && (date.toDate ? date.toDate() : new Date(date)) < cutOffDate;
    });

    console.log(`Activities found pre-Dec 1st: ${strayActivities.length}`);
    strayActivities.forEach(doc => {
        console.log(`- Activity ID: ${doc.id}, Date: ${doc.data().endDate.toDate().toISOString()}`);
    });

    // 2. Feed
    const allFeed = await db.collection("feed")
        .where("userId", "==", userId)
        .get();

    const strayFeed = allFeed.docs.filter(doc => {
        const date = doc.data().date;
        return date && (date.toDate ? date.toDate() : new Date(date)) < cutOffDate;
    });

    console.log(`Feed items found pre-Dec 1st: ${strayFeed.length}`);
    strayFeed.forEach(doc => {
        console.log(`- Feed ID: ${doc.id}, Date: ${doc.data().date.toDate().toISOString()}, activityId: ${doc.data().activityId}`);
    });
}

findStray().catch(console.error);
