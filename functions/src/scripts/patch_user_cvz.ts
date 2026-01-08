
import * as admin from 'firebase-admin';
import * as path from 'path';

// Ruta relativa desde functions/src/scripts/ hacia la raíz del proyecto
const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');

admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: "adventure-streak"
});

import { getFirestore } from 'firebase-admin/firestore';

// Para el entorno PRE
const db = getFirestore("adventure-streak-pre");

async function patchUser() {
    const userId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
    console.log(`🔍 Buscando usuario ${userId}...`);

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        console.error("❌ Usuario no encontrado");
        return;
    }

    const data = userDoc.data();
    if (!data) return;

    const history = data.seasonHistory || {};
    let updated = false;
    const newHistory: any = {};

    console.log("📂 Validando historial de temporadas...");

    for (const [key, entry] of Object.entries(history)) {
        const item = entry as any;
        let itemModified = false;

        // Clone item
        const newItem = { ...item };

        // 1. Fix missing seasonName
        if (!newItem.seasonName) {
            newItem.seasonName = key === 'test_pagination_2026' ? 'Despertar del Explorador' : 'Temporada Anterior';
            console.log(`   ✏️ [${key}] Agregado seasonName: ${newItem.seasonName}`);
            itemModified = true;
        }

        // 2. Fix missing finalCells
        if (newItem.finalCells === undefined || newItem.finalCells === null) {
            newItem.finalCells = 0;
            console.log(`   ✏️ [${key}] Agregado finalCells: 0`);
            itemModified = true;
        }

        // 3. Fix id vs seasonId (Ensure 'id' exists if 'seasonId' is present, just in case)
        if (newItem.seasonId && !newItem.id) {
            newItem.id = newItem.seasonId; // Map seasonId to id for Codable
            console.log(`   ✏️ [${key}] Mapeado seasonId -> id`);
            itemModified = true;
        }

        if (itemModified) {
            updated = true;
        }
        newHistory[key] = newItem;
    }

    if (updated) {
        await userRef.update({
            seasonHistory: newHistory,
            // Force invitationVerified just in case, though it looked true
            invitationVerified: true
        });
        console.log("✅ Usuario actualizado exitosamente.");
    } else {
        console.log("✨ No se requirieron cambios.");
    }
}

patchUser().catch(console.error);
