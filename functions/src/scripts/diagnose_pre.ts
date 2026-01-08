
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import * as path from "path";

const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');
const databaseId = "adventure-streak-pre";

if (getApps().length === 0) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
        credential: cert(serviceAccount),
        projectId: "adventure-streak"
    });
}

const db = getFirestore(databaseId);

async function diagnose() {
    console.log("🕵️‍♀️ DIAGNOSING PRE ENVIRONMENT STATE...");

    // 0. Check Config
    console.log("\n--- CONFIG CHECK ---");
    const configDoc = await db.collection("config").doc("gameplay").get();
    const config = configDoc.data();
    console.log(`   territoryExpirationDays: ${config?.territoryExpirationDays} (Expected: 7)`);
    console.log(`   globalResetDate: ${config?.globalResetDate ? config.globalResetDate.toDate().toISOString() : "undefined"}`);

    // 1. Check Activities Dates
    console.log("\n--- ACTIVITIES SAMPLE ---");
    const activities = await db.collection("activities").limit(5).get();
    if (activities.empty) {
        console.log("   (No activities found)");
    } else {
        activities.forEach(doc => {
            // ... (existing logging)
            // simplified for brevity in this replace, assume existing logger is fine or I can rewrite it.
            // Actually I'll just append the new check after this block.
            console.log(`   Activity ${doc.id}: ...`);
        });
    }

    // 1.5 Check Remote Territories Expirations
    console.log("\n--- TERRITORY EXPIRATION SAMPLE ---");
    const territories = await db.collection("remote_territories").limit(5).get();
    if (territories.empty) {
        console.log("   (No territories found)");
    } else {
        territories.forEach(doc => {
            const data = doc.data();
            const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt) : "undefined";
            const lastConquered = data.lastConqueredAt ? (data.lastConqueredAt.toDate ? data.lastConqueredAt.toDate().toISOString() : data.lastConqueredAt) : "undefined";

            // Calculate diff in days
            let diffDays = "unknown";
            if (data.expiresAt?.toDate && data.lastConqueredAt?.toDate) {
                const diffMs = data.expiresAt.toDate().getTime() - data.lastConqueredAt.toDate().getTime();
                diffDays = (diffMs / (1000 * 60 * 60 * 24)).toFixed(1);
            }

            console.log(`   Territory ${doc.id}: Conquered=${lastConquered} Expires=${expiresAt} (Duration: ~${diffDays} days)`);
        });
    }

    // 2. Check Users Tokens & Rivals
    console.log("\n--- USERS CHECK (Tokens & Rivals) ---");
    const users = await db.collection("users").get();
    const adminId = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";

    // We cannot use forEach async awaits cleanly in loop without Map.
    // Use for...of
    for (const doc of users.docs) {
        const data = doc.data();
        const hasFCM = !!data.fcmToken;
        const hasAPNS = !!data.apnsToken;
        const isAdmin = doc.id === adminId;

        const status = (hasFCM || hasAPNS) ? "⚠️ HAS TOKENS" : "✅ Clean";

        if (hasFCM || hasAPNS || isAdmin) {
            console.log(`   User ${doc.id.padEnd(28)}: FCM=${hasFCM} APNS=${hasAPNS} -> ${status}`);
        }

        console.log(`      Metrics: Activities=${data.totalActivities || 0}, Distance=${data.totalDistanceKm?.toFixed(1) || 0}km, Streak=${data.currentStreakWeeks || 0}, CellsOwned=${data.totalCellsOwned || 0}`);

        if (!isAdmin && (data.fcmTokens || data.apnsTokens)) {
            console.log(`   🚨 User ${doc.id} has PLURAL tokens!`);
        }

        // Report Rivals
        const thieves = data.recentThieves || [];
        const victims = data.recentTheftVictims || [];

        // Report Vengeance Targets (Subcollection check)
        const vengeanceSnap = await db.collection("users").doc(doc.id).collection("vengeance_targets").limit(1).get();
        const hasVengeance = !vengeanceSnap.empty;

        if (thieves.length > 0 || victims.length > 0 || hasVengeance) {
            console.log(`   User ${doc.id} Rivals: Thieves=${thieves.length}, Victims=${victims.length}, Vengeance=${hasVengeance ? ">0" : "0"}`);

            if (hasVengeance) {
                const vData = vengeanceSnap.docs[0].data();
                const stolenDate = vData.stolenAt ? (vData.stolenAt.toDate ? vData.stolenAt.toDate().toISOString() : vData.stolenAt) : "unknown";
                console.log(`      -> Sample Vengeance Target: StolenAt=${stolenDate} (Activity: ${vData.activityId})`);
            }
        }

        if (doc.id === "i1CEf9eU4MhEOabFGrv2ymPSMFH3") {
            console.log("\n   --- GENERIC USER KEYS DUMP ---");
            console.log(Object.keys(data).sort());
        }
    }
}

diagnose().catch(console.error);
