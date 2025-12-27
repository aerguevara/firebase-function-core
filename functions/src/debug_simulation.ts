import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Creates a function that triggers when a mock workout is created.
 * Sends a silent push to ALL users in the target environment to trigger a refresh.
 * 
 * Note: This is for DEBUG/PRE use only. Broadcasting to all users is not scalable for PROD.
 */
export const createOnMockWorkoutCreated = (databaseId: string) =>
    onDocumentCreated({
        document: "debug_mock_workouts/{workoutId}",
        database: databaseId
    }, async (event) => {
        console.log(`[debug_simulation] New mock workout created in specific db: ${databaseId}`);

        const db = getFirestore(databaseId);

        // 1. Target specific user for PRE environment
        const targetUserId = "DQN1tyypsEZouksWzmFeSIYip7b2";
        const userDoc = await db.collection("users").doc(targetUserId).get();

        if (!userDoc.exists) {
            console.log(`[debug_simulation] Target user ${targetUserId} not found.`);
            return;
        }

        const data = userDoc.data();
        const tokens: string[] = [];

        if (data?.fcmTokens) {
            if (Array.isArray(data.fcmTokens)) {
                tokens.push(...data.fcmTokens);
            } else if (typeof data.fcmTokens === 'string') {
                tokens.push(data.fcmTokens);
            }
        }

        if (tokens.length === 0) {
            console.log(`[debug_simulation] No FCM tokens found for user ${targetUserId}.`);
            return;
        }

        // 2. Send Standard Push (Visible)
        const message: admin.messaging.MulticastMessage = {
            notification: {
                title: "Simulación Lista",
                body: "Nuevos datos generados. Toca para procesar."
            },
            data: {
                type: "mock_import_trigger",
                timestamp: new Date().toISOString()
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default"
                    }
                }
            },
            tokens: tokens
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            console.log(`[debug_simulation] Sent silent push to ${response.successCount} devices. Failed: ${response.failureCount}`);
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.error(`Error sending to token ${tokens[idx]}:`, resp.error);
                    }
                });
            }
        } catch (error) {
            console.error("[debug_simulation] Fatal error sending multicast:", error);
        }
    });
