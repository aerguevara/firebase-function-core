import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";

const serviceAccountPath = path.resolve(__dirname, "../../../../../backend-admin/secrets/serviceAccount.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    databaseURL: "https://adventure-streak.firebaseio.com"
});

const db = getFirestore();
const userId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
const activityId = "EE920140-B2E0-4905-A763-E30DF6ECF38D";

async function verifyActivityIntegrity() {
    console.log(`🔍 Final Verification for Activity: ${activityId}`);

    const userRef = db.collection("users").doc(userId);
    const activityRef = db.collection("activities").doc(activityId);

    // 1. Check Activity Document
    const activitySnap = await activityRef.get();
    const actData = activitySnap.data();
    console.log("--- Activity ---");
    console.log(`Status: ${actData?.processingStatus}`);
    console.log(`XP Breakdown: ${JSON.stringify(actData?.xpBreakdown)}`);
    console.log(`Stats: ${JSON.stringify(actData?.territoryStats)}`);

    // 2. Check Feed
    const feedSnap = await db.collection("feed").where("activityId", "==", activityId).get();
    console.log("\n--- Feed ---");
    console.log(`Count: ${feedSnap.size}`);
    feedSnap.docs.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id} | Type: ${data.type} | XP: ${data.xpEarned} | NewZones: ${data.activityData?.newZonesCount}`);
    });

    // 3. Check User Stats
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    console.log("\n--- User Profile ---");
    console.log(`Total XP: ${userData?.xp}`);
    console.log(`Badges: ${JSON.stringify(userData?.badges)}`);

    // 4. Detailed Badge check (Notifications)
    const achSnap = await db.collection("notifications")
        .where("recipientId", "==", userId)
        .where("type", "==", "achievement")
        .get();
    console.log("\n--- Achievement Notifications ---");
    achSnap.docs.forEach(doc => {
        console.log(`ID: ${doc.id} | Badge: ${doc.data().badgeId} | Msg: ${doc.data().message}`);
    });

    console.log("\n✅ Verification finished.");
}

verifyActivityIntegrity().catch(console.error);
