import * as admin from "firebase-admin";
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

/**
 * Script to generate a manual invitation token for debugging.
 * Usage: npx ts-node src/scripts/generate_debug_invitation.ts [databaseId] [token]
 */

async function generateDebugInvitation(databaseId: string, customToken?: string) {
    const serviceAccountPath = '/Users/aerguevara/Documents/develop/Adventure Streak/backend-admin/secrets/serviceAccount.json';

    if (fs.existsSync(serviceAccountPath)) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath))
            });
        }
    } else {
        console.error("❌ Service account not found");
        process.exit(1);
    }

    const db = databaseId === '(default)' ? getFirestore() : getFirestore(databaseId);
    const token = customToken || `DEBUG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const inviteRef = db.collection("invitations").doc(token);

    await inviteRef.set({
        token: token,
        status: "pending",
        usedBy: null,
        issuer: "SYSTEM-DEBUG",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: null // Never expires for debug
    });

    console.log(`\n✅ Invitation generated successfully!`);
    console.log(`🎫 Token: ${token}`);
    console.log(`🌐 Database: ${databaseId}\n`);
}

if (require.main === module) {
    const databaseId = process.argv[2] || 'adventure-streak-pre';
    const customToken = process.argv[3];
    generateDebugInvitation(databaseId, customToken).catch(console.error);
}
