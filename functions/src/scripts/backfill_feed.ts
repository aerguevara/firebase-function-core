import * as admin from "firebase-admin";

// Initialize Firebase Admin
// Assuming GOOGLE_APPLICATION_CREDENTIALS is set or using default credentials
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function backfillFeed() {
    console.log("🚀 Starting Feed Backfill...");

    try {
        const feedSnapshot = await db.collection("feed").get();
        console.log(`📦 Found ${feedSnapshot.size} feed events.`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        const batch = db.batch();
        let batchCount = 0;

        for (const doc of feedSnapshot.docs) {
            const feedData = doc.data();
            const activityData = feedData.activityData || {};

            // Check if locationLabel is missing or null
            if (!activityData.locationLabel) {
                const activityId = feedData.activityId;
                if (!activityId) {
                    console.log(`⚠️ Feed event ${doc.id} has no activityId.`);
                    continue;
                }

                try {
                    // Fetch source activity
                    const activityDoc = await db.collection("activities").doc(activityId).get();
                    if (activityDoc.exists) {
                        const activitySource = activityDoc.data();
                        const label = activitySource?.locationLabel;

                        if (label) {
                            console.log(`✅ Found label '${label}' for activity ${activityId}. Updating feed ${doc.id}...`);

                            // Update the feed document
                            const feedRef = db.collection("feed").doc(doc.id);
                            batch.update(feedRef, {
                                "activityData.locationLabel": label,
                                // Also update title if it was generic
                                // "title": label // Optional: Decide if we want to overwrite the title too? 
                                // User said "standardize data", so let's stick to the missing field first.
                            });

                            batchCount++;
                            updatedCount++;
                        } else {
                            console.log(`ℹ️ Activity ${activityId} has no locationLabel either.`);
                            skippedCount++;
                        }
                    } else {
                        console.log(`❌ Activity ${activityId} not found for feed ${doc.id}.`);
                        errorCount++;
                    }
                } catch (err) {
                    console.error(`Error processing feed ${doc.id}:`, err);
                    errorCount++;
                }
            } else {
                // console.log(`✓ Feed ${doc.id} already has label.`);
            }

            // Commit batch if large
            if (batchCount >= 400) {
                await batch.commit();
                console.log(`💾 Committed batch of ${batchCount} updates.`);
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`💾 Committed final batch of ${batchCount} updates.`);
        }

        console.log("🏁 Backfill Complete.");
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped (Reference missing): ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (error) {
        console.error("🔥 Fatal error during backfill:", error);
    }
}

backfillFeed();
