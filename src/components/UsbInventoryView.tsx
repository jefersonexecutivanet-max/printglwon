import React, { useState } from "react";
import { 
  Cpu, 
  Terminal, 
  Copy, 
  Check, 
  Trash2, 
  Clock, 
  HardDrive, 
  Search, 
  Sparkles, 
  Download, 
  AlertCircle 
} from "lucide-react";
import { UsbInventoryEntry } from "../types";

interface UsbInventoryViewProps {
  entries: UsbInventoryEntry[];
  onSimulateAgentSync: () => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export default function UsbInventoryView({
  entries,
  onSimulateAgentSync,
  onDeleteEntry,
}: UsbInventoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter list by search term
  const filteredEntries = entries.filter((entry) => {
    const term = searchTerm.toLowerCase();
    return (
      entry.name.toLowerCase().includes(term) ||
      entry.model.toLowerCase().includes(term) ||
      entry.serial.toLowerCase().includes(term) ||
      entry.driver.toLowerCase().includes(term) ||
      entry.host.toLowerCase().includes(term)
    );
  });

  const psScript = `# Windows PowerShell Collector Script
# Execute como Administrador para coletar impressoras locais USB
# e transmitir diretamente para a central do PrintGlow

$ServerUrl = "${window.location.origin}/api/usb-inventory"

Write-Host "Iniciando Varredura de Ativos USB..." -ForegroundColor Cyan

# Filtra impressoras instaladas fisicamente na porta USB local
$UsbPrinters = Get-Printer | Where-Object { $_.PortName -like "USB*" -or $_.PortName -like "PORTUSB*" }

if ($UsbPrinters.Count -eq 0) {
    Write-Host "Nenhuma impressora USB local detectada." -ForegroundColor Yellow
    Exit
}

foreach ($p in $UsbPrinters) {
    # Extração robusta do Serial via WMI class
    $driverNode = Get-WmiObject Win32_Printer | Where-Object { $_.Name -eq $p.Name }
    $serial = $driverNode.SerialNumber
    if (-not $serial) {
        $serial = "USB_SERIAL_" + $p.Name.GetHashCode().ToString("X")
    }

    $body = @{
        name   = $p.Name
        model  = $p.DriverName
        serial = $serial
        driver = $p.DriverName
        host   = $env:COMPUTERNAME
    } | ConvertTo-Json -Compress

    Write-Host "Sincronizando: $($p.Name) [$($p.DriverName)]" -ForegroundColor Green
    
    try {
        Invoke-RestMethod -Uri $ServerUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
        Write-Host "Enviado com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "Falha ao enviar dados para a central: $_" -ForegroundColor Red
    }
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(psScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncSimulate = async () => {
    setIsSyncing(true);
    try {
      await onSimulateAgentSync();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6" id="usb-inventory-tab-content">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-medium text-2xl text-white">Inventário de Ativos USB</h2>
          <p className="text-slate-400 text-sm">Dispositivos locais identificados por meio do Agente Windows leve local.</p>
        </div>
        <div>
          <button
            onClick={handleSyncSimulate}
            disabled={isSyncing}
            className="cursor-pointer px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 font-medium text-xs flex items-center gap-2 transition select-none disabled:opacity-50"
            id="btn-simulate-usb-agent"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Simular Agente de Coleta (PowerShell)"}
          </button>
        </div>
      </div>

      {/* Two Grid Column: Table + PowerShell Script */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Table List Column */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Search bar */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar por Nome, Modelo, Serial, Host ou Driver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-900 text-slate-200 placeholder-slate-500 text-xs focus:ring-1 focus:ring-blue-500/50 outline-none transition"
              id="input-search-usb-printers"
            />
          </div>

          {/* Table container */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto min-h-[350px]">
              {filteredEntries.length === 0 ? (
                <div className="py-24 text-center text-slate-500">
                  <HardDrive className="h-8 w-8 mx-auto text-slate-700 mb-2.5 animate-pulse" />
                  <p className="text-sm font-semibold text-slate-400">Nenhum equipamento local registrado</p>
                  <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto leading-normal">
                    Nenhuma impressora USB cadastrada na base. Execute o script PowerShell no computador hospedeiro para sincronizar automaticamente.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse" id="table-usb-inventory">
                  <thead>
                    <tr className="border-b border-slate-900 text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold bg-slate-950">
                      <th className="py-3 px-4">Impressora USB local</th>
                      <th className="py-3 px-4">Série / Identificação</th>
                      <th className="py-3 px-4">Driver de Impressão</th>
                      <th className="py-3 px-4">Host de Rede</th>
                      <th className="py-3 px-4">Sincronizado</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-xs text-slate-300">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-900/10 transition">
                        {/* Name & Model */}
                        <td className="py-3.5 px-4 font-normal">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-white">{entry.name}</p>
                            <p className="text-[10px] text-slate-500">{entry.model}</p>
                          </div>
                        </td>

                        {/* Serial */}
                        <td className="py-3.5 px-4 font-mono font-medium">
                          {entry.serial ? (
                            <span className="text-slate-200">{entry.serial}</span>
                          ) : (
                            <span className="text-slate-650">—</span>
                          )}
                        </td>

                        {/* Driver */}
                        <td className="py-3.5 px-4 text-slate-400">
                          {entry.driver}
                        </td>

                        {/* Host PC */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-300 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-lg w-fit text-[11px] font-mono">
                            <Terminal className="h-3 w-3 text-blue-400" />
                            {entry.host}
                          </div>
                        </td>

                        {/* Synchronized date */}
                        <td className="py-3.5 px-4 text-slate-450 font-mono text-[10px]">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-600" />
                            {new Date(entry.createdAt).toLocaleString("pt-BR")}
                          </div>
                        </td>

                        {/* Delete action */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => onDeleteEntry(entry.id)}
                            title="Remover Registro USB"
                            className="p-1.5 rounded bg-slate-900 border border-slate-850 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition cursor-pointer select-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Local PowerShell Client Widget */}
        <div className="space-y-4">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-xl">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Script do Agente Windows</h3>
                <p className="text-[11px] text-slate-500">Agente PowerShell leve e livre de dependências externas.</p>
              </div>
            </div>

            <div className="p-3 bg-blue-950/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300 leading-normal flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Esse script varre as portas de impressão USB locais e transmite os dados para esta central via HTTP POST de forma criptografada.</span>
            </div>

            {/* Script Box */}
            <div className="relative">
              <pre className="p-4 bg-black border border-slate-900 text-emerald-400 font-mono text-[9px] rounded-xl overflow-x-auto h-72 max-w-full leading-relaxed select-all">
                {psScript}
              </pre>
              <button
                onClick={copyToClipboard}
                className="absolute top-2.5 right-2.5 p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 transition-all border border-slate-800 cursor-pointer select-none"
                title="Copiar Código"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <p className="text-[10px] text-slate-500 leading-normal">
              <strong>Como rodar:</strong> Abra o PowerShell como Administrador em qualquer máquina host Windows contendo impressoras conectadas via cabo USB, cole o código acima e pressione Enter.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
