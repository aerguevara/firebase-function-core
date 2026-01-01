import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Script for Phase 0: Sync PROD to PRE environment.
 * It copies all documents and subcollections from the '(default)' database
 * to the 'adventure-streak-pre' database instance.
 */

async function syncProdToPre() {
    console.log("🚀 Starting Sync PROD -> PRE...");

    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const dbProd = getFirestore();
    const dbPre = getFirestore("adventure-streak-pre");

    try {
        // ACTIVAR MODO SILENCIOSO ANTES DE EMPEZAR
        await setSilentMode(dbPre, true);

        const collections = [
            "activities",
            "activity_reaction_stats",
            "activity_reactions",
            "config",
            "debug_mock_workouts",
            "feed",
            "notifications",
            "remote_territories",
            "reserved_icons",
            "users"
        ];

        for (const colName of collections) {
            console.log(`📦 Syncing collection: ${colName}...`);

            let lastDoc = null;
            let totalSynced = 0;
            const pageSize = 100;

            while (true) {
                let query = dbProd.collection(colName).limit(pageSize);
                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }

                const snapshot = await query.get();
                if (snapshot.empty) break;

                for (const doc of snapshot.docs) {
                    await copyDocRecursive(doc, dbPre);
                    totalSynced++;
                    lastDoc = doc;
                }
                console.log(`   Progress ${colName}: ${totalSynced} synced...`);
            }
        }

        console.log("🏁 Sync Complete.");
    } finally {
        // Opcional: podríamos desactivarlo aquí, pero como vamos a ejecutar
        // los scripts de reset justo después, mejor dejarlo activo por seguridad.
        // await setSilentMode(dbPre, false);
    }
}

async function setSilentMode(db: admin.firestore.Firestore, active: boolean) {
    console.log(`🔧 Setting Silent Mode to ${active} in ${db.databaseId}...`);
    await db.collection("config").doc("maintenance").set({ silentMode: active }, { merge: true });
}

async function copyDocRecursive(doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot, targetDb: admin.firestore.Firestore) {
    const data = doc.data();
    if (!data) return;

    // Write doc to target database
    await targetDb.doc(doc.ref.path).set(data);

    // List and copy subcollections recursively
    const subCollections = await doc.ref.listCollections();
    for (const subCol of subCollections) {
        const subSnapshot = await subCol.get();
        if (!subSnapshot.empty) {
            for (const subDoc of subSnapshot.docs) {
                await copyDocRecursive(subDoc, targetDb);
            }
        }
    }
}

syncProdToPre().catch(err => {
    console.error("❌ Sync failed:", err);
    process.exit(1);
});
