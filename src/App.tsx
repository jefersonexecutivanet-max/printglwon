import React, { useState, useEffect } from "react";
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  writeBatch 
} from "firebase/firestore";
import { auth, db, logout, handleFirestoreError, OperationType } from "./services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Printer, EventLog, Alert, UsbInventoryEntry } from "./types";
import { playAlertChime } from "./utils/audio";
import { ImportedPrinter, validateIPAddress, isLocalUsbIp } from "./utils/spreadsheet";

// UI Components
import Sidebar from "./components/Sidebar";
import LoginScreen from "./components/LoginScreen";
import DashboardView from "./components/DashboardView";
import PrintersView from "./components/PrintersView";
import EventLogsView from "./components/EventLogsView";
import AlertsView from "./components/AlertsView";
import UsbInventoryView from "./components/UsbInventoryView";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  // Tab State
  const [currentTab, setCurrentTab] = useState("dashboard");

  // Telemetries State
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [usbInventory, setUsbInventory] = useState<UsbInventoryEntry[]>([]);

  // Sound and simulation configurations
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [demoMode, setDemoMode] = useState(false); // default to false so actual status check is done by default
  const [isGlobalScanning, setIsGlobalScanning] = useState(false);
  const [scanningPrintersMap, setScanningPrintersMap] = useState<{ [key: string]: boolean }>({});

  const isLocalIpToken = (ipValue?: string) => {
    const normalized = String(ipValue || "").trim().toUpperCase();
    return normalized === "" || normalized === "SEMREDE" || normalized === "USB" || normalized === "LOCAL";
  };

  // 1. Google Authentication hook
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsDemo(false);
        setDemoMode(false); // Disable simulation for real accounts
      } else if (!isDemo) {
        setUser(null);
      }
      setAuthInitialized(true);
    });

    return () => unsubscribe();
  }, [isDemo]);

  // 2. Real-time Firebase Firestore syncing
  useEffect(() => {
    if (!user || isDemo) return;

    // A. Sync Printers Collection
    const printersUnsubscribe = onSnapshot(
      query(collection(db, "printers"), orderBy("name", "asc")),
      (snapshot) => {
        const list: Printer[] = [];
        snapshot.forEach((docSnapshot) => {
          list.push({ id: docSnapshot.id, ...docSnapshot.data() } as Printer);
        });
        setPrinters(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "printers");
      }
    );

    // B. Sync Logs Collection
    const logsUnsubscribe = onSnapshot(
      query(collection(db, "logs"), orderBy("timestamp", "desc")),
      (snapshot) => {
        const list: EventLog[] = [];
        snapshot.forEach((docSnapshot) => {
          list.push({ id: docSnapshot.id, ...docSnapshot.data() } as EventLog);
        });
        setLogs(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "logs");
      }
    );

    // C. Sync Alerts Collection
    const alertsUnsubscribe = onSnapshot(
      query(collection(db, "alerts"), orderBy("timestamp", "desc")),
      (snapshot) => {
        const list: Alert[] = [];
        snapshot.forEach((docSnapshot) => {
          list.push({ id: docSnapshot.id, ...docSnapshot.data() } as Alert);
        });
        setAlerts(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "alerts");
      }
    );

    // D. Sync USB Inventory Collection
    const usbUnsubscribe = onSnapshot(
      query(collection(db, "inventory_usb"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const list: UsbInventoryEntry[] = [];
        snapshot.forEach((docSnapshot) => {
          list.push({ id: docSnapshot.id, ...docSnapshot.data() } as UsbInventoryEntry);
        });
        setUsbInventory(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "inventory_usb");
      }
    );

    return () => {
      printersUnsubscribe();
      logsUnsubscribe();
      alertsUnsubscribe();
      usbUnsubscribe();
    };
  }, [user, isDemo]);

  // 3. Mock Data populating if running in Local Demo Mode
  useEffect(() => {
    if (!isDemo) return;

    // Initial seed printers
    const initialPrinters: Printer[] = [
      {
        id: "p1",
        name: "HP Laser Comercial 01",
        ip: "10.0.1.45",
        hostname: "imp-comercial-01",
        location: "Diretoria",
        model: "HP LaserJet M608",
        notes: "Uso administrativo prioritário.",
        status: "online",
        latency: 12,
        lastChecked: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "p2",
        name: "Kyocera Central Corredor",
        ip: "10.0.1.55",
        hostname: "imp-kyocera-02",
        location: "Hall Principal",
        model: "Kyocera Ecosys P3145",
        notes: "Impressões departamentais volumosas.",
        status: "offline",
        latency: 0,
        lastChecked: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "p3",
        name: "Plotter Engenharia",
        ip: "10.0.2.14",
        hostname: "imp-plotter",
        location: "Sala de Projetos",
        model: "HP DesignJet T650",
        notes: "Papel A1/A0 engenharia.",
        status: "instável",
        latency: 320,
        lastChecked: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "p4",
        name: "Ricoh Térreo Recepção",
        ip: "10.0.1.99", // designated offline IP simulation trigger
        hostname: "imp-ricoh-recep",
        location: "Recepção",
        model: "Ricoh C3004 MFP",
        notes: "Gargalo constante no atendimento.",
        status: "offline",
        latency: 0,
        lastChecked: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ];

    const initialLogs: EventLog[] = [
      {
        id: "l1",
        printerId: "p2",
        printerName: "Kyocera Central Corredor",
        eventType: "incident",
        message: "Perda total de comunicação. Dispositivo inalcançável via ping.",
        previousStatus: "online",
        currentStatus: "offline",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "l2",
        printerId: "p3",
        printerName: "Plotter Engenharia",
        eventType: "status_change",
        message: "Lentidão crítica de resposta detectada na rede local.",
        previousStatus: "online",
        currentStatus: "instável",
        timestamp: new Date(Date.now() - 1800000).toISOString(),
      }
    ];

    const initialAlerts: Alert[] = [
      {
        id: "a1",
        printerId: "p2",
        printerName: "Kyocera Central Corredor",
        message: "Link offline inalcançável. Verificar se o switch ou cabo estão conectados.",
        severity: "critical",
        status: "active",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "a2",
        printerId: "p3",
        printerName: "Plotter Engenharia",
        message: "Latência elevada (320ms). Possível colisão de pacotes de dados.",
        severity: "warning",
        status: "active",
        timestamp: new Date(Date.now() - 1800000).toISOString(),
      }
    ];

    const initialUsb: UsbInventoryEntry[] = [
      {
        id: "usb1",
        name: "Brother HL-L2320D",
        model: "Brother HL-L2320D series",
        serial: "BRDLS82710492",
        driver: "Brother Laser Type1 Class Driver",
        host: "PC-FINANCEIRO-04",
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: "usb2",
        name: "Epson EcoTank L3250",
        model: "Epson L3250 Series",
        serial: "EPSON_L3250_72F9",
        driver: "Epson Inkjet ESC/P-R",
        host: "PC-RECEP-01",
        createdAt: new Date(Date.now() - 4800000).toISOString(),
      }
    ];

    setPrinters(initialPrinters);
    setLogs(initialLogs);
    setAlerts(initialAlerts);
    setUsbInventory(initialUsb);
  }, [isDemo]);

  // 4. Live fluctuating background process (every 12s if simulation is allowed!)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!demoMode || printers.length === 0) return;

      // Select a random printer to fluctuate latency or status
      const randomIndex = Math.floor(Math.random() * printers.length);
      const target = printers[randomIndex];

      // Don't modify fixed offline designated IPs
      if (target.ip.endsWith(".99")) return;

      const randomLatency = 5 + Math.floor(Math.random() * 45);
      const randomTrigger = Math.random();

      let nextStatus: "online" | "sleep_mode" | "warning" | "error" | "offline" = "online";
      let nextLatency = randomLatency;
      let nextMessage = "Funcionando normalmente";

      if (randomTrigger > 0.90) {
        nextStatus = "sleep_mode";
        nextLatency = 0;
        nextMessage = "Modo de economia de energia (Standby de rede detectado)";
      } else if (randomTrigger > 0.80) {
        const errors = [
          "Erro Crítico: Papel atolado na Gaveta 1",
          "Erro Crítico: Tampa frontal aberta",
          "Erro Crítico: Cartucho vazio"
        ];
        nextStatus = "error";
        nextMessage = errors[Math.floor(Math.random() * errors.length)];
        nextLatency = 24;
      } else if (randomTrigger > 0.70) {
        const warnings = [
          "Aviso: Toner baixo (10%)",
          "Aviso: Pouco papel na bandeja bypass"
        ];
        nextStatus = "warning";
        nextMessage = warnings[Math.floor(Math.random() * warnings.length)];
        nextLatency = 15;
      }

      const prevStatus = target.status;

      // Update state
      setPrinters((prev) => 
        prev.map((p) => 
          p.id === target.id 
            ? { 
                ...p, 
                status: nextStatus, 
                latency: nextLatency, 
                currentMessage: nextMessage,
                lastChecked: new Date().toISOString() 
              } 
            : p
        )
      );

      // Handle custom log and alert triggers
      if (prevStatus !== nextStatus) {
        handleStateTransitionActions(target.id, target.name, prevStatus, nextStatus, nextMessage);
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [demoMode, printers, soundEnabled]);

  // 4b. Real network background auto-scan process (runs every 30 seconds if in real mode and not demo)
  useEffect(() => {
    if (demoMode || isDemo || printers.length === 0) return;

    const interval = setInterval(() => {
      triggerGlobalScan();
    }, 30000); // scan every 30 seconds (as requested!)

    return () => clearInterval(interval);
  }, [demoMode, isDemo, printers.length]);

  // Handle Log and alert insertions in both Firestore and Demo State
  const handleStateTransitionActions = async (
    printerId: string, 
    printerName: string, 
    prevStatus: string, 
    nextStatus: string,
    messageOverride?: string
  ) => {
    const isRecovery = nextStatus === "online" || nextStatus === "sleep_mode";
    const typeStr = isRecovery ? "recovery" : "incident";
    
    let statusMsg = messageOverride || `Anomalia de rede detectada. Impressora reportada como ${nextStatus}.`;
    if (nextStatus === "online") {
      statusMsg = messageOverride || `Dispositivo restabelecido e operando normalmente. Latência estabilizada.`;
    } else if (nextStatus === "sleep_mode") {
      statusMsg = messageOverride || `Dispositivo entrou em modo economia de energia (Standby de rede).`;
    }

    // Audio chime trigger if allowed
    if (soundEnabled) {
      playAlertChime(isRecovery ? "success" : (nextStatus === "offline" ? "critical" : "info"));
    }

    if (isDemo) {
      // Create Mock Log
      const newLog: EventLog = {
        id: "l_" + Date.now(),
        printerId,
        printerName,
        eventType: typeStr as any,
        message: statusMsg,
        previousStatus: prevStatus,
        currentStatus: nextStatus,
        timestamp: new Date().toISOString(),
      };
      setLogs((prev) => [newLog, ...prev]);

      // Resolve previous alerts or add new alert
      if (isRecovery) {
        setAlerts((prev) => 
          prev.map((a) => 
            a.printerId === printerId && a.status === "active" 
              ? { ...a, status: "resolved", resolvedAt: new Date().toISOString() } 
              : a
          )
        );
      } else {
        // ONLY trigger alert if NOT sleep_mode (as requested by user!)
        if (nextStatus !== "sleep_mode") {
          const newAlert: Alert = {
            id: "a_" + Date.now(),
            printerId,
            printerName,
            message: statusMsg,
            severity: nextStatus === "offline" || nextStatus === "error" ? "critical" : "warning",
            status: "active",
            timestamp: new Date().toISOString(),
          };
          setAlerts((prev) => [newAlert, ...prev]);
        }
      }
    } else {
      // Real database integration
      try {
        // 1. Writer Incident Log to DB
        await addDoc(collection(db, "logs"), {
          printerId,
          printerName,
          eventType: typeStr,
          message: statusMsg,
          previousStatus: prevStatus,
          currentStatus: nextStatus,
          timestamp: new Date().toISOString(),
        });

        // 2. Resolve alerts or build a new alert log
        if (isRecovery) {
          // Resolve in real DB
        } else if (nextStatus !== "sleep_mode") {
          await addDoc(collection(db, "alerts"), {
            printerId,
            printerName,
            message: statusMsg,
            severity: nextStatus === "offline" || nextStatus === "error" ? "critical" : "warning",
            status: "active",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "logs/alerts transition docs");
      }
    }
  };

  // CRUD Operations
  // A. Add Printer
  const handleAddPrinter = async (data: Omit<Printer, "id" | "status" | "latency" | "lastChecked" | "createdAt" | "updatedAt">) => {
    let initialStatus: Printer["status"] = "online";
    let initialMessage = "Funcionando normalmente";
    let finalTipo = data.tipo || "Multifuncional";

    const ipVal = data.ip ? String(data.ip).trim() : "";
    const isLocal = isLocalUsbIp(ipVal);

    if (isLocal) {
      initialStatus = "local_usb";
      initialMessage = "Impressora local (sem rede)";
      finalTipo = "LOCAL_USB";
    }

    if (isDemo) {
      const p: Printer = {
        id: "p_" + Date.now(),
        ...data,
        tipo: finalTipo,
        status: initialStatus,
        latency: initialStatus === "online" ? 18 : 0,
        currentMessage: initialMessage,
        lastChecked: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
      setPrinters((prev) => [...prev, p]);
      if (soundEnabled) playAlertChime("success");
    } else {
      try {
        await addDoc(collection(db, "printers"), {
          ...data,
          tipo: finalTipo,
          status: initialStatus,
          latency: initialStatus === "online" ? 22 : 0,
          currentMessage: initialMessage,
          ultimaVerificacao: null,
          responseTime: null,
          mensagem: null,
          lastChecked: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "printers");
      }
    }
  };

  // B. Edit Printer
  const handleEditPrinter = async (id: string, updateData: Partial<Printer>) => {
    let extraUpdates: Partial<Printer> = {};
    if (updateData.ip !== undefined) {
      const ipVal = String(updateData.ip).trim();
      const isLocal = isLocalUsbIp(ipVal);

      if (isLocal) {
        extraUpdates.status = "local_usb";
        extraUpdates.tipo = "LOCAL_USB";
        extraUpdates.currentMessage = "Impressora local (sem rede)";
        extraUpdates.latency = 0;
      } else {
        const currentDevice = printers.find((p) => p.id === id);
        if (currentDevice && currentDevice.status === "local_usb") {
          extraUpdates.status = "online";
          extraUpdates.currentMessage = "Operação normalizada. Monitoramento de rede ativado.";
        }
      }
    }

    const finalUpdates = {
      ...updateData,
      ...extraUpdates,
      updatedAt: new Date().toISOString()
    };

    if (isDemo) {
      setPrinters((prev) => prev.map((p) => (p.id === id ? { ...p, ...finalUpdates } : p)));
    } else {
      try {
        const printerDoc = doc(db, "printers", id);
        await updateDoc(printerDoc, finalUpdates);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "printers/" + id);
      }
    }
  };

  // C. Delete Printer
  const handleDeletePrinter = async (id: string) => {
    if (isDemo) {
      setPrinters((prev) => prev.filter((p) => p.id !== id));
    } else {
      try {
        await deleteDoc(doc(db, "printers", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "printers/" + id);
      }
    }
  };

  // USB local inventory helpers
  const handleSimulateUsbAgentSync = async () => {
    const listSimulated = [
      {
        name: "Brother HL-L2320D",
        model: "Brother HL-L2320D series",
        serial: "BRDLS" + (Math.floor(Math.random() * 9000000) + 1000000),
        driver: "Brother Laser Type1 Class Driver",
        host: "PC-FINANCEIRO-04",
      },
      {
        name: "Epson EcoTank L3250",
        model: "Epson L3250 Series",
        serial: "EPSON_L3250_" + (Math.floor(Math.random() * 90000) + 10000).toString(16).toUpperCase(),
        driver: "Epson Inkjet ESC/P-R",
        host: "PC-RECEP-01",
      },
      {
        name: "HP LaserJet 1020",
        model: "HP LaserJet 1020",
        serial: "HPLJ1020_CNB" + (Math.floor(Math.random() * 900000) + 100000),
        driver: "HP LaserJet Series v4.2",
        host: "PC-DIRETORIA",
      },
      {
        name: "Zebra GC420t",
        model: "Zebra GK420t Label Printer",
        serial: "ZBRA" + (Math.floor(Math.random() * 9000000) + 1000000),
        driver: "ZDesigner GK420t",
        host: "PC-EXPEDICAO-02",
      }
    ];

    const randomPick = listSimulated[Math.floor(Math.random() * listSimulated.length)];

    if (isDemo) {
      const entry: UsbInventoryEntry = {
        id: "usb_" + Date.now(),
        ...randomPick,
        createdAt: new Date().toISOString(),
      };
      setUsbInventory((prev) => [entry, ...prev]);
    } else {
      try {
        await addDoc(collection(db, "inventory_usb"), {
          ...randomPick,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "inventory_usb");
      }
    }
  };

  const handleDeleteUsbInventoryEntry = async (id: string) => {
    if (isDemo) {
      setUsbInventory((prev) => prev.filter((entry) => entry.id !== id));
    } else {
      try {
        await deleteDoc(doc(db, "inventory_usb", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "inventory_usb/" + id);
      }
    }
  };

  // D. Bulk import spreadsheet entries
  const handleBulkImport = async (importedPrinters: ImportedPrinter[]) => {
    let addedCount = 0;
    const itemsToInsert = importedPrinters.map((ip) => {
      let initialStatus: Printer["status"] = "online";
      let initialMessage = "Funcionando normalmente";

      const ipVal = ip.ip ? ip.ip.trim() : "";
      if (isLocalUsbIp(ipVal)) {
        initialStatus = "local_usb";
        initialMessage = "Impressora local (sem rede)";
      }

      return {
        // Core spreadsheet enterprise schema
        setor: ip.setor || "",
        tipo: ip.tipo || "Multifuncional",
        marca: ip.marca || "",
        modelo: ip.modelo || "",
        tombo: ip.tombo || "",
        serial: ip.serial || "",
        ip: ipVal,
        status: initialStatus,
        ultimaVerificacao: null,
        responseTime: null,
        mensagem: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        // Backward compatibility fields
        name: ip.name,
        location: ip.setor || "",
        model: ip.model,
        notes: ip.notes || "",
        latency: initialStatus === "online" ? 15 : 0,
        currentMessage: initialMessage,
        lastChecked: new Date().toISOString(),
      };
    });

    if (isDemo) {
      const list: Printer[] = itemsToInsert.map((item, index) => ({
        id: `imported_${Date.now()}_${index}`,
        ...item
      } as any));
      setPrinters((prev) => [...prev, ...list]);
      addedCount = list.length;
      if (soundEnabled) playAlertChime("success");
    } else {
      try {
        const batch = writeBatch(db);
        itemsToInsert.forEach((item) => {
          const newDocRef = doc(collection(db, "printers"));
          batch.set(newDocRef, item);
          addedCount++;
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "printers batch import");
      }
    }
    return addedCount;
  };

  // E. Resolve warning alerts
  const handleResolveAlert = async (id: string) => {
    if (isDemo) {
      setAlerts((prev) => 
        prev.map((a) => a.id === id ? { ...a, status: "resolved", resolvedAt: new Date().toISOString() } : a)
      );
      if (soundEnabled) playAlertChime("success");
    } else {
      try {
        const docRef = doc(db, "alerts", id);
        await updateDoc(docRef, {
          status: "resolved",
          resolvedAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "alerts/" + id);
      }
    }
  };

  // Network Telemetry Engine Action Integration
  // Ping individual printer
  const triggerSingleScan = async (device: Printer) => {
    if (device.status === "sem_ip" || device.status === "ip_invalido" || device.status === "local_usb") {
      return; // Do not scan printers without a valid IP
    }
    setScanningPrintersMap((prev) => ({ ...prev, [device.id]: true }));

    try {
      let resultStatus: "online" | "sleep_mode" | "warning" | "error" | "offline" = "online";
      let resultLatency = 14;
      let currentMessage = "Funcionando normalmente";
      let failCount = device.consecutiveFailures || 0;
      let uptimeVal = device.uptimePercentage || 98;

      if (demoMode) {
        await new Promise((r) => setTimeout(r, 600));
        const isOfflineDemo = device.ip.endsWith(".99") || device.ip.endsWith(".98");
        if (isOfflineDemo) {
          failCount += 1;
          resultLatency = 0;
          if (failCount >= 5) {
            resultStatus = "offline";
            currentMessage = "Inativa: Sem resposta após 5 verificações consecutivas";
          } else {
            const currentDevStatus = device.status;
            resultStatus = (currentDevStatus === "offline" || currentDevStatus === "instável" || currentDevStatus === "sem_resposta") ? "sleep_mode" : currentDevStatus as any;
            if (resultStatus === "online") resultStatus = "sleep_mode";
            currentMessage = `Standby / Tentativa ${failCount}/5 de conexão pendente...`;
          }
        } else {
          failCount = 0;
          const rand = Math.random();
          if (rand > 0.80) {
            const errors = [
              "Erro Crítico: Papel atolado na Gaveta 1",
              "Erro Crítico: Tampa frontal aberta",
              "Erro Crítico: Cartucho vazio"
            ];
            resultStatus = "error";
            currentMessage = errors[Math.floor(Math.random() * errors.length)];
            resultLatency = 24;
          } else if (rand > 0.60) {
            const warnings = [
              "Aviso: Toner baixo (10%)",
              "Aviso: Pouco papel na gaveta de saída"
            ];
            resultStatus = "warning";
            currentMessage = warnings[Math.floor(Math.random() * warnings.length)];
            resultLatency = 15;
          } else if (rand > 0.45) {
            resultStatus = "sleep_mode";
            currentMessage = "Modo de economia de energia (Standby de rede detectado)";
            resultLatency = 0;
          } else {
            resultStatus = "online";
            currentMessage = "Funcionando normalmente";
            resultLatency = 8 + Math.floor(Math.random() * 20);
          }
        }
      } else {
        // Fetch real network ping from Express backend
        const response = await fetch(`/api/ping?ip=${device.ip}`);
        const data = await response.json();
        
        const rawStatus = data.status || "offline";
        resultLatency = data.latency || 0;
        const msg = data.currentMessage || "Sem resposta ou desligada";

        if (rawStatus === "offline") {
          failCount += 1;
          if (failCount >= 5) {
            resultStatus = "offline";
            currentMessage = `Inativa: Sem resposta após 5 tentativas consecutivas (${msg})`;
          } else {
            const currentDevStatus = device.status;
            resultStatus = (currentDevStatus === "offline" || currentDevStatus === "instável" || currentDevStatus === "sem_resposta") ? "sleep_mode" : currentDevStatus as any;
            if (resultStatus === "online") resultStatus = "sleep_mode";
            currentMessage = `Standby / Tentativa ${failCount}/5 de verificação falhou...`;
          }
        } else {
          failCount = 0;
          resultStatus = rawStatus as any;
          currentMessage = msg;
        }
      }

      if (resultStatus === "offline") {
        uptimeVal = Math.max(10, uptimeVal - 2);
      } else {
        uptimeVal = Math.min(100, uptimeVal + 1);
      }

      const prevStatus = device.status;

      // Update Printer record
      await handleEditPrinter(device.id, {
        status: resultStatus,
        latency: resultLatency,
        consecutiveFailures: failCount,
        currentMessage,
        uptimePercentage: uptimeVal,
        lastActivity: resultStatus !== "offline" ? new Date().toISOString() : (device.lastActivity || new Date().toISOString()),
        lastChecked: new Date().toISOString(),
      });

      // Handle audio and logs if state mutated
      if (prevStatus !== resultStatus) {
        await handleStateTransitionActions(device.id, device.name, prevStatus, resultStatus, currentMessage);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScanningPrintersMap((prev) => ({ ...prev, [device.id]: false }));
    }
  };

  // Ping All Registered Printers
  const triggerGlobalScan = async () => {
    const activePrinters = printers.filter((p) => p.status !== "sem_ip" && p.status !== "ip_invalido" && p.status !== "local_usb");
    if (activePrinters.length === 0) return;
    setIsGlobalScanning(true);

    try {
      let results: any[] = [];
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 1200));
        results = activePrinters.map((p) => {
          const isOfflineDemo = p.ip.endsWith(".99") || p.ip.endsWith(".98");
          if (isOfflineDemo) {
            return { id: p.id, ip: p.ip, status: "offline", latency: 0, currentMessage: "Sem resposta de ping ou SNMP" };
          }
          const rand = Math.random();
          if (rand > 0.85) {
            return { id: p.id, ip: p.ip, status: "sleep_mode", latency: 0, currentMessage: "Standby de suspensão de rede" };
          }
          return { id: p.id, ip: p.ip, status: "online", latency: 8 + Math.floor(Math.random() * 20), currentMessage: "Funcionando normalmente" };
        });
      } else {
        const response = await fetch("/api/ping-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ printers: activePrinters.map((p) => ({ id: p.id, ip: p.ip })) }),
        });
        const data = await response.json();
        results = data.results || [];
      }

      // Proccess batch updates in UI or DB
      for (const res of results) {
        const existingDevice = printers.find((p) => p.id === res.id);
        if (!existingDevice) continue;

        let finalStatus = res.status;
        let failCount = existingDevice.consecutiveFailures || 0;
        let currentMsg = res.currentMessage || "Pronto para operação";
        let uptimeVal = existingDevice.uptimePercentage || 98;

        if (finalStatus === "offline" || res.status === "offline") {
          failCount += 1;
          if (failCount >= 5) {
            finalStatus = "offline";
            currentMsg = `Inativa: Sem resposta por 5 varreduras consecutivas (${res.currentMessage || "Ping falhou"})`;
          } else {
            const currentDevStatus = existingDevice.status;
            finalStatus = (currentDevStatus === "offline" || currentDevStatus === "instável" || currentDevStatus === "sem_resposta") ? "sleep_mode" : currentDevStatus as any;
            if (finalStatus === "online") finalStatus = "sleep_mode";
            currentMsg = `Standby / Tentativa ${failCount}/5 de verificação falhou...`;
          }
        } else {
          failCount = 0;
          finalStatus = res.status;
          currentMsg = res.currentMessage || "Pronta para operação";
        }

        if (finalStatus === "offline") {
          uptimeVal = Math.max(10, uptimeVal - 2);
        } else {
          uptimeVal = Math.min(100, uptimeVal + 1);
        }

        const prevStatus = existingDevice.status;

        await handleEditPrinter(res.id, {
          status: finalStatus,
          latency: res.latency,
          consecutiveFailures: failCount,
          currentMessage: currentMsg,
          uptimePercentage: uptimeVal,
          lastActivity: finalStatus !== "offline" ? new Date().toISOString() : (existingDevice.lastActivity || new Date().toISOString()),
          lastChecked: new Date().toISOString(),
        });

        if (prevStatus !== finalStatus) {
          await handleStateTransitionActions(res.id, existingDevice.name, prevStatus, finalStatus, currentMsg);
        }
      }

      if (soundEnabled) playAlertChime("success");
    } catch (err) {
      console.error(err);
    } finally {
      setIsGlobalScanning(false);
    }
  };

  // Display authentication bypass or login screen on start
  if (!authInitialized) {
    return (
      <div className="min-h-screen bg-[#060812] flex items-center justify-center p-6 text-slate-400 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
          Aguardando autenticação segura...
        </div>
      </div>
    );
  }

  if (!user && !isDemo) {
    return (
      <LoginScreen
        onLoginSuccess={(usr) => setUser(usr)}
        onEnterAsDemo={() => {
          setIsDemo(true);
          setUser({
            uid: "demo-admin",
            email: "demo@printglow.com",
            displayName: "Avaliador Corporativo",
            photoURL: "",
          });
        }}
      />
    );
  }

  // Choose components to mount inside tab
  const renderTabContent = () => {
    switch (currentTab) {
      case "printers":
        return (
          <PrintersView
            printers={printers}
            onAddPrinter={handleAddPrinter}
            onEditPrinter={handleEditPrinter}
            onDeletePrinter={handleDeletePrinter}
            onBulkImport={handleBulkImport}
            triggerSingleScan={triggerSingleScan}
            isScanningMap={scanningPrintersMap}
          />
        );
      case "logs":
        return <EventLogsView logs={logs} />;
      case "usb_inventory":
        return (
          <UsbInventoryView
            entries={usbInventory}
            onSimulateAgentSync={handleSimulateUsbAgentSync}
            onDeleteEntry={handleDeleteUsbInventoryEntry}
          />
        );
      case "alerts":
        return <AlertsView alerts={alerts} onResolveAlert={handleResolveAlert} />;
      default:
        return (
          <DashboardView
            printers={printers}
            logs={logs}
            alerts={alerts}
            onNavigate={setCurrentTab}
            triggerScan={triggerGlobalScan}
            isScanning={isGlobalScanning}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#060812] flex" id="main-application-view-frame">
      {/* Sidebar rail */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        demoMode={demoMode}
        setDemoMode={setDemoMode}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        printersCount={printers.length}
        activeAlertsCount={alerts.filter((a) => a.status === "active").length}
        triggerGlobalScan={triggerGlobalScan}
        isScanning={isGlobalScanning}
        onLogout={async () => {
          if (isDemo) {
            setIsDemo(false);
            setUser(null);
          } else {
            await logout();
          }
        }}
      />

      {/* Main Body frame */}
      <main className="flex-grow p-8 max-h-screen overflow-y-auto font-sans bg-[#060812]">
        <div className="max-w-7xl mx-auto space-y-6">
          {renderTabContent()}
        </div>
      </main>
    </div>
  );
}
