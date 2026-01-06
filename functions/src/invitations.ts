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
    const inviteRef = db.collection("invitations").doc(token);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists || inviteDoc.data()?.status !== "pending") {
        throw new HttpsError("not-found", "Invalid or already used invitation token.");
    }

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
        // System debug or anonymous issuer
        newPath = ["SYSTEM"];
    }

    const batch = db.batch();

    // 1. Mark invite as used
    batch.update(inviteRef, {
        status: "used",
        usedBy: uid,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Update new user
    // 2. Update new user (Use set with merge to avoiding race condition if doc doesn't exist yet)
    batch.set(db.collection("users").doc(uid), {
        invitationVerified: true,
        invitedBy: issuerUid,
        invitationPath: newPath,
        invitationQuota: 3, // Default quota for new users
    }, { merge: true });

    // 3. Increment inviter count (if real user)
    if (issuerUid && issuerUid !== "SYSTEM-DEBUG") {
        const issuerRef = db.collection("users").doc(issuerUid);
        batch.update(issuerRef, {
            invitationCount: admin.firestore.FieldValue.increment(1),
        });
    }

    await batch.commit();

    return { success: true };
});
