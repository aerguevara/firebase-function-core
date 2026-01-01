import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Script to migrate/populate vengeance_targets for existing thefts in PRE environment.
 */
async function migrateVengeanceTargets() {
    console.log("🚀 Starting Vengeance Targets Migration (PRE)...");

    const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json";

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId: "adventure-streak"
        });
    }

    const db = getFirestore("adventure-streak-pre");

    try {
        const territoriesSnapshot = await db.collection("remote_territories").get();
        console.log(`📦 Found ${territoriesSnapshot.size} total territories.`);

        let processedCount = 0;
        let vengeanceCreatedCount = 0;

        for (const cellDoc of territoriesSnapshot.docs) {
            const cellId = cellDoc.id;
            const cellData = cellDoc.data();

            // Fetch history for this cell
            const historySnap = await cellDoc.ref.collection("history")
                .orderBy("timestamp", "desc")
                .limit(20)
                .get();

            if (historySnap.empty) continue;

            const history = historySnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Find the most recent theft
            const mostRecentSteal = history.find((h: any) => h.interaction === "steal");

            if (mostRecentSteal && (mostRecentSteal as any).previousOwnerId) {
                const victimId = (mostRecentSteal as any).previousOwnerId;
                const thiefId = (mostRecentSteal as any).userId;
                const thiefName = await getUserDisplayName(db, thiefId);

                // Check if the victim has reclaimed it since the steal
                // (Recapture or Conquest after the steal timestamp)
                const reclaimAfterSteal = history.find((h: any) =>
                    h.userId === victimId &&
                    (h.interaction === "recapture" || h.interaction === "conquest" || h.interaction === "defense") &&
                    h.timestamp.toDate() > (mostRecentSteal as any).timestamp.toDate()
                );

                if (!reclaimAfterSteal && cellData.userId !== victimId) {
                    // Victim still needs vengeance
                    const vengeanceRef = db.collection("users").doc(victimId).collection("vengeance_targets").doc(cellId);
                    await vengeanceRef.set({
                        cellId: cellId,
                        centerLatitude: cellData.centerLatitude,
                        centerLongitude: cellData.centerLongitude,
                        thiefId: thiefId,
                        thiefName: thiefName,
                        stolenAt: (mostRecentSteal as any).timestamp,
                        xpReward: 25
                    });
                    vengeanceCreatedCount++;
                }
            }

            processedCount++;
            if (processedCount % 50 === 0) {
                console.log(`   Progress: ${processedCount}/${territoriesSnapshot.size} cells processed...`);
            }
        }

        console.log(`🏁 Migration Complete. Created ${vengeanceCreatedCount} vengeance targets.`);
    } catch (error) {
        console.error("❌ Migration failed:", error);
    }
}

const userCache = new Map<string, string>();
async function getUserDisplayName(db: admin.firestore.Firestore, userId: string): Promise<string> {
    if (userCache.has(userId)) return userCache.get(userId)!;

    const userDoc = await db.collection("users").doc(userId).get();
    const name = userDoc.exists ? (userDoc.data()?.displayName || "Desconocido") : "Desconocido";
    userCache.set(userId, name);
    return name;
}

migrateVengeanceTargets().catch(err => {
    console.error("❌ Script error:", err);
    process.exit(1);
});
