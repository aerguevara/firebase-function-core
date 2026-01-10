import * as admin from 'firebase-admin';
import * as path from 'path';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        projectId: "adventure-streak"
    });
}

async function run() {
    const db = getFirestore("adventure-streak-pre");
    const anyeloId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    const albanysId = "JaSFY1oPRUfJmuIgFf1LUzl6yOp2";

    const cellsToStealBack = ["-1836_20192", "-1837_20192"];
    const cellToDefend = "-1837_20191";

    console.log("🛠️ Preparando estado en PRE para test de venganza...");

    const batch = db.batch();

    // 1. Poner 2 celdas como propiedad de Albanys
    for (const cellId of cellsToStealBack) {
        const ref = db.collection("remote_territories").doc(cellId);
        batch.update(ref, {
            userId: albanysId,
            activityId: "EXTERNAL_ACTIVITY_ID", // Diferente para que NO sea auto-colisión
            lastConqueredAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-09T10:00:00Z")),
            expiresAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-16T10:00:00Z"))
        });

        // 2. Añadirlas como objetivos de venganza para Anyelo
        const vengeanceRef = db.collection("users").doc(anyeloId).collection("vengeance_targets").doc(cellId);
        batch.set(vengeanceRef, {
            cellId: cellId,
            thiefId: albanysId,
            stolenAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-09T10:00:00Z")),
            expiresAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-16T10:00:00Z")),
            xpReward: 25
        });
    }

    // 3. Poner 1 celda como defensa (propiedad de Anyelo pero de una actividad antigua)
    const defendRef = db.collection("remote_territories").doc(cellToDefend);
    batch.update(defendRef, {
        userId: anyeloId,
        activityId: "PREVIOUS_ANYELO_ACTIVITY",
        lastConqueredAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-09T11:00:00Z")),
        expiresAt: admin.firestore.Timestamp.fromDate(new Date("2026-01-16T11:00:00Z"))
    });

    await batch.commit();
    console.log("✅ Estado de PRE restaurado para el test.");
}

run().catch(console.error);
