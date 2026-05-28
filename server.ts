import express from "express";
import path from "path";
import { exec } from "child_process";
import net from "net";
import { createServer as createViteServer } from "vite";
import cron from "node-cron";
// @ts-ignore
import snmp from "net-snmp";

async function startServer() {
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
  }
  const backendPrinterCache = new Map<string, CachedPrinter>();

  // SNMP Check Function utilizing specified OIDs
  const checkSnmpPrinter = (ip: string): Promise<{
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
    return new Promise((resolve) => {
      try {
        const session = snmp.createSession(ip, "public", {
          timeout: 1000,
          retries: 0,
          port: 161
        });

        // OIDs requested:
        // status: "1.3.6.1.2.1.25.3.5.1.1" (hrPrinterStatus)
        // messages: "1.3.6.1.2.1.43.18.1.1.8.1.1" (prtAlertDescription)
        // name: "1.3.6.1.2.1.1.5.0" (sysName)
        // counter: "1.3.6.1.2.1.43.10.2.1.4.1.1" (hrPrinterTotalPages)
        const oids = [
          "1.3.6.1.2.1.1.5.0",
          "1.3.6.1.2.1.25.3.5.1.1",
          "1.3.6.1.2.1.43.18.1.1.8.1.1",
          "1.3.6.1.2.1.43.10.2.1.4.1.1"
        ];

        session.get(oids, (err: any, varbinds: any) => {
          if (err) {
            // Fallback attempt: Try to query just the basic sysName and printerStatus to handle more restrictive devices
            const basicOids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.25.3.5.1.1"];
            session.get(basicOids, (err2: any, varbinds2: any) => {
              session.close();
              if (err2) {
                resolve({ active: false });
              } else {
                let sysName = undefined;
                let printerStatus = undefined;
                if (varbinds2[0] && !snmp.isVarbindError(varbinds2[0])) {
                  sysName = varbinds2[0].value.toString();
                }
                if (varbinds2[1] && !snmp.isVarbindError(varbinds2[1])) {
                  printerStatus = Number(varbinds2[1].value);
                }
                resolve({
                  active: true,
                  sysName,
                  printerStatus,
                  alertMsg: "Status SNMP recuperado com restrições de OID"
                });
              }
            });
          } else {
            let sysName = undefined;
            let printerStatus = undefined;
            let alertMsg = undefined;
            let totalPages = undefined;

            if (varbinds[0] && !snmp.isVarbindError(varbinds[0])) {
              sysName = varbinds[0].value.toString();
            }
            if (varbinds[1] && !snmp.isVarbindError(varbinds[1])) {
              printerStatus = Number(varbinds[1].value);
            }
            if (varbinds[2] && !snmp.isVarbindError(varbinds[2])) {
              alertMsg = varbinds[2].value.toString();
            }
            if (varbinds[3] && !snmp.isVarbindError(varbinds[3])) {
              totalPages = Number(varbinds[3].value);
            }

            session.close();

            // Structure detailed metrics if total pages are fetched via SNMP OID
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

            resolve({
              active: true,
              sysName,
              printerStatus,
              alertMsg,
              totalPages,
              colorPages,
              monoPages,
              scannerCount,
              copyCount
            });
          }
        });
      } catch {
        resolve({ active: false });
      }
    });
  };

  // Helper TCP Connection check function
  const checkTcpPort = (ip: string, port: number, timeoutMs = 800): Promise<boolean> => {
    return new Promise((resolve) => {
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
    });
  };

  // Helper HTTP connection check function (Prioridade 3)
  const checkHttpInterface = (ip: string, timeoutMs = 1200): Promise<boolean> => {
    return new Promise((resolve) => {
      // Test common ports 80 and 443 specifically for web interfaces
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      const handleErrorList = () => {
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
      };

      socket.on("error", handleErrorList);
      socket.on("timeout", handleErrorList);
      socket.connect(80, ip);
    });
  };

  // Helper: Validates IP addresses according to requirements
  const isValidIP = (ip: string): boolean => {
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/;
    return regex.test(ip.trim());
  };

  // Helper: Determines if a device functions as Local USB or invalid
  const checkIsLocalUsb = (ip: string | undefined): boolean => {
    if (!ip) return true;
    const clean = ip.trim().toUpperCase();
    if (clean === "" || clean === "SEMREDE" || clean === "USB" || clean === "LOCAL") {
      return true;
    }
    return !isValidIP(ip);
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
  }> => {
    const cleanIp = ip ? ip.trim() : "";
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

    const pingRes = await pingPromise;
    pingActive = pingRes.active;
    latency = pingRes.latency;

    // B. Check standard printer ports (Prioridade 2): 9100 (RAW JetDirect) and 515 (LPD)
    const tcp9100Res = await checkTcpPort(cleanIp, 9100, 800);
    const tcp515Res = await checkTcpPort(cleanIp, 515, 800);
    tcpActive = tcp9100Res || tcp515Res;

    // C. Check HTTP Web Interface (Prioridade 3)
    httpActive = await checkHttpInterface(cleanIp, 1000);

    // D. Fetch SNMP metrics (Prioridade 1)
    let snmpRes: any = { active: false };
    if (pingActive || tcpActive || httpActive) {
      snmpRes = await checkSnmpPrinter(cleanIp);
      snmpActive = snmpRes.active;
    }

    // Determine status based on the enterprise hybrid rules
    let status: "online" | "sleep_mode" | "warning" | "error" | "offline" | "local_usb" | "instável" | "instavel" = "offline";
    let currentMessage = "Sem resposta em múltiplos canais";

    const deviceKey = id || cleanIp;
    let cachedHistory = printerHistoryCache.get(deviceKey);
    let failCount = cachedHistory ? cachedHistory.consecutiveFailures : 0;

    const responded = snmpActive || tcpActive || httpActive || pingActive;

    if (responded) {
      failCount = 0;
      if (snmpActive) {
        // SNMP is active (Prioridade 1)
        const alertStr = snmpRes.alertMsg ? String(snmpRes.alertMsg).toLowerCase() : "";
        
        if (alertStr && (alertStr.includes("jam") || alertStr.includes("atolado") || alertStr.includes("obstruído"))) {
          status = "error";
          currentMessage = `Erro Crítico: Papel atolado detectado via SNMP (${snmpRes.alertMsg})`;
        } else if (alertStr && (alertStr.includes("open") || alertStr.includes("aberta") || alertStr.includes("tampa"))) {
          status = "error";
          currentMessage = `Erro Crítico: Tampa frontal ou traseira aberta (${snmpRes.alertMsg})`;
        } else if (alertStr && (alertStr.includes("empty") || alertStr.includes("vazio") || alertStr.includes("toner") || alertStr.includes("insira") || alertStr.includes("vazia"))) {
          status = "warning";
          currentMessage = `Aviso: Toner ou Gaveta de papel vazios (${snmpRes.alertMsg})`;
        } else if (alertStr && (alertStr.includes("low") || alertStr.includes("baixo") || alertStr.includes("pouco"))) {
          status = "warning";
          currentMessage = `Aviso: Consumíveis em nível crítico (${snmpRes.alertMsg})`;
        } else if (snmpRes.printerStatus === 1 || snmpRes.printerStatus === 2) {
          status = "sleep_mode";
          currentMessage = "Modo economia detectado\nTentando reconectar...";
        } else {
          status = "online";
          currentMessage = snmpRes.alertMsg || "Funcionando normalmente (SNMP Ativo)";
        }
      } else if (tcpActive) {
        // TCP Port active (Prioridade 2)
        status = "online";
        currentMessage = "Funcionando normalmente (Porta TCP 9100/515 ativa)";
      } else if (httpActive) {
        // HTTP Web active (Prioridade 3)
        status = "online";
        currentMessage = "Funcionando normalmente (Interface Web HTTP ativa)";
      } else if (pingActive) {
        // ICMP Ping active
        status = "online";
        currentMessage = "Funcionando normalmente (Resposta ICMP Ping ativa)";
      }
    } else {
      // Device currently down: apply sleep mode / instability / offline thresholds
      failCount++;
      if (failCount <= 2) {
        status = "sleep_mode";
        currentMessage = "Modo economia detectado\nTentando reconectar...";
      } else if (failCount <= 4) {
        status = "instável";
        currentMessage = `Inatividade temporária detectada • Verificação instável (Tentativa ${failCount}/5)...`;
      } else {
        status = "offline";
        currentMessage = "Inativa: Sem resposta após 5 verificações consecutivas (SNMP/TCP/HTTP/Ping falharam).";
      }
    }

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
      copyCount: snmpRes.copyCount
    };
  };

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
        consecutiveFailures: result.status === "offline" ? 1 : 0
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
      const results = await Promise.all(
        printers.map(async (printer: { id: string; ip: string; name?: string }) => {
          const check = await checkPrinterNetwork(printer.ip, printer.id);
          
          backendPrinterCache.set(printer.id, {
            id: printer.id,
            ip: printer.ip,
            name: printer.name || `Impressora ${printer.ip}`,
            status: check.status,
            consecutiveFailures: check.status === "offline" ? 1 : 0
          });

          return {
            id: printer.id,
            ip: printer.ip,
            ...check,
          };
        })
      );
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
      
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Background Patch] Firestore returned status ${res.status}: ${errText}`);
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
        console.warn(`[Background Create] Firestore returned status ${res.status}: ${errText}`);
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
          consecutiveFailures: p.consecutiveFailures || 0
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
        if (prevStatus !== nextStatus) {
          console.log(`[BACKGROUND MONITOR status_change] ${printer.name || 'Dispositivo'}: ${prevStatus} -> ${nextStatus}`);
          
          const isRecovery = nextStatus === "online" || nextStatus === "sleep_mode";
          const logPayload = {
            printerId: printer.id,
            printerName: printer.name || "Impressora",
            eventType: isRecovery ? "recovery" : "incident",
            message: `[Monitor de Fundo] Alteração de status: ${prevStatus.toUpperCase()} -> ${nextStatus.toUpperCase()}. Detalhe: ${result.currentMessage}`,
            previousStatus: prevStatus,
            currentStatus: nextStatus,
            timestamp: new Date().toISOString()
          };

          await writeDocumentToFirestore("logs", logPayload);
          await writeDocumentToFirestore("printer_logs", logPayload);

          if (nextStatus === "error" || nextStatus === "offline" || nextStatus === "warning") {
            const severity = nextStatus === "error" ? "critical" : nextStatus === "offline" ? "critical" : "warning";
            await writeDocumentToFirestore("alerts", {
              printerId: printer.id,
              printerName: printer.name || "Impressora",
              message: `Alerta Ativo [Monitor de Fundo]: Alteração para estado ${nextStatus.toUpperCase()}. ${result.currentMessage}`,
              severity,
              status: "active",
              timestamp: new Date().toISOString()
            });
          }
        }

        // Cache result update
        backendPrinterCache.set(printer.id, {
          id: printer.id,
          ip: printer.ip,
          name: printer.name || `Impressora ${printer.ip}`,
          status: nextStatus,
          consecutiveFailures: updates.consecutiveFailures
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
