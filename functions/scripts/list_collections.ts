// @ts-nocheck
import * as admin from "firebase-admin";
const serviceAccount = require("../../../../Docs/serviceAccount.json");

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function listCollections() {
    console.log("🔍 Listing Root Collections...");
    const collections = await db.listCollections();
    for (const collection of collections) {
        console.log(`- ${collection.id}`);
    }
}

listCollections().catch(console.error);
