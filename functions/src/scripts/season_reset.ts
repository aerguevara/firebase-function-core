/* eslint-disable */
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { SeasonID, SeasonManager } from "../seasons";
import * as path from "path";

// Guidelines: Initializing for PRE
const serviceAccountPath = path.resolve(__dirname, "../../../../backend-admin/secrets/serviceAccount.json");
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        projectId: "adventure-streak"
    });
}

async function runSeasonReset(seasonId: SeasonID) {
    // Guidelines: Specifying PRE database
    const db = (admin.firestore() as any).getFirestore ? (admin.firestore() as any).getFirestore("adventure-streak-pre") : admin.firestore();

    const season = SeasonManager.getSeasonById(seasonId);

    if (!season) {
        console.error(`Invalid Season ID: ${seasonId}`);
        return;
    }

    console.log(`🚀 Starting Reset for Season: ${season.name} (${seasonId})`);

    const usersSnap = await db.collection("users").get();
    let userCount = 0;

    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        const seasonXp = userData.xp || 0; // In this MVP, we assume XP in doc IS the season XP
        const totalCells = userData.totalCellsOwned || 0;

        // 1. Calculate Prestige (1 per 5000 XP)
        const prestigeEarned = Math.floor(seasonXp / 5000);

        // 2. Archive Season Stats
        const historyEntry = {
            seasonId: seasonId,
            seasonName: season.name,
            finalXp: seasonXp,
            finalCells: totalCells,
            prestigeEarned: prestigeEarned,
            completedAt: FieldValue.serverTimestamp()
        };

        const batch = db.batch();

        // Push to history
        const historyRef = db.collection("users").doc(userId).collection("seasonHistory").doc(seasonId);
        batch.set(historyRef, historyEntry);

        // 3. Update User Profile
        const userUpdate: any = {
            prestige: FieldValue.increment(prestigeEarned),
            xp: 0, // Reset XP for new season
            totalCellsOwned: 0,
            lastSeasonReset: FieldValue.serverTimestamp()
        };
        // Also update the nested dictionary for easier access in iOS
        userUpdate[`seasonHistory.${seasonId}`] = historyEntry;

        batch.update(db.collection("users").doc(userId), userUpdate);

        // 4. Send Notification
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
            recipientId: userId,
            type: "achievement",
            senderId: "system",
            senderName: "Adventure Streak",
            timestamp: FieldValue.serverTimestamp(),
            isRead: false,
            message: `¡Temporada finalizada! Has ganado ${prestigeEarned} puntos de prestigio.`
        });

        await batch.commit();
        userCount++;
        console.log(`Processed user ${userId}: +${prestigeEarned} Prestige`);
    }

    // 5. Clear World (Territories)
    console.log("🧹 Clearing all territories...");
    const territoriesSnap = await db.collection("remote_territories").get();
    const tBatchSize = 400;
    for (let i = 0; i < territoriesSnap.docs.length; i += tBatchSize) {
        const tBatch = db.batch();
        territoriesSnap.docs.slice(i, i + tBatchSize).forEach((doc: any) => tBatch.delete(doc.ref));
        await tBatch.commit();
    }

    console.log(`✅ Season ${seasonId} reset complete for ${userCount} users.`);
}

// Check args
const argId = process.argv[2] as SeasonID;
if (argId) {
    // Note: This execution context might require firebase-admin init
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    runSeasonReset(argId).catch(console.error);
} else {
    console.log("Usage: npx ts-node season_reset.ts <SeasonID>");
}
