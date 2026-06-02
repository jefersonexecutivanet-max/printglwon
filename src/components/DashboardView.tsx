import React, { useState } from "react";
import { 
  Printer, 
  Activity, 
  CheckCircle2, 
  XOctagon, 
  Clock, 
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  FileText,
  Volume2,
  Cpu,
  Plug
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell 
} from "recharts";
import { Printer as PrinterType, EventLog, Alert } from "../types";
import { validateIPAddress } from "../utils/spreadsheet";

interface DashboardViewProps {
  printers: PrinterType[];
  logs: EventLog[];
  alerts: Alert[];
  onNavigate: (tab: string, subTab?: "com_ip" | "sem_ip") => void;
  triggerScan: () => void;
  isScanning: boolean;
}

export default function DashboardView({ 
  printers, 
  logs, 
  alerts, 
  onNavigate,
  triggerScan,
  isScanning
}: DashboardViewProps) {
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  // Separated lists according to IP presence
  const comIpList = printers.filter(
    (p) => p.ip && p.ip.trim() !== "" && p.ip !== "0.0.0.0" && validateIPAddress(p.ip)
  );
  const semIpList = printers.filter(
    (p) => 
      !p.ip || 
      p.ip.trim() === "" || 
      p.ip === "0.0.0.0" || 
      !validateIPAddress(p.ip) ||
      p.status === "local_usb" || 
      p.status === "sem_ip" || 
      p.status === "ip_invalido"
  );

  const totalPrinters = printers.length;
  const totalComIp = comIpList.length;
  const totalSemIp = semIpList.length;

  // CC Status Metrics Compilation
  const compileCCStats = () => {
    const stats = {
      impressora: { pronto: 0, espera: 0, processando: 0, aquecendo: 0, economia: 0, alerta: 0, offline: 0 },
      scanner: { pronto: 0, espera: 0, inativo: 0, erro: 0, offline: 0 },
      fax: { pronto: 0, espera: 0, inativo: 0, erro: 0, offline: 0 },
      mensagem: { pronto: 0, espera: 0, erro: 0, alerta: 0, offline: 0 }
    };

    comIpList.forEach((p) => {
      if (p.status === "offline") {
        stats.impressora.offline++;
        stats.scanner.offline++;
        stats.fax.offline++;
        stats.mensagem.offline++;
        return;
      }

      // 1. Impressora
      const sImp = (p.statusImpressora || "Pronto").toLowerCase();
      if (sImp.includes("pronto")) stats.impressora.pronto++;
      else if (sImp.includes("espera") || sImp.includes("sleep")) stats.impressora.espera++;
      else if (["processando", "imprimindo", "impressao", "printing"].some((token) => sImp.includes(token))) stats.impressora.processando++;
      else if (sImp.includes("aquecendo")) stats.impressora.aquecendo++;
      else if (sImp.includes("economia") || sImp.includes("poupar")) stats.impressora.economia++;
      else stats.impressora.alerta++;

      // 2. Scanner
      const sScan = (p.statusScanner || "Pronto").toLowerCase();
      if (sScan.includes("pronto")) stats.scanner.pronto++;
      else if (sScan.includes("espera") || sScan.includes("sleep")) stats.scanner.espera++;
      else if (sScan.includes("inativo")) stats.scanner.inativo++;
      else stats.scanner.erro++;

      // 3. FAX
      const sFax = (p.statusFax || "Pronto").toLowerCase();
      if (sFax.includes("pronto")) stats.fax.pronto++;
      else if (sFax.includes("espera") || sFax.includes("sleep")) stats.fax.espera++;
      else if (sFax.includes("inativo")) stats.fax.inativo++;
      else stats.fax.erro++;

      // 4. Mensagem
      const inferredMessage = p.statusMensagem && p.statusMensagem !== "Pronto"
        ? p.statusMensagem
        : (p.currentMessage && p.currentMessage !== "✅ Operacional" && p.currentMessage !== "🔴 Offline"
            ? p.currentMessage.replace(/^[🚨⚠️]\s*/, "")
            : "Pronto");
      const sMsg = inferredMessage.toLowerCase();
      if (sMsg.includes("pronto")) stats.mensagem.pronto++;
      else if (sMsg.includes("espera") || sMsg.includes("sleep") || sMsg.includes("economia") || ["processando", "imprimindo", "impressao", "printing"].some((token) => sMsg.includes(token))) stats.mensagem.espera++;
      else if (["erro", "falha", "preso", "atolado", "aberta", "aberto", "sem papel", "vazio", "vazia", "unidade", "imagem", "baixo"].some(x => sMsg.includes(x))) stats.mensagem.alerta++;
      else stats.mensagem.erro++;
    });

    return stats;
  };

  const ccStats = compileCCStats();

  const onlinePrinters = printers.filter((p) => p.status === "online" || p.status === "warning" || p.status === "error").length;
  const offlinePrinters = printers.filter((p) => p.status === "offline").length;

  // Calculo de alertas físicos reais do sensor e do Command Center para impressoras conectadas
  const errosOperacionaisCount = printers.filter(
    (p) => p.status !== "offline" && p.currentMessage && p.currentMessage.includes("🚨")
  ).length;

  const avisosOperacionaisCount = printers.filter(
    (p) => p.status !== "offline" && p.currentMessage && p.currentMessage.includes("⚠️")
  ).length;

  const totalSensorAlerts = errosOperacionaisCount + avisosOperacionaisCount;

  // Active status rate of network printers
  const totalPrintersEmRede = printers.filter(
    (p) => p.status === "online" || p.status === "offline" || p.status === "warning" || p.status === "error"
  ).length;
  const onlinePercentage = totalPrintersEmRede > 0 ? Math.round((onlinePrinters / totalPrintersEmRede) * 100) : 0;

  // Average response time of active printers (only those with IP and online and responsive)
  const activePrintersWithPing = comIpList.filter((p) => p.status === "online" && p.latency > 0);
  const avgResponse = activePrintersWithPing.length > 0 
    ? Math.round(activePrintersWithPing.reduce((acc, curr) => acc + curr.latency, 0) / activePrintersWithPing.length) 
    : 0;

  // Active alerts count from database
  const activeAlerts = alerts.filter((a) => a.status === "active");

  // Chart data: Latency timeline from latest logs (using comIpList with status online)
  const latencyChartData = comIpList.filter((p) => p.status === "online").map((p) => ({
    name: p.name.substring(0, 12) + (p.name.length > 12 ? "..." : ""),
    latência: p.latency,
    status: p.status,
  }));

  // Bar chart data: Location-wise distribution
  const locationStats = printers.reduce((acc: { [key: string]: number }, curr) => {
    const loc = curr.setor || curr.location || "Não especificado";
    acc[loc] = (acc[loc] || 0) + 1;
    return acc;
  }, {});

  const locationChartData = Object.keys(locationStats).map((loc) => ({
    local: loc,
    quantidade: locationStats[loc],
  }));

  const COLORS = {
    online: "#22c55e",
    sleep_mode: "#3b82f6",
    instavel: "#eab308",
    warning: "#f59e0b",
    error: "#ef4444",
    offline: "#ef4444",
    local_usb: "#64748b"
  };

  return (
    <div className="space-y-6" id="dashboard-tab-content">
      {/* Upper Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-medium text-2xl text-white">Painel de Telemetria Geral</h2>
          <p className="text-slate-400 text-sm">Monitorando {totalPrinters} impressoras corporativas cadastradas em rede local.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAgentModalOpen(true)}
            className="cursor-pointer px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 font-medium text-xs flex items-center gap-2 transition select-none"
            id="btn-agent-dashboard"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            Agente Local
          </button>
          <button
            onClick={triggerScan}
            disabled={isScanning}
            className={`cursor-pointer px-4 py-2.5 rounded-xl border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 font-medium text-xs flex items-center gap-2 transition select-none ${
              isScanning ? "opacity-70 cursor-not-allowed" : ""
            }`}
            id="btn-scan-dashboard"
          >
            <Activity className={`w-3.5 h-3.5 ${isScanning ? "animate-pulse" : ""}`} />
            {isScanning ? "Processando Varredura..." : "Efetuar Verificação Geral"}
          </button>
        </div>
      </div>

      {/* Quick Navigation Buttons */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/10 border border-slate-900 rounded-2xl" id="dashboard-quick-navigation">
        <span className="text-xs text-slate-400 font-medium font-mono uppercase tracking-wider flex items-center mr-2">Filtro Rápido:</span>
        <button
          onClick={() => onNavigate("printers", "com_ip")}
          className="cursor-pointer px-4 py-2 rounded-xl border border-blue-500/20 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 font-semibold text-xs flex items-center gap-2 transition select-none"
          id="btn-active-printers-dashboard"
        >
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Impressoras Ativas com IP
        </button>
        <button
          onClick={() => onNavigate("printers", "sem_ip")}
          className="cursor-pointer px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold text-xs flex items-center gap-2 transition select-none"
          id="btn-inventario-dashboard"
        >
          <span>🔌</span>
          Inventário
        </button>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ativas (Com IP) */}
        <div 
          onClick={() => onNavigate("printers", "com_ip")}
          onKeyDown={(e) => e.key === "Enter" && onNavigate("printers", "com_ip")}
          role="button"
          tabIndex={0}
          aria-label="Ver Impressoras Ativas com IP"
          className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-blue-500/40 hover:bg-slate-900/40 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none shadow-lg bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/10 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Impressoras Ativas com IP</span>
            <span className="p-2 bg-blue-600/10 text-blue-400 rounded-lg group-hover:scale-105 transition">
              <Printer className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-blue-400 tracking-tight">{totalComIp}</span>
            <div className="text-[10px] text-slate-500 mt-1 flex flex-col gap-0.5 font-semibold">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                {onlinePercentage}% Conectividade
              </div>
              <p className="text-[9.5px] text-slate-400 font-normal mt-0.5">Impressoras com IP cadastrado</p>
            </div>
          </div>
        </div>

        {/* Status Inventário */}
        <div 
          onClick={() => onNavigate("printers", "sem_ip")}
          onKeyDown={(e) => e.key === "Enter" && onNavigate("printers", "sem_ip")}
          role="button"
          tabIndex={0}
          aria-label="Ver Inventário de impressoras"
          className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-amber-500/40 hover:bg-slate-900/40 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none shadow-lg bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/10 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Inventário</span>
            <span className="p-2 bg-amber-600/10 text-amber-400 rounded-lg group-hover:scale-105 transition">
              <Plug className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-amber-500 tracking-tight">{totalSemIp}</span>
            <div className="text-[10px] text-amber-500/80 mt-1 flex flex-col gap-0.5 font-semibold">
              <div className="flex items-center gap-1 text-slate-400">
                <span>🔌 Local USB / Sem rede</span>
              </div>
              <p className="text-[9.5px] text-slate-400 font-normal mt-0.5">Dispositivos mapeados no inventário</p>
            </div>
          </div>
        </div>

        {/* Latency Average */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Latência Média</span>
            <span className="p-2 bg-amber-600/10 text-amber-500 rounded-lg group-hover:scale-105 transition">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-amber-400 tracking-tight">
              {avgResponse} <span className="text-xs text-slate-400 font-normal">ms</span>
            </span>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              Fila de varredura ativa de rede
            </div>
          </div>
        </div>

        {/* Active Alerts (Focusing on real operational problems) */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Erros Operaç. SNMP</span>
            <span className="p-2 bg-blue-600/10 text-blue-400 rounded-lg group-hover:scale-105 transition">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className={`text-3xl font-display font-bold tracking-tight ${totalSensorAlerts > 0 ? "text-amber-450" : "text-slate-300"}`}>
              {totalSensorAlerts}
            </span>
            <div className="text-[10px] text-slate-500 mt-1 flex flex-col font-normal leading-normal">
              <span>Críticos (🚨): {errosOperacionaisCount} • Avisos (⚠️): {avisosOperacionaisCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO COMPLEMENTAR: MONITORAMENTO REAL-TIME COMMAND CENTER */}
      <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-xl" id="command-center-summary-banner">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-display font-medium text-lg text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              Monitoramento Command Center (Módulos de Rede IP)
            </h3>
            <p className="text-slate-400 text-xs mt-1">Sumarização em tempo real das condições internas autônomas de cada canal operacional.</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono font-semibold text-slate-500">
            <span>Pool Monitorado: {totalComIp} Equipamentos IPs</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Col 1: Impressora */}
          <div className="bg-slate-905 border border-slate-900 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status Impressora</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/25">Módulo</span>
            </div>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-450">
                <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-550" /> Pronto</span>
                <span className="font-mono text-white font-bold">{ccStats.impressora.pronto}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Em Espera / Aquecendo</span>
                <span className="font-mono text-white font-bold">{ccStats.impressora.espera + ccStats.impressora.aquecendo + ccStats.impressora.processando}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Econ. Energia</span>
                <span className="font-mono text-white font-bold">{ccStats.impressora.economia}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5 text-amber-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Alertas / Anomalia</span>
                <span className="font-mono text-amber-500 font-bold">{ccStats.impressora.alerta}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5 text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-550 animate-pulse" /> Offline</span>
                <span className="font-mono text-red-500 font-bold">{ccStats.impressora.offline}</span>
              </div>
            </div>
          </div>

          {/* Col 2: Scanner */}
          <div className="bg-slate-905 border border-slate-900 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status Scanner</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/25">Módulo</span>
            </div>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-450 font-semibold">
                <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-550" /> Pronto</span>
                <span className="font-mono text-white font-bold">{ccStats.scanner.pronto}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Em Espera</span>
                <span className="font-mono text-white font-bold">{ccStats.scanner.espera}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-550" /> Inativo / Offline</span>
                <span className="font-mono text-white font-bold">{ccStats.scanner.inativo + ccStats.scanner.offline}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5 text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-550 animate-pulse" /> Erro / Falha</span>
                <span className="font-mono text-red-500 font-bold">{ccStats.scanner.erro}</span>
              </div>
            </div>
          </div>

          {/* Col 3: FAX */}
          <div className="bg-slate-905 border border-slate-900 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status FAX</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/25">Módulo</span>
            </div>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-450 font-semibold">
                <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-555" /> Pronto</span>
                <span className="font-mono text-white font-bold">{ccStats.fax.pronto}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Em Espera</span>
                <span className="font-mono text-white font-bold">{ccStats.fax.espera}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-550" /> Inativo / Offline</span>
                <span className="font-mono text-white font-bold">{ccStats.fax.inativo + ccStats.fax.offline}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5 text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-550 animate-pulse" /> Erro / Falha</span>
                <span className="font-mono text-red-500 font-bold">{ccStats.fax.erro}</span>
              </div>
            </div>
          </div>

          {/* Col 4: Status da Mensagem (Alert-Source Priority) */}
          <div className="bg-gradient-to-br from-slate-900/40 via-slate-900/40 to-blue-950/15 border border-slate-900 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status das Mensagens</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/25">Fila Crítica</span>
            </div>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-450 font-semibold">
                <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-550" /> Sem Alerta</span>
                <span className="font-mono text-white font-bold">{ccStats.mensagem.pronto + ccStats.mensagem.espera}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5 text-amber-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Alertas Ativos</span>
                <span className="font-mono text-amber-500 font-bold">{ccStats.mensagem.alerta}</span>
              </div>
              <div className="flex items-center justify-between text-slate-455">
                <span className="flex items-center gap-1.5 text-red-500 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-550 animate-pulse" /> Críticos / Erros</span>
                <span className="font-mono text-red-500 font-bold">{ccStats.mensagem.offline + ccStats.mensagem.erro}</span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-500">
                <span>Regra de Prioridade Ativa</span>
                <span className="text-green-400 font-bold">100% OK</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latency Live Chart */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 lg:col-span-2 shadow">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-white">Latência por Dispositivo (Ping)</h3>
              <p className="text-slate-500 text-xs">Variação do tempo de ida e volta do pacote em milissegundos.</p>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold border border-green-500/20 bg-green-500/5 text-green-400 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
              Tempo Real
            </span>
          </div>

          <div className="h-64 w-full">
            {totalPrinters === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                Nenhuma impressora disponível para traçar telemetria.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyChartData}>
                  <defs>
                    <linearGradient id="latencyGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e40af" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "12px", fontSize: "11px", color: "#f8fafc" }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="latência" 
                    stroke="#3b82f6" 
                    strokeWidth={2.5} 
                    dot={{ fill: "#3b82f6", r: 4 }} 
                    activeDot={{ r: 6, fill: "#ff007f" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Printers by Location distribution */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-white font-sans">Saturação por Localidade</h3>
              <p className="text-slate-500 text-xs">Volume de ativos distribuídos física ou lógicamente.</p>
            </div>
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </div>

          <div className="h-64 w-full">
            {locationChartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                Sem informações de localização cadastradas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="local" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "12px", fontSize: "11px", color: "#f8fafc" }}
                  />
                  <Bar dataKey="quantidade" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                    {locationChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#2563eb" : "#4f46e5"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Two-Column split for Alerts and Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Active Incidents */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Últimos Incidentes Detectados
            </h3>
            <button 
              onClick={() => onNavigate("alerts")}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {activeAlerts.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/40 mb-2" />
                <p className="text-xs">Excelente! Nenhum incidente pendente nesta zona.</p>
              </div>
            ) : (
              activeAlerts.slice(0, 5).map((alert) => (
                <div 
                  key={alert.id} 
                  className={`p-3 border rounded-xl flex items-start gap-3 bg-slate-900/30 ${
                    alert.severity === "critical" 
                      ? "border-red-500/20 text-red-300" 
                      : alert.severity === "warning" 
                      ? "border-amber-500/20 text-amber-300" 
                      : "border-blue-500/20 text-blue-300"
                  }`}
                >
                  <span className={`p-1.5 rounded-lg text-xs mt-0.5 ${
                    alert.severity === "critical" 
                      ? "bg-red-500/10 text-red-400" 
                      : alert.severity === "warning" 
                      ? "bg-amber-500/10 text-amber-500" 
                      : "bg-blue-500/10 text-blue-400"
                  }`}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-grow min-w-0">
                    <p className="text-xs font-semibold truncate text-slate-200">
                      {alert.printerName}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {alert.message}
                    </p>
                    <span className="text-[9px] text-slate-500 font-mono mt-1 block">
                      {new Date(alert.timestamp).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Latest Activity logs timeline */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              Eventos Recentes do Sistema
            </h3>
            <button 
              onClick={() => onNavigate("logs")}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
                <Clock className="h-8 w-8 text-slate-700 mb-2" />
                <p className="text-xs">Nenhum evento registrado no log.</p>
              </div>
            ) : (
              logs.slice(0, 5).map((log) => {
                const isRecovery = log.eventType === "recovery" || log.currentStatus === "online";
                return (
                  <div key={log.id} className="flex gap-4 items-start relative pl-1">
                    {/* Tiny dot timeline decor */}
                    <div className="flex flex-col items-center h-full pt-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 border ${
                        isRecovery 
                          ? "bg-green-500 border-green-400 glow-green" 
                          : log.eventType === "incident" 
                          ? "bg-red-500 border-red-400 glow-red"
                          : "bg-slate-700 border-slate-600"
                      }`} />
                    </div>

                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {log.printerName}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                        {log.message}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Seção Separada: Ativas com IP vs Inventário Sem IP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel: Ativas com IP */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 inline-block animate-ping" />
            <span className="-ml-1.5">Impressoras com IP Monitoradas ({totalComIp})</span>
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {comIpList.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhuma impressora de rede online.</p>
            ) : (
              comIpList.map((p) => (
                <div key={p.id} className="p-3 bg-slate-900/30 border border-slate-900 rounded-xl flex items-center justify-between gap-3 hover:border-slate-800 transition">
                  <div className="min-w-0 flex-grow">
                    <p className="text-xs font-semibold text-slate-200 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.ip || "SEM IP"} • {p.setor || "Sem setor"}</p>
                    {p.currentMessage && (p.currentMessage.includes("🚨") || p.currentMessage.includes("⚠️")) && (
                      <p className="text-[10px] font-bold text-amber-500 mt-1 flex items-center gap-1 animate-pulse">
                        {p.currentMessage}
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                    p.status === "online" 
                      ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}>
                    {p.status === "online" ? "🟢 ONLINE" : "🔴 OFFLINE"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Painel: Inventário Sem IP */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0 inline-block" />
            Inventário Local / Sem IP ({totalSemIp})
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {semIpList.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhuma impressora local cadastrada.</p>
            ) : (
              semIpList.map((p) => (
                <div key={p.id} className="p-3 bg-slate-900/30 border border-slate-900 rounded-xl flex items-center justify-between gap-3 hover:border-slate-800 transition">
                  <div className="min-w-0 flex-grow">
                    <p className="text-xs font-semibold text-slate-200 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{p.modelo || "Modelo não especificado"} • {p.setor || "Sem setor"}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20 shrink-0">
                    SEM IP
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 2. Modal: Agente Local de Monitoramento */}
      {isAgentModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[85vh] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-4">
              <div className="flex items-center gap-2.5">
                <Cpu className="w-5 h-5 text-blue-500 animate-pulse animate-duration-[2000ms]" />
                <div>
                  <h3 className="text-md font-semibold text-white">Agente Local de Monitoramento</h3>
                  <p className="text-[11px] text-slate-400">Como a Vercel está em nuvem, este agente integra sua infraestrutura privada online</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAgentModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition text-sm font-semibold cursor-pointer select-none bg-slate-900 border border-slate-850 px-2 py-1 rounded"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                O monitoramento corporativo profissional do <strong>PrintGlow</strong> pode ser assistido por um agente local leve em Node.js ou Windows Service, que executa varreduras diretas nos IPs da sua rede e sincroniza diretamente com a API segura online.
              </p>

              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-850 space-y-2">
                <h4 className="font-semibold text-slate-200">Como executar em 3 passos:</h4>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Crie uma nova pasta em seu servidor local e execute: <code className="text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono">npm install net-snmp express</code></li>
                  <li>Crie o arquivo <code className="text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono">agente.js</code> com o código abaixo.</li>
                  <li>Inicie o agente com: <code className="text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono">node agente.js</code></li>
                </ol>
              </div>

              <div className="space-y-1 bg-slate-950 rounded-xl p-3 border border-slate-900">
                <p className="font-semibold text-slate-200 pb-1.5">Código do Agente Local (agente.js):</p>
                <div className="text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-60 select-all p-2 bg-slate-950">
{`const snmp = require("net-snmp");
const http = require("http");

const API_SERVER_URL = "https://${window.location.host}";
const PRINTERS_IP_LIST = ${JSON.stringify(comIpList.map(p => p.ip))};

console.log("[AGENT] Iniciando monitoramento SNMP local...");

function scanPrinters() {
  PRINTERS_IP_LIST.forEach((ip) => {
    const session = snmp.createSession(ip, "public");
    const oids = ["1.3.6.1.2.1.25.3.5.1.1", "1.3.6.1.2.1.43.18.1.1.8.1.1"];
    
    session.get(oids, (err, varbinds) => {
      let payload = { ip, status: "online", msg: "OK" };
      if (err) {
        payload.status = "offline";
        payload.msg = "Sem resposta de ping ou SNMP";
      } else {
        const state = varbinds[0] ? varbinds[0].value : 3;
        const alert = varbinds[1] ? varbinds[1].value.toString() : "";
        payload.msg = alert || "Dispositivo ativo via agente local";
        payload.status = state === 1 ? "sleep_mode" : "online";
      }
      
      const req = http.request(\`\${API_SERVER_URL}/api/ping?ip=\${ip}\`, { method: "GET" });
      req.on("error", (e) => console.error("[AGENT] Erro de envio:", e.message));
      req.end();
    });
  });
}

setInterval(scanPrinters, 30000);
scanPrinters();`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
