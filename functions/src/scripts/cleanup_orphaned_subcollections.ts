import * as admin from 'firebase-admin';
import * as path from 'path';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Load service account
const serviceAccountPath = path.resolve(__dirname, '../../../../../backend-admin/secrets/serviceAccount.json');
const serviceAccount = require(serviceAccountPath);

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: "adventure-streak"
    });
}

const db = getFirestore("adventure-streak-pre");
const TARGET_USER_ID = "CVZ34x99UuU6fCrOEc8Wg5nPYX82";

/**
 * Moves a document and its subcollections (Standalone version of user_management logic)
 */
async function moveDocument(
    db: admin.firestore.Firestore,
    sourcePath: string,
    destPath: string,
    includeSubcollections: boolean = false
) {
    const sourceRef = db.doc(sourcePath);
    const destRef = db.doc(destPath);
    const docSnap = await sourceRef.get();

    // If doc exists, copy it. If not, we might still want to check subcollections if we are in "orphaned" mode
    // But for this script, we are being explicit about subcollections.

    if (docSnap.exists) {
        const data = docSnap.data();
        if (data) {
            await destRef.set({
                ...data,
                archivedAt: FieldValue.serverTimestamp(),
            });
        }
    }

    if (includeSubcollections) {
        const subcollections = await sourceRef.listCollections();
        for (const sub of subcollections) {
            console.log(`Processing subcollection: ${sub.id}`);
            const docs = await sub.get();
            for (const d of docs.docs) {
                await moveDocument(db, `${sourcePath}/${sub.id}/${d.id}`, `${destPath}/${sub.id}/${d.id}`, true);
            }
        }
    }

    // Only delete if it existed or we processed subcollections? 
    // Ideally we delete the doc at the end. Firestore allows deleting non-existent doc (no-op).
    if (docSnap.exists) {
        await sourceRef.delete();
    }
}


async function cleanupOrphans() {
    console.log(`🧹 Cleaning up orphaned subcollections for user: ${TARGET_USER_ID}`);

    // We know the parent doc is likely gone, so moveDocument(users/ID) would skip.
    // We explicitly list the subcollections we found in verification.

    // BUT, we can use a modified helper that doesn't require parent existence to traverse down.

    const sourcePath = `users/${TARGET_USER_ID}`;
    const destPath = `archived_users/${TARGET_USER_ID}`;

    const userRef = db.doc(sourcePath);
    const subcollections = await userRef.listCollections();

    if (subcollections.length === 0) {
        console.log("No subcollections found to clean up.");
        return;
    }

    // Ensure parent archived doc exists (create placeholder if needed)
    const archivDoc = await db.doc(destPath).get();
    if (!archivDoc.exists) {
        console.log("Creating placeholder for archived user (since original is gone)...");
        await db.doc(destPath).set({
            _archivedReason: "Orphaned subcollection cleanup",
            archivedAt: FieldValue.serverTimestamp()
        });
    }

    for (const sub of subcollections) {
        console.log(`Working on subcollection: ${sub.id}`);
        const docs = await sub.get();
        for (const d of docs.docs) {
            console.log(` -> Moving doc ${d.id}`);
            await moveDocument(db, `${sourcePath}/${sub.id}/${d.id}`, `${destPath}/${sub.id}/${d.id}`, true);
        }
    }

    console.log("✨ Cleanup complete.");
}

cleanupOrphans().catch(console.error);
