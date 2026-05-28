import React, { useState, useRef } from "react";
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
  RefreshCw
} from "lucide-react";
import { parseCSVText, parseExcelFile, ImportedPrinter, validateIPAddress, buildPrinterFromRow } from "../utils/spreadsheet";
import { Printer } from "../types";

const isLocalIpToken = (ipValue?: string) => {
  const normalized = String(ipValue || "").trim().toUpperCase();
  return normalized === "" || normalized === "SEMREDE" || normalized === "USB" || normalized === "LOCAL";
};

interface PrintersViewProps {
  printers: Printer[];
  onAddPrinter: (printer: Omit<Printer, "id" | "status" | "latency" | "lastChecked" | "createdAt" | "updatedAt">) => Promise<void>;
  onEditPrinter: (id: string, printer: Partial<Printer>) => Promise<void>;
  onDeletePrinter: (id: string) => Promise<void>;
  onBulkImport: (printers: ImportedPrinter[]) => Promise<number>;
  triggerSingleScan: (printer: Printer) => Promise<void>;
  isScanningMap: { [key: string]: boolean };
}

export default function PrintersView({
  printers,
  onAddPrinter,
  onEditPrinter,
  onDeletePrinter,
  onBulkImport,
  triggerSingleScan,
  isScanningMap,
}: PrintersViewProps) {
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

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

  // Open Drawer cleanup
  const openAddDrawer = () => {
    setSetor("");
    setTipo("Multifuncional");
    setMarca("");
    setModelo("");
    setTombo("");
    setSerial("");
    setIp("");
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
    setFormError(null);
  };

  // Action Add Submission
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!setor.trim() || !marca.trim() || !modelo.trim() || !serial.trim()) {
      setFormError("Setor, Marca, Modelo e Número de Série são obrigatórios.");
      return;
    }

    // IP validation if filled and not explicitly marked as local device
    if (ip.trim()) {
      const cleanIpMatch = ip.trim().replace(/\s+/g, "").replace(/\.\./g, ".");
      if (!isLocalIpToken(cleanIpMatch) && !validateIPAddress(cleanIpMatch)) {
        setFormError("O IP inserido possui formato IPv4 incorreto (ex: 192.168.1.50).");
        return;
      }
    }

    setIsSaving(true);
    try {
      await onAddPrinter({
        name: `${marca} ${modelo} - ${setor}`,
        ip: ip.trim(),
        setor: setor.trim(),
        tipo: tipo.trim(),
        marca: marca.trim(),
        modelo: modelo.trim(),
        tombo: tombo.trim(),
        serial: serial.trim(),
        location: setor.trim(),
        model: `${marca} ${modelo}`,
        notes: [
          tipo ? `Tipo: ${tipo}` : "",
          tombo ? `Tombo: ${tombo}` : "",
          serial ? `S/N: ${serial}` : ""
        ].filter(Boolean).join(" | "),
        ultimaVerificacao: null,
        responseTime: null,
        mensagem: null,
      } as any);

      setIsAddOpen(false);
    } catch (err: any) {
      setFormError("Erro ao registrar a impressora no banco de dados.");
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

    // IP validation if filled and not explicitly marked as local device
    if (ip.trim()) {
      const cleanIpMatch = ip.trim().replace(/\s+/g, "").replace(/\.\./g, ".");
      if (!isLocalIpToken(cleanIpMatch) && !validateIPAddress(cleanIpMatch)) {
        setFormError("O IP editado possui formato IPv4 incorreto (ex: 10.69.32.18).");
        return;
      }
    }

    setIsSaving(true);
    try {
      await onEditPrinter(isEditOpen.id, {
        name: `${marca} ${modelo} - ${setor}`,
        ip: ip.trim(),
        setor: setor.trim(),
        tipo: tipo.trim(),
        marca: marca.trim(),
        modelo: modelo.trim(),
        tombo: tombo.trim(),
        serial: serial.trim(),
        location: setor.trim(),
        model: `${marca} ${modelo}`,
        notes: [
          tipo ? `Tipo: ${tipo}` : "",
          tombo ? `Tombo: ${tombo}` : "",
          serial ? `S/N: ${serial}` : ""
        ].filter(Boolean).join(" | ")
      });
      setIsEditOpen(null);
    } catch (err) {
      setFormError("Falha na atualização do cadastro da impressora.");
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
              <option value="all">Todos os Status</option>
              <option value="online">Online</option>
              <option value="sleep_mode">Sleep Mode/Economia</option>
              <option value="warning">Aviso / Warning</option>
              <option value="error">Erro Crítico</option>
              <option value="offline">Offline / Inativa</option>
              <option value="local_usb">Inventário Local (LOCAL_USB)</option>
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

      {/* Interactive Database Datatable */}
      <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl" id="table-card-container">
        <div className="overflow-x-auto min-h-[350px]">
          {filteredPrinters.length === 0 ? (
            <div className="py-24 text-center text-slate-500">
              <AlertCircle className="h-8 w-8 mx-auto text-slate-700 mb-2.5" />
              <p className="text-sm font-semibold text-slate-400">Nenhum equipamento localizado</p>
              <p className="text-slate-500 text-xs mt-1">Nenhum registro coincide com o filtro de pesquisa aplicado.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse" id="table-printers">
              <thead>
                <tr className="border-b border-slate-900 text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold bg-slate-950">
                  <th className="py-3 px-4">Impressora / Cadastro</th>
                  <th className="py-3 px-4">Endereço IP</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Tempo Resposta</th>
                  <th className="py-3 px-4">Mensagem do Sensor</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-xs text-slate-300">
                {filteredPrinters.map((printer) => {
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
                          <span className="text-slate-200">{printer.ip}</span>
                        ) : (
                          <span className="text-slate-600 bg-slate-900/50 border border-dashed border-slate-800 px-2 py-0.5 rounded text-[10px]">SEM IP CONFIGURADO</span>
                        )}
                      </td>

                      {/* Status Badges Cell (Glow customized matching requested enterprise state colors) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[9.5px] uppercase tracking-wider w-fit border ${
                            printer.status === "online" 
                              ? "bg-green-500/10 text-green-400 border-green-500/20" 
                              : printer.status === "sleep_mode" 
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                              : printer.status === "warning" 
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                              : (printer.status === "instável" || printer.status === "instavel")
                              ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              : printer.status === "error"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : printer.status === "offline"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : printer.status === "local_usb"
                              ? "bg-slate-500/10 text-slate-400 border-slate-500/25"
                              : "bg-slate-800/20 text-slate-450 border-slate-700/20"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              printer.status === "online" 
                                ? "bg-green-400 animate-pulse" 
                                : printer.status === "sleep_mode" 
                                ? "bg-blue-400" 
                                : printer.status === "warning" || printer.status === "instável" || printer.status === "instavel"
                                ? "bg-yellow-400" 
                                : printer.status === "error" || printer.status === "offline"
                                ? "bg-red-400"
                                : "bg-slate-400"
                            }`} />
                            {printer.status === "sleep_mode" 
                              ? "SLEEP / STANDBY" 
                              : (printer.status === "instável" || printer.status === "instavel")
                              ? "INSTÁVEL"
                              : printer.status === "local_usb" || printer.status === "ip_invalido" || printer.status === "sem_ip"
                              ? "Impressora local (sem rede)"
                              : printer.status === "warning"
                              ? "AVISO"
                              : printer.status === "error"
                              ? "ERRO"
                              : printer.status.toUpperCase()}
                          </span>
                        </div>
                      </td>

                      {/* Response Latency Cell */}
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {printer.status === "offline" || printer.status === "sem_ip" || printer.status === "ip_invalido" || printer.status === "local_usb" ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span>{printer.latency || 0} ms</span>
                        )}
                      </td>

                      {/* Printer Discovered Alert Sensor message */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {printer.currentMessage ? (
                            <p 
                              className={`text-[11px] font-medium max-w-xs break-words ${
                                printer.status === "error" 
                                  ? "text-red-400" 
                                  : printer.status === "warning" || printer.status === "ip_invalido" || printer.status === "instável" || printer.status === "instavel"
                                  ? "text-amber-400"
                                  : printer.status === "sem_ip" || printer.status === "local_usb"
                                  ? "text-slate-500 italic"
                                  : "text-slate-350"
                              }`}
                            >
                              {printer.currentMessage}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-500 italic">Dispositivo aguardando varredura...</p>
                          )}
                          
                          {printer.lastChecked && (
                            <p className="text-[9px] text-slate-600 font-mono">Verificado em: {new Date(printer.lastChecked).toLocaleString("pt-BR")}</p>
                          )}
                        </div>
                      </td>

                      {/* Actions Trigger panel */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
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

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Endereço IP (Opcional - deixe em branco para SEM IP)</label>
                  <input
                    type="text"
                    placeholder="Ex: 10.69.32.18"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                  />
                  <p className="text-[9px] text-slate-500 font-sans mt-1">Dispositivos sem IP cadastrado serão assinalados com o status de rede "SEM IP" e não realizarão pings.</p>
                </div>
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

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Endereço IP (Opcional - deixe em branco para desativar monitoramento)</label>
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-850 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none font-mono"
                  />
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
                                    row.ip && !isLocalIpToken(row.ip) && !validateIPAddress(row.ip)
                                      ? "border-red-500/50 bg-red-950/20 text-red-400 font-semibold"
                                      : !row.ip
                                      ? "text-slate-600 border-dashed border-slate-900 pr-1 py-1"
                                      : ""
                                  }`}
                                  placeholder="Vazio (Sem IP)"
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
                  <li><strong>IP Opcional:</strong> Caso o IP venha vazio ou marcado como <strong>SEMREDE</strong>, <strong>USB</strong> ou <strong>LOCAL</strong>, o equipamento será classificado como <strong>LOCAL_USB</strong> e não será monitorado pela rede.</li>
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
