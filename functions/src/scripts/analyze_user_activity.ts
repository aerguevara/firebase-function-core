import * as admin from 'firebase-admin';
import * as path from 'path';
import { getFirestore } from 'firebase-admin/firestore';

// Ruta relativa desde functions/src/scripts/ hacia la raíz del proyecto
const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        projectId: "adventure-streak" // Siempre incluir explícitamente
    });
}

// Para el entorno PRO (usando el import correcto según los otros scripts)
const db = getFirestore("(default)");

async function analyzeUserActivity(userId: string) {
    console.log(`🔍 Analizando usuario: ${userId}`);

    // 1. Fetch User Data
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
        console.error(`❌ Usuario ${userId} no encontrado.`);
        return;
    }
    const userData = userDoc.data();
    console.log("\n👤 --- DATOS DEL USUARIO ---");
    console.log(JSON.stringify(userData, null, 2));

    // 2. Fetch Activities (fetching more and sorting in JS to avoid index requirement)
    console.log("\n🏃 Buscando la última actividad (ordenando en local)...");
    const activitiesSnapshot = await db.collection("activities")
        .where("userId", "==", userId)
        .get();

    if (activitiesSnapshot.empty) {
        console.log("❌ No se encontraron actividades para este usuario.");
        return;
    }

    // Sort by endDate descending in memory to avoid "missing index" error
    const sortedActivities = activitiesSnapshot.docs
        .map(doc => ({ id: doc.id, data: doc.data() }))
        .sort((a: any, b: any) => {
            const dateA = a.data.endDate?.toDate ? a.data.endDate.toDate().getTime() : new Date(a.data.endDate).getTime();
            const dateB = b.data.endDate?.toDate ? b.data.endDate.toDate().getTime() : new Date(b.data.endDate).getTime();
            return dateB - dateA;
        });

    const activityObj = sortedActivities[0];
    const activityData = activityObj.data;
    const activityId = activityObj.id;

    console.log("\n📋 --- DATOS DE LA ACTIVIDAD ---");
    console.log(`ID: ${activityId}`);
    console.log(JSON.stringify(activityData, null, 2));

    // 3. Fetch Route Points
    console.log("\n📍 Buscando puntos de la ruta...");
    const routesSnapshot = await db.collection(`activities/${activityId}/routes`).get();

    if (routesSnapshot.empty) {
        console.log("⚠️ No se encontró colección de rutas para esta actividad.");
    } else {
        const chunks = routesSnapshot.docs
            .map((d: any) => d.data())
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

        let allPoints: any[] = [];
        for (const chunk of chunks) {
            if (chunk.points && Array.isArray(chunk.points)) {
                allPoints = allPoints.concat(chunk.points.map((p: any) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                    timestamp: p.timestamp && p.timestamp.toDate ? p.timestamp.toDate().toISOString() : p.timestamp,
                })));
            }
        }

        console.log("\n🛣️ --- PUNTOS DE LA RUTA ---");
        console.log(`Total de puntos encontrados: ${allPoints.length}`);
        if (allPoints.length > 0) {
            if (allPoints.length > 20) {
                console.log("Primeros 10 puntos:");
                console.log(JSON.stringify(allPoints.slice(0, 10), null, 2));
                console.log("...");
                console.log("Últimos 10 puntos:");
                console.log(JSON.stringify(allPoints.slice(-10), null, 2));
            } else {
                console.log(JSON.stringify(allPoints, null, 2));
            }
        }
    }

    console.log("\n✅ Análisis completado.");
}

const targetUserId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";
analyzeUserActivity(targetUserId).catch(console.error);
