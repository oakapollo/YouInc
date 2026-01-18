import "server-only";
import admin from "firebase-admin";

function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  return admin;
}

export function db() {
  return getAdmin().firestore();
}