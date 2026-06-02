import React, { useState, useRef, useEffect } from "react";
import { 
  Plus, 
  Search, 
  FileSpreadsheet, 
  Trash2, 
  Edit3, 
  Activity, 
  X, 
  Upload, 
  AlertCircle,
  AlertTriangle,
  FileDown,
  Check,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  ShieldCheck
} from "lucide-react";
import { parseCSVText, parseExcelFile, ImportedPrinter, validateIPAddress, buildPrinterFromRow } from "../utils/spreadsheet";
import { Printer } from "../types";

interface PrintersViewProps {
  printers: Printer[];
  onAddPrinter: (printer: Omit<Printer, "id" | "status" | "latency" | "lastChecked" | "createdAt" | "updatedAt">) => Promise<void>;
  onEditPrinter: (id: string, printer: Partial<Printer>) => Promise<void>;
  onDeletePrinter: (id: string) => Promise<void>;
  onBulkImport: (printers: ImportedPrinter[]) => Promise<number>;
  triggerSingleScan: (printer: Printer) => Promise<void>;
  isScanningMap: { [key: string]: boolean };
  initialActiveTab?: "com_ip" | "sem_ip";
}

const getCCStatusBadge = (statusVal?: string) => {
  if (!statusVal) {
    return <span className="text-slate-600 font-mono text-[10px]">—</span>;
  }
  const clean = statusVal.trim();
  const cleanLower = clean.toLowerCase();
  
  let colorClass = "bg-slate-900 text-slate-400 border-slate-800";
  if (["pronto", "sucesso", "ok"].some(x => cleanLower.includes(x))) {
    colorClass = "bg-green-500/10 text-green-400 border-green-500/20";
  } else if (["espera", "sleep", "economia", "eco", "poupar"].some(x => cleanLower.includes(x))) {
    colorClass = "bg-slate-850 text-slate-300 border-slate-800";
  } else if (["aquecendo", "processando", "imprimindo", "printing", "impressao"].some(x => cleanLower.includes(x))) {
    colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  } else if (["baixo", "prox", "fim", "proxima", "manutencao"].some(x => cleanLower.includes(x))) {
    colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  } else if (["erro", "falha", "preso", "atolado", "aberta", "aberto", "sem papel", "vazio", "vazia"].some(x => cleanLower.includes(x))) {
    colorClass = "bg-red-500/10 text-red-500 border-red-500/20";
  } else if (["inativo"].some(x => cleanLower.includes(x))) {
    colorClass = "bg-slate-950 text-slate-500 border-slate-900";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] border tracking-wide whitespace-nowrap ${colorClass}`}>
      {clean}
    </span>
  );
};

const formatLastChecked = (timeStr?: string | null) => {
  if (!timeStr) return <span className="text-slate-600 font-mono">—</span>;
  try {
    const dt = new Date(timeStr);
    return (
      <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap" title={dt.toLocaleString("pt-BR")}>
        {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    );
  } catch {
    return <span className="text-slate-400">{timeStr}</span>;
  }
};

const getPrinterStatusIndicator = (currentMessage?: string, status?: string) => {
  const raw = currentMessage?.trim() || "";
  const message = raw.replace(/^[🚨⚠️\s]+/, "").trim();
  const lower = message.toLowerCase();

  if (raw.includes("🚨")) {
    return {
      label: message.toUpperCase() || "ERRO",
      className: "border bg-red-500/15 text-red-450 border-red-500/35",
      dotClass: "bg-red-500"
    };
  }

  if (raw.includes("⚠️")) {
    return {
      label: message.toUpperCase() || "ATENÇÃO",
      className: "border bg-amber-500/15 text-amber-450 border-amber-500/35",
      dotClass: "bg-amber-500"
    };
  }

  if (raw === "✅ Operacional") {
    return {
      label: status === "error" ? "ERRO" : status === "warning" ? "ATENÇÃO" : "ONLINE",
      className: "border bg-green-500/10 text-green-400 border-green-500/20",
      dotClass: "bg-green-400"
    };
  }

  if (!message || raw === "🔴 Offline") {
    return {
      label: status === "offline" ? "INATIVO" : status === "warning" ? "ATENÇÃO" : status === "error" ? "ERRO" : "ONLINE",
      className: "border bg-slate-950 text-slate-400 border-slate-800",
      dotClass: "bg-slate-500"
    };
  }

  const isError = ["erro", "falha", "preso", "atolado", "aberta", "aberto", "sem papel", "vazio", "vazia", "carregar papel"].some((x) => lower.includes(x));
  const isWarning = ["atencao", "atenção", "toner", "kit", "manutencao", "manutenção", "unidade", "drum", "tambor"].some((x) => lower.includes(x));
  const isProcessing = ["imprimindo", "printing", "processando", "aquecendo", "impressão", "impressao"].some((x) => lower.includes(x));
  const isWaiting = ["espera", "sleep", "economia", "eco", "poupar"].some((x) => lower.includes(x));

  if (isError) {
    return {
      label: message.toUpperCase(),
      className: "border bg-red-500/15 text-red-450 border-red-500/35",
      dotClass: "bg-red-500"
    };
  }

  if (isWarning) {
    return {
      label: message.toUpperCase(),
      className: "border bg-amber-500/15 text-amber-450 border-amber-500/35",
      dotClass: "bg-amber-500"
    };
  }

  if (isProcessing) {
    return {
      label: message.toUpperCase(),
      className: "border bg-blue-500/10 text-blue-400 border-blue-500/20",
      dotClass: "bg-blue-400"
    };
  }

  if (isWaiting) {
    return {
      label: message.toUpperCase(),
      className: "border bg-slate-850 text-slate-300 border-slate-800",
      dotClass: "bg-slate-500"
    };
  }

  return {
    label: message.toUpperCase(),
    className: "border bg-green-500/10 text-green-400 border-green-500/20",
    dotClass: "bg-green-400"
  };
};

export default function PrintersView({
  printers,
  onAddPrinter,
  onEditPrinter,
  onDeletePrinter,
  onBulkImport,
  triggerSingleScan,
  isScanningMap,
  initialActiveTab,
}: PrintersViewProps) {
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [activeListTab, setActiveListTab] = useState<"com_ip" | "sem_ip">(initialActiveTab || "com_ip");

  // Sync state if initialActiveTab prop changes
  useEffect(() => {
    if (initialActiveTab) {
      setActiveListTab(initialActiveTab);
    }
  }, [initialActiveTab]);

  // Multi-Form / Drawer states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState<Printer | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Form Fields State
  const [setor, setSetor] = useState("");
  const [tipo, setTipo] = useState("Multifuncional");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [tombo, setTombo] = useState("");
  const [serial, setSerial] = useState("");
  const [ip, setIp] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  
  // Command Center Auth state fields
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    isLoading: boolean;
    success?: boolean;
    message?: string;
  } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Import State
  const [dragActive, setDragActive] = useState(false);
  const [importedList, setImportedList] = useState<ImportedPrinter[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Location list for filter (Location maps to Setor in spreadsheet schema)
  const locations = Array.from(
    new Set(
      printers
        .map((p) => p.setor || p.location)
        .filter(Boolean)
    )
  );

  // Filter logic: search Setor, Serial, IP, Modelo, Marca, Status intelligently!
  const filteredPrinters = printers.filter((printer) => {
    const searchLow = searchTerm.toLowerCase();
    const matchesSearch = 
      printer.name.toLowerCase().includes(searchLow) ||
      printer.ip.includes(searchLow) ||
      (printer.setor && printer.setor.toLowerCase().includes(searchLow)) ||
      (printer.marca && printer.marca.toLowerCase().includes(searchLow)) ||
      (printer.modelo && printer.modelo.toLowerCase().includes(searchLow)) ||
      (printer.serial && printer.serial.toLowerCase().includes(searchLow)) ||
      (printer.tipo && printer.tipo.toLowerCase().includes(searchLow)) ||
      (printer.status && printer.status.toLowerCase().includes(searchLow)) ||
      (printer.model && printer.model.toLowerCase().includes(searchLow)) ||
      (printer.location && printer.location.toLowerCase().includes(searchLow)) ||
      (printer.currentMessage && printer.currentMessage.toLowerCase().includes(searchLow));

    const matchesStatus = statusFilter === "all" || printer.status === statusFilter;
    
    const printerSetor = printer.setor || printer.location || "";
    const matchesLoc = locationFilter === "all" || printerSetor === locationFilter;

    return matchesSearch && matchesStatus && matchesLoc;
  });

  // Split list according to tab selected: Ativas (with configured IP address) vs Inventário (local USB / no IP)
  const ativasPrinters = filteredPrinters.filter(
    (p) => p.ip && p.ip.trim() !== "" && p.ip !== "0.0.0.0" && validateIPAddress(p.ip)
  );
  
  const inventarioPrinters = filteredPrinters.filter(
    (p) => 
      !p.ip || 
      p.ip.trim() === "" || 
      p.ip === "0.0.0.0" || 
      !validateIPAddress(p.ip) ||
      p.status === "local_usb" || 
      p.status === "sem_ip" || 
      p.status === "ip_invalido"
  );

  const listToRender = 
    activeListTab === "com_ip" 
      ? ativasPrinters 
      : inventarioPrinters;

  // Open Drawer cleanup
  const openAddDrawer = () => {
    setSetor("");
    setTipo("Multifuncional");
    setMarca("");
    setModelo("");
    setTombo("");
    setSerial("");
    setIp("");
    setRemoteUrl("");
    setAdminUsername("admin");
    setAdminPassword("admin");
    setShowPassword(false);
    setTestStatus(null);
    setFormError(null);
    setIsAddOpen(true);
  };

  const openEditDrawer = (printer: Printer) => {
    setIsEditOpen(printer);
    setSetor(printer.setor || printer.location || "");
    setTipo(printer.tipo || "Multifuncional");
    setMarca(printer.marca || "");
    setModelo(printer.modelo || printer.model || "");
    setTombo(printer.tombo || "");
    setSerial(printer.serial || "");
    setIp(printer.ip || "");
    setRemoteUrl(printer.remoteUrl || "");
    setAdminUsername(printer.adminUsername || "admin");
    setAdminPassword(printer.adminPassword ? "********" : "admin");
    setShowPassword(false);
    setTestStatus(null);
    setFormError(null);
  };

  // Test printer command center authentication connectivity
  const handleTestAccess = async () => {
    if (!ip.trim()) {
      setTestStatus({ isLoading: false, success: false, message: "O endereço IP é obrigatório para testar." });
      return;
    }
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setTestStatus({ isLoading: false, success: false, message: "Usuário Admin e Senha Admin são obrigatórios." });
      return;
    }

    setTestStatus({ isLoading: true });
    try {
      let passwordToTest = adminPassword;
      // If editing and password has not been altered, use the encrypted value from the model. 
      if (isEditOpen && adminPassword === "********") {
        passwordToTest = isEditOpen.adminPassword || "admin";
      } else {
        // Encrypt the plain text password first
        const encRes = await fetch("/api/encrypt-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: adminPassword })
        });
        if (encRes.ok) {
          const encData = await encRes.json();
          passwordToTest = encData.encrypted;
        }
      }

      const res = await fetch("/api/test-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: ip.trim(),
          id: isEditOpen?.id || "draft_test",
          adminUsername: adminUsername.trim(),
          adminPassword: passwordToTest
        })
      });

      const data = await res.json();
      setTestStatus({
        isLoading: false,
        success: data.success,
        message: data.message
      });
    } catch (err: any) {
      setTestStatus({
        isLoading: false,
        success: false,
        message: "Falha de conexão com o servidor."
      });
    }
  };

  // Action Add Submission
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!setor.trim() || !marca.trim() || !modelo.trim() || !serial.trim()) {
      setFormError("Setor, Marca, Modelo e Número de Série são obrigatórios.");
      return;
    }

    if (!adminUsername.trim() || !adminPassword.trim()) {
      setFormError("Usuário Admin e Senhas Admin são obrigatórios para habilitar autenticação de Command Center.");
      return;
    }

    // IP validation: If filled but NOT a valid IP and not an explicit local keyword, we treat it as Local/USB!
    let finalTipo = tipo.trim();
    let finalIp = ip.trim();
    if (finalIp === "0.0.0.0") {
      finalIp = "";
    }
    const ipUpper = finalIp.toUpperCase();
    const isLocal = !finalIp || ipUpper === "SEMREDE" || ipUpper === "USB" || ipUpper === "LOCAL" || !validateIPAddress(finalIp);

    if (isLocal) {
      finalTipo = "LOCAL_USB";
    }

    setIsSaving(true);
    try {
      // Securely encrypt the password on the server
      let encryptedPassword = "";
      const encRes = await fetch("/api/encrypt-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword })
      });
      if (encRes.ok) {
        const encData = await encRes.json();
        encryptedPassword = encData.encrypted;
      } else {
        throw new Error("Erro de criptografia de credenciais");
      }

      await onAddPrinter({
        name: `${marca} ${modelo} - ${setor}`,
        ip: finalIp,
        setor: setor.trim(),
        tipo: finalTipo,
        marca: marca.trim(),
        modelo: modelo.trim(),
        tombo: tombo.trim(),
        serial: serial.trim(),
        location: setor.trim(),
        model: `${marca} ${modelo}`,
        remoteUrl: remoteUrl.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword: encryptedPassword,
        notes: [
          finalTipo ? `Tipo: ${finalTipo}` : "",
          tombo ? `Tombo: ${tombo}` : "",
          serial ? `S/N: ${serial}` : ""
        ].filter(Boolean).join(" | "),
        ultimaVerificacao: null,
        responseTime: null,
        mensagem: null,
      } as any);

      setIsAddOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Erro ao registrar a impressora no banco de dados.");
    } finally {
      setIsSaving(false);
    }
  };

  // Action Edit Submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditOpen) return;
    setFormError(null);

    if (!setor.trim() || !marca.trim() || !modelo.trim() || !serial.trim()) {
      setFormError("Setor, Marca, Modelo e Número de Série são campos obrigatórios.");
      return;
    }

    if (!adminUsername.trim() || !adminPassword.trim()) {
      setFormError("Usuário Admin e Senhas Admin são obrigatórios para habilitar autenticação de Command Center.");
      return;
    }

    // IP validation
    let finalTipo = tipo.trim();
    let finalIp = ip.trim();
    if (finalIp === "0.0.0.0") {
      finalIp = "";
    }
    const ipUpper = finalIp.toUpperCase();
    const isLocal = !finalIp || ipUpper === "SEMREDE" || ipUpper === "USB" || ipUpper === "LOCAL" || !validateIPAddress(finalIp);

    if (isLocal) {
      finalTipo = "LOCAL_USB";
    }

    setIsSaving(true);
    try {
      let finalEncryptedPassword = isEditOpen.adminPassword || "";

      // If the password was changed (user deleted asterisks mask)
      if (adminPassword !== "********") {
        const encRes = await fetch("/api/encrypt-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: adminPassword })
        });
        if (encRes.ok) {
          const encData = await encRes.json();
          finalEncryptedPassword = encData.encrypted;
        } else {
          throw new Error("Erro de criptografia de credenciais");
        }
      }

      await onEditPrinter(isEditOpen.id, {
        name: `${marca} ${modelo} - ${setor}`,
        ip: finalIp,
        setor: setor.trim(),
        tipo: finalTipo,
        marca: marca.trim(),
        modelo: modelo.trim(),
        tombo: tombo.trim(),
        serial: serial.trim(),
        location: setor.trim(),
        model: `${marca} ${modelo}`,
        remoteUrl: remoteUrl.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword: finalEncryptedPassword,
        notes: [
          finalTipo ? `Tipo: ${finalTipo}` : "",
          tombo ? `Tombo: ${tombo}` : "",
          serial ? `S/N: ${serial}` : ""
        ].filter(Boolean).join(" | ")
      });
      setIsEditOpen(null);
    } catch (err: any) {
      setFormError(err.message || "Falha na atualização do cadastro da impressora.");
    } finally {
      setIsSaving(false);
    }
  };

  // CSV/Excel Drag and Drop Event listeners
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processSpreadsheetFile = async (file: File) => {
    try {
      setImportStatus("Lendo arquivo de dados...");
      const fileType = file.name.split(".").pop()?.toLowerCase();
      
      let parsed: ImportedPrinter[] = [];
      if (fileType === "csv") {
        const text = await file.text();
        parsed = parseCSVText(text);
      } else if (fileType === "xlsx" || fileType === "xls") {
        parsed = await parseExcelFile(file);
      } else {
        setImportStatus("Formato de planilha inválido. Envie um arquivo .csv ou .xlsx.");
        return;
      }

      if (parsed.length === 0) {
        setImportStatus("Nenhum dado de impressora pôde ser lido. Verifique o cabeçalho e colunas.");
      } else {
        setImportedList(parsed);
        const invalidCount = parsed.filter(x => x.validationStatus === "invalid").length;
        const correctedCount = parsed.filter(x => x.validationStatus === "corrected").length;
        
        if (invalidCount > 0) {
          setImportStatus(`Planilha carregada. Encontrados ${parsed.length} itens. Atenção: ${invalidCount} possuem erros de validação e necessitam de correção manual na tabela abaixo.`);
        } else if (correctedCount > 0) {
          setImportStatus(`Planilha carregada com sucesso! Encontrados ${parsed.length} itens. IPs divergentes foram corrigidos de forma automática.`);
        } else {
          setImportStatus(`Sucesso! Carregadas ${parsed.length} impressoras prontas para importação.`);
        }
      }
    } catch (err) {
      setImportStatus("Erro na decodificação do arquivo Excel/CSV.");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processSpreadsheetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processSpreadsheetFile(e.target.files[0]);
    }
  };

  // Inline adjustment inside the Spreadsheet Preview Modal!
  const handleImportedFieldChange = (index: number, field: keyof ImportedPrinter, value: string) => {
    setImportedList((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };
      
      // Re-evaluate validation utilizing spreadsheet logic
      const rowObj: { [key: string]: string } = {
        setor: field === "setor" ? value : target.setor,
        tipo: field === "tipo" ? value : target.tipo,
        marca: field === "marca" ? value : target.marca,
        modelo: field === "modelo" ? value : target.modelo,
        tombo: field === "tombo" ? value : target.tombo,
        serial: field === "serial" ? value : target.serial,
        ip: field === "ip" ? value : target.ip,
        usuarioadmin: field === "adminUsername" ? value : (target.adminUsername || "admin"),
        senhaadmin: field === "adminPassword" ? value : (target.adminPassword || "admin"),
      };

      const rebuilt = buildPrinterFromRow(rowObj);
      updated[index] = rebuilt;
      return updated;
    });
  };

  const commitImport = async () => {
    const validItems = importedList.filter(x => x.validationStatus !== "invalid");
    if (validItems.length === 0) {
      setImportStatus("Erro: Não existem itens válidos prontos para serem salvos.");
      return;
    }

    setIsSaving(true);
    try {
      const added = await onBulkImport(validItems);
      setImportStatus(`Importação em lote concluída com sucesso! ${added} novas impressoras monitoradas salvas no Firebase.`);
      setImportedList([]);
      setTimeout(() => {
        setIsImportOpen(false);
        setImportStatus(null);
      }, 2500);
    } catch (err) {
      setImportStatus("Inconsistência de segurança ao salvar lote no Firestore.");
    } finally {
      setIsSaving(false);
    }
  };

  // Export List Data to CSV file report (with brazilian columns format)
  const downloadReports = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility in Portuguese
    csvContent += "Setor;Tipo;Marca;Modelo;Tombo;Número de Série;IP;Status;Última Mensagem;Latência(ms)\n";

    printers.forEach((p) => {
      const row = [
        `"${p.setor || p.location || ""}"`,
        `"${p.tipo || "Multifuncional"}"`,
        `"${p.marca || ""}"`,
        `"${p.modelo || p.model || ""}"`,
        `"${p.tombo || ""}"`,
        `"${p.serial || ""}"`,
        `"${p.ip || ""}"`,
        `"${p.status.toUpperCase()}"`,
        `"${p.currentMessage || ""}"`,
        p.latency,
      ].join(";");
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const encodedUri = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_impressoras_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="printers-tab-content">
      {/* Upper header action bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-medium text-2xl text-white">Equipamentos Cadastrados</h2>
          <p className="text-slate-400 text-sm">Gerencie o pool de impressoras e realize importações automáticas de planilhas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadReports}
            className="cursor-pointer px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850 transition flex items-center gap-2 select-none"
            id="btn-export-printers"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-400" />
            Exportar Inventário CSV
          </button>
          <button
            onClick={() => {
              setImportedList([]);
              setImportStatus(null);
              setIsImportOpen(true);
            }}
            className="cursor-pointer px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850 transition flex items-center gap-2 select-none"
            id="btn-import-open"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
            Importar Planilha XLSX / CSV
          </button>
          <button
            onClick={openAddDrawer}
            className="cursor-pointer px-4 py-2 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2 select-none shadow shadow-blue-500/10"
            id="btn-add-printer-open"
          >
            <Plus className="w-3.5 h-3.5" />
            Cadastrar Impressora
          </button>
        </div>
      </div>

      {/* Control filter panel */}
      <div className="p-4 bg-slate-950 border border-slate-900 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input bar */}
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Pesquisar por Setor, Serial, IP, Modelo, Marca ou Status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-850 text-slate-200 placeholder-slate-500 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none transition"
            id="input-search-printers"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-850 text-slate-300 text-xs focus:outline-none select-none cursor-pointer"
              id="select-filter-status"
            >
              <option value="all">Sinalizadores (Todos)</option>
              <option value="online">Online / Ativa</option>
              <option value="local_usb">Inventariada (Local/USB)</option>
              <option value="offline">Offline / Inativa</option>
            </select>
          </div>

          {/* Filter Location */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider font-semibold">Setor / Local:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-850 text-slate-300 text-xs focus:outline-none select-none cursor-pointer"
              id="select-filter-location"
            >
              <option value="all">Todos os Setores</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Database Datatable with Integrated Tabs like Print Audit */}
      <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl" id="table-card-container">
        
        {/* Dynamic Navigation Tabs */}
        <div className="flex border-b border-slate-900 bg-slate-950/80 px-4" id="printers-list-tabs">
          <button
            onClick={() => setActiveListTab("com_ip")}
            className={`cursor-pointer px-5 py-3.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center gap-2 select-none ${
              activeListTab === "com_ip"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            id="tab-btn-com-ip"
          >
            🟢 IMPRESSORAS ATIVAS COM IP
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${activeListTab === "com_ip" ? "text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20" : "text-slate-500 bg-slate-900"}`}>
              {printers.filter(p => p.ip && p.ip.trim() !== "" && p.ip !== "0.0.0.0").length}
            </span>
          </button>

          <button
            onClick={() => setActiveListTab("sem_ip")}
            className={`cursor-pointer px-5 py-3.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center gap-2 select-none ${
              activeListTab === "sem_ip"
                ? "border-amber-500 text-amber-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            id="tab-btn-sem-ip"
          >
            🔌 INVENTÁRIO
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${activeListTab === "sem_ip" ? "text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20" : "text-slate-500 bg-slate-900"}`}>
              {printers.filter(p => !p.ip || p.ip.trim() === "" || p.ip === "0.0.0.0" || p.status === "local_usb" || p.status === "sem_ip" || p.status === "ip_invalido").length}
            </span>
          </button>
        </div>

        <div className="overflow-x-auto min-h-[350px]">
          {listToRender.length === 0 ? (
            <div className="py-24 text-center text-slate-500">
              <AlertCircle className="h-8 w-8 mx-auto text-slate-700 mb-2.5" />
              <p className="text-sm font-semibold text-slate-400">Nenhum equipamento nesta categoria</p>
              <p className="text-slate-500 text-xs mt-1">Nenhum registro coincide com o filtro de pesquisa aplicado nesta aba.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse" id="table-printers">
              <thead>
                <tr className="border-b border-slate-900 text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold bg-slate-950">
                  <th className="py-3 px-4">Impressora / Cadastro</th>
                  <th className="py-3 px-4">Endereço IP</th>
                  <th className="py-3 px-4">Status Geral</th>
                  <th className="py-3 px-4">Status Impressora</th>
                  <th className="py-3 px-4">Status Scanner</th>
                  <th className="py-3 px-4">Status FAX</th>
                  <th className="py-3 px-4">Status da Mensagem</th>
                  <th className="py-3 px-4">Latência</th>
                  <th className="py-3 px-4">Última Atualização</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-xs text-slate-300">
                {listToRender.map((printer) => {
                  const isScanning = isScanningMap[printer.id] || false;
                  const printerSetor = printer.setor || printer.location || "Não especificado";
                  
                  return (
                    <tr key={printer.id} className="hover:bg-slate-900/25 transition">
                      {/* Name & Model Cell (Brand/Model, Serial, Tombo, Setor) */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{printer.marca || printer.name}</span>
                            <span className="text-slate-300">{printer.modelo || printer.model}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 font-mono">
                            <span className="bg-slate-900 border border-slate-850 px-1.5 py-0.2 rounded">Setor: {printerSetor}</span>
                            {printer.serial && (
                              <span className="bg-slate-900 border border-slate-850 px-1.5 py-0.2 rounded">S/N: {printer.serial}</span>
                            )}
                            {printer.tombo && (
                              <span className="bg-slate-900 border border-slate-850 px-1.5 py-0.2 rounded">Tombo: {printer.tombo}</span>
                            )}
                            {printer.totalPages !== undefined && printer.totalPages !== null && printer.totalPages > 0 && (
                              <span className="bg-blue-950 text-blue-400 border border-blue-900 px-1.5 py-0.2 rounded font-semibold text-[9.5px]">
                                📊 SNMP: {printer.totalPages.toLocaleString("pt-BR")} págs
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* IP Address Cell */}
                      <td className="py-3.5 px-4 font-mono font-medium">
                        {printer.ip ? (
                          <div className="flex flex-col gap-1">
                            <a
                              href={`http://${printer.ip}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Acessar painel de gerenciamento web via IP"
                              className="text-blue-400 hover:text-blue-350 hover:underline flex items-center gap-1 w-fit"
                            >
                              {printer.ip}
                              <ExternalLink className="w-3 h-3 opacity-70" />
                            </a>
                            {printer.remoteUrl && (
                              <span className="text-[9px] text-slate-500 truncate max-w-[140px] font-sans" title={printer.remoteUrl}>
                                URL personalizada
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 bg-slate-900/50 border border-dashed border-slate-800 px-2 py-0.5 rounded text-[10px]">SEM IP CONFIGURADO</span>
                        )}
                      </td>

                      {/* Status Badges Cell (Optimized online/offline split for clean Print Audit view) */}
                      <td className="py-3.5 px-4 animate-fade-in">
                        <div className="flex flex-col gap-1">
                          {printer.status === "local_usb" || printer.status === "sem_ip" || printer.status === "ip_invalido" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[9.5px] uppercase tracking-wider w-fit border bg-slate-500/10 text-slate-400 border-slate-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              INVENTARIADA
                            </span>
                          ) : printer.status === "online" || printer.status === "warning" || printer.status === "error" ? (
                            (() => {
                              const indicator = getPrinterStatusIndicator(printer.currentMessage, printer.status);
                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[9.5px] uppercase tracking-wider w-fit ${indicator.className}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${indicator.dotClass} animate-pulse`} />
                                  {indicator.label}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[9.5px] uppercase tracking-wider w-fit border bg-slate-950 text-slate-400 border-slate-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              INATIVA
                            </span>
                          )}

                          {printer.currentMessage && printer.currentMessage !== "✅ Operacional" && printer.currentMessage !== "🔴 Offline" && (
                            <span className="text-[10px] text-slate-400 leading-tight max-w-[200px] truncate">
                              {printer.currentMessage.replace(/^[🚨⚠️]\s*/, "")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Command Center Status Columns */}
                      <td className="py-3.5 px-4 animate-fade-in">
                        {getCCStatusBadge(printer.status === "local_usb" || printer.status === "sem_ip" || printer.status === "ip_invalido" ? "Inativo" : (printer.statusImpressora || (printer.status === "offline" ? "Offline" : "Pronto")))}
                      </td>

                      <td className="py-3.5 px-4 animate-fade-in">
                        {getCCStatusBadge(printer.status === "local_usb" || printer.status === "sem_ip" || printer.status === "ip_invalido" ? "Inativo" : (printer.statusScanner || (printer.status === "offline" ? "Offline" : "Pronto")))}
                      </td>

                      <td className="py-3.5 px-4 animate-fade-in">
                        {getCCStatusBadge(printer.status === "local_usb" || printer.status === "sem_ip" || printer.status === "ip_invalido" ? "Inativo" : (printer.statusFax || (printer.status === "offline" ? "Offline" : "Pronto")))}
                      </td>

                      <td className="py-3.5 px-4 animate-fade-in max-w-[150px] overflow-hidden truncate">
                        {getCCStatusBadge(
                          printer.status === "local_usb" || printer.status === "sem_ip" || printer.status === "ip_invalido"
                            ? "Inativo"
                            : (
                                printer.statusMensagem && printer.statusMensagem !== "Pronto"
                                  ? printer.statusMensagem
                                  : (printer.currentMessage && printer.currentMessage !== "✅ Operacional"
                                      ? printer.currentMessage.replace(/^[🚨⚠️]\s*/, "")
                                      : (printer.status === "offline" ? "Offline" : "Pronto"))
                              )
                        )}
                      </td>

                      {/* Response Latency Cell */}
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {printer.status === "offline" || printer.status === "sem_ip" || printer.status === "ip_invalido" || printer.status === "local_usb" ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span>{printer.latency || 0} ms</span>
                        )}
                      </td>

                      {/* Última Atualização Cell */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          {formatLastChecked(printer.updatedAt || printer.lastChecked)}
                          {printer.lastChecked && (
                            <p className="text-[9px] text-slate-600 font-mono">Cad: {new Date(printer.createdAt || printer.lastChecked).toLocaleDateString("pt-BR")}</p>
                          )}
                        </div>
                      </td>

                      {/* Actions Trigger panel */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {printer.ip && (
                            <a
                              href={`http://${printer.ip}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Acesso Remoto via IP (WebUI)"
                              className="p-1.5 rounded bg-slate-900 border border-slate-850 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/30 transition cursor-pointer select-none flex items-center justify-center"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => triggerSingleScan(printer)}
                            disabled={isScanning || printer.status === "sem_ip" || printer.status === "ip_invalido" || printer.status === "local_usb"}
                            title="Verificar Equipamento"
                            className="p-1.5 rounded bg-slate-900 border border-slate-850 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer select-none disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-400"
                          >
                            <Activity className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-blue-400" : ""}`} />
                          </button>
                          <button
                            onClick={() => openEditDrawer(printer)}
                            title="Editar Ativo"
                            className="p-1.5 rounded bg-slate-900 border border-slate-850 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer select-none"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeletePrinter(printer.id)}
                            title="Remover Cadastro"
                            className="p-1.5 rounded bg-slate-900 border border-slate-850 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition cursor-pointer select-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DRAWERS AND MODALS REGIONS */}
      
      {/* 1. Modal: CADASTRO DISPOSITIVO (MANUAL ADD) */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition duration-150">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-emerald-500" />
            <div className="p-6 border-b border-slate-900 flex items-center justify-between bg-slate-950">
              <div>
                <h3 className="font-display font-semibold text-white">Cadastrar Impressora de Rede</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Preencha as informações obrigatórias para monitoramento.</p>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-slate-500 hover:text-slate-300 rounded cursor-pointer select-none">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {formError && (
                  <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-xl text-xs text-red-400 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Setor / Local *</label>
                    <input
                      type="text"
                      placeholder="Ex: 1a SECRETARIA"
                      value={setor}
                      onChange={(e) => setSetor(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Tipo de Equipamento</label>
                    <input
                      type="text"
                      placeholder="Ex: Multifuncional"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Marca / Fabricante *</label>
                    <input
                      type="text"
                      placeholder="Ex: KYOCERA"
                      value={marca}
                      onChange={(e) => setMarca(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Modelo *</label>
                    <input
                      type="text"
                      placeholder="Ex: M3655IDN"
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Patrimônio / Tombo</label>
                    <input
                      type="text"
                      placeholder="Ex: 4195"
                      value={tombo}
                      onChange={(e) => setTombo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Número de Série (Serial) *</label>
                    <input
                      type="text"
                      placeholder="Ex: R4P2604195"
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Endereço IP (Opcional - deixe em branco para SEM IP)</label>
                    <input
                      type="text"
                      placeholder="Ex: 10.69.32.18"
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">URL de Acesso Remoto Personalizada (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: http://10.69.32.18:8080"
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                </div>

                {/* CONFIGURAÇÃO DE CREDENCIAIS DO COMMAND CENTER */}
                <div className="p-4 rounded-xl border border-slate-900 bg-slate-900/40 space-y-3.5">
                  <div className="flex items-center gap-2 border-b border-slate-900 pb-2">
                    <Key className="w-4 h-4 text-yellow-500" />
                    <h4 className="text-xs font-bold text-slate-200">Credenciais Command Center Rx *</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Usuário Admin *</label>
                      <input
                        type="text"
                        placeholder="Ex: admin"
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Senha Admin *</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Senha ou código admin"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          required
                          className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1.5 text-slate-500 hover:text-slate-300 select-none cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Button & Indicator */}
                  <div className="pt-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-500">Valide os acessos contra o IP fornecido</span>
                      <button
                        type="button"
                        onClick={handleTestAccess}
                        disabled={testStatus?.isLoading}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-200 text-[10px] rounded-lg tracking-wide font-mono transition cursor-pointer select-none flex items-center gap-1.5"
                      >
                        {testStatus?.isLoading ? "Testando..." : "Testar Acesso"}
                      </button>
                    </div>

                    {testStatus && (
                      <div className={`p-2.5 rounded-lg text-[11px] flex gap-2 border ${
                        testStatus.isLoading 
                          ? "bg-blue-950/20 border-blue-500/10 text-blue-400 font-mono"
                          : testStatus.success
                          ? "bg-emerald-950/25 border-emerald-500/20 text-emerald-400 font-semibold"
                          : "bg-red-950/25 border-red-500/20 text-red-400"
                      }`}>
                        {testStatus.isLoading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mt-0.5" />
                        ) : testStatus.success ? (
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400 mt-0.5" />
                        )}
                        <span>{testStatus.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[9px] text-slate-500 font-sans mt-0.5">Dispositivos sem IP cadastrado serão assinalados com o status de rede "SEM IP". Por padrão, o acesso remoto abre o gerenciador Web no link http do IP.</p>
              </div>

              <div className="p-6 border-t border-slate-900 bg-slate-950 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-900 text-slate-300 text-xs rounded-xl font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-xl font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? "Gravando..." : "Salvar no Banco"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: EDITAR DISPOSITIVO */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-amber-500" />
            <div className="p-6 border-b border-slate-900 flex items-center justify-between bg-slate-950">
              <div>
                <h3 className="font-display font-semibold text-white">Editar Impressora</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Altere dados técnicos cadastrados deste ativo.</p>
              </div>
              <button onClick={() => setIsEditOpen(null)} className="p-1 text-slate-500 hover:text-slate-300 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {formError && (
                  <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-xl text-xs text-red-400 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Setor / Local *</label>
                    <input
                      type="text"
                      placeholder="Ex: 1a SECRETARIA"
                      value={setor}
                      onChange={(e) => setSetor(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Tipo de Equipamento</label>
                    <input
                      type="text"
                      placeholder="Ex: Multifuncional"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Marca / Fabricante *</label>
                    <input
                      type="text"
                      placeholder="Ex: KYOCERA"
                      value={marca}
                      onChange={(e) => setMarca(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Modelo *</label>
                    <input
                      type="text"
                      placeholder="Ex: M3655IDN"
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Patrimônio / Tombo</label>
                    <input
                      type="text"
                      value={tombo}
                      onChange={(e) => setTombo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Número de Série (Serial) *</label>
                    <input
                      type="text"
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Endereço IP (Opcional - deixe em branco para desativar)</label>
                    <input
                      type="text"
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">URL de Acesso Remoto Personalizada (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: http://10.69.32.18:8080"
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                    />
                  </div>
                </div>

                {/* CONFIGURAÇÃO DE CREDENCIAIS DO COMMAND CENTER */}
                <div className="p-4 rounded-xl border border-slate-900 bg-slate-900/40 space-y-3.5">
                  <div className="flex items-center gap-2 border-b border-slate-900 pb-2">
                    <Key className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold text-slate-200">Credenciais Command Center Rx *</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Usuário Admin *</label>
                      <input
                        type="text"
                        placeholder="Ex: admin"
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Senha Admin *</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Senha ou código admin"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          required
                          className="w-full pl-3 pr-9 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1.5 text-slate-500 hover:text-slate-300 select-none cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Button & Indicator */}
                  <div className="pt-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-500">Valide os acessos contra o IP editado</span>
                      <button
                        type="button"
                        onClick={handleTestAccess}
                        disabled={testStatus?.isLoading}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-200 text-[10px] rounded-lg tracking-wide font-mono transition cursor-pointer select-none flex items-center gap-1.5"
                      >
                        {testStatus?.isLoading ? "Testando..." : "Testar Acesso"}
                      </button>
                    </div>

                    {testStatus && (
                      <div className={`p-2.5 rounded-lg text-[11px] flex gap-2 border ${
                        testStatus.isLoading 
                          ? "bg-blue-950/20 border-blue-500/10 text-blue-400 font-mono"
                          : testStatus.success
                          ? "bg-emerald-950/25 border-emerald-500/20 text-emerald-400 font-semibold"
                          : "bg-red-950/25 border-red-500/20 text-red-400"
                      }`}>
                        {testStatus.isLoading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mt-0.5" />
                        ) : testStatus.success ? (
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400 mt-0.5" />
                        )}
                        <span>{testStatus.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-900 bg-slate-950 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(null)}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-900 text-slate-300 text-xs rounded-xl font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-xl font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? "Gravando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: IMPORTAR PLANILHAS CSV / XLSX (Highly structured interactive spreadsheet validator) */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-5xl bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-blue-500" />
            <div className="p-6 border-b border-slate-900 flex items-center justify-between bg-slate-950">
              <div>
                <h3 className="font-display font-semibold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-teal-400" />
                  Importador Inteligente de Planilhas
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Submeta planilhas reais de ativos contendo colunas brasileiras padrão.</p>
              </div>
              <button 
                onClick={() => { setIsImportOpen(false); setImportedList([]); setImportStatus(null); }} 
                className="p-1 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Drop area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                  dragActive 
                    ? "border-blue-500 bg-blue-600/5 text-blue-400" 
                    : "border-slate-800 hover:border-slate-700 bg-slate-900/40 text-slate-450"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-10 h-10 text-slate-500 mb-2.5 animate-bounce" />
                <p className="text-xs font-semibold text-slate-200">Arraste e solte o inventário de Impressoras aqui</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  Compatível com arquivos Excel (.xlsx, .xls) e texto delimitado por vírgulas ou ponto-e-vírgula (.csv).
                </p>
                <div className="mt-4 px-3 py-1.5 bg-slate-900 border border-slate-800 text-[10px] uppercase font-mono text-slate-400 rounded-lg hover:text-white transition">
                  Explorar Arquivos no Computador
                </div>
              </div>

              {/* Status and logs banner */}
              {importStatus && (
                <div className={`p-3.5 border rounded-xl text-xs font-mono flex items-start gap-2.5 ${
                  importStatus.includes("Sucesso") || importStatus.includes("concluída")
                    ? "bg-teal-950/20 border-teal-500/20 text-teal-400"
                    : importStatus.includes("Atenção") || importStatus.includes("erro")
                    ? "bg-amber-950/30 border-amber-500/20 text-amber-500"
                    : "bg-slate-900 border-slate-850 text-slate-350"
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="leading-relaxed whitespace-pre-wrap">{importStatus}</div>
                </div>
              )}

              {/* INTERACTIVE REVIEW TABLE (Manual Correction Grid!) */}
              {importedList.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide font-mono">
                      Pré-visualização e Edição de Registros ({importedList.length} detectadas):
                    </h4>

                    {/* Quick Counters Indicator */}
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="px-2 py-0.5 bg-green-500/15 text-green-400 rounded-md">
                        Prontos: {importedList.filter(x => x.validationStatus === "valid").length}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-md">
                        Corrigidos: {importedList.filter(x => x.validationStatus === "corrected").length}
                      </span>
                      <span className="px-2 py-0.5 bg-red-500/15 text-red-450 rounded-md">
                        Erros pendentes: {importedList.filter(x => x.validationStatus === "invalid").length}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                    Você pode <strong className="text-slate-300">clicar e digitar diretamente em qualquer célula da tabela</strong> para realizar as correções necessárias de IP ou campos vazios antes de confirmar.
                  </p>

                  <div className="border border-slate-900 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead className="bg-slate-900/60 text-[9px] uppercase text-slate-500 sticky top-0 font-bold border-b border-slate-900">
                        <tr>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Setor *</th>
                          <th className="p-2.5">Marca *</th>
                          <th className="p-2.5">Modelo *</th>
                          <th className="p-2.5">S/N (Serial) *</th>
                          <th className="p-2.5">Tombo</th>
                          <th className="p-2.5">IP (Endereço)</th>
                          <th className="p-2.5">Usuário Admin *</th>
                          <th className="p-2.5">Senha Admin *</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 bg-slate-950 text-slate-300">
                        {importedList.map((row, i) => {
                          const hasErrors = row.validationStatus === "invalid";
                          const isCorrected = row.validationStatus === "corrected";

                          return (
                            <tr key={i} className={`hover:bg-slate-900/30 transition ${hasErrors ? "bg-red-500/5" : ""}`}>
                              {/* Validation Status Indicator */}
                              <td className="p-2 w-28 shrink-0">
                                {hasErrors ? (
                                  <span 
                                    className="inline-flex items-center gap-1 text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded"
                                    title={row.errors.join(", ")}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    REJEITADA
                                  </span>
                                ) : isCorrected ? (
                                  <span 
                                    className="inline-flex items-center gap-1 text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded"
                                    title="IP corrigido automaticamente (ex: removido duplo ponto '..')"
                                  >
                                    <Check className="w-3 h-3" />
                                    AJUSTADA
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 className="w-3 h-3" />
                                    VÁLIDA
                                  </span>
                                )}
                              </td>

                              {/* Sector Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.setor}
                                  onChange={(e) => handleImportedFieldChange(i, "setor", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${!row.setor ? "border-dashed border-red-500/40 text-red-400 font-semibold" : ""}`}
                                  placeholder="Setor obrigatório"
                                />
                              </td>

                              {/* Brand Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.marca}
                                  onChange={(e) => handleImportedFieldChange(i, "marca", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${!row.marca ? "border-dashed border-red-500/40 text-red-400 font-semibold" : ""}`}
                                  placeholder="Fabricante obg."
                                />
                              </td>

                              {/* Model Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.modelo}
                                  onChange={(e) => handleImportedFieldChange(i, "modelo", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${!row.modelo ? "border-dashed border-red-500/40 text-red-400 font-semibold" : ""}`}
                                  placeholder="Modelo obg."
                                />
                              </td>

                              {/* Serial Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.serial}
                                  onChange={(e) => handleImportedFieldChange(i, "serial", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${!row.serial ? "border-dashed border-red-500/40 text-red-400 font-semibold" : ""}`}
                                  placeholder="Número de Série"
                                />
                              </td>

                              {/* Tombo Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.tombo}
                                  onChange={(e) => handleImportedFieldChange(i, "tombo", e.target.value)}
                                  className="w-full bg-transparent px-2 py-1 text-[11px] text-slate-350 hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded"
                                  placeholder="-"
                                />
                              </td>

                              {/* IP Edit with dynamic validation highlight */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.ip}
                                  onChange={(e) => handleImportedFieldChange(i, "ip", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] text-teal-400 hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${
                                    row.ip && !validateIPAddress(row.ip)
                                      ? "border-red-500/50 bg-red-950/20 text-red-400 font-semibold"
                                      : !row.ip
                                      ? "text-slate-600 border-dashed border-slate-900 pr-1 py-1"
                                      : ""
                                  }`}
                                  placeholder="Vazio (Sem IP)"
                                />
                              </td>

                              {/* Admin Username Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.adminUsername || "admin"}
                                  onChange={(e) => handleImportedFieldChange(i, "adminUsername", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${!(row.adminUsername || "admin") ? "border-dashed border-red-500/40 text-red-400 font-semibold" : ""}`}
                                  placeholder="admin"
                                />
                              </td>

                              {/* Admin Password Edit */}
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.adminPassword || "admin"}
                                  onChange={(e) => handleImportedFieldChange(i, "adminPassword", e.target.value)}
                                  className={`w-full bg-transparent px-2 py-1 text-[11px] hover:bg-slate-900 border border-transparent focus:border-slate-850 focus:bg-slate-900 outline-none rounded ${!(row.adminPassword || "admin") ? "border-dashed border-red-500/40 text-red-400 font-semibold" : ""}`}
                                  placeholder="admin"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-normal">
                    * Colunas assinaladas com asterisco (*) representam preenchimento mandatório. Dispositivos inválidos (conforme regras em vermelho) serão descartados da transação final se não corrigidos.
                  </p>
                </div>
              )}

              {/* Informational table columns helper cards */}
              <div className="text-[11px] bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-2">
                <p className="font-semibold flex items-center gap-2 text-slate-255">
                  <FileSpreadsheet className="h-4 w-4 text-slate-400 shrink-0" />
                  Regras de Leitura e Mapeamento Inteligente:
                </p>
                <ul className="list-disc pl-5 leading-relaxed text-slate-400 space-y-1 text-[10.5px]">
                  <li>O arquivo deve conter as colunas de cabeçalho: <strong>Setor, Tipo, Marca, Modelo, Tombo, Número de Série</strong> e <strong>IP</strong>.</li>
                  <li><strong>IP Opcional:</strong> Caso o IP venha vazio, ele será assinalado como <strong>SEM_IP</strong> no Firebase e não interferirá nos fluxos de rede da intranet.</li>
                  <li><strong>Correção de IP:</strong> IPs formatados inadequadamente com pontos duplicados (ex: <code>10.69..32.67</code>) serão automaticamente retificados para <code>10.69.32.67</code> pela rotina sanitária.</li>
                </ul>
              </div>
            </div>

            <div className="p-6 border-t border-slate-900 bg-slate-950 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setIsImportOpen(false); setImportedList([]); setImportStatus(null); }}
                className="px-4 py-2 border border-slate-850 hover:bg-slate-900 text-slate-300 text-xs rounded-xl font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSaving || importedList.length === 0}
                onClick={commitImport}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-xl font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Salvando Dados...
                  </>
                ) : (
                  `Concluir Importação (${importedList.filter(x => x.validationStatus !== "invalid").length} de ${importedList.length} itens)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
