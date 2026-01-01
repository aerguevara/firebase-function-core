const admin = require('firebase-admin');
const serviceAccount = require('../../../Docs/serviceAccount.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'adventure-streak'
});

const dbs = ['(default)', 'adventure-streak-pre'];

const { getFirestore } = require('firebase-admin/firestore');

async function updateConfig() {
    for (const dbId of dbs) {
        console.log(`Updating database: ${dbId}...`);
        const db = getFirestore(dbId);

        // Set globalResetDate to Dec 1, 2025
        const resetDate = new Date('2025-12-01T00:00:00Z');

        await db.collection('config').doc('gameplay').set({
            globalResetDate: admin.firestore.Timestamp.fromDate(resetDate),
            workoutLookbackDays: 29, // To cover Dec 1 from Dec 29
            loadHistoricalWorkouts: true,
            territoryExpirationDays: 30,
            onboardingImportLimit: 10
        }, { merge: true });

        console.log(`✅ ${dbId}: globalResetDate set to ${resetDate.toISOString()}`);
    }
    process.exit(0);
}

updateConfig().catch(err => {
    console.error('❌ Error updating config:', err);
    process.exit(1);
});
