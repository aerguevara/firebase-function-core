import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Triggers when a user reacts to an activity.
 * Creates a notification for the activity owner.
 */
export const createOnReactionCreated = (databaseId: string | undefined = undefined) =>
    onDocumentCreated({
        document: "activity_reactions/{reactionId}",
        database: databaseId
    }, async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data();
        const activityId = data.activityId;
        const reactorId = data.reactedUserId;
        const reactionType = data.reactionType;

        if (!activityId || !reactorId || !reactionType) {
            console.log("⚠️ Missing data in reaction document.");
            return;
        }

        const db = databaseId ? getFirestore(databaseId) : getFirestore();

        try {
            // 1. Fetch Activity to get the Author
            const activitySnap = await db.collection("activities").doc(activityId).get();
            if (!activitySnap.exists) {
                console.log(`⚠️ Activity ${activityId} not found.`);
                return;
            }

            const activityData = activitySnap.data();
            const authorId = activityData?.userId;

            if (!authorId) {
                console.log("⚠️ Activity has no userId.");
                return;
            }

            // 2. Prevent Self-Notification
            if (authorId === reactorId) {
                console.log("ℹ️ Self-reaction, skipping notification.");
                return;
            }

            // 3. Get Reactor Details (User who reacted)
            const reactorSnap = await db.collection("users").doc(reactorId).get();
            const reactorName = reactorSnap.exists ? reactorSnap.data()?.displayName : "Unknown User";
            const reactorAvatar = reactorSnap.exists ? reactorSnap.data()?.avatarURL : "";

            // 4. Create Notification
            await db.collection("notifications").add({
                recipientId: authorId,
                senderId: reactorId,
                senderName: reactorName || "Adventurer",
                senderAvatarURL: reactorAvatar || "",
                type: "reaction",
                reactionType: reactionType,
                activityId: activityId,
                timestamp: FieldValue.serverTimestamp(),
                isRead: false
                // Message body is constructed by the `onNotificationCreated` trigger or client
            });

            console.log(`✅ Notification sent to ${authorId} for reaction ${reactionType} from ${reactorName}`);

        } catch (error) {
            console.error("❌ Error processing reaction:", error);
        }
    }
    );
