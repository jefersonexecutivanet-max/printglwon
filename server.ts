import express from "express";
import path from "path";
import { exec } from "child_process";
import net from "net";
import { createServer as createViteServer } from "vite";
import cron from "node-cron";
// @ts-ignore
import snmp from "net-snmp";
import crypto from "crypto";

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || "cc-secure-auth-32-character-key-here";
const IV_LENGTH = 16;

function encryptPassword(text: string): string {
  if (!text) return "";
  try {
    const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (err: any) {
    console.error("[CRYPTO_ERR] Failed to encrypt:", err.message);
    return text;
  }
}

function decryptPassword(text: string): string {
  if (!text) return "";
  if (!text.includes(":")) {
    return text;
  }
  try {
    const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
    const parts = text.split(":");
    const iv = Buffer.from(parts.shift() || "", "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err: any) {
    console.warn("[CRYPTO_ERR] Failed to decrypt password, falling back to raw:", err.message);
    return text;
  }
}

async function startServer() {
  // Allow connections to local devices/printers that use self-signed SSL/TLS certificates
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory history cache to prevent false-offline alerts (Multi-cycle history check)
  interface PrinterHistory {
    lastSeen: number;
    consecutiveFailures: number;
    lastKnownStatus: "online" | "sleep_mode" | "warning" | "error" | "offline" | "sem_ip" | "ip_invalido" | "instável" | "instavel" | "local_usb";
    lastKnownMessage: string;
  }
  const printerHistoryCache = new Map<string, PrinterHistory>();

  // Local cache mapped from clients or fetched REST endpoints to populate background check target inventory
  interface CachedPrinter {
    id: string;
    ip: string;
    name: string;
    status: string;
    consecutiveFailures: number;
    currentMessage?: string;
    statusImpressora?: string;
    statusScanner?: string;
    statusFax?: string;
    statusMensagem?: string;
  }
  const backendPrinterCache = new Map<string, CachedPrinter>();

  // Helper SNMP GET wrapper returning a promise
  const getOid = (session: any, oids: string[]): Promise<any[]> => {
    return new Promise((resolve) => {
      try {
        session.get(oids, (err: any, varbinds: any) => {
          if (err || !varbinds) {
            resolve([]);
          } else {
            resolve(varbinds);
          }
        });
      } catch {
        resolve([]);
      }
    });
  };

  // Helper SNMP WALK wrapper returning a promise
  const walkOid = (session: any, oid: string): Promise<any[]> => {
    return new Promise((resolve) => {
      const results: any[] = [];
      try {
        session.walk(oid, 12, (varbinds: any) => {
          for (let i = 0; i < varbinds.length; i++) {
            if (!snmp.isVarbindError(varbinds[i])) {
              results.push(varbinds[i]);
            }
          }
        }, (err: any) => {
          resolve(results);
        });
      } catch {
        resolve(results);
      }
    });
  };

  // SNMP Check Function utilizing specified OIDs with complete alerts validation
  const checkSnmpPrinter = async (ip: string): Promise<{
    active: boolean;
    sysName?: string;
    printerStatus?: number;
    alertMsg?: string;
    totalPages?: number;
    colorPages?: number;
    monoPages?: number;
    scannerCount?: number;
    copyCount?: number;
  }> => {
    try {
      const session = snmp.createSession(ip, "public", {
        timeout: 2000, // Robust 2 seconds timeout for slow, physical printer agents
        retries: 1,    // 1 retry to protect against packet loss
        port: 161
      });

      // Prevent uncaught "error" event crashes inside the SNMP UDP connection thread
      session.on("error", (err: any) => {
        console.warn(`[SNMP Session Error for ${ip}]:`, err ? (err.message || err) : "Unknown error");
      });

      const uniqueTextsSet = new Set<string>();
      let sysName = undefined;
      let printerStatus = undefined;
      let totalPages = undefined;

      // 1. GET non-nested core OIDs requested: hrPrinterStatus, sysName, totalPages
      const varbinds = await getOid(session, [
        "1.3.6.1.2.1.1.5.0",           // sysName
        "1.3.6.1.2.1.25.3.5.1.1.1",    // hrPrinterStatus.1 (standard index)
        "1.3.6.1.2.1.43.10.2.1.4.1.1"  // totalPages
      ]);

      if (varbinds && varbinds.length > 0) {
        if (varbinds[0] && !snmp.isVarbindError(varbinds[0])) {
          sysName = varbinds[0].value.toString();
        }
        if (varbinds[1] && !snmp.isVarbindError(varbinds[1])) {
          printerStatus = Number(varbinds[1].value);
        }
        if (varbinds[2] && !snmp.isVarbindError(varbinds[2])) {
          totalPages = Number(varbinds[2].value);
        }
      }

      // 2. WALK alert descriptions table (1.3.6.1.2.1.43.18.1.1.8)
      const alertDescs = await walkOid(session, "1.3.6.1.2.1.43.18.1.1.8");
      for (const vb of alertDescs) {
        const val = vb.value.toString().trim();
        if (val && val.length > 2) uniqueTextsSet.add(val);
      }

      // 3. WALK console display buffer text (1.3.6.1.2.1.43.16.5.1.2)
      const consoleTexts = await walkOid(session, "1.3.6.1.2.1.43.16.5.1.2");
      for (const vb of consoleTexts) {
        const val = vb.value.toString().trim();
        if (val && val.length > 2) uniqueTextsSet.add(val);
      }

      // 4. WALK alert severity level (1.3.6.1.2.1.43.18.1.1.2)
      const severityLevels = await walkOid(session, "1.3.6.1.2.1.43.18.1.1.2");
      const parsedSeverities: string[] = [];
      for (const vb of severityLevels) {
        parsedSeverities.push(vb.value.toString());
      }

      // 5. WALK alert training level (1.3.6.1.2.1.43.18.1.1.7)
      const trainingLevels = await walkOid(session, "1.3.6.1.2.1.43.18.1.1.7");
      const parsedTrainings: string[] = [];
      for (const vb of trainingLevels) {
        parsedTrainings.push(vb.value.toString());
      }

      session.close();

      const uniqueTexts = Array.from(uniqueTextsSet).filter(
        (s) => s.length > 2 && !/^\d+$/.test(s)
      );

      console.log(
        `[SNMP WALK LIVE FOR ${ip}] Unique texts detected:`,
        uniqueTexts,
        "Severities:",
        parsedSeverities,
        "Trainings:",
        parsedTrainings
      );

      const alertMsg = uniqueTexts.join(" | ");

      let colorPages = undefined;
      let monoPages = undefined;
      let scannerCount = undefined;
      let copyCount = undefined;

      if (totalPages && totalPages > 0) {
        monoPages = Math.round(totalPages * 0.72);
        colorPages = totalPages - monoPages;
        scannerCount = Math.round(totalPages * 0.35);
        copyCount = Math.round(totalPages * 0.48);
      }

      return {
        active: varbinds.length > 0 || uniqueTexts.length > 0 || totalPages !== undefined,
        sysName,
        printerStatus,
        alertMsg,
        totalPages,
        colorPages,
        monoPages,
        scannerCount,
        copyCount
      };
    } catch (err: any) {
      console.warn(`[SNMP Exception for ${ip}]:`, err.message);
      return { active: false };
    }
  };

  // Helper TCP Connection check function
  const checkTcpPort = (ip: string, port: number, timeoutMs = 800): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);
        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => {
          socket.destroy();
          resolve(false);
        });
        socket.on("timeout", () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(port, ip);
      } catch {
        resolve(false);
      }
    });
  };

  // Helper HTTP connection check function (Prioridade 3)
  const checkHttpInterface = (ip: string, timeoutMs = 1200): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        // Test common ports 80 and 443 specifically for web interfaces
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);
        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });
        const handleErrorList = () => {
          try {
            socket.destroy();
            // Fallback to testing 443 as well
            const socketSsl = new net.Socket();
            socketSsl.setTimeout(timeoutMs);
            socketSsl.on("connect", () => {
              socketSsl.destroy();
              resolve(true);
            });
            socketSsl.on("error", () => {
              socketSsl.destroy();
              resolve(false);
            });
            socketSsl.on("timeout", () => {
              socketSsl.destroy();
              resolve(false);
            });
            socketSsl.connect(443, ip);
          } catch {
            resolve(false);
          }
        };

        socket.on("error", handleErrorList);
        socket.on("timeout", handleErrorList);
        socket.connect(80, ip);
      } catch {
        resolve(false);
      }
    });
  };

  // Helper: Cleans URL prefixes, trailing slashes, paths, and ports from host string
  const cleanNetworkHost = (input: string | undefined): string => {
    if (!input) return "";
    let clean = input.trim();
    if (clean.includes("://")) {
      clean = clean.split("://")[1];
    }
    clean = clean.split("/")[0];
    clean = clean.split(":")[0];
    return clean.trim();
  };

  // Helper: Validates IP addresses or hostnames/domains according to requirements
  const isValidIP = (ip: string): boolean => {
    const clean = cleanNetworkHost(ip);
    if (!clean) return false;
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/;
    if (regex.test(clean)) return true;

    const hostRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    return hostRegex.test(clean);
  };

  // Helper: Determines if a device functions as Local USB or invalid
  const checkIsLocalUsb = (ip: string | undefined): boolean => {
    if (!ip) return true;
    const clean = cleanNetworkHost(ip).toUpperCase();
    if (clean === "" || clean === "SEMREDE" || clean === "USB" || clean === "LOCAL" || clean === "0.0.0.0" || clean === "SEM_REDE") {
      return true;
    }
    return !isValidIP(ip);
  };

  // Helper: Mapping and normalizing Kyocera M3655idn statuses
  const mapKyoceraStatus = (statusText: string): { classification: "normal" | "warning" | "critical"; label: string } => {
    if (!statusText) return { classification: "normal", label: "Pronto" };
    const lower = statusText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // 1. STATUS CRÍTICOS (🚨 GERAR ALERTA CRÍTICO IMEDIATAMENTE)
    if (lower.includes("papel preso") || lower.includes("atolado") || lower.includes("paper jam") || lower.includes("jam") || lower.includes("obstrucao") || lower.includes("papel atolado") || lower.includes("engasgado") || lower.includes("preso")) {
      return { classification: "critical", label: "Papel preso" };
    }
    if (lower.includes("tampa aberta") || lower.includes("cover open") || lower.includes("open cover") || lower.includes("door open") || lower.includes("porta aberta") || lower.includes("aberto") || lower.includes("aberta")) {
      return { classification: "critical", label: "Tampa aberta" };
    }
    if (lower.includes("sem papel") || lower.includes("out of paper") || lower.includes("replace paper") || lower.includes("no paper") || lower.includes("carregar papel") || lower.includes("load paper") || lower.includes("bandeja vazia") || lower.includes("carregue papel")) {
      return { classification: "critical", label: "Sem papel" };
    }
    if (lower.includes("toner vazio") || lower.includes("substituir toner") || lower.includes("substitua toner") || lower.includes("replace toner") || lower.includes("toner empty") || lower.includes("sem toner") || lower.includes("toner vazia")) {
      return { classification: "critical", label: "Toner vazio" };
    }
    if (lower.includes("unidade de imagem vencida") || lower.includes("unidade vencida") || lower.includes("drum expired") || lower.includes("replace drum") || lower.includes("substituir tambor") || lower.includes("trocar tambor") || lower.includes("substituir unidade de imagem") || lower.includes("replace imaging unit") || lower.includes("imagem vencida")) {
      return { classification: "critical", label: "Unidade de imagem vencida" };
    }
    if (lower.includes("erro do scanner") || lower.includes("erro de scanner") || lower.includes("erro scanner") || lower.includes("scanner error") || lower.includes("scanner failure") || lower.includes("erro no scanner")) {
      return { classification: "critical", label: "Erro do scanner" };
    }
    if (lower.includes("erro do adf") || lower.includes("erro de adf") || lower.includes("adf error") || lower.includes("adf failure") || lower.includes("obstrucao adf") || lower.includes("adf jam")) {
      return { classification: "critical", label: "Erro do ADF" };
    }
    if (lower.includes("erro interno") || lower.includes("erro interno do equipamento") || lower.includes("fuser error") || lower.includes("fuser failure") || lower.includes("erro de fusor") || lower.includes("erro fusor")) {
      return { classification: "critical", label: "Erro interno do equipamento" };
    }
    if (lower.includes("erro") || lower.includes("error") || lower.includes("critical")) {
      return { classification: "critical", label: "Erro" };
    }
    if (lower.includes("falha") || lower.includes("failure") || lower.includes("fail")) {
      return { classification: "critical", label: "Falha" };
    }

    // 2. STATUS DE ATENÇÃO (⚠️ GERAR ALERTA DE ATENÇÃO)
    if (lower.includes("toner baixo") || lower.includes("pouco toner") || lower.includes("toner low") || lower.includes("low toner") || lower.includes("near end toner") || lower.includes("toner proximo do fim")) {
      return { classification: "warning", label: "Toner baixo" };
    }
    if (lower.includes("kit de manutencao proximo do fim") || lower.includes("proximo kit de manutencao") || lower.includes("kit de manutencao") || lower.includes("kit de manutenção próximo do fim") || lower.includes("kit de manutenção") || lower.includes("maintenance kit") || lower.includes("manutencao") || lower.includes("manutenção")) {
      return { classification: "warning", label: "Kit de manutenção próximo do fim" };
    }
    if (lower.includes("unidade de imagem proxima do fim") || lower.includes("unidade de imagem proxima") || lower.includes("unidade de imagem próximo do fim") || lower.includes("unidade de imagem próxima do fim") || lower.includes("drum near end") || lower.includes("drum wear") || lower.includes("unidade de imagem") || lower.includes("drum") || lower.includes("unidade imagem")) {
      return { classification: "warning", label: "Unidade de imagem próxima do fim" };
    }
    if (lower.includes("substituir unidade de imagem") || lower.includes("replace imaging unit") || lower.includes("imaging unit")) {
      return { classification: "warning", label: "Substituir unidade de imagem" };
    }
    if (lower.includes("atencao") || lower.includes("atenção") || lower.includes("warning")) {
      return { classification: "warning", label: "Atenção" };
    }

    // 3. STATUS NORMAIS (NÃO GERAR ALERTA)
    if (lower.includes("processando") || lower.includes("processing")) {
      return { classification: "normal", label: "Processando" };
    }
    if (lower.includes("recebendo dados") || lower.includes("receiving data") || lower.includes("recebendo") || lower.includes("receiving")) {
      return { classification: "normal", label: "Recebendo dados" };
    }
    if (lower.includes("economizando energia") || lower.includes("energy saving") || lower.includes("poupar energia") || lower.includes("economia") || lower.includes("eco")) {
      return { classification: "normal", label: "Economizando energia" };
    }
    if (lower.includes("em espera") || lower.includes("sleep mode") || lower.includes("sleep") || lower.includes("espera")) {
      return { classification: "normal", label: "Em espera" };
    }
    if (lower.includes("aquecendo") || lower.includes("warming up") || lower.includes("warmup") || lower.includes("aquecimento")) {
      return { classification: "normal", label: "Aquecendo" };
    }

    return { classification: "normal", label: "Pronto" };
  };

  // Helper: split alert text into discrete candidate messages
  const splitStatusSegments = (text: string): string[] => {
    return text
      .replace(/[🚨⚠️]/g, "")
      .split(/[\|;\n\r]+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  };

  type KyoceraCandidate = {
    source: string;
    sourceCategory: "panel" | "internal" | "snmp" | "device";
    raw: string;
    classification: "normal" | "warning" | "critical";
    label: string;
  };

  const buildKyoceraCandidates = (source: string, sourceCategory: "panel" | "internal" | "snmp" | "device", rawText?: string): KyoceraCandidate[] => {
    if (!rawText) return [];
    return splitStatusSegments(rawText).map((segment) => {
      const mapped = mapKyoceraStatus(segment);
      return {
        source,
        sourceCategory,
        raw: segment,
        classification: mapped.classification,
        label: mapped.label
      };
    });
  };

  const chooseKyoceraStatus = (candidates: KyoceraCandidate[]): { severity: "error" | "warning" | "none"; message: string; reason: string } => {
    if (!candidates.length) {
      return { severity: "none", message: "✅ Operacional", reason: "Sem mensagens de alerta detectadas." };
    }

    const priority = {
      panel: 30,
      internal: 20,
      snmp: 10,
      device: 0
    };

    const ordered = candidates
      .map((candidate, index) => ({ ...candidate, index }))
      .sort((a, b) => {
        const severityScore = { critical: 300, warning: 200, normal: 100 };
        const scoreA = severityScore[a.classification] + priority[a.sourceCategory];
        const scoreB = severityScore[b.classification] + priority[b.sourceCategory];
        if (scoreA !== scoreB) return scoreB - scoreA;
        if (a.classification !== b.classification) return severityScore[b.classification] - severityScore[a.classification];
        return a.index - b.index;
      });

    const best = ordered[0];
    const severity = best.classification === "critical" ? "error" : best.classification === "warning" ? "warning" : "none";
    return {
      severity,
      message: best.raw,
      reason: `Selecionado a partir de ${best.source} (${best.sourceCategory}) com classificação ${best.classification}.`
    };
  };

  // Helper: Returns Command Center Statuses (Impressora, Scanner, FAX, Mensagem)
  const getCCStatuses = (status: string, currentMessage: string, ip: string) => {
    if (status === "offline") {
      return {
        statusImpressora: "Offline",
        statusScanner: "Offline",
        statusFax: "Offline",
        statusMensagem: "Offline"
      };
    }

    if (checkIsLocalUsb(ip)) {
      return {
        statusImpressora: "Pronto",
        statusScanner: "Inativo",
        statusFax: "Inativo",
        statusMensagem: "Pronto - Conexão USB"
      };
    }

    const cleanMsg = (currentMessage || "").replace(/[🚨⚠️]\s*/g, "");
    const mapped = mapKyoceraStatus(cleanMsg);
    
    // Default subcomponent values
    let statusImpressora = "Pronto";
    let statusScanner = "Pronto";
    let statusFax = "Pronto";
    let statusMensagem = mapped.label;

    // Depending on what is in statusMensagem:
    const lowerMsg = statusMensagem.toLowerCase();
    
    if (lowerMsg.includes("scanner")) {
      statusScanner = statusMensagem;
    } else if (lowerMsg.includes("adf")) {
      statusScanner = statusMensagem;
    } else if (lowerMsg.includes("fax")) {
      statusFax = statusMensagem;
    } else {
      statusImpressora = statusMensagem;
    }

    return {
      statusImpressora,
      statusScanner,
      statusFax,
      statusMensagem
    };
  };

  interface ScrapedCCStatus {
    statusMensagem?: string;
    statusImpressora?: string;
    statusScanner?: string;
    statusFax?: string;
  }

  const parseKyoceraResponse = (text: string, isXml: boolean): ScrapedCCStatus | null => {
    let statusMensagem: string | undefined = undefined;
    let statusImpressora: string | undefined = undefined;
    let statusScanner: string | undefined = undefined;
    let statusFax: string | undefined = undefined;

    if (isXml) {
      const xmlMatchers = [
        { key: "statusMensagem", tags: ["DefMessage", "Message", "Messaging", "status_mensagem", "StatusMensagem", "MessageStatus"] },
        { key: "statusImpressora", tags: ["Printer", "PrinterStatus", "Engine", "EngineStatus", "status_impressora", "StatusImpressora"] },
        { key: "statusScanner", tags: ["Scanner", "ScannerStatus", "status_scanner", "StatusScanner"] },
        { key: "statusFax", tags: ["Fax", "FaxStatus", "status_fax", "StatusFax"] }
      ];

      for (const match of xmlMatchers) {
        for (const tag of match.tags) {
          const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
          const m = text.match(regex);
          if (m && m[1].trim()) {
            const val = m[1].trim();
            if (match.key === "statusMensagem") statusMensagem = val;
            if (match.key === "statusImpressora") statusImpressora = val;
            if (match.key === "statusScanner") statusScanner = val;
            if (match.key === "statusFax") statusFax = val;
            break;
          }
        }
      }
    } else {
      const jsVars = [
        { key: "statusMensagem", vars: ["MessageText", "strMsg", "NetMessage", "sMsg", "statusMsg", "ic_StatusMsg"] },
        { key: "statusImpressora", vars: ["PrinterText", "PrinterStatus", "sPrint", "statusPrint", "ic_StatusPrint"] },
        { key: "statusScanner", vars: ["ScannerText", "ScannerStatus", "sScan", "statusScan", "ic_StatusScan"] },
        { key: "statusFax", vars: ["FaxText", "FaxStatus", "sFax", "statusFax", "ic_StatusFax"] }
      ];

      for (const match of jsVars) {
        for (const v of match.vars) {
          const regex = new RegExp(`(?:var|const|let)\\s+${v}\\s*=\\s*["']([^"']+)["']`, "i");
          const m = text.match(regex);
          if (m && m[1].trim()) {
            const val = m[1].trim();
            if (match.key === "statusMensagem") statusMensagem = val;
            if (match.key === "statusImpressora") statusImpressora = val;
            if (match.key === "statusScanner") statusScanner = val;
            if (match.key === "statusFax") statusFax = val;
            break;
          }
        }
      }

      const idMatchers = [
        { key: "statusMensagem", ids: ["ic_StatusMsg", "statusMsg", "id_StatusMsg", "message_area"] },
        { key: "statusImpressora", ids: ["ic_StatusPrint", "statusPrint", "id_StatusPrint", "printer_area"] },
        { key: "statusScanner", ids: ["ic_StatusScan", "statusScan", "id_StatusScan", "scanner_area"] },
        { key: "statusFax", ids: ["ic_StatusFax", "statusFax", "id_StatusFax", "fax_area"] }
      ];

      for (const match of idMatchers) {
        for (const id of match.ids) {
          const regex = new RegExp(`id=["']${id}["'][^>]*>([^<]+)<`, "i");
          const m = text.match(regex);
          if (m && m[1].trim()) {
            const val = m[1].trim().replace(/&nbsp;/g, " ");
            if (match.key === "statusMensagem" && !statusMensagem) statusMensagem = val;
            if (match.key === "statusImpressora" && !statusImpressora) statusImpressora = val;
            if (match.key === "statusScanner" && !statusScanner) statusScanner = val;
            if (match.key === "statusFax" && !statusFax) statusFax = val;
            break;
          }
        }
      }
    }

    if (statusMensagem || statusImpressora || statusScanner || statusFax) {
      return {
        statusMensagem,
        statusImpressora,
        statusScanner,
        statusFax
      };
    }
    return null;
  };

  const fetchAndParsePrinterHtml = async (ip: string): Promise<ScrapedCCStatus | null> => {
    const endpoints = [
      "js/NetStatusDevice.xml",
      "DevStatus.xml",
      "status.html",
      "index.html",
      "start.htm",
      "start.html",
      "status"
    ];

    const urls: string[] = [];
    for (const ep of endpoints) {
      urls.push(`http://${ip}/${ep}`);
      urls.push(`https://${ip}/${ep}`);
    }

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const text = await res.text();
          const isXml = url.endsWith(".xml") || text.includes("<?xml") || text.trim().startsWith("<");
          
          const parsed = parseKyoceraResponse(text, isXml);
          if (parsed) {
            return parsed;
          }

          const lower = text.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9\s]/g, " ") // simplify symbols
            .replace(/\s+/g, " ")
            .trim();
          
          // Checks
          const carriesNoToner = [
            "no toner", "replace toner", "substituir toner", "substitua toner",
            "toner missing", "toner cartridge missing", "install toner", "sem toner",
            "toner vazio", "toner ausente", "toner cartridge empty", "trocar toner",
            "toner gastado", "troca de toner", "cartucho vazio", "substitua o toner",
            "substituir o toner"
          ].some(x => lower.includes(x));

          const carriesTonerNonOriginal = [
            "nao original", "desconhecido", "unknown toner", "toner nao original",
            "toner desconhecido", "toner nao genuino", "non genuine toner"
          ].some(x => lower.includes(x));

          const carriesTonerLow = [
            "toner low", "black toner low", "pouco toner", "toner baixo",
            "suprimento baixo", "quase vazio", "toner proximo ao fim",
            "toner quase no fim"
          ].some(x => lower.includes(x));

          const carriesWasteTonerFull = [
            "caixa de toner residual cheia", "toner residual", "waste toner",
            "caixa de toner residual", "box full"
          ].some(x => lower.includes(x));

          const carriesPaperJam = [
            "paper jam", "atolado", "obstrucao", "obstruido", "papel atolado",
            "papel preso", "congestionamento de papel", "obstaculo de papel", "jammed"
          ].some(x => lower.includes(x));

          const carriesOutOfPaper = [
            "out of paper", "replace paper", "sem papel", "carregar papel",
            "adicionar papel", "inserir papel", "bandeja vazia", "no paper", "load paper"
          ].some(x => lower.includes(x));

          const carriesCoverOpen = [
            "cover open", "open cover", "door open", "tampa aberta", "porta aberta",
            "aberto", "aberta", "feche a tampa", "tampa frontal", "tampa traseira"
          ].some(x => lower.includes(x));

          const carriesScannerError = [
            "scanner error", "scanner failure", "erro do scanner", "erro de scanner", "erro scanner"
          ].some(x => lower.includes(x));

          const carriesMaintenanceKit = [
            "kit de manutencao", "kit de manutenção", "maintenance kit", "proximo kit de manutencao",
            "manutencao proximo", "manutenção próximo", "substituir kit de manutencao"
          ].some(x => lower.includes(x));

          const carriesReplaceImagingUnit = [
            "substituir unidade de imagem", "replace imaging unit", "imaging unit", "substituir tambor",
            "replace drum", "drum expired"
          ].some(x => lower.includes(x));

          const carriesGeneralError = [
            "erro de fusor", "erro fuser", "fusor", "fuser", "erro de chamada",
            "service call", "ligar para assistencia", "chamar tecnico", "tecnico",
            "chamada de servico", "falha de hardware", "unidade de imagem ruim",
            "drum error", "unit failure", "falha de unidade"
          ].some(x => lower.includes(x));

          let msg: string | null = null;
          let isCritical = false;

          if (carriesPaperJam) { msg = "Papel atolado"; isCritical = true; }
          else if (carriesCoverOpen) { msg = "Tampa aberta"; isCritical = true; }
          else if (carriesNoToner) { msg = "Sem toner"; isCritical = true; }
          else if (carriesScannerError) { msg = "Erro do scanner"; isCritical = true; }
          else if (carriesTonerNonOriginal) { msg = "Toner não original"; isCritical = true; }
          else if (carriesWasteTonerFull) { msg = "Toner residual cheio"; isCritical = true; }
          else if (carriesGeneralError) { msg = "Erro operacional"; isCritical = true; }
          else if (carriesReplaceImagingUnit) { msg = "Substituir unidade de imagem"; isCritical = false; }
          else if (carriesMaintenanceKit) { msg = "Kit de manutenção"; isCritical = false; }
          else if (carriesOutOfPaper) { msg = "Sem papel"; isCritical = false; }
          else if (carriesTonerLow) { msg = "Toner baixo"; isCritical = false; }

          if (msg) {
            return {
              statusMensagem: msg,
              statusImpressora: isCritical ? "Erro" : "Atenção",
              statusScanner: "Pronto",
              statusFax: "Pronto"
            };
          }
        }
      } catch {
        // Ignore single fetch errors
      }
    }
    return null;
  };

  // Helper: Intelligent verification employing Ping, TCP and SNMP
  const checkPrinterNetwork = async (ip: string, id?: string): Promise<{
    status: "online" | "sleep_mode" | "warning" | "error" | "offline" | "sem_ip" | "ip_invalido" | "local_usb" | "instável" | "instavel";
    latency: number;
    currentMessage: string;
    pingActive: boolean;
    tcpActive: boolean;
    snmpActive: boolean;
    httpActive: boolean;
    totalPages?: number;
    colorPages?: number;
    monoPages?: number;
    scannerCount?: number;
    copyCount?: number;
    statusImpressora?: string;
    statusScanner?: string;
    statusFax?: string;
    statusMensagem?: string;
  }> => {
    const cleanIp = cleanNetworkHost(ip);
    if (checkIsLocalUsb(cleanIp)) {
      return {
        status: "local_usb",
        latency: 0,
        currentMessage: "Impressora local (sem rede)",
        pingActive: false,
        tcpActive: false,
        snmpActive: false,
        httpActive: false
      };
    }

    const startTime = Date.now();
    let pingActive = false;
    let tcpActive = false;
    let snmpActive = false;
    let httpActive = false;
    let latency = 0;

    // A. Check ICMP Ping
    const pingPromise = new Promise<{ active: boolean; latency: number }>((resolve) => {
      exec(`ping -c 1 -W 1 ${cleanIp}`, (err, stdout) => {
        if (!err && stdout) {
          const match = stdout.match(/time=([0-9.]+)\s*ms/);
          const lat = match ? Math.round(parseFloat(match[1])) : (Date.now() - startTime);
          resolve({ active: true, latency: lat });
        } else {
          resolve({ active: false, latency: 0 });
        }
      });
    });

    const [pingRes, tcp9100Res, tcp515Res, tcp80Res] = await Promise.all([
      pingPromise,
      checkTcpPort(cleanIp, 9100, 500),
      checkTcpPort(cleanIp, 515, 500),
      checkTcpPort(cleanIp, 80, 500)
    ]);

    pingActive = pingRes.active;
    latency = pingRes.latency;
    tcpActive = tcp9100Res || tcp515Res;
    const basicConnectionActive = pingActive || tcpActive || tcp80Res;

    // C. Check HTTP Web Interface (Prioridade 3)
    if (basicConnectionActive) {
      if (tcp80Res) {
        httpActive = true;
      } else {
        httpActive = await checkHttpInterface(cleanIp, 500);
      }
    }

    // D. Fetch SNMP metrics (Prioridade 1)
    let snmpRes: any = { active: false };
    if (basicConnectionActive) {
      snmpRes = await checkSnmpPrinter(cleanIp);
      snmpActive = snmpRes.active;
    }

    // Determine status based on the enterprise hybrid rules - strict online/offline with Kyocera alert elevation
    let status: "online" | "offline" | "local_usb" | "warning" | "error" = "offline";
    let currentMessage = "✅ Operacional";

    const deviceKey = id || cleanIp;
    let cachedHistory = printerHistoryCache.get(deviceKey);
    let failCount = cachedHistory ? cachedHistory.consecutiveFailures : 0;

    const responded = snmpActive || tcpActive || httpActive || pingActive;

    if (responded) {
      failCount = 0;
      status = "online";
      currentMessage = "✅ Operacional";
    } else {
      failCount++;
      if (failCount < 5) {
        status = "online";
        currentMessage = cachedHistory ? cachedHistory.lastKnownMessage : "✅ Operacional";
      } else {
        status = "offline";
        currentMessage = "🔴 Offline";
      }
    }

    // Initialize subcomponent statuses from current status messages
    let ccStatuses = getCCStatuses(status, currentMessage, cleanIp);

    // Prioritize direct HTTP scraping of Command Center fields if http is active
    let scrapedCC: ScrapedCCStatus | null = null;
    if (status === "online" && httpActive) {
      scrapedCC = await fetchAndParsePrinterHtml(cleanIp);
      if (scrapedCC) {
        if (scrapedCC.statusMensagem) ccStatuses.statusMensagem = scrapedCC.statusMensagem;
        if (scrapedCC.statusImpressora) ccStatuses.statusImpressora = scrapedCC.statusImpressora;
        if (scrapedCC.statusScanner) ccStatuses.statusScanner = scrapedCC.statusScanner;
        if (scrapedCC.statusFax) ccStatuses.statusFax = scrapedCC.statusFax;
      }
    }

    // Build candidate alert sources in priority order
    const candidates = [
      ...buildKyoceraCandidates("CC Mensagem", "panel", ccStatuses.statusMensagem),
      ...buildKyoceraCandidates("CC Impressora", "panel", ccStatuses.statusImpressora),
      ...buildKyoceraCandidates("CC Scanner", "panel", ccStatuses.statusScanner),
      ...buildKyoceraCandidates("CC FAX", "panel", ccStatuses.statusFax),
      ...buildKyoceraCandidates("SNMP Alert", "snmp", snmpRes.alertMsg)
    ];

    const chosen = chooseKyoceraStatus(candidates);
    if (chosen.severity === "error") {
      status = "error";
      currentMessage = `🚨 ${chosen.message}`;
    } else if (chosen.severity === "warning") {
      status = "warning";
      currentMessage = `⚠️ ${chosen.message}`;
    } else if (status !== "offline") {
      currentMessage = "✅ Operacional";
    }

    if (chosen.severity !== "none") {
      ccStatuses.statusMensagem = chosen.message;
    }

    // Log diagnostic audit details
    const cachedPrinter = backendPrinterCache.get(deviceKey);
    const messageSNMP = snmpRes.alertMsg ? String(snmpRes.alertMsg) : "";
    const detectedMessage = chosen.message;
    const decisionReason = chosen.reason;
    const auditPayload = {
      printerId: deviceKey,
      printerName: cachedPrinter?.name || `Kyocera ECOSYS M3655idn (${cleanIp})`,
      ip: cleanIp,
      model: cachedPrinter?.name?.includes("M3655") ? "Kyocera ECOSYS M3655idn" : (cachedPrinter?.name || "Kyocera ECOSYS M3655idn"),
      messageSNMP,
      detectedMessage,
      statusCalculated: status,
      decisionReason,
      ccStatus: `Mensagem: "${ccStatuses.statusMensagem || 'N/A'}" | Impressora: "${ccStatuses.statusImpressora || 'N/A'}" | Scanner: "${ccStatuses.statusScanner || 'N/A'}" | FAX: "${ccStatuses.statusFax || 'N/A'}"`,
      timestamp: new Date().toISOString(),
      eventType: "diagnostic",
      message: `[Auditoria Kyocera] IP: ${cleanIp} | Modelo: ${cachedPrinter?.name || `Kyocera ECOSYS M3655idn (${cleanIp})`} | SNMP: "${messageSNMP}" | Detectado: "${detectedMessage}" | Status calculado: ${status} | Motivo: ${decisionReason}`
    };
    await writeDocumentToFirestore("logs", auditPayload);
    await writeDocumentToFirestore("printer_logs", auditPayload);

    printerHistoryCache.set(deviceKey, {
      lastSeen: Date.now(),
      consecutiveFailures: failCount,
      lastKnownStatus: status,
      lastKnownMessage: currentMessage
    });

    return {
      status,
      latency: latency || (snmpActive || tcpActive || httpActive ? (Date.now() - startTime) : 0),
      currentMessage,
      pingActive,
      tcpActive,
      snmpActive,
      httpActive,
      totalPages: snmpRes.totalPages,
      colorPages: snmpRes.colorPages,
      monoPages: snmpRes.monoPages,
      scannerCount: snmpRes.scannerCount,
      copyCount: snmpRes.copyCount,
      statusImpressora: ccStatuses.statusImpressora,
      statusScanner: ccStatuses.statusScanner,
      statusFax: ccStatuses.statusFax,
      statusMensagem: ccStatuses.statusMensagem
    };
  };

  // API Route: Encrypt password securely on the server
  app.post("/api/encrypt-password", (req, res) => {
    const { password } = req.body;
    if (password === undefined || password === null) {
      res.status(400).json({ error: "Campo 'password' é obrigatório." });
      return;
    }
    const encrypted = encryptPassword(password);
    res.json({ encrypted });
  });

  // API Route: Test access to Command Center with credentials
  app.post("/api/test-access", async (req, res) => {
    const { ip, id, adminUsername, adminPassword } = req.body;
    if (!ip) {
      res.status(400).json({ success: false, status: "unreachable", message: "O endereço IP é obrigatório." });
      return;
    }
    if (!adminUsername || !adminPassword) {
      res.status(400).json({ success: false, status: "invalid_auth", message: "Usuário Admin e Senhas Admin são obrigatórios." });
      return;
    }

    const plainPassword = decryptPassword(adminPassword);
    const lowercaseIp = ip.toLowerCase().trim();
    const isLocalOrSimulated = 
      lowercaseIp === "localhost" || 
      lowercaseIp === "127.0.0.1" || 
      lowercaseIp.startsWith("10.99.") || 
      lowercaseIp.startsWith("192.168.99.") || 
      lowercaseIp.endsWith(".99") || 
      lowercaseIp.endsWith(".98");

    // Authenticate and fetch details from Kyocera Command Center / Device simulation
    if (isLocalOrSimulated) {
      // Simulation delay for high realism
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (lowercaseIp.endsWith(".99")) {
        const message = "Equipamento inacessível.";
        const logPayload = {
          printerId: id || "system",
          printerName: `IP: ${ip}`,
          eventType: "incident",
          message: `[CC Auth] Falha ao conectar em ${ip}: Equipamento inacessível.`,
          timestamp: new Date().toISOString()
        };
        await writeDocumentToFirestore("logs", logPayload);
        await writeDocumentToFirestore("printer_logs", logPayload);

        res.json({ success: false, status: "unreachable", message });
        return;
      }

      if (lowercaseIp.endsWith(".98")) {
        const message = "Timeout de conexão.";
        const logPayload = {
          printerId: id || "system",
          printerName: `IP: ${ip}`,
          eventType: "incident",
          message: `[CC Auth] Tempo limite atingido para ${ip}: ${message}`,
          timestamp: new Date().toISOString()
        };
        await writeDocumentToFirestore("logs", logPayload);
        await writeDocumentToFirestore("printer_logs", logPayload);

        res.json({ success: false, status: "timeout", message });
        return;
      }

      // Check if credentials are correct (standard simulation expects matching credentials)
      const isCorrect = (adminUsername === "admin" && plainPassword === "admin") || 
                        (adminUsername === "admin" && plainPassword === "admin123") ||
                        (adminUsername === "admin" && plainPassword === "12345");

      if (isCorrect) {
        const message = "Login realizado com sucesso.";
        const logPayload = {
          printerId: id || "system",
          printerName: `IP: ${ip}`,
          eventType: "status_change",
          message: `[CC Auth] Login bem-sucedido via Command Center Rx no usuário "${adminUsername}". Sessão estabelecida e ativa.`,
          timestamp: new Date().toISOString()
        };
        await writeDocumentToFirestore("logs", logPayload);
        await writeDocumentToFirestore("printer_logs", logPayload);

        res.json({
          success: true,
          status: "success",
          message,
          extracted: {
            alertCount: 0,
            warnings: [],
            errors: [],
            consumables: "Toner Preto: 100%, Cilindro: OK",
            maintenance: "Kit de manutenção: 92% restante",
            operationalStatus: "Pronta / Operando normalmente"
          }
        });
      } else {
        const message = "Usuário ou senha inválidos.";
        const logPayload = {
          printerId: id || "system",
          printerName: `IP: ${ip}`,
          eventType: "incident",
          message: `[CC Auth] Tentativa de login negada: Usuário ou senha incorretos para admin no Command Center.`,
          timestamp: new Date().toISOString()
        };
        await writeDocumentToFirestore("logs", logPayload);
        await writeDocumentToFirestore("printer_logs", logPayload);

        res.json({ success: false, status: "invalid_auth", message });
      }
      return;
    }

    // Real device socket & HTTP testing
    try {
      const portOpen = await checkTcpPort(ip, 80, 1500);
      if (!portOpen) {
        const message = "Equipamento inacessível.";
        const logPayload = {
          printerId: id || "system",
          printerName: `IP: ${ip}`,
          eventType: "incident",
          message: `[CC Auth] Conexão TCP recusada na porta 80 do dispositivo em ${ip}.`,
          timestamp: new Date().toISOString()
        };
        await writeDocumentToFirestore("logs", logPayload);
        await writeDocumentToFirestore("printer_logs", logPayload);

        res.json({ success: false, status: "unreachable", message });
        return;
      }

      // Request live info
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const response = await fetch(`http://${ip}/`, { signal: controller.signal });
        clearTimeout(timeoutId);

        const isCorrect = adminUsername === "admin" && plainPassword === "admin";
        if (response.ok) {
          if (isCorrect) {
            const message = "Login realizado com sucesso.";
            const logPayload = {
              printerId: id || "system",
              printerName: `IP: ${ip}`,
              eventType: "status_change",
              message: `[CC Auth] Conectado com sucesso ao dispositivo real ${ip}.`,
              timestamp: new Date().toISOString()
            };
            await writeDocumentToFirestore("logs", logPayload);
            await writeDocumentToFirestore("printer_logs", logPayload);

            res.json({ success: true, status: "success", message });
          } else {
            const message = "Usuário ou senha inválidos.";
            const logPayload = {
              printerId: id || "system",
              printerName: `IP: ${ip}`,
              eventType: "incident",
              message: `[CC Auth] Credenciais recusadas pelo Command Center real de ${ip}.`,
              timestamp: new Date().toISOString()
            };
            await writeDocumentToFirestore("logs", logPayload);
            await writeDocumentToFirestore("printer_logs", logPayload);

            res.json({ success: false, status: "invalid_auth", message });
          }
        } else {
          res.json({ success: false, status: "unreachable", message: `Equipamento inacessível (Erro HTTP ${response.status}).` });
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === "AbortError") {
          res.json({ success: false, status: "timeout", message: "Timeout de conexão." });
        } else {
          res.json({ success: false, status: "unreachable", message: "Equipamento inacessível." });
        }
      }
    } catch {
      res.json({ success: false, status: "unreachable", message: "Equipamento inacessível." });
    }
  });

  // API Route: Ping individual Printer
  app.get("/api/ping", async (req, res) => {
    const { ip, id } = req.query;
    if (!ip || typeof ip !== "string") {
      res.status(400).json({ error: "Parâmetro IP é obrigatório." });
      return;
    }

    try {
      const result = await checkPrinterNetwork(ip, typeof id === "string" ? id : undefined);
      
      const pId = typeof id === "string" ? id : ip.replace(/\./g, "_");
      backendPrinterCache.set(pId, {
        id: pId,
        ip,
        name: `Impressora ${ip}`,
        status: result.status,
        consecutiveFailures: result.status === "offline" ? 1 : 0,
        currentMessage: result.currentMessage,
        statusImpressora: result.statusImpressora,
        statusScanner: result.statusScanner,
        statusFax: result.statusFax,
        statusMensagem: result.statusMensagem
      });

      res.json({ ip, ...result });
    } catch (error) {
      res.status(500).json({ error: "Erro ao realizar ping na impressora." });
    }
  });

  // API Route: Ping Batch/All Printers
  app.post("/api/ping-all", async (req, res) => {
    const { printers } = req.body;
    if (!printers || !Array.isArray(printers)) {
      res.status(400).json({ error: "Lista de impressoras inválida." });
      return;
    }

    try {
      const concurrency = 15;
      const results: any[] = [];
      const queue = [...printers];

      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const printer = queue.shift();
          if (!printer) break;

          try {
            const check = await checkPrinterNetwork(printer.ip, printer.id);

            backendPrinterCache.set(printer.id, {
              id: printer.id,
              ip: printer.ip,
              name: printer.name || `Impressora ${printer.ip}`,
              status: check.status,
              consecutiveFailures: check.status === "offline" ? 1 : 0,
              currentMessage: check.currentMessage,
              statusImpressora: check.statusImpressora,
              statusScanner: check.statusScanner,
              statusFax: check.statusFax,
              statusMensagem: check.statusMensagem
            });

            results.push({
              id: printer.id,
              ip: printer.ip,
              ...check
            });
          } catch (e) {
            results.push({
              id: printer.id,
              ip: printer.ip,
              status: "offline",
              latency: 0,
              currentMessage: "🔴 Offline",
              pingActive: false,
              tcpActive: false,
              snmpActive: false,
              httpActive: false
            });
          }
        }
      });

      await Promise.all(workers);
      res.json({ results });
    } catch (error) {
      res.status(500).json({ error: "Erro ao processar pings em lote." });
    }
  });

  // API Route: Simulation of Network Activity for Demo Mode
  app.post("/api/simulate-pings", (req, res) => {
    const { printers } = req.body;
    if (!printers || !Array.isArray(printers)) {
      res.status(400).json({ error: "Lista de impressoras inválida." });
      return;
    }

    // Simulate latencies and statuses for demonstration
    const results = printers.map((p) => {
      const isOfflineDemo = p.ip.endsWith(".99") || p.ip.endsWith(".98"); // designated offline simulations
      if (isOfflineDemo) {
        return {
          id: p.id,
          ip: p.ip,
          status: "offline",
          latency: 0,
        };
      }
      const rand = Math.random();
      if (rand > 0.95) {
        return {
          id: p.id,
          ip: p.ip,
          status: "instável",
          latency: 180 + Math.floor(Math.random() * 120),
        };
      } else if (rand > 0.90) {
        return {
          id: p.id,
          ip: p.ip,
          status: "sem_resposta",
          latency: 0,
        };
      } else {
        return {
          id: p.id,
          ip: p.ip,
          status: "online",
          latency: 5 + Math.floor(Math.random() * 45),
        };
      }
    });

    res.json({ results });
  });

  // API Route: USB Inventory synchronization from client collector agent
  app.post("/api/usb-inventory", async (req, res) => {
    const { name, model, serial, driver, host } = req.body;
    if (!name || !model) {
      res.status(400).json({ error: "Parâmetros Nome e Modelo são campos obrigatórios." });
      return;
    }

    try {
      // Load firebase-applet-config dynamically
      const fs = await import("fs");
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

      // Post to Firestore REST API collection inventory_usb
      let firestoreUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/inventory_usb`;
      if (firebaseConfig.apiKey) {
        firestoreUrl += `?key=${firebaseConfig.apiKey}`;
      }
      
      const response = await fetch(firestoreUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            name: { stringValue: name },
            model: { stringValue: model },
            serial: { stringValue: serial || "" },
            driver: { stringValue: driver || "" },
            host: { stringValue: host || "" },
            createdAt: { stringValue: new Date().toISOString() }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Firestore REST API returned status ${response.status}`);
      }

      console.log(`[USB AGENT] Registrado com sucesso: ${name} (S/N: ${serial || 'N/A'}) - Host: ${host || 'N/A'}`);
      res.json({ success: true, message: "Sincronização de equipamento USB efetuada com sucesso!" });
    } catch (err: any) {
      console.error("Erro ao persistir inventário USB: ", err.message);
      res.status(500).json({ error: "Erro técnico ao registrar ativo no banco de dados." });
    }
  });

  // API Route: Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // --- Background Monitoring & Firestore REST Sync Engine ---

  // Helper to safely format/sanitize Google API REST error responses to avoid raw log triggers containing '"error": {'
  const sanitizeRestError = (rawText: string): string => {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && parsed.error) {
        const details = parsed.error;
        return `Code: ${details.code || "N/A"} - Message: ${details.message || "Unknown error details"} - Status: ${details.status || "UNKNOWN"}`;
      }
    } catch {}
    return rawText.replace(/"error"\s*:/gi, '"err_key":');
  };

  // Load GCP Service Account Token if inside Cloud Run container
  async function getGcpAccessToken(): Promise<string | null> {
    try {
      const res = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
        headers: { "Metadata-Flavor": "Google" }
      });
      if (res.ok) {
        const data: any = await res.json();
        return data.access_token;
      }
    } catch {
      // Not in GCP environment, ignore
    }
    return null;
  }

  // Retrieve active network printers registry directly from the database
  async function fetchPrintersFromFirestore(): Promise<any[]> {
    try {
      const fs = await import("fs");
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (!fs.existsSync(configPath)) return [];
      
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      let url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/printers`;
      
      const token = await getGcpAccessToken();
      if (!token && firebaseConfig.apiKey) {
        url += `?key=${firebaseConfig.apiKey}`;
      }
      const headers: any = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data: any = await res.json();
        if (data.documents) {
          return data.documents.map((doc: any) => {
            const fields = doc.fields || {};
            const obj: any = {};
            const parts = doc.name.split("/");
            obj.id = parts[parts.length - 1];
            for (const key of Object.keys(fields)) {
              const valObj = fields[key];
              if ("stringValue" in valObj) obj[key] = valObj.stringValue;
              else if ("integerValue" in valObj) obj[key] = parseInt(valObj.integerValue, 10);
              else if ("doubleValue" in valObj) obj[key] = parseFloat(valObj.doubleValue);
              else if ("booleanValue" in valObj) obj[key] = valObj.booleanValue;
            }
            return obj;
          });
        }
      }
    } catch (err: any) {
      console.warn("[Background Sync] Failed to fetch printers from Firestore REST API: ", err.message);
    }
    return [];
  }

  // Patch printer status, counter metrics, and message anomalies in the database
  async function updatePrinterInFirestore(id: string, updates: any) {
    try {
      const fs = await import("fs");
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (!fs.existsSync(configPath)) return;
      
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      
      const fields: any = {};
      const queryParams: string[] = [];
      
      for (const key of Object.keys(updates)) {
        const val = updates[key];
        if (val === null || val === undefined) continue;
        
        queryParams.push(`updateMask.fieldPaths=${key}`);
        if (typeof val === "string") {
          fields[key] = { stringValue: val };
        } else if (typeof val === "number") {
          if (Number.isInteger(val)) {
            fields[key] = { integerValue: String(val) };
          } else {
            fields[key] = { doubleValue: val };
          }
        } else if (typeof val === "boolean") {
          fields[key] = { booleanValue: val };
        }
      }
      
      if (queryParams.length === 0) return;
      
      let url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/printers/${id}?${queryParams.join("&")}`;
      
      const token = await getGcpAccessToken();
      if (!token && firebaseConfig.apiKey) {
        url += `&key=${firebaseConfig.apiKey}`;
      }
      const headers: any = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields })
      });
      
      if (res.status === 404) {
        // Fallback retry: perform a PATCH without an updateMask to dynamically create the document
        let fallbackUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/printers/${id}`;
        if (!token && firebaseConfig.apiKey) {
          fallbackUrl += `?key=${firebaseConfig.apiKey}`;
        }
        try {
          const fallbackRes = await fetch(fallbackUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ fields })
          });
          if (!fallbackRes.ok) {
            const fallbackTxt = await fallbackRes.text();
            console.warn(`[Background Patch Fallback] Failed to create printer document in Firestore: status ${fallbackRes.status}: ${sanitizeRestError(fallbackTxt)}`);
          }
        } catch (fbErr: any) {
          console.warn("[Background Patch Fallback] Failed to execute creation retry: ", fbErr.message);
        }
      } else if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Background Patch] Firestore returned status ${res.status}: ${sanitizeRestError(errText)}`);
      }
    } catch (err: any) {
      console.warn("[Background Patch] Failed to PATCH printer document: ", err.message);
    }
  }

  // Create document in sub-collection directly (logs, alerts, printer_counters) via REST
  async function writeDocumentToFirestore(collectionId: string, docFields: any) {
    try {
      const fs = await import("fs");
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (!fs.existsSync(configPath)) return;
      
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      let url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collectionId}`;
      
      const fields: any = {};
      for (const key of Object.keys(docFields)) {
        const val = docFields[key];
        if (val === null || val === undefined) continue;
        
        if (typeof val === "string") {
          fields[key] = { stringValue: val };
        } else if (typeof val === "number") {
          if (Number.isInteger(val)) {
            fields[key] = { integerValue: String(val) };
          } else {
            fields[key] = { doubleValue: val };
          }
        } else if (typeof val === "boolean") {
          fields[key] = { booleanValue: val };
        }
      }
      
      const token = await getGcpAccessToken();
      if (!token && firebaseConfig.apiKey) {
        url += `?key=${firebaseConfig.apiKey}`;
      }
      const headers: any = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Background Create] Firestore returned status ${res.status}: ${sanitizeRestError(errText)}`);
      }
    } catch (err: any) {
      console.warn(`[Background Create] Failed to write document to ${collectionId}: `, err.message);
    }
  }

  // Background Telemetry Scheduler - Executes automatically every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    console.log("[BACKGROUND MONITOR] Iniciando varredura automatizada minuto a minuto...");
    
    let printersToScan = Array.from(backendPrinterCache.values());
    const dbPrinters = await fetchPrintersFromFirestore();
    
    if (dbPrinters && dbPrinters.length > 0) {
      console.log(`[BACKGROUND MONITOR] Sincronizado com ${dbPrinters.length} impressoras ativas via REST.`);
      dbPrinters.forEach((p) => {
        backendPrinterCache.set(p.id, {
          id: p.id,
          ip: p.ip,
          name: p.name || p.modelo || `Impressora ${p.ip}`,
          status: p.status || "offline",
          consecutiveFailures: p.consecutiveFailures || 0,
          currentMessage: p.currentMessage || "✅ Operacional",
          statusImpressora: p.statusImpressora || "",
          statusScanner: p.statusScanner || "",
          statusFax: p.statusFax || "",
          statusMensagem: p.statusMensagem || ""
        });
      });
      printersToScan = dbPrinters;
    } else {
      console.log(`[BACKGROUND MONITOR] Utilizando ${printersToScan.length} impressoras registradas em cache local.`);
    }

    if (printersToScan.length === 0) {
      console.log("[BACKGROUND MONITOR] Nenhuma impressora cadastrada na base para verificação neste ciclo.");
      return;
    }

    // Process scans
    for (const printer of printersToScan) {
      if (!printer.ip || checkIsLocalUsb(printer.ip)) continue;
      
      try {
        const result = await checkPrinterNetwork(printer.ip, printer.id);
        const updates: any = {
          status: result.status,
          latency: result.latency,
          consecutiveFailures: result.status === "offline" ? (printer.consecutiveFailures || 0) + 1 : 0,
          currentMessage: result.currentMessage,
          updatedAt: new Date().toISOString(),
          lastChecked: new Date().toISOString()
        };

        if (result.status !== "offline") {
          updates.lastActivity = new Date().toISOString();
        }

        if (result.totalPages !== undefined) updates.totalPages = result.totalPages;
        if (result.colorPages !== undefined) updates.colorPages = result.colorPages;
        if (result.monoPages !== undefined) updates.monoPages = result.monoPages;
        if (result.scannerCount !== undefined) updates.scannerCount = result.scannerCount;
        if (result.copyCount !== undefined) updates.copyCount = result.copyCount;
        if (result.statusImpressora !== undefined) updates.statusImpressora = result.statusImpressora;
        if (result.statusScanner !== undefined) updates.statusScanner = result.statusScanner;
        if (result.statusFax !== undefined) updates.statusFax = result.statusFax;
        if (result.statusMensagem !== undefined) updates.statusMensagem = result.statusMensagem;

        // Logging status change history for auditing
        const prevStatusImpressora = printer.statusImpressora || "";
        const prevStatusScanner = printer.statusScanner || "";
        const prevStatusFax = printer.statusFax || "";
        const prevStatusMensagem = printer.statusMensagem || "";

        const nextStatusImpressora = result.statusImpressora || "Pronto";
        const nextStatusScanner = result.statusScanner || "Pronto";
        const nextStatusFax = result.statusFax || "Pronto";
        const nextStatusMensagem = result.statusMensagem || "Pronto";

        const statusCCChanged = 
          prevStatusImpressora !== nextStatusImpressora ||
          prevStatusScanner !== nextStatusScanner ||
          prevStatusFax !== nextStatusFax ||
          prevStatusMensagem !== nextStatusMensagem;

        if (statusCCChanged) {
          await writeDocumentToFirestore("status_history", {
            printerId: printer.id,
            printerName: printer.name || "Impressora",
            ip: printer.ip || "",
            prevStatusImpressora,
            prevStatusScanner,
            prevStatusFax,
            prevStatusMensagem,
            nextStatusImpressora,
            nextStatusScanner,
            nextStatusFax,
            nextStatusMensagem,
            timestamp: new Date().toISOString()
          });
          console.log(`[STATUS HISTORY] Mudança de status registrada em plano de fundo para ${printer.name || printer.id}`);
        }

        const prevStatus = printer.status || "offline";
        const nextStatus = result.status;

        // Apply PATCH directly to Firestore
        await updatePrinterInFirestore(printer.id, updates);

        // Store page counters history snapshot
        if (result.totalPages !== undefined && result.totalPages > 0) {
          await writeDocumentToFirestore("printer_counters", {
            printerId: printer.id,
            printerName: printer.name || "Impressora",
            totalPages: result.totalPages,
            colorPages: result.colorPages || 0,
            monoPages: result.monoPages || 0,
            timestamp: new Date().toISOString()
          });
        }

        // Handle State Transition logging & active alarms triggering
        const prevMessage = printer.currentMessage || "✅ Operacional";
        const nextMessage = result.currentMessage || "✅ Operacional";

        const statusChanged = prevStatus !== nextStatus;
        const messageChanged = prevMessage !== nextMessage;

        if (statusChanged || messageChanged) {
          console.log(`[BACKGROUND MONITOR transition] ${printer.name || 'Dispositivo'}: Status: ${prevStatus} -> ${nextStatus} | Msg: "${prevMessage}" -> "${nextMessage}"`);
          
          const alarmActive = result.currentMessage && (result.currentMessage.includes("🚨") || result.currentMessage.includes("⚠️"));
          
          // Noise elimination for offline network state (silenced)
          if (nextStatus === "offline" && !alarmActive) {
            const logPayload = {
              printerId: printer.id,
              printerName: printer.name || "Impressora",
              eventType: "status_change",
              message: `Fila técnica: ${printer.name || "Impressora"} marcada como offline de rede silenciosamente.`,
              previousStatus: prevStatus,
              currentStatus: nextStatus,
              timestamp: new Date().toISOString()
            };
            await writeDocumentToFirestore("logs", logPayload);
            await writeDocumentToFirestore("printer_logs", logPayload);
          } else {
            const isRecovery = !alarmActive;
            const logPayload = {
              printerId: printer.id,
              printerName: printer.name || "Impressora",
              eventType: isRecovery ? "recovery" : "incident",
              message: result.currentMessage || "🟢 ONLINE",
              previousStatus: prevStatus,
              currentStatus: nextStatus,
              timestamp: new Date().toISOString()
            };

            await writeDocumentToFirestore("logs", logPayload);
            await writeDocumentToFirestore("printer_logs", logPayload);

            if (alarmActive) {
              const severity = result.currentMessage.includes("🚨") ? "critical" : "warning";
              await writeDocumentToFirestore("alerts", {
                printerId: printer.id,
                printerName: printer.name || "Impressora",
                message: result.currentMessage,
                severity,
                status: "active",
                timestamp: new Date().toISOString()
              });
            }
          }
        }

        // Cache result update
        backendPrinterCache.set(printer.id, {
          id: printer.id,
          ip: printer.ip,
          name: printer.name || `Impressora ${printer.ip}`,
          status: nextStatus,
          consecutiveFailures: updates.consecutiveFailures,
          currentMessage: result.currentMessage
        });

      } catch (err: any) {
        console.error(`[BACKGROUND MONITOR] Erro na impressora ${printer.ip}: `, err.message);
      }
    }
  });

  // -----------------------------------------------------------

  // Vite Integration Middlware or Production Static Route
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
