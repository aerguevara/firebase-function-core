/* eslint-disable */
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Moves a document from source path to destination path.
 */
async function moveDocument(
    db: admin.firestore.Firestore,
    sourcePath: string,
    destPath: string,
    includeSubcollections: boolean = false
) {
    const sourceRef = db.doc(sourcePath);
    const destRef = db.doc(destPath);
    const docSnap = await sourceRef.get();

    if (!docSnap.exists) return;

    const data = docSnap.data();
    if (data) {
        await destRef.set({
            ...data,
            archivedAt: FieldValue.serverTimestamp(),
        });

        if (includeSubcollections) {
            const subcollections = await sourceRef.listCollections();
            for (const sub of subcollections) {
                const docs = await sub.get();
                for (const d of docs.docs) {
                    await moveDocument(db, `${sourcePath}/${sub.id}/${d.id}`, `${destPath}/${sub.id}/${d.id}`, true);
                }
            }
        }

        await sourceRef.delete();
    }
}

/**
 * Archives and deletes user data.
 */
export const createDeleteAccount = (databaseId: string | undefined = undefined) =>
    onCall({
        memory: "512MiB",
        timeoutSeconds: 540, // Max timeout for heavy data move
    }, async (request) => {
        // 1. Authenticate Request
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }

        const uid = request.auth.uid;
        const db = databaseId ? getFirestore(databaseId) : getFirestore();

        console.log(`[DeleteAccount] Starting archival process for user: ${uid}`);

        try {
            // 2. Archive User Profile
            await moveDocument(db, `users/${uid}`, `archived_users/${uid}`, true);

            // 3. Archive Activities & Subcollections
            const activitiesSnap = await db.collection("activities").where("userId", "==", uid).get();
            for (const doc of activitiesSnap.docs) {
                await moveDocument(db, `activities/${doc.id}`, `archived_activities/${doc.id}`, true);
            }

            // 4. Archive Remote Territories
            const territoriesSnap = await db.collection("remote_territories").where("userId", "==", uid).get();
            for (const doc of territoriesSnap.docs) {
                await moveDocument(db, `remote_territories/${doc.id}`, `archived_remote_territories/${doc.id}`);
            }

            // 5. Archive Feed Items
            const feedSnap = await db.collection("feed").where("userId", "==", uid).get();
            for (const doc of feedSnap.docs) {
                await moveDocument(db, `feed/${doc.id}`, `archived_feed/${doc.id}`);
            }

            // 6. Archive Notifications (Recipient or Sender)
            const notifRecipientSnap = await db.collection("notifications").where("recipientId", "==", uid).get();
            for (const doc of notifRecipientSnap.docs) {
                await moveDocument(db, `notifications/${doc.id}`, `archived_notifications/${doc.id}`);
            }
            const notifSenderSnap = await db.collection("notifications").where("senderId", "==", uid).get();
            for (const doc of notifSenderSnap.docs) {
                await moveDocument(db, `notifications/${doc.id}`, `archived_notifications/${doc.id}`);
            }

            // 7. Archive Reactions
            const reactionsSnap = await db.collection("activity_reactions").where("reactedUserId", "==", uid).get();
            for (const doc of reactionsSnap.docs) {
                await moveDocument(db, `activity_reactions/${doc.id}`, `archived_activity_reactions/${doc.id}`);
            }

            // 8. Handle Ranking Leaderboard
            const rankingRef = db.collection("config").doc("ranking");
            const rankingDoc = await rankingRef.get();
            if (rankingDoc.exists && rankingDoc.data()?.userId === uid) {
                console.log(`[DeleteAccount] User was the leader. Resetting ranking leader.`);
                await rankingRef.delete();
            }

            // 9. Delete Firebase Auth User
            // Note: This must be the last step. If anything fails above, we want to be able to retry.
            await admin.auth().deleteUser(uid);

            console.log(`[DeleteAccount] Successfully archived and deleted user: ${uid}`);
            return { success: true };

        } catch (error) {
            console.error(`[DeleteAccount] Error during archival for user ${uid}:`, error);
            throw new HttpsError("internal", "Failed to archive user data.");
        }
    });
