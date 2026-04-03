/**
 * Adventure Streak: Fraud Guard Logic
 * Real-time detection and resolution with streaming support.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";

export interface FraudDetection {
  severity: "fraud" | "suspicious";
  reason: string;
}

/**
 * FraudAnalyzer
 * Stateful analyzer for streaming route points in chunks.
 */
export class FraudAnalyzer {
  private lastPoint: any | null = null;
  private detection: FraudDetection | null = null;

  /**
   * Processes a chunk of points and returns true if fraud is detected (early exit).
   */
  processChunk(points: any[]): boolean {
    for (const p2 of points) {
      if (this.lastPoint) {
        // 1. Distance Jump (GPS Teleportation)
        const dist = p2.distance_from_previous || 0;
        
        // 2. Speed (km/h) (Vehicle detection)
        const speed = p2.speed_kmh || 0;

        // FRAUD LIMITS
        if (dist > 500 || speed > 45) {
          this.detection = {
            severity: "fraud",
            reason: `Actividad imposible: Salto de ${Math.round(dist)}m o Velocidad de ${speed.toFixed(1)}km/h`
          };
          return true; // Early exit
        }

        // SUSPICIOUS LIMITS (Keep checking, might find actual fraud later)
        if (dist > 300 || speed > 25) {
          this.detection = {
            severity: "suspicious",
            reason: `Actividad sospechosa: Salto de ${Math.round(dist)}m o Velocidad de ${speed.toFixed(1)}km/h`
          };
        }
      }
      this.lastPoint = p2;
    }
    return false;
  }

  getDetection(): FraudDetection | null {
    return this.detection;
  }
}

/**
 * Resolution Logic
 * Atomically reverts gains and cleans up evidence.
 */
export async function resolveFraud(
  activityId: string, 
  data: any, 
  databaseId: string | undefined
): Promise<void> {
  const db = databaseId ? getFirestore(databaseId) : getFirestore();
  const userId = data.userId;
  if (!userId) return;

  const xpToRevert = data.xpBreakdown?.total || 0;
  const distanceKm = (data.distanceMeters || 0) / 1000.0;
  
  const tStats = data.territoryStats || {};
  const newCells = tStats.newCellsCount || 0;
  const stolenCells = tStats.stolenCellsCount || 0;
  const recapturedCells = tStats.recapturedCellsCount || 0;
  const defendedCells = tStats.defendedCellsCount || 0;
  const totalGainedCells = newCells + stolenCells + recapturedCells;

  console.log(`[FraudGuard] Resolving fraud for user ${userId} in activity ${activityId}...`);

  // 1. Transaction to update user stats
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) return;

    const userData = userDoc.data() || {};
    const currentXp = userData.xp || 0;
    const newXp = Math.max(0, currentXp - xpToRevert);
    const newLevel = 1 + Math.floor(newXp / 1000);

    transaction.update(userRef, {
      xp: newXp,
      level: newLevel,
      totalActivities: FieldValue.increment(-1),
      totalDistanceKm: FieldValue.increment(-distanceKm),
      totalConqueredTerritories: FieldValue.increment(-newCells),
      totalStolenTerritories: FieldValue.increment(-(stolenCells + (tStats.vengeanceCellsCount || 0))),
      totalDefendedTerritories: FieldValue.increment(-defendedCells),
      totalRecapturedTerritories: FieldValue.increment(-recapturedCells),
      totalCellsOwned: FieldValue.increment(-totalGainedCells)
    });
  });

  // 2. Delete conquered territories
  const territoriesQuery = await db.collection("remote_territories")
    .where("activityId", "==", activityId)
    .get();

  if (!territoriesQuery.empty) {
    const batch = db.batch();
    territoriesQuery.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[FraudGuard] Deleted ${territoriesQuery.size} territories.`);
  }

  // 3. Log detection for admin report
  await db.collection("fraud_logs_admin").add({
    userId,
    activityId,
    reason: data.fraudReason || "Detección automática",
    severity: data.fraudSeverity || "fraud",
    xpReverted: xpToRevert,
    timestamp: FieldValue.serverTimestamp()
  });

  // 4. Send notification to user
  let dateStr = "reciente";
  if (data.startDate) {
    try {
      const date = data.startDate.toDate ? data.startDate.toDate() : new Date(data.startDate);
      dateStr = date.toLocaleDateString("es-ES");
    } catch (e) {}
  }

  await db.collection("notifications").add({
    recipientId: userId,
    type: "fraud_detected",
    activityDate: dateStr,
    createdAt: FieldValue.serverTimestamp()
  });

  console.log(`[FraudGuard] Resolution complete for ${activityId}.`);
}
