import * as admin from 'firebase-admin';
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from 'fs';

// Requisitos de Inicialización segun @[/guidelines]
const serviceAccountPath = '/Users/aerguevara/Documents/develop/Adventure Streak/backend-admin/secrets/serviceAccount.json';

if (admin.apps.length === 0) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: "adventure-streak"
    });
}

const db = getFirestore("adventure-streak-pre");

async function checkSeasonStatus() {
    console.log("🔍 Checking Season Status in PRE...");

    // 1. Check Global Config
    const configSnap = await db.collection("config").doc("gameplay").get();
    const configData = configSnap.data();
    const currentSeasonId = configData?.currentSeasonId;

    console.log("\n--- GLOBAL CONFIG ---");
    console.log(`Current Season ID (Server): ${currentSeasonId}`);
    console.log(`Current Season Name: ${configData?.currentSeasonName}`);

    if (configData?.lastResetAt) {
        // Handle both admin.firestore.Timestamp and other formats
        const lastReset = (configData.lastResetAt as any).toDate ? (configData.lastResetAt as any).toDate() : new Date(configData.lastResetAt);
        console.log(`Last Reset At: ${lastReset.toISOString()}`);
    }

    // 2. Check Users
    console.log("\n--- USERS ACKNOWLEDGMENT STATUS ---");
    const usersSnap = await db.collection("users").get();

    usersSnap.forEach((doc: any) => {
        const userData = doc.data();
        const lastAck = userData.lastAcknowledgeSeasonId;
        const shouldShowModal = lastAck !== currentSeasonId;

        console.log(`User: ${userData.displayName || doc.id}`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Last Acknowledge Season: ${lastAck || "NULL"}`);
        console.log(`   XP: ${userData.xp || 0}`);
        console.log(`   Total Cells: ${userData.totalCellsOwned || 0}`);
        console.log(`   >>> SHOULD SHOW MODAL? ${shouldShowModal ? "✅ YES" : "❌ NO"}`);
        console.log("-----------------------------------");
    });

    console.log("\n🏁 End of Status Check.");
}

checkSeasonStatus().catch(console.error);
