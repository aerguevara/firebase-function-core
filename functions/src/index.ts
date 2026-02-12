/* eslint-disable */
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { createProcessActivityComplete } from "./territories";
import { createOnReactionCreated } from "./reactions";
import { BADGES } from "./badges";
import { createOnMockWorkoutCreated } from "./debug_simulation";
import { dailyUserSync } from "./sync";
import { createEngagementHourlyJob, createEngagementRoutineJob } from "./engagement";
import { checkRankingChange } from "./ranking";

// --- Invitations & User Management ---
import { createGenerateInvitation, createRedeemInvitation } from "./invitations";
import { createDeleteAccount } from "./user_management";
export const generateInvitationCall = createGenerateInvitation();
export const redeemInvitationCall = createRedeemInvitation();
export const deleteAccount = createDeleteAccount();
export const generateInvitationCallPRE = createGenerateInvitation("adventure-streak-pre");
export const redeemInvitationCallPRE = createRedeemInvitation("adventure-streak-pre");
export const deleteAccountPRE = createDeleteAccount("adventure-streak-pre");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

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

      // Check for Silent Mode (Maintenance)
      const maintenanceDoc = await db.collection("config").doc("maintenance").get();
      if (maintenanceDoc.exists && maintenanceDoc.data()?.silentMode === true) {
        console.log("Silent Mode is active. Skipping push notification.");
        return;
      }

      let tokens: string[] = [];

      if (recipientId === "all") {
        // BROADCAST LOGIC: Fetch all users with FCM tokens
        console.log(`[Notification] Broadcasting ${data.type} to all users...`);
        const usersWithTokens = await db.collection("users")
          .where("fcmTokens", "!=", null)
          .get();

        usersWithTokens.docs.forEach(doc => {
          const uData = doc.data();
          if (uData.fcmTokens) {
            const userTokens = Array.isArray(uData.fcmTokens) ? uData.fcmTokens : [uData.fcmTokens];
            tokens = tokens.concat(userTokens);
          }
        });
      } else {
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

        tokens = Array.isArray(fcmToken) ? fcmToken : [fcmToken];
      }

      if (tokens.length === 0) {
        console.log(`No FCM tokens found for delivery.`);
        return;
      }

      // De-duplicate tokens
      tokens = [...new Set(tokens)];

      let title = "Adventure Streak";
      let body = "¡Tienes una nueva alerta!";

      switch (data.type) {
        case "ranking_changed":
          title = "¡Nuevo Líder en el Ranking! 🥇";
          body = `¡El trono ha cambiado! ${data.senderName} es ahora el número 1 del ranking mundial.`;
          break;
        case "ranking_lost_first_place":
          title = "¡Has perdido el liderato! 📉";
          body = `¡${data.senderName} te ha superado y ahora ocupa la primera posición!`;
          break;
        case "reaction": {
          title = "¡Nueva reacción! 🔥";
          const reactionEmojis: Record<string, string> = {
            "fire": "🔥",
            "sword": "⚔️",
            "shield": "🛡️"
          };
          const emoji = reactionEmojis[data.reactionType] || data.reactionType || "✨";
          body = `${data.senderName} reaccionó con ${emoji} a tu actividad.`;
          break;
        }
        case "follow":
          title = "¡Nuevo seguidor! 👥";
          body = `${data.senderName} ahora sigue tus aventuras.`;
          break;
        case "achievement":
          title = "¡Logro desbloqueado! 🏆";
          if (data.badgeId && data.badgeId.startsWith("level_up_")) {
            const level = data.badgeId.split("_").pop();
            body = `¡Felicidades! ¡Has alcanzado el Nivel ${level} !`;
          } else {
            const badge = BADGES.find((b) => b.id === data.badgeId);
            const badgeName = badge ? badge.name : (data.badgeId || "Recompensa");
            body = `¡Has ganado la insignia ${badgeName} !`;
          }
          break;
        case "territory_conquered":
          title = data.locationLabel ? `¡Conquista en ${data.locationLabel} ! 🚩` : "¡Territorio Conquistado! 🚩";
          body = data.locationLabel
            ? `Has conquistado nuevos territorios en ${data.locationLabel}. ¡Sigue así!`
            : "¡Has conquistado nuevos territorios! Sigue explorando.";
          break;
        case "territory_stolen":
          title = "¡Territorio Robado! ⚔️";
          body = data.message || (data.locationLabel
            ? `¡${data.senderName} te ha robado un territorio en ${data.locationLabel} ! ¡Recupéralo!`
            : `¡${data.senderName} te ha robado un territorio! ¡Recupéralo!`);
          break;
        case "territory_defended":
          title = "¡Territorio Defendido! 🛡️";
          body = "Tu territorio ha sido defendido con éxito.";
          break;
        case "territory_stolen_success":
          title = "¡Territorio Robado! 🏴‍☠️";
          body = data.message || (data.locationLabel
            ? `¡Has robado territorios enemigos en ${data.locationLabel} !`
            : "¡Has robado territorios enemigos correctamente!");
          break;
        case "follower_territory_activity":
          title = `¡Actividad de ${data.senderName} ! 🚩`;
          {
            const counts = [];
            if (data.conquestCount > 0) counts.push(`${data.conquestCount} conquistados`);
            if (data.stealCount > 0) counts.push(`${data.stealCount} robados`);
            const countText = counts.join(" y ");
            const locationText = data.locationLabel ? ` en ${data.locationLabel} ` : "";
            body = `${data.senderName} ha obtenido ${countText}${locationText}.`;
          }
          break;
        case "streak_saver":
          title = "¡Salva tu racha! 🔥";
          body = data.message || `No dejes que tu racha de ${data.streakWeeks} semanas se pierda. ¡Entrena hoy!`;
          break;
        case "territory_guardian":
          title = "¡Alerta de Guardián! 🛡️";
          body = data.message || `Tu territorio en ${data.locationLabel || "el mapa"} está a punto de expirar.`;
          break;
        case "territory_expiring_soon":
          title = "¡Tu territorio está por vencer! ⏳";
          body = data.message || (data.locationLabel
            ? `A tus territorios en ${data.locationLabel} les quedan 5 horas. ¡Entrena ahora para mantenerlos!`
            : "A tus territorios les quedan 5 horas. ¡Entrena ahora para mantenerlos!");
          break;
        case "territories_expired":
          title = "¡Territorios caducados! 📉";
          body = data.message || (data.locationLabel
            ? `¡Ups! Tus territorios en ${data.locationLabel} han caducado. ¡Vuelve a conquistarlos para recuperar tu racha!`
            : "¡Ups! Tus territorios han caducado. ¡Vuelve a conquistarlos!");
          break;
        case "vengeance_reminder":
          title = "¡La venganza te espera! ⚔️";
          body = data.message || `Tienes oportunidades de venganza pendientes. ¡Recupera tu territorio!`;
          break;
        case "rival_radar":
          title = "¡Radar de Rivales! 🚩";
          body = `${data.senderName} está conquistando cerca de tu zona. ¡Vigila tus fronteras!`;
          break;
        case "weekly_recap":
          title = "Tu semana en Adventure Streak 🏆";
          body = data.message || "Has tenido una semana increíble. ¡Mira tus estadísticas!";
          break;
        case "workout_import":
          title = "Entrenamiento Procesado 🏃";
          body = "Tu entrenamiento ha sido analizado y los territorios actualizados.";
          break;
      }

      // Limit multicast to 500 tokens at a time (FCM limit)
      const chunk = (arr: any[], size: number) => arr.reduce((acc, _, i) => (i % size) ? acc : [...acc, arr.slice(i, i + size)], []);
      const tokenChunks = chunk(tokens, 500);

      for (const tokenChunk of tokenChunks) {
        const message: admin.messaging.MulticastMessage = {
          notification: { title, body },
          data: {
            notificationId: snapshot.id,
            type: data.type || "unknown",
          },
          apns: { payload: { aps: { sound: "default" } } },
          android: { notification: { sound: "default" } },
          tokens: tokenChunk,
        };
        await admin.messaging().sendEachForMulticast(message);
      }

      console.log(`Notification sent to ${tokens.length} tokens.`);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  });

/**
 * Triggers when a user document is updated.
 * Used to detect ranking changes.
 */
export const createOnUserUpdated = (databaseId: string | undefined = undefined) =>
  onDocumentUpdated({
    document: "users/{userId}",
    database: databaseId
  }, async (event) => {
    const change = event.data;
    if (!change) return;

    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (!afterData) return;

    // Trigger only if level or xp changed
    if (beforeData?.level === afterData.level && beforeData?.xp === afterData.xp) {
      return;
    }

    const db = databaseId ? getFirestore(databaseId) : getFirestore();
    await checkRankingChange(db, event.params.userId, afterData);
  });

// --- PROD ENV (Default Database) ---
export const onNotificationCreated = createOnNotificationCreated();
export const processActivityComplete = createProcessActivityComplete();
export const onReactionCreated = createOnReactionCreated();
export const onUserUpdated = createOnUserUpdated();

// --- PRE ENV (adventure-streak-pre Database) ---
export const onNotificationCreatedPRE = createOnNotificationCreated("adventure-streak-pre");
export const processActivityCompletePRE = createProcessActivityComplete("adventure-streak-pre");
export const onReactionCreatedPRE = createOnReactionCreated("adventure-streak-pre");
export const onUserUpdatedPRE = createOnUserUpdated("adventure-streak-pre");
export const onMockWorkoutCreatedPRE = createOnMockWorkoutCreated("adventure-streak-pre");

export const scheduledDailySync = dailyUserSync;
export const hourlyEngagement = createEngagementHourlyJob();
export const routineEngagement = createEngagementRoutineJob();
export const hourlyEngagementPRE = createEngagementHourlyJob("adventure-streak-pre");
export const routineEngagementPRE = createEngagementRoutineJob("adventure-streak-pre");
