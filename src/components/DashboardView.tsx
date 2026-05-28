import React from "react";
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
  Volume2
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

interface DashboardViewProps {
  printers: PrinterType[];
  logs: EventLog[];
  alerts: Alert[];
  onNavigate: (tab: string) => void;
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
  // Separated lists
  const monitoradasList = printers.filter((p) => p.status !== "local_usb" && p.status !== "ip_invalido" && p.status !== "sem_ip");
  const inventarioLocalList = printers.filter((p) => p.status === "local_usb" || p.status === "ip_invalido" || p.status === "sem_ip");

  const totalPrinters = printers.length;
  const totalMonitoradas = monitoradasList.length;
  const totalLocalUsb = inventarioLocalList.length;

  const onlinePrinters = monitoradasList.filter((p) => p.status === "online").length;
  const sleepPrinters = monitoradasList.filter((p) => p.status === "sleep_mode").length;
  const instavelPrinters = monitoradasList.filter((p) => p.status === "instavel" || p.status === "instável").length;
  const warningPrinters = monitoradasList.filter((p) => p.status === "warning").length;
  const errorPrinters = monitoradasList.filter((p) => p.status === "error").length;
  const offlinePrinters = monitoradasList.filter((p) => p.status === "offline").length;

  // Active status rate of network printers
  const activeCount = onlinePrinters + sleepPrinters + warningPrinters;
  const onlinePercentage = totalMonitoradas > 0 ? Math.round((activeCount / totalMonitoradas) * 100) : 0;

  // Average response time of active printers
  const activePrinters = monitoradasList.filter((p) => p.latency > 0);
  const avgResponse = activePrinters.length > 0 
    ? Math.round(activePrinters.reduce((acc, curr) => acc + curr.latency, 0) / activePrinters.length) 
    : 0;

  // Active alerts count
  const activeAlerts = alerts.filter((a) => a.status === "active");

  // Chart data: Latency timeline from latest logs (grouping by last checked to show live telemetries)
  const latencyChartData = monitoradasList.map((p) => ({
    name: p.name.substring(0, 12) + (p.name.length > 12 ? "..." : ""),
    latência: p.status === "offline" ? 0 : p.latency,
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
          <p className="text-slate-400 text-sm">Visualização consolidada de {totalMonitoradas} impressoras de rede monitoradas e {totalLocalUsb} ativos locais inventariados.</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Registered */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Ativos Registrados</span>
            <span className="p-2 bg-slate-900 text-slate-300 rounded-lg group-hover:scale-105 transition">
              <Printer className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-white tracking-tight">{totalPrinters}</span>
            <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-1 leading-normal">
              Rede: {totalMonitoradas} • Inventário Local: {totalLocalUsb}
            </div>
          </div>
        </div>

        {/* Status Active (Online) */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-emerald-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Rede Online / Standby</span>
            <span className="p-2 bg-emerald-600/10 text-emerald-400 rounded-lg group-hover:scale-105 transition">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-emerald-400 tracking-tight">{onlinePrinters + sleepPrinters}</span>
            <div className="text-[10px] text-emerald-500 mt-1 flex flex-col gap-0.5 font-semibold">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping inline-block" />
                {onlinePercentage}% Operando Rede
              </div>
              <p className="text-[9.5px] text-slate-400 font-normal mt-0.5">Online: {onlinePrinters} • Standby: {sleepPrinters}</p>
            </div>
          </div>
        </div>

        {/* Status Critical (Offline) */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-red-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Inativas (Offline)</span>
            <span className="p-2 bg-red-600/10 text-red-500 rounded-lg group-hover:scale-105 transition">
              <XOctagon className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-red-500 tracking-tight">{offlinePrinters}</span>
            <div className="text-[10px] text-slate-500 mt-1 flex flex-col gap-0.5">
              <span>Sem resposta (5 tentativas)</span>
              <p className="text-[9.5px] text-slate-400">Requerem atenção rápida</p>
            </div>
          </div>
        </div>

        {/* Latency Average */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider font-mono">Latência Média</span>
            <span className="p-2 bg-amber-600/10 text-amber-500 rounded-lg group-hover:scale-105 transition">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-display font-bold text-amber-400 tracking-tight">
              {avgResponse} <span className="text-xs text-slate-400 font-normal">ms</span>
            </span>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              Fila monitoramento ativo
            </div>
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-800 transition shadow bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase font-mono tracking-wider">Anomalias / Alertas</span>
            <span className="p-2 bg-blue-600/10 text-blue-400 rounded-lg group-hover:scale-105 transition">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className={`text-3xl font-display font-bold tracking-tight ${warningPrinters + errorPrinters + instavelPrinters > 0 ? "text-amber-450" : "text-slate-300"}`}>
              {warningPrinters + errorPrinters + instavelPrinters}
            </span>
            <div className="text-[10px] text-slate-500 mt-1 flex flex-col font-normal leading-normal">
              <span>Erros: {errorPrinters} • Avisos: {warningPrinters} • Instáveis: {instavelPrinters}</span>
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

      {/* Seção Separada: Monitoradas vs Inventário Local */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel: Monitoradas de Rede */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 inline-block animate-ping" />
            <span className="-ml-1.5">Impressoras de Rede Monitoradas ({totalMonitoradas})</span>
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {monitoradasList.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhuma impressora de rede monitorada.</p>
            ) : (
              monitoradasList.map((p) => (
                <div key={p.id} className="p-3 bg-slate-900/30 border border-slate-900 rounded-xl flex items-center justify-between gap-3 hover:border-slate-800 transition">
                  <div className="min-w-0 flex-grow">
                    <p className="text-xs font-semibold text-slate-200 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.ip || "SEM IP"} • {p.setor || "Sem setor"}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                    p.status === "online" 
                      ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                      : p.status === "sleep_mode" 
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" 
                      : (p.status === "instavel" || p.status === "instável")
                      ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                      : p.status === "warning"
                      ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}>
                    {p.status === "sleep_mode" ? "ECONOMIA" : (p.status === "instavel" || p.status === "instável") ? "INSTÁVEL" : p.status.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Painel: Inventário Local */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0 inline-block" />
            Inventário Local - USB / Sem Rede ({totalLocalUsb})
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {inventarioLocalList.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhuma impressora local cadastrada.</p>
            ) : (
              inventarioLocalList.map((p) => (
                <div key={p.id} className="p-3 bg-slate-900/30 border border-slate-900 rounded-xl flex items-center justify-between gap-3 hover:border-slate-800 transition">
                  <div className="min-w-0 flex-grow">
                    <p className="text-xs font-semibold text-slate-200 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{p.modelo || "Modelo não especificado"} • {p.setor || "Sem setor"}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20 shrink-0">
                    LOCAL_USB
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
