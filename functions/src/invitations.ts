import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Factory for generating a new invitation token.
 */
export const createGenerateInvitation = (databaseId?: string) => onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const db = databaseId ? getFirestore(databaseId) : getFirestore();
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new HttpsError("not-found", "User document not found.");
    }

    const userData = userDoc.data();
    if (!userData?.invitationVerified) {
        throw new HttpsError("permission-denied", "User is not verified to invite others.");
    }

    const quota = userData.invitationQuota || 0;
    const count = userData.invitationCount || 0;

    if (count >= quota) {
        throw new HttpsError("resource-exhausted", "You have reached your invitation quota.");
    }

    // Generate unique token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    await db.collection("invitations").doc(token).set({
        issuer: uid,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { token };
});

/**
 * Factory for redeeming an invitation token.
 */
export const createRedeemInvitation = (databaseId?: string) => onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const db = databaseId ? getFirestore(databaseId) : getFirestore();
    const token = request.data.token;
    if (!token) {
        throw new HttpsError("invalid-argument", "Token is required.");
    }

    const uid = request.auth.uid;

    // 1. Try to find a private invitation first (Backward Compatibility)
    const inviteRef = db.collection("invitations").doc(token);
    const inviteDoc = await inviteRef.get();

    if (inviteDoc.exists && inviteDoc.data()?.status === "pending") {
        const issuerUid = inviteDoc.data()?.issuer;
        let newPath: string[] = [];

        if (issuerUid && issuerUid !== "SYSTEM-DEBUG") {
            const issuerRef = db.collection("users").doc(issuerUid);
            const issuerDoc = await issuerRef.get();

            if (!issuerDoc.exists) {
                throw new HttpsError("internal", "Inviter no longer exists.");
            }

            const issuerData = issuerDoc.data();
            const parentPath = issuerData?.invitationPath || [];
            newPath = [...parentPath, issuerUid];
        } else {
            newPath = ["SYSTEM"];
        }

        const batch = db.batch();

        // Mark invite as used
        batch.update(inviteRef, {
            status: "used",
            usedBy: uid,
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update new user
        batch.set(db.collection("users").doc(uid), {
            invitationVerified: true,
            invitedBy: issuerUid,
            invitationPath: newPath,
            invitationQuota: 3,
        }, { merge: true });

        // Increment inviter count
        if (issuerUid && issuerUid !== "SYSTEM-DEBUG") {
            const issuerRef = db.collection("users").doc(issuerUid);
            batch.update(issuerRef, {
                invitationCount: admin.firestore.FieldValue.increment(1),
            });
        }

        await batch.commit();
        return { success: true, mode: "private" };
    }

    // 2. Fallback: Try to find a global invitation
    const globalRef = db.collection("global_invitations").doc(token);
    const globalDoc = await globalRef.get();

    if (globalDoc.exists) {
        const globalData = globalDoc.data();
        const now = admin.firestore.Timestamp.now();

        if (!globalData?.active) {
            throw new HttpsError("failed-precondition", "This global code is no longer active.");
        }

        if (now < globalData.startsAt || now > globalData.endsAt) {
            throw new HttpsError("out-of-range", "This invitation code has expired or is not yet active.");
        }

        // Check if user already redeemed this specific global code
        const redemptionRef = globalRef.collection("redemptions").doc(uid);
        const redemptionDoc = await redemptionRef.get();
        if (redemptionDoc.exists) {
            throw new HttpsError("already-exists", "You have already redeemed this code.");
        }

        const batch = db.batch();

        // Record redemption for this user
        batch.set(redemptionRef, {
            redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update global usage count
        batch.update(globalRef, {
            usageCount: admin.firestore.FieldValue.increment(1),
        });

        // Update user (Verified via Global Code)
        batch.set(db.collection("users").doc(uid), {
            invitationVerified: true,
            invitedBy: "SYSTEM-GLOBAL",
            invitationPath: ["GLOBAL"],
            invitationQuota: 3,
        }, { merge: true });

        await batch.commit();
        return { success: true, mode: "global" };
    }

    throw new HttpsError("not-found", "Invalid, expired, or already used invitation token.");
});
