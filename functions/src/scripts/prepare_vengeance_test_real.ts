
import * as admin from 'firebase-admin';

// Initialize Firebase Admin for PRE environment
const serviceAccount = require('/Users/aerguevara/Documents/develop/Adventure Streak/Docs/serviceAccount.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://adventure-streak-pre-default-rtdb.europe-west1.firebasedatabase.app"
    });
}

const db = admin.firestore();
db.settings({ databaseId: 'adventure-streak-pre' });

async function prepareTest() {
    const victimId = 'DQN1tyypsEZouksWzmFeSIYip7b2';
    const thiefId = 'CVZ34x99UuU6fCrOEc8Wg5nPYX82';
    const cellId = '-1810_20235';

    console.log(`🚀 Preparing Vengeance Test: ${victimId} vs ${thiefId}`);

    try {
        // 1. Update territory ownership
        const territoryRef = db.collection('remote_territories').doc(cellId);
        const territorySnap = await territoryRef.get();

        if (!territorySnap.exists) {
            console.error(`❌ Territory ${cellId} not found!`);
            return;
        }

        const territoryData = territorySnap.data()!;
        await territoryRef.update({
            userId: thiefId,
            lastInteraction: 'steal'
        });
        console.log(`✅ Territory ${cellId} owned by thief ${thiefId}`);

        // 2. Add steal to history
        const now = new Date();
        await territoryRef.collection('history').add({
            userId: thiefId,
            previousOwnerId: victimId,
            interaction: 'steal',
            timestamp: admin.firestore.Timestamp.fromDate(now)
        });
        console.log(`✅ Steal event added to history`);

        // 3. Get Thief Name
        const thiefSnap = await db.collection('users').doc(thiefId).get();
        const thiefName = thiefSnap.data()?.displayName || "Jugador";

        // 4. Create Vengeance Target
        const vengeanceRef = db.collection('users').doc(victimId).collection('vengeance_targets').doc(cellId);
        await vengeanceRef.set({
            cellId: cellId,
            centerLatitude: territoryData.centerLatitude,
            centerLongitude: territoryData.centerLongitude,
            thiefId: thiefId,
            thiefName: thiefName,
            stolenAt: admin.firestore.Timestamp.fromDate(now),
            xpReward: 25
        });
        console.log(`✅ Vengeance target created for ${victimId} (Thief: ${thiefName})`);

        console.log('\n🏁 Phase 1 Complete! Open the app and check the Workouts carousel.');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

prepareTest();
