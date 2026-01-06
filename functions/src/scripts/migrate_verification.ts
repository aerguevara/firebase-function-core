
import * as admin from 'firebase-admin';
import * as path from 'path';

// Force color output for better readability
process.env.FORCE_COLOR = '1';

const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');

admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: "adventure-streak"
});

// Helper to get Firestore instance for a specific database ID
const { getFirestore } = require('firebase-admin/firestore');

function getDatabase(dbId: string): admin.firestore.Firestore {
    if (dbId === '(default)') {
        return getFirestore();
    } else {
        console.log(`🔌 Accessing named DB via getFirestore(dbId): ${dbId}`);
        // Try passing string directly if library supports it (some versions do lookup by ID)
        try {
            // @ts-ignore
            return getFirestore(dbId);
        } catch (e) {
            console.log("Direct string failed, trying app init...");
            const appName = `app-${dbId}`;
            const existingApp = admin.apps.find(app => app?.name === appName);
            if (existingApp) return existingApp.firestore();

            const app = admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath)),
                projectId: "adventure-streak",
                databaseId: dbId
            } as any, appName);
            return app.firestore();
        }
    }
}

async function migrateDatabase(dbId: string, label: string) {
    console.log(`\n===============================================================`);
    console.log(`🚀 STARTING MIGRATION FOR: ${label} (DB: ${dbId})`);
    console.log(`===============================================================`);

    const db = getDatabase(dbId);
    const usersRef = db.collection('users');
    let processedCount = 0;
    let updatedCount = 0;

    // Process in batches
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
        console.log("⚠️ No users found in this database.");
        return;
    }

    console.log(`📊 Found ${snapshot.size} users. Checking verification status...`);

    const batchSize = 500;
    let batch = db.batch();
    let batchOperationCount = 0;

    for (const doc of snapshot.docs) {
        processedCount++;
        const data = doc.data();

        // CHECK 1: Invitation Verified?
        // We assume false/undefined needs fix.
        const needsVerification = data.invitationVerified !== true;

        // CHECK 2: Quota Update?
        // We want to ensure they have 15. Only set if missing or different?
        // Actually, let's just FORCE set it to 15 for everyone to be generous/consistent 
        // OR only if they don't have it? 
        // User asked: "en cuota le pones 15". I will force set it to 15 for consistency for everyone migrated.
        const currentQuota = data.invitationQuota;
        const needsQuotaUpdate = currentQuota !== 15;

        // CHECK 3: Invitation Count?
        // Initialize to 0 if missing.
        const needsCountInit = data.invitationCount === undefined || data.invitationCount === null;

        if (needsVerification || needsQuotaUpdate || needsCountInit) {
            const updates: any = {};

            if (needsVerification) {
                updates.invitationVerified = true;
            }

            if (needsQuotaUpdate) {
                updates.invitationQuota = 15;
            }

            if (needsCountInit) {
                updates.invitationCount = 0;
            }

            batch.update(doc.ref, updates);
            updatedCount++;
            batchOperationCount++;

            console.log(`[${processedCount}/${snapshot.size}] UPDATE User ${doc.id} | Verified: ${data.invitationVerified} -> true | Quota: ${currentQuota} -> 15`);
        } else {
            console.log(`[${processedCount}/${snapshot.size}] SKIP User ${doc.id} | Verified: ${data.invitationVerified} | Quota: ${currentQuota}`);
        }

        // Commit batch if full
        if (batchOperationCount >= batchSize) {
            await batch.commit();
            console.log(`\n💾 Committed batch of ${batchOperationCount} updates.`);
            batch = db.batch();
            batchOperationCount = 0;
        }
    }

    // Commit remaining
    if (batchOperationCount > 0) {
        await batch.commit();
        console.log(`\n💾 Committed final batch of ${batchOperationCount} updates.`);
    }

    console.log(`\n🎉 MIGRATION COMPLETE FOR ${label}`);
    console.log(`   - Total Users Scanned: ${processedCount}`);
    console.log(`   - Total Users Updated: ${updatedCount}`);
}

async function main() {
    try {
        // 1. Run for PRE
        await migrateDatabase('adventure-streak-pre', 'PRE-PRODUCTION');

        // 2. Run for PRO
        await migrateDatabase('(default)', 'PRODUCTION');

        console.log("\n✅ All migrations finished successfully.");
        process.exit(0);
    } catch (error) {
        console.error("\n❌ Migration failed:", error);
        process.exit(1);
    }
}

main();
