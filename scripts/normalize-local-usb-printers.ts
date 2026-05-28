import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  DocumentData,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const LOCAL_STATUS = ["sem_ip", "ip_invalido"];

function isLocalUsbIp(ip?: string): boolean {
  const normalized = String(ip || "").trim().toUpperCase();
  return normalized === "" || normalized === "SEMREDE" || normalized === "USB" || normalized === "LOCAL";
}

function buildLocalUsbUpdate(docData: DocumentData): Record<string, any> {
  const update: Record<string, any> = {
    status: "local_usb",
    tipo: "LOCAL_USB",
    currentMessage: "Impressora local (sem rede)",
    latency: 0,
    updatedAt: new Date().toISOString(),
  };

  if (!docData.ip || isLocalUsbIp(docData.ip)) {
    update.ip = docData.ip || "";
  }

  return update;
}

async function runMigration() {
  console.log("Iniciando migração de impressoras locais sem rede...");

  const printersRef = collection(db, "printers");
  const q = query(printersRef, where("status", "in", LOCAL_STATUS));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    console.log("Nenhum registro antigo de `sem_ip` ou `ip_invalido` encontrado.");
    return;
  }

  const docs = snapshot.docs;
  console.log(`Encontrados ${docs.length} registros para ajustar.`);

  const batch = writeBatch(db);
  let count = 0;

  for (const docSnapshot of docs) {
    const data = docSnapshot.data();
    const update = buildLocalUsbUpdate(data);
    const docRef = doc(db, "printers", docSnapshot.id);
    batch.update(docRef, update);
    count += 1;

    if (count === 450) {
      await batch.commit();
      console.log(`Commit parcial realizado em ${count} documentos.`);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Commit final realizado em ${count} documentos.`);
  }

  console.log("Migração concluída: documentos antigos atualizados para LOCAL_USB.");
}

runMigration().catch((error) => {
  console.error("Erro durante a migração:", error);
  process.exit(1);
});
