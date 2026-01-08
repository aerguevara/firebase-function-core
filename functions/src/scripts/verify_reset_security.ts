
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import * as path from "path";

const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');
const databaseId = "adventure-streak-pre";

if (getApps().length === 0) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
        credential: cert(serviceAccount),
        projectId: "adventure-streak"
    });
}

const db = getFirestore(databaseId);

async function verify() {
    console.log("🕵️‍♀️ Verifying Security & Integrity in PRE...");

    // 1. Check Admin User (CVZ...)
    const adminId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    const adminDoc = await db.collection("users").doc(adminId).get();

    if (!adminDoc.exists) {
        console.error("❌ Admin user not found!");
    } else {
        const data = adminDoc.data() || {};
        console.log(`✅ Admin (${adminId}) found.`);
        console.log(`   - FCM Token present? ${data.fcmToken ? "YES ✅" : "NO (Might be correct if not set in PRO)"}`);

        // Check Season History
        const seasonId = "test_reset_v4_2026";
        const history = data.seasonHistory?.[seasonId];
        if (history) {
            console.log(`   - Season History [${seasonId}] found:`);
            console.log(`     - id: ${history.id} ${history.id === seasonId ? "✅" : "❌"}`);
            // Note: Typos in execution command might affect seasonName verification
            console.log(`     - seasonName: ${history.seasonName} ${history.seasonName.includes("Temporada") ? "✅" : "❌"}`);
            console.log(`     - finalCells: ${history.finalCells} ${history.finalCells !== undefined ? "✅" : "❌"}`);
        } else {
            console.error("❌ Season history missing for admin!");
        }
    }

    // 2. Check Generic User (i1CE...)
    const userId = "i1CEf9eU4MhEOabFGrv2ymPSMFH3";
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
        console.error(`❌ User ${userId} not found!`);
    } else {
        const data = userDoc.data() || {};
        console.log(`✅ Generic User (${userId}) found.`);
        console.log(`   - FCM Token present? ${data.fcmToken ? "YES ❌ (FAIL)" : "NO ✅ (SUCCESS)"}`);
        console.log(`   - APNS Token present? ${data.apnsToken ? "YES ❌ (FAIL)" : "NO ✅ (SUCCESS)"}`);
    }
}

verify().catch(console.error);
