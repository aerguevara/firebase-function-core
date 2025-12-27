import * as admin from "firebase-admin";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";

const serviceAccountPath = "/Users/aerguevara/Documents/develop/Adventure Streak/backend-admin/secrets/serviceAccount.json";
const PAGE_SIZE = 400;
const PROFILE_CHUNK_SIZE = 30;
const BATCH_WRITE_LIMIT = 400;

interface RivalEntry {
    userId?: string;
    displayName?: string;
    avatarURL?: string | null;
    lastInteractionAt?: admin.firestore.Timestamp | Date;
    count?: number;
}

async function processDatabase(db: Firestore, dbName: string) {
    console.log(`\nStarting recentThieves avatar backfill for database: ${dbName}`);

    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    let scannedUsers = 0;
    let updatedUsers = 0;
    let page = 0;

    while (true) {
        let query = db.collection("users")
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(PAGE_SIZE);

        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) break;

        page += 1;
        scannedUsers += snapshot.size;

        const thiefIds = new Set<string>();
        snapshot.docs.forEach(doc => {
            const data = doc.data() || {};
            const recentThieves = Array.isArray(data.recentThieves)
                ? (data.recentThieves as RivalEntry[])
                : [];
            for (const entry of recentThieves) {
                if (entry?.userId) thiefIds.add(entry.userId);
            }
        });

        const profileMap = new Map<string, { displayName: string | null; avatarURL: string | null }>();
        const thiefIdArray = Array.from(thiefIds);

        for (let i = 0; i < thiefIdArray.length; i += PROFILE_CHUNK_SIZE) {
            const chunk = thiefIdArray.slice(i, i + PROFILE_CHUNK_SIZE);
            if (chunk.length === 0) continue;

            const profileSnapshot = await db.collection("users")
                .where(admin.firestore.FieldPath.documentId(), "in", chunk)
                .get();

            profileSnapshot.forEach(profileDoc => {
                const profileData = profileDoc.data() || {};
                profileMap.set(profileDoc.id, {
                    displayName: profileData.displayName || null,
                    avatarURL: profileData.avatarURL || profileData.photoURL || null
                });
            });
        }

        let batch = db.batch();
        let batchCount = 0;
        let pageUpdated = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data() || {};
            const recentThieves = Array.isArray(data.recentThieves)
                ? (data.recentThieves as RivalEntry[])
                : [];

            if (recentThieves.length === 0) continue;

            let changed = false;
            const updatedThieves = recentThieves.map(entry => {
                if (!entry?.userId) return entry;
                const profile = profileMap.get(entry.userId);
                if (!profile) return entry;

                let next: RivalEntry = entry;
                if (profile.displayName && profile.displayName !== entry.displayName) {
                    next = { ...next, displayName: profile.displayName };
                    changed = true;
                }
                if (profile.avatarURL && profile.avatarURL !== entry.avatarURL) {
                    next = { ...next, avatarURL: profile.avatarURL };
                    changed = true;
                }
                return next;
            });

            if (changed) {
                batch.update(doc.ref, { recentThieves: updatedThieves });
                batchCount += 1;
                pageUpdated += 1;
            }

            if (batchCount >= BATCH_WRITE_LIMIT) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        updatedUsers += pageUpdated;
        console.log(`Page ${page}: scanned ${snapshot.size} users, updated ${pageUpdated} users.`);
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log(`Completed ${dbName}. Users scanned: ${scannedUsers}, users updated: ${updatedUsers}.`);
}

async function runBackfill() {
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Authenticated with service account.");
    } else {
        console.log("Service account not found, using default credentials.");
        admin.initializeApp();
    }

    const dbProd = getFirestore();
    await processDatabase(dbProd, "(default)");

    try {
        const dbPre = getFirestore(admin.app(), "adventure-streak-pre");
        await processDatabase(dbPre, "adventure-streak-pre");
    } catch (e) {
        console.error("Failed to process PRE database. Ensure it exists and is accessible.", e);
    }
}

runBackfill()
    .then(() => {
        console.log("All done.");
        process.exit(0);
    })
    .catch(e => {
        console.error("Fatal error:", e);
        process.exit(1);
    });
