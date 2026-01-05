import * as admin from "firebase-admin";

/**
 * Simplified migration script to debug Firestore connection issues.
 */
async function migrateGeohash() {
    console.log("🚀 Starting Geohash migration (DEBUG)...");

    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({
                projectId: "adventure-streak"
            });
        }

        const db = admin.firestore();
        console.log("📡 Attempting to fetch ONE document from 'remote_territories'...");

        const snapshot = await db.collection("remote_territories").limit(1).get();

        if (snapshot.empty) {
            console.log("⚠️ Collection is empty or not accessible.");
        } else {
            console.log(`✅ Success! Found ${snapshot.size} document.`);
            console.log("Document ID:", snapshot.docs[0].id);
        }
    } catch (error: any) {
        console.error("❌ Firestore Error:");
        console.error("Message:", error.message);
        console.error("Code:", error.code);
        if (error.stack) console.error("Stack:", error.stack);
    }
}

migrateGeohash().catch(console.error);
