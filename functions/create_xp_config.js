const admin = require('firebase-admin');
const serviceAccount = require('../../../Docs/serviceAccount.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const defaultXPConfig = {
    minDistanceKm: 0.5,
    minDurationSeconds: 5 * 60,

    baseFactorPerKm: 10.0,
    factorRun: 1.2,
    factorBike: 0.7,
    factorWalk: 0.9,
    factorOther: 1.0,
    factorIndoor: 0.5,
    indoorXPPerMinute: 3.0,

    dailyBaseXPCap: 300,

    xpPerNewCell: 8,
    xpPerDefendedCell: 3,
    xpPerRecapturedCell: 12,
    maxNewCellsXPPerActivity: 50,

    baseStreakXPPerWeek: 10,

    weeklyRecordBaseXP: 30,
    weeklyRecordPerKmDiffXP: 5,
    minWeeklyRecordKm: 5.0,

    legendaryThresholdCells: 20
};

async function createConfig() {
    try {
        await db.collection('config').doc('gamification').set(defaultXPConfig);
        console.log('✅ Successfully created config/gamification in Firestore.');
    } catch (error) {
        console.error('❌ Error creating config:', error);
    }
}

createConfig();
