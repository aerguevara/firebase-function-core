/* eslint-disable */
import * as admin from "firebase-admin";
import { FieldValue, Firestore } from "firebase-admin/firestore";

interface LeaderInfo {
    userId: string;
    displayName: string;
    level: number;
    xp: number;
    updatedAt: admin.firestore.Timestamp;
}

/**
 * Checks if the updated user should take the #1 spot in the ranking.
 * If so, updates the config and triggers notifications.
 * 
 * Logic:
 * 1. Primary metric: Level (higher is better)
 * 2. Secondary metric: XP (higher is better)
 */
export async function checkRankingChange(
    db: Firestore,
    userId: string,
    userData: any
): Promise<void> {
    const newLevel = userData.level || 1;
    const newXP = userData.xp || 0;
    const newDisplayName = userData.displayName || "Explorador";

    const rankingConfigRef = db.collection("config").doc("ranking");

    try {
        await db.runTransaction(async (transaction) => {
            const rankingDoc = await transaction.get(rankingConfigRef);
            let currentLeader: LeaderInfo | null = null;

            if (rankingDoc.exists) {
                currentLeader = rankingDoc.data() as LeaderInfo;
            }

            // Check if user is already the leader (just update stats if so)
            if (currentLeader && currentLeader.userId === userId) {
                // Check if stats improved or just stayed the same
                if (currentLeader.level !== newLevel || currentLeader.xp !== newXP) {
                    transaction.set(rankingConfigRef, {
                        userId,
                        displayName: newDisplayName,
                        level: newLevel,
                        xp: newXP,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
                return;
            }

            // Check if new user surpasses current leader
            // Note: If no leader exists (first time), new user takes it.
            const isBetter = !currentLeader ||
                (newLevel > currentLeader.level) ||
                (newLevel === currentLeader.level && newXP > currentLeader.xp);

            if (isBetter) {
                console.log(`[Ranking] New Leader detected: ${newDisplayName} (${userId})`);

                // 1. Update ranking config
                transaction.set(rankingConfigRef, {
                    userId,
                    displayName: newDisplayName,
                    level: newLevel,
                    xp: newXP,
                    updatedAt: FieldValue.serverTimestamp()
                });

                // 2. Notify previous leader (if exists)
                if (currentLeader) {
                    const prevLeaderNotifRef = db.collection("notifications").doc();
                    transaction.set(prevLeaderNotifRef, {
                        recipientId: currentLeader.userId,
                        type: "ranking_lost_first_place",
                        senderId: userId,
                        senderName: newDisplayName,
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false
                    });
                }

                // 3. Notify all users
                // We create a special notification document with recipientId "all"
                // The onNotificationCreated trigger will handle this by broadcasting
                const globalNotifRef = db.collection("notifications").doc();
                transaction.set(globalNotifRef, {
                    recipientId: "all",
                    type: "ranking_changed",
                    senderId: userId,
                    senderName: newDisplayName,
                    timestamp: FieldValue.serverTimestamp(),
                    isRead: false
                });
            }
        });
    } catch (error) {
        console.error("Error updating ranking leader:", error);
    }
}
