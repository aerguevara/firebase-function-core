import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';

/**
 * Script to repopulate distance metrics for all users.
 * Logic:
 * 1. For each user, fetch all activities.
 * 2. Check if activity has GPS routes.
 * 3. Update totalDistanceKm (GPS) and totalDistanceNoGpsKm (Manual).
 * 4. Update currentWeekDistanceKm and currentWeekDistanceNoGpsKm based on "now".
 */

const calendarRef = new Date("2025-12-29T00:00:00Z");
const getWeekIndex = (date: Date) => {
    const diffTime = date.getTime() - calendarRef.getTime();
    if (diffTime < 0) return -1;
    return Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
};

async function repopulateMetrics(databaseId: string, dryRun: boolean = true) {
    console.log(`🚀 Starting Distance Repopulation (${dryRun ? 'DRY RUN' : 'LIVE'}) for: ${databaseId}...`);

    const serviceAccountPath = '/Users/aerguevara/Documents/develop/Adventure Streak/backend-admin/secrets/serviceAccount.json';

    if (fs.existsSync(serviceAccountPath)) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath))
            });
        }
    } else {
        console.error("❌ Service account not found at:", serviceAccountPath);
        process.exit(1);
    }

    const db = databaseId === '(default)' ? getFirestore() : getFirestore(databaseId);
    const usersSnapshot = await db.collection("users").get();
    console.log(`📡 Processing ${usersSnapshot.size} users...`);

    const today = new Date();
    const currentWeekIdx = getWeekIndex(today);

    let totalUsersProcessed = 0;

    for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const activitiesSnapshot = await db.collection("activities")
            .where("userId", "==", userId)
            .get();

        let totalGPS = 0;
        let totalManual = 0;
        let weekGPS = 0;
        let weekManual = 0;

        for (const activityDoc of activitiesSnapshot.docs) {
            const data = activityDoc.data();
            const distanceKm = (data.distanceMeters || 0) / 1000.0;
            const activityDate = data.endDate instanceof admin.firestore.Timestamp ? data.endDate.toDate() : new Date(data.endDate);
            const activityWeekIdx = getWeekIndex(activityDate);

            // Check for routes subcollection
            const routesSnapshot = await activityDoc.ref.collection("routes").limit(1).get();
            const hasGps = !routesSnapshot.empty;

            if (hasGps) {
                totalGPS += distanceKm;
                if (activityWeekIdx === currentWeekIdx) weekGPS += distanceKm;
            } else {
                totalManual += distanceKm;
                if (activityWeekIdx === currentWeekIdx) weekManual += distanceKm;
            }
        }

        const updates = {
            totalDistanceKm: totalGPS,
            totalDistanceNoGpsKm: totalManual,
            currentWeekDistanceKm: weekGPS,
            currentWeekDistanceNoGpsKm: weekManual,
            lastRepopulated: FieldValue.serverTimestamp()
        };

        if (!dryRun) {
            await userDoc.ref.update(updates);
        }

        totalUsersProcessed++;
        if (totalUsersProcessed % 10 === 0) {
            console.log(`✅ Processed ${totalUsersProcessed}/${usersSnapshot.size} users...`);
        }
    }

    console.log(`🏁 Repopulation complete! Total users: ${totalUsersProcessed}`);
}

if (require.main === module) {
    const databaseId = process.argv[2] || 'adventure-streak-pre';
    const dryRun = process.argv[3] !== 'live';
    repopulateMetrics(databaseId, dryRun).catch(console.error);
}
