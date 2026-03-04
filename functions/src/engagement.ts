import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * Factory for engagement hourly job.
 * @param databaseId Optional Firestore database ID.
 */
export const createEngagementHourlyJob = (databaseId: string | undefined = undefined) =>
    onSchedule("0 * * * *", async (event) => {
        const db = databaseId ? getFirestore(databaseId) : getFirestore();
        const now = new Date();
        const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);

        console.log(`🚀 Starting hourly engagement checks (${databaseId || "default"})...`);

        // 1. THE GUARDIAN: Check for expiring Epic/HotSpot territories
        try {
            const expiringSnap = await db.collection("remote_territories")
                .where("expiresAt", ">", Timestamp.fromDate(now))
                .where("expiresAt", "<=", Timestamp.fromDate(twelveHoursFromNow))
                .get();

            const userNotifiedToday = new Set<string>();

            for (const doc of expiringSnap.docs) {
                const data = doc.data();
                const userId = data.userId;

                const firstConq = data.firstConqueredAt?.toDate() || data.lastConqueredAt?.toDate() || new Date();
                const ageDays = (now.getTime() - firstConq.getTime()) / (1000 * 3600 * 24);
                const isImportant = ageDays > 30 || data.isHotSpot === true;

                if (isImportant && !userNotifiedToday.has(userId)) {
                    const userDoc = await db.collection("users").doc(userId).get();
                    const userData = userDoc.data();
                    const lastEng = userData?.lastEngagementNotif?.toDate() || new Date(0);

                    if (now.getTime() - lastEng.getTime() > 20 * 60 * 60 * 1000) { // 20 hours buffer
                        await db.collection("notifications").add({
                            recipientId: userId,
                            type: "territory_guardian",
                            locationLabel: data.locationLabel || "tu zona",
                            message: `Tu territorio ${ageDays > 30 ? "épico" : "estratégico"} en ${data.locationLabel || "el mapa"} expirará pronto. ¡Refuérzalo!`,
                            timestamp: FieldValue.serverTimestamp(),
                            isRead: false
                        });

                        await db.collection("users").doc(userId).update({
                            lastEngagementNotif: FieldValue.serverTimestamp()
                        });
                        userNotifiedToday.add(userId);
                    }
                }
            }
        } catch (e) {
            console.error("Guardian check failed:", e);
        }

        // 2. 5-HOUR WARNING & EXPIRED NOTIFICATIONS
        try {
            const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
            const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
            const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

            // A. 5-Hour Warning
            const expiringSoonSnap = await db.collection("remote_territories")
                .where("expiresAt", ">", Timestamp.fromDate(fourHoursFromNow))
                .where("expiresAt", "<=", Timestamp.fromDate(fiveHoursFromNow))
                .get();

            const userWarningSent = new Set<string>(); // composite key: userId_locationLabel

            for (const doc of expiringSoonSnap.docs) {
                const data = doc.data();
                const userId = data.userId;
                const locationLabel = data.locationLabel || "tus zonas";
                const key = `${userId}_${locationLabel}`;

                if (!userWarningSent.has(key)) {
                    await db.collection("notifications").add({
                        recipientId: userId,
                        type: "territory_expiring_soon",
                        locationLabel: data.locationLabel || null,
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false
                    });
                    userWarningSent.add(key);
                }
            }

            // B. Expired Notifications
            const expiredSnap = await db.collection("remote_territories")
                .where("expiresAt", ">", Timestamp.fromDate(oneHourAgo))
                .where("expiresAt", "<=", Timestamp.fromDate(now))
                .get();

            const userExpiredSent = new Set<string>(); // composite key: userId_locationLabel

            for (const doc of expiredSnap.docs) {
                const data = doc.data();
                const userId = data.userId;
                const locationLabel = data.locationLabel || "tus zonas";
                const key = `${userId}_${locationLabel}`;

                if (!userExpiredSent.has(key)) {
                    await db.collection("notifications").add({
                        recipientId: userId,
                        type: "territories_expired",
                        locationLabel: data.locationLabel || null,
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false
                    });
                    userExpiredSent.add(key);
                }
            }
        } catch (e) {
            console.error("Expiry warning checks failed:", e);
        }
    });

/**
 * Factory for engagement routine job.
 * @param databaseId Optional Firestore database ID.
 */
export const createEngagementRoutineJob = (databaseId: string | undefined = undefined) =>
    onSchedule("0 9 * * *", async (event) => {
        const db = databaseId ? getFirestore(databaseId) : getFirestore();
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

        console.log(`🚀 Starting routine engagement job (${databaseId || "default"}, Day: ${dayOfWeek})...`);

        // A. WEEKLY RECAP (Monday)
        if (dayOfWeek === 1) {
            const usersSnap = await db.collection("users").get();
            for (const doc of usersSnap.docs) {
                const userData = doc.data();
                if ((userData.totalActivities || 0) > 0) {
                    await db.collection("notifications").add({
                        recipientId: doc.id,
                        type: "weekly_recap",
                        message: `¡Vaya semana! Has mantenido ${userData.totalCellsOwned || 0} territorios. ¿Listo para más?`,
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false
                    });
                }
            }
        }

        // B. STREAK SAVER (Saturday)
        if (dayOfWeek === 6) {
            const usersSnap = await db.collection("users").where("currentStreakWeeks", ">", 2).get();
            for (const doc of usersSnap.docs) {
                const userData = doc.data();
                const lastActivity = userData.lastActivityDate?.toDate() || new Date(0);
                const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
                if (lastActivity < fiveDaysAgo) {
                    await db.collection("notifications").add({
                        recipientId: doc.id,
                        type: "streak_saver",
                        streakWeeks: userData.currentStreakWeeks,
                        message: `¡No pierdas tu racha de ${userData.currentStreakWeeks} semanas! ❄️ Entrena hoy para salvarla.`,
                        timestamp: FieldValue.serverTimestamp(),
                        isRead: false
                    });
                }
            }
        }
    });
