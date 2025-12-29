import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function verifyPhase2() {
    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";
    const databaseId = "adventure-streak-pre";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore(databaseId);
    console.log("🔍 Verifying Phase 2 Cleanup (PRE)...");

    const collections = [
        "remote_territories",
        "feed",
        "notifications",
        "activity_reactions",
        "activity_reaction_stats"
    ];

    let allEmpty = true;

    for (const col of collections) {
        const snap = await db.collection(col).limit(10).get();
        if (!snap.empty) {
            console.error(`❌ Collection '${col}' is NOT empty. Found ${snap.size}+ documents.`);
            allEmpty = false;
        } else {
            console.log(`✅ Collection '${col}' is empty.`);
        }
    }

    if (allEmpty) {
        console.log("✨ Phase 2 Verification PASSED.");
        process.exit(0);
    } else {
        console.error("🛑 Phase 2 Verification FAILED.");
        process.exit(1);
    }
}

verifyPhase2().catch(console.error);
