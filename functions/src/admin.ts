/* eslint-disable */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, Timestamp, Firestore, DocumentReference } from "firebase-admin/firestore";

/**
 * ADMIN TASKS TRIGGER
 * Handles high-privilege administrative operations like Season Resets.
 */

const CONCURRENCY_LIMIT = 20;

export const createOnAdminTaskCreated = (databaseId: string | undefined = undefined) =>
  onDocumentCreated({
    document: "admin_tasks/{taskId}",
    database: databaseId,
    timeoutSeconds: 540, // Max timeout (9 minutes)
    memory: "1GiB"
  }, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    if (!data || data.status === "completed" || data.status === "failed") {
      return;
    }

    const db = databaseId ? getFirestore(databaseId) : getFirestore();
    const taskId = event.params.taskId;

    try {
      // Update status to processing
      await snapshot.ref.update({
        status: "processing",
        startedAt: FieldValue.serverTimestamp()
      });

      if (data.type === "season_reset") {
        await executeSeasonReset(db, data, snapshot.ref);
      } else {
        throw new Error(`Unknown task type: ${data.type}`);
      }

      await snapshot.ref.update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp()
      });

      console.log(`[AdminTask] Task ${taskId} (${data.type}) completed successfully.`);
    } catch (error: any) {
      console.error(`[AdminTask] Task ${taskId} failed:`, error);
      await snapshot.ref.update({
        status: "failed",
        error: error.message || "Unknown error",
        failedAt: FieldValue.serverTimestamp()
      });
    }
  });

async function executeSeasonReset(db: Firestore, params: any, taskRef: DocumentReference) {
  const { seasonId, seasonName, startDate: startDateStr } = params;

  if (!seasonId || !seasonName || !startDateStr) {
    throw new Error("Missing required parameters: seasonId, seasonName, startDate");
  }

  const startDate = new Date(startDateStr).getTime() > 0 ? new Date(startDateStr) : new Date();
  
  console.log(`[SeasonReset] Starting reset for ${seasonId} (${seasonName}) at ${startDate.toISOString()}`);

  // 1. Silent Mode ON
  await setSilentMode(db, true);

  try {
    // Phase 1: Archive
    await taskRef.update({ phase: "archiving" });
    await phase1Archive(db, startDate);

    // Phase 2: Cleanup
    await taskRef.update({ phase: "cleanup" });
    await phase2Cleanup(db, startDate);

    // Phase 3: User Reset
    await taskRef.update({ phase: "user_reset" });
    await phase3UserReset(db, seasonId, seasonName, startDate);

    // Phase 4: Config Update
    await taskRef.update({ phase: "configuring" });
    const subtitleFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
    const subtitle = subtitleFormatter.format(startDate);

    await db.collection("config").doc("gameplay").update({
      globalResetDate: Timestamp.fromDate(startDate),
      currentSeasonId: seasonId,
      currentSeasonName: seasonName,
      currentSeasonSubtitle: subtitle,
      territoryExpirationDays: 7,
      lastResetAt: FieldValue.serverTimestamp()
    });

    // Phase 5: Reprocess (Limited to new season activities)
    await taskRef.update({ phase: "reprocessing" });
    await phase4Reprocess(db, startDate);

  } finally {
    // 6. Silent Mode OFF
    await setSilentMode(db, false);
  }
}

/** PHASES IMPLEMENTATION (Adapted from script) **/

async function phase1Archive(db: Firestore, cutOffDate: Date) {
  const collections = [
    { name: "activities", field: "endDate", archive: "activities_archive", recursive: true },
    { name: "feed", field: "date", archive: "feed_archive", recursive: false },
    { name: "notifications", field: "timestamp", archive: "notifications_archive", recursive: false }
  ];

  for (const col of collections) {
    const snapshot = await db.collection(col.name).where(col.field, "<", cutOffDate).get();
    await runInParallel(snapshot.docs, async (doc) => {
      if (col.recursive) {
        await copyDocRecursive(doc, db, col.archive);
        await deleteDocRecursive(doc.ref);
      } else {
        await db.collection(col.archive).doc(doc.id).set(doc.data());
        await doc.ref.delete();
      }
    });
  }
}

async function phase2Cleanup(db: Firestore, startDate: Date) {
  await fastDeleteCollection(db.collection("remote_territories"));
  await fastDeleteCollection(db.collection("activity_reactions"));
  await fastDeleteCollection(db.collection("activity_reaction_stats"));

  const activities = await db.collection("activities").where("endDate", ">=", startDate).get();
  await runInParallel(activities.docs, async (doc) => {
    await fastDeleteSubcollection(doc.ref, "territories");
    await doc.ref.update({ processingStatus: FieldValue.delete() });
  });
}

async function phase3UserReset(db: Firestore, seasonId: string, seasonName: string, startDate: Date) {
  const users = await db.collection("users").get();
  await runInParallel(users.docs, async (doc) => {
    const data = doc.data();
    const currentXp = data.xp || 0;
    const currentCells = data.totalCellsOwned || 0;
    const prestigeEarned = Math.floor(currentXp / 5000);

    const historyEntry = {
      id: seasonId,
      seasonId: seasonId,
      seasonName: seasonName,
      finalCells: currentCells,
      finalXp: currentXp,
      prestigeEarned: prestigeEarned,
      completedAt: FieldValue.serverTimestamp()
    };

    await doc.ref.update({
      prestige: FieldValue.increment(prestigeEarned),
      xp: 0,
      totalActivities: 0,
      totalDistanceKm: 0,
      totalDistanceNoGpsKm: 0,
      totalCellsOwned: 0,
      totalConqueredTerritories: 0,
      totalStolenTerritories: 0,
      totalDefendedTerritories: 0,
      totalRecapturedTerritories: 0,
      currentWeekDistanceKm: 0,
      currentWeekDistanceNoGpsKm: 0,
      currentStreakWeeks: 0,
      bestWeeklyDistanceKm: 0,
      recentTerritories: 0,
      recentThieves: [],
      recentTheftVictims: [],
      lastSeasonReset: FieldValue.serverTimestamp(),
      [`seasonHistory.${seasonId}`]: historyEntry
    });

    await fastDeleteSubcollection(doc.ref, "vengeance_targets");
  });
}

async function phase4Reprocess(db: Firestore, startDate: Date) {
  const activities = await db.collection("activities")
    .where("endDate", ">=", startDate)
    .orderBy("endDate", "asc")
    .get();

  for (const doc of activities.docs) {
    await doc.ref.update({
      xpBreakdown: FieldValue.delete(),
      missions: FieldValue.delete(),
      territoryStats: FieldValue.delete(),
      processingStatus: "pending"
    });
  }
}

/** HELPERS **/

async function fastDeleteCollection(col: any) {
  const docRefs = await col.listDocuments();
  await runInParallel(docRefs, async (ref: DocumentReference) => {
    await deleteDocRecursive(ref);
  });
}

async function fastDeleteSubcollection(docRef: DocumentReference, subName: string) {
  const subCol = docRef.collection(subName);
  const docRefs = await subCol.listDocuments();
  await runInParallel(docRefs, async (ref: DocumentReference) => {
    await deleteDocRecursive(ref);
  });
}

async function runInParallel<T>(items: T[], fn: (item: T) => Promise<void>) {
  const chunks = [];
  for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
    chunks.push(items.slice(i, i + CONCURRENCY_LIMIT));
  }
  for (const c of chunks) {
    await Promise.all(c.map(fn));
  }
}

async function setSilentMode(db: Firestore, active: boolean) {
  await db.collection("config").doc("maintenance").set({ silentMode: active }, { merge: true });
}

async function copyDocRecursive(doc: any, db: Firestore, targetCol: string) {
  const data = doc.data();
  if (!data) return;
  await db.collection(targetCol).doc(doc.id).set(data);
  const subCols = await doc.ref.listCollections();
  for (const sub of subCols) {
    const snap = await sub.get();
    for (const sd of snap.docs) {
      await db.collection(targetCol).doc(doc.id).collection(sub.id).doc(sd.id).set(sd.data());
    }
  }
}

async function deleteDocRecursive(docRef: DocumentReference) {
  const subCols = await docRef.listCollections();
  for (const sub of subCols) {
    const docRefs = await sub.listDocuments();
    await runInParallel(docRefs, async (ref: DocumentReference) => {
      await deleteDocRecursive(ref);
    });
  }
  await docRef.delete();
}
