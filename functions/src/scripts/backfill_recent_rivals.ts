
import * as admin from "firebase-admin";
import { getFirestore, Firestore, Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";

// --- Configuration ---
const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/backend-admin/secrets/serviceAccount.json";

interface Rival {
    userId: string;
    displayName: string;
    avatarURL: string | null;
    lastInteractionAt: Date;
    count: number;
}

// Logic to process a single database
async function processDatabase(db: Firestore, dbName: string) {
    console.log(`\n🔵 Starting processing for database: ${dbName}`);

    // 1. Fetch all 'territory_stolen' notifications
    // These notifications tell us: senderId (Thief) stole from recipientId (Victim)
    const snapshot = await db.collection("notifications")
        .where("type", "==", "territory_stolen")
        //.orderBy("timestamp", "desc") // Removed to avoid index wait time. Sorting in memory.
        .limit(5000) // Increased limit to capture most history
        .get();

    console.log(`   Found ${snapshot.size} theft notifications (limit 2000).`);

    if (snapshot.empty) {
        console.log("   No thefts found. Skipping.");
        return;
    }

    // 2. Aggregate Data
    // We need to build:
    // Map<ThiefId, Map<VictimId, {count, lastAt, victimDetails}>>
    // Map<VictimId, Map<ThiefId, {count, lastAt, thiefDetails}>>

    // Helper to store aggregated interaction
    interface Interaction {
        count: number;
        lastAt: Date;
        details: { name: string, avatar: string | null, id: string };
    }

    const thievesData = new Map<string, Map<string, Interaction>>(); // User -> Victims
    const victimsData = new Map<string, Map<string, Interaction>>(); // User -> Thieves

    let processedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const victimId = data.recipientId;
        const thiefId = data.senderId;

        if (!victimId || !thiefId) continue;

        const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date();

        // --- Process Thief (Sender) -> Victim (Recipient) ---
        if (!thievesData.has(thiefId)) thievesData.set(thiefId, new Map());
        const victimMap = thievesData.get(thiefId)!;

        // We need victim details. Currently notifications DON'T verify victim name in payload usually?
        // Wait, 'territory_stolen' notification is sent TO the victim FROM the thief.
        // So `senderName` is the Thief's name.
        // We don't have the Victim's name in this notification payload usually (it's the recipient).
        // WE NEED TO FETCH USERS later or infer from other sources.

        // However, we DO have Thief details (senderName, senderAvatarURL) in the payload!
        // So building `recentThieves` for the victim is easy.

        // Building `recentTheftVictims` for the thief is harder because we don't have victim name in the notification body usually.
        // We will need to fetch user profiles for the generated IDs.

        // Update Victim's "Recent Thieves" list (Sender is the thief)
        if (!victimsData.has(victimId)) victimsData.set(victimId, new Map());
        const thiefMap = victimsData.get(victimId)!;

        if (!thiefMap.has(thiefId)) {
            thiefMap.set(thiefId, {
                count: 1,
                lastAt: timestamp,
                details: {
                    id: thiefId,
                    name: data.senderName || "Desconocido",
                    avatar: data.senderAvatarURL || null
                }
            });
        } else {
            const entry = thiefMap.get(thiefId)!;
            entry.count += 1;
            // Keep the LATEST timestamp
            if (timestamp > entry.lastAt) {
                entry.lastAt = timestamp;
                // Update details if newer
                entry.details.name = data.senderName || entry.details.name;
                entry.details.avatar = data.senderAvatarURL || entry.details.avatar;
            }
        }

        // Update Thief's "Recent Victims" list (Recipient is the victim)
        // We count interactions here, but we lack details.
        if (!victimMap.has(victimId)) {
            victimMap.set(victimId, {
                count: 1,
                lastAt: timestamp,
                details: { id: victimId, name: "...", avatar: null } // Placeholder
            });
        } else {
            const entry = victimMap.get(victimId)!;
            entry.count += 1;
            if (timestamp > entry.lastAt) entry.lastAt = timestamp;
        }

        processedCount++;
    }

    console.log(`   Aggregated ${processedCount} interactions.`);
    console.log(`   Unique Thieves to update: ${thievesData.size}`);
    console.log(`   Unique Victims to update: ${victimsData.size}`);

    // 3. Resolve Missing User Details (for Victims lists)
    // The `thievesData` map has victims as keys but no name/avatar/
    const allVictimIds = new Set<string>();
    thievesData.forEach((vMap) => {
        vMap.forEach((_, vId) => allVictimIds.add(vId));
    });

    console.log(`   Fetching profiles for ${allVictimIds.size} unique victims...`);
    const victimProfiles = new Map<string, { name: string, avatar: string | null }>();

    const victimIdsArray = Array.from(allVictimIds);
    // Chunk fetches to avoid limits
    for (let i = 0; i < victimIdsArray.length; i += 100) {
        const chunk = victimIdsArray.slice(i, i + 100);
        if (chunk.length === 0) continue;
        const q = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
        q.forEach(d => {
            const temp = d.data();
            victimProfiles.set(d.id, {
                name: temp.displayName || "Desconocido",
                avatar: temp.avatarURL || temp.photoURL || null
            });
        });
    }

    // 4. Perform Updates
    const batchHandler = async (operations: Promise<any>[]) => {
        // Just execute promises in chunks
        const chunkSize = 50;
        for (let i = 0; i < operations.length; i += chunkSize) {
            await Promise.all(operations.slice(i, i + chunkSize));
            console.log(`      ...updated ${Math.min(i + chunkSize, operations.length)} / ${operations.length} documents`);
        }
    };

    const updateOps: Promise<any>[] = [];

    // A. Update Users with their Recent Thieves (VictimsData)
    for (const [userId, thiefMap] of victimsData.entries()) {
        const rivals: Rival[] = Array.from(thiefMap.values()).map(interaction => ({
            userId: interaction.details.id,
            displayName: interaction.details.name,
            avatarURL: interaction.details.avatar,
            lastInteractionAt: interaction.lastAt,
            count: interaction.count
        }))
            .sort((a, b) => b.lastInteractionAt.getTime() - a.lastInteractionAt.getTime())
            .slice(0, 5);

        const op = db.collection("users").doc(userId).update({
            recentThieves: rivals
        }).catch(e => console.error(`Failed to update victim ${userId}:`, e.message));
        updateOps.push(op);
    }

    // B. Update Users with their Recent Victims (ThievesData)
    for (const [userId, victimMap] of thievesData.entries()) {
        const rivals: Rival[] = [];
        for (const [vId, interaction] of victimMap.entries()) {
            const profile = victimProfiles.get(vId);
            if (profile) {
                rivals.push({
                    userId: vId,
                    displayName: profile.name,
                    avatarURL: profile.avatar,
                    lastInteractionAt: interaction.lastAt,
                    count: interaction.count
                });
            }
        }

        rivals.sort((a, b) => b.lastInteractionAt.getTime() - a.lastInteractionAt.getTime());
        const top5 = rivals.slice(0, 5);

        const op = db.collection("users").doc(userId).update({
            recentTheftVictims: top5
        }).catch(e => console.error(`Failed to update thief ${userId}:`, e.message));
        updateOps.push(op);
    }

    console.log(`   Executing ${updateOps.length} updates...`);
    await batchHandler(updateOps);
    console.log(`   ✅ Database ${dbName} complete.`);
}


async function runBackfill() {
    // 1. Init
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Authenticated with Service Account");
    } else {
        console.log("⚠️ No service account, using default.");
        admin.initializeApp();
    }

    // 2. Process PROD
    const dbProd = getFirestore(); // Default
    await processDatabase(dbProd, "(default)");

    // 3. Process PRE
    // Note: getFirestore(app, id) returns the instance. 
    // If the database doesn't exist or permissions fail, it might error.
    try {
        const dbPre = getFirestore(admin.app(), "adventure-streak-pre");
        await processDatabase(dbPre, "adventure-streak-pre");
    } catch (e) {
        console.error("❌ Failed to process PRE database. Ensure it exists and is accessible.", e);
    }
}

runBackfill()
    .then(() => {
        console.log("🎉 All Done.");
        process.exit(0);
    })
    .catch(e => {
        console.error("Fatal Error:", e);
        process.exit(1);
    });
