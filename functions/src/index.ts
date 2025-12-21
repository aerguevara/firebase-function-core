import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Triggers when a new document is created in the 'notifications' collection.
 * Sends a push notification to the recipient of the notification.
 */
export const onNotificationCreated = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("No snapshot found.");
      return;
    }

    const data = snapshot.data();
    if (!data) {
      console.log("No data found in notification document.");
      return;
    }

    const recipientId = data.recipientId;
    if (!recipientId) {
      console.log("No recipientId specified.");
      return;
    }

    try {
      const db = admin.firestore();
      const userRef = db.collection("users").doc(recipientId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.log(`User document for ${recipientId} does not exist.`);
        return;
      }

      const userData = userDoc.data();
      const fcmToken = userData?.fcmTokens;

      if (!fcmToken) {
        console.log(`No FCM token found for user ${recipientId}.`);
        return;
      }

      const tokens = Array.isArray(fcmToken) ? fcmToken : [fcmToken];

      if (tokens.length === 0) {
        console.log(`FCM token list is empty for user ${recipientId}.`);
        return;
      }

      let title = "Adventure Streak";
      let body = "You have a new alert!";

      switch (data.type) {
      case "reaction":
        title = "New Reaction! 🔥";
        body = `${data.senderName} reacted with ${data.reactionType} ` +
                        "to your activity.";
        break;
      case "follow":
        title = "New Follower! 👥";
        body = `${data.senderName} is now following your adventures.`;
        break;
      case "achievement":
        title = "Achievement Unlocked! 🏆";
        if (data.badgeId && data.badgeId.startsWith("level_up_")) {
          const level = data.badgeId.split("_").pop();
          body = `Congratulations! You've reached Level ${level}!`;
        } else {
          body = `You've earned the ${data.badgeId || "Reward"} badge!`;
        }
        break;
      }

      const message: admin.messaging.MulticastMessage = {
        notification: {
          title,
          body,
        },
        data: {
          notificationId: snapshot.id,
          type: data.type || "unknown",
        },
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      const successCount = response.successCount;
      const failureCount = response.failureCount;
      console.log(`${successCount} messages sent; ${failureCount} failed.`);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  });
