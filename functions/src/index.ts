/* eslint-disable */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { createProcessActivityComplete } from "./territories";
import { createOnReactionCreated } from "./reactions";
import { createOnMockWorkoutCreated } from "./debug_simulation";

admin.initializeApp();

/**
 * Triggers when a new document is created in the 'notifications' collection.
 * Sends a push notification to the recipient of the notification.
 */
export const createOnNotificationCreated = (databaseId: string | undefined = undefined) =>
  onDocumentCreated({
    document: "notifications/{notificationId}",
    database: databaseId
  }, async (event) => {
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
      const db = databaseId ? getFirestore(databaseId) : getFirestore();
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
      let body = "¡Tienes una nueva alerta!";

      switch (data.type) {
        case "reaction":
          title = "¡Nueva reacción! 🔥";
          body = `${data.senderName} reaccionó con ${data.reactionType} ` +
            "a tu actividad.";
          break;
        case "follow":
          title = "¡Nuevo seguidor! 👥";
          body = `${data.senderName} ahora sigue tus aventuras.`;
          break;
        case "achievement":
          title = "¡Logro desbloqueado! 🏆";
          if (data.badgeId && data.badgeId.startsWith("level_up_")) {
            const level = data.badgeId.split("_").pop();
            body = `¡Felicidades! ¡Has alcanzado el Nivel ${level}!`;
          } else {
            body = `¡Has ganado la insignia ${data.badgeId || "Recompensa"}!`;
          }
          break;
        case "territory_conquered":
          title = data.locationLabel ? `¡Conquista en ${data.locationLabel}! 🚩` : "¡Territorio Conquistado! 🚩";
          body = data.locationLabel
            ? `Has conquistado nuevos territorios en ${data.locationLabel}. ¡Sigue así!`
            : "¡Has conquistado nuevos territorios! Sigue explorando.";
          break;
        case "territory_stolen":
          title = "¡Territorio Robado! ⚔️";
          body = data.locationLabel
            ? `¡${data.senderName} te ha robado un territorio en ${data.locationLabel}! ¡Recupéralo!`
            : `¡${data.senderName} te ha robado un territorio! ¡Recupéralo!`;
          break;
        case "territory_defended":
          title = "¡Territorio Defendido! 🛡️";
          body = "Tu territorio ha sido defendido con éxito.";
          break;
        case "territory_stolen_success":
          title = "¡Territorio Robado! 🏴‍☠️";
          body = data.message || (data.locationLabel
            ? `¡Has robado territorios enemigos en ${data.locationLabel}!`
            : "¡Has robado territorios enemigos correctamente!");
          break;
        case "follower_territory_activity":
          title = `¡Actividad de ${data.senderName}! 🚩`;
          {
            const counts = [];
            if (data.conquestCount > 0) counts.push(`${data.conquestCount} conquistados`);
            if (data.stealCount > 0) counts.push(`${data.stealCount} robados`);
            const countText = counts.join(" y ");
            const locationText = data.locationLabel ? ` en ${data.locationLabel}` : "";
            body = `${data.senderName} ha obtenido ${countText}${locationText}.`;
          }
          break;
        case "workout_import":
          // Legacy or handled elsewhere if needed, but not triggered from territories.ts anymore
          title = "Entrenamiento Procesado 🏃";
          body = "Tu entrenamiento ha sido analizado y los territorios actualizados.";
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
        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
        android: {
          notification: {
            sound: "default",
          },
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

// --- PROD ENV (Default Database) ---
export const onNotificationCreated = createOnNotificationCreated();
export const processActivityComplete = createProcessActivityComplete();
export const onReactionCreated = createOnReactionCreated();

// --- PRE ENV (adventure-streak-pre Database) ---
export const onNotificationCreatedPRE = createOnNotificationCreated("adventure-streak-pre");
export const processActivityCompletePRE = createProcessActivityComplete("adventure-streak-pre");
export const onReactionCreatedPRE = createOnReactionCreated("adventure-streak-pre");
export const onMockWorkoutCreatedPRE = createOnMockWorkoutCreated("adventure-streak-pre");
