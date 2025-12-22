"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
// Adjust path to point to Docs/serviceAccount.json
// From: functions/firebase-function-notifications/functions/scripts/analyze_territories.ts
// To: Adventure Streak/Docs/serviceAccount.json
const serviceAccount = require("../../../../Docs/serviceAccount.json");
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
// --- HELPERS (Copied from territories.ts) ---
const CELL_SIZE_DEGREES = 0.002;
const EXPIRATION_DAYS = 7;
function getCellIndex(latitude, longitude) {
    const x = Math.floor(longitude / CELL_SIZE_DEGREES);
    const y = Math.floor(latitude / CELL_SIZE_DEGREES);
    return { x, y };
}
function getCellId(x, y) {
    return `${x}_${y}`;
}
function getCellCenter(x, y) {
    const lon = (x + 0.5) * CELL_SIZE_DEGREES;
    const lat = (y + 0.5) * CELL_SIZE_DEGREES;
    return { latitude: lat, longitude: lon };
}
function getBoundary(centerLat, centerLon) {
    const halfSize = CELL_SIZE_DEGREES / 2.0;
    return [
        { latitude: centerLat + halfSize, longitude: centerLon - halfSize },
        { latitude: centerLat + halfSize, longitude: centerLon + halfSize },
        { latitude: centerLat - halfSize, longitude: centerLon + halfSize },
        { latitude: centerLat - halfSize, longitude: centerLon - halfSize },
    ];
}
function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function getCellsBetween(start, end, now, userId, activityId) {
    const cells = new Map();
    const dist = distanceMeters(start.latitude, start.longitude, end.latitude, end.longitude);
    if (dist < 10) {
        const { x, y } = getCellIndex(start.latitude, start.longitude);
        const id = getCellId(x, y);
        cells.set(id, createCell(x, y, now, userId, activityId));
        return cells;
    }
    const stepSize = 20.0;
    const steps = Math.ceil(dist / stepSize);
    for (let i = 0; i <= steps; i++) {
        const fraction = i / steps;
        const lat = start.latitude + (end.latitude - start.latitude) * fraction;
        const lon = start.longitude + (end.longitude - start.longitude) * fraction;
        const { x, y } = getCellIndex(lat, lon);
        const id = getCellId(x, y);
        if (!cells.has(id)) {
            cells.set(id, createCell(x, y, now, userId, activityId));
        }
    }
    return cells;
}
function createCell(x, y, now, userId, activityId) {
    const center = getCellCenter(x, y);
    const expiresAt = new Date(now.getTime() + (EXPIRATION_DAYS * 24 * 60 * 60 * 1000));
    return {
        id: getCellId(x, y),
        centerLatitude: center.latitude,
        centerLongitude: center.longitude,
        boundary: getBoundary(center.latitude, center.longitude),
        expiresAt: expiresAt,
        activityEndAt: now,
        userId: userId,
        activityId: activityId,
    };
}
// --- MAIN ANALYSIS LOGIC ---
async function analyzeLastActivity() {
    console.log("🔍 Fetching recent activities...");
    // 1. Fetch Activities (Fetch last 10 to find one with a route)
    const activitiesSnapshot = await db.collection("activities")
        .orderBy("endDate", "desc")
        .limit(10)
        .get();
    if (activitiesSnapshot.empty) {
        console.log("❌ No activities found.");
        return;
    }
    let activityDoc = null;
    let activityData = null;
    let allPoints = [];
    let activityId = "";
    for (const doc of activitiesSnapshot.docs) {
        const data = doc.data();
        const id = doc.id;
        console.log(`Checking activity ${id}...`);
        // Fetch Route
        const routesSnapshot = await db.collection(`activities/${id}/routes`).get();
        if (routesSnapshot.empty) {
            console.log(`\t⚠️ No routes collection found.`);
            continue;
        }
        const chunks = routesSnapshot.docs.map((d) => d.data())
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        let points = [];
        for (const chunk of chunks) {
            if (chunk.points && Array.isArray(chunk.points)) {
                points = points.concat(chunk.points.map((p) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                    timestamp: p.timestamp && p.timestamp.toDate ? p.timestamp.toDate() : new Date(),
                })));
            }
        }
        if (points.length > 0) {
            activityDoc = doc;
            activityData = data;
            allPoints = points;
            activityId = id;
            console.log(`✅ Found valid activity with ${points.length} points.`);
            break;
        }
        else {
            console.log(`\t⚠️ Route collection empty or no points.`);
        }
    }
    if (!activityDoc || !activityData) {
        console.log("❌ No recent activity with valid route points found.");
        return;
    }
    const userId = activityData.userId;
    const userName = activityData.userName || "Unknown";
    console.log(`\n📋 Analyzing Activity: ${activityId}`);
    console.log(`👤 User: ${userName} (${userId})`);
    console.log(`📅 Date: ${activityData.endDate instanceof admin.firestore.Timestamp ? activityData.endDate.toDate() : activityData.endDate}`);
    const endDate = activityData.endDate instanceof admin.firestore.Timestamp
        ? activityData.endDate.toDate()
        : new Date(activityData.endDate || Date.now());
    // 3. Calculate Traversed Cells
    const traversedCells = new Map();
    if (allPoints.length > 0) {
        const startIdx = getCellIndex(allPoints[0].latitude, allPoints[0].longitude);
        const startId = getCellId(startIdx.x, startIdx.y);
        traversedCells.set(startId, createCell(startIdx.x, startIdx.y, endDate, userId, activityId));
        for (let i = 0; i < allPoints.length - 1; i++) {
            const segCells = getCellsBetween(allPoints[i], allPoints[i + 1], endDate, userId, activityId);
            segCells.forEach((cell, id) => traversedCells.set(id, cell));
        }
    }
    console.log(`🔹 Traversed Cells: ${traversedCells.size}`);
    // 4. Fetch Existing Owners
    const cellIds = Array.from(traversedCells.keys());
    const existingRemotes = new Map();
    const chunkedIds = [];
    for (let i = 0; i < cellIds.length; i += 30) {
        chunkedIds.push(cellIds.slice(i, i + 30));
    }
    for (const chunk of chunkedIds) {
        const q = await db.collection("remote_territories").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
        q.docs.forEach((d) => existingRemotes.set(d.id, d.data()));
    }
    // 5. Simulate Verdict
    console.log("\n⚖️  --- VERDICT SIMULATION ---");
    console.log(stringpad("Cell ID", 15) + stringpad("Existing Owner", 30) + stringpad("Verdict", 15) + "Reason");
    console.log("-".repeat(100));
    let stats = {
        conquest: 0,
        defense: 0,
        steal: 0,
        recapture: 0
    };
    for (const [cellId, newCell] of traversedCells.entries()) {
        const existing = existingRemotes.get(cellId);
        let verdict = "UNKNOWN";
        let reason = "";
        if (existing) {
            const existingOwner = existing.userId;
            const isOwner = existingOwner === userId;
            const existingTime = existing.activityEndAt ? existing.activityEndAt.toDate() : new Date(0);
            const isExpired = existing.expiresAt ? existing.expiresAt.toDate() < new Date() : true;
            const sameActivity = existing.activityId === activityId;
            if (sameActivity) {
                verdict = "CONQUEST";
                reason = "Existing cell belongs to CURRENT activity (Self-Collision fixed)";
                stats.conquest++;
            }
            else if (!isOwner && !isExpired && existingTime >= endDate) {
                verdict = "SKIP";
                reason = "Owned by other, not expired, newer timestamp (Defended by them?)";
            }
            else if (isExpired) {
                if (isOwner) {
                    verdict = "RECAPTURE";
                    reason = "Expired (Owned by me)";
                    stats.recapture++;
                }
                else {
                    verdict = "CONQUEST";
                    reason = "Expired (Owned by other/none)";
                    stats.conquest++;
                }
            }
            else if (!isOwner) {
                verdict = "STEAL";
                reason = `Owned by ${existingOwner} (Active)`;
                stats.steal++;
            }
            else {
                verdict = "DEFENSE";
                reason = "Owned by me (Active)";
                stats.defense++;
            }
            console.log(stringpad(cellId, 15) + stringpad(existingOwner || "NULL", 30) + stringpad(verdict, 15) + reason);
        }
        else {
            verdict = "CONQUEST";
            reason = "New territory";
            stats.conquest++;
            console.log(stringpad(cellId, 15) + stringpad("---", 30) + stringpad(verdict, 15) + reason);
        }
    }
    console.log("\n📊 --- FINAL STATS ---");
    console.log(`Conquests: ${stats.conquest}`);
    console.log(`Defenses:  ${stats.defense}`);
    console.log(`Steals:    ${stats.steal}`);
    console.log(`Recaptures:${stats.recapture}`);
}
function stringpad(str, len) {
    if (str.length >= len)
        return str.substring(0, len - 3) + "...";
    return str + " ".repeat(len - str.length);
}
analyzeLastActivity().catch(console.error);
