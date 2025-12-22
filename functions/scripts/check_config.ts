// @ts-nocheck
import * as admin from "firebase-admin";
const serviceAccount = require("../../../../Docs/serviceAccount.json");

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkConfig() {
    console.log("🔍 Checking config/gameplay...");
    try {
        const doc = await db.collection("config").doc("gameplay").get();
        if (!doc.exists) {
            console.log("❌ config/gameplay document does NOT exist.");
        } else {
            console.log("✅ config/gameplay exists:");
            console.log(JSON.stringify(doc.data(), null, 2));
        }
    } catch (e) {
        console.error("Error fetching config:", e);
    }
}

checkConfig().catch(console.error);
