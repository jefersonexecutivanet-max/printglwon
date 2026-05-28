import React, { useState } from "react";
import { 
  BellRing, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Flame, 
  Info,
  Clock
} from "lucide-react";
import { Alert } from "../types";

interface AlertsViewProps {
  alerts: Alert[];
  onResolveAlert: (id: string) => Promise<void>;
}

export default function AlertsView({ alerts, onResolveAlert }: AlertsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch = 
      alert.printerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.message.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = severityFilter === "all" || alert.severity === severityFilter;
    const matchesStatus = statusFilter === "all" || alert.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-6" id="alerts-tab-content">
      {/* Tab Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-medium text-2xl text-white">Alertas & Incidentes Ativos</h2>
          <p className="text-slate-400 text-sm">Controle de interrupções críticas de rede, lentidões de resposta e incidentes pendentes.</p>
        </div>
      </div>

      {/* Grid wrapper */}
      <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
        {/* Top bar controls */}
        <div className="flex flex-col lg:flex-row items-center gap-4 mb-6">
          <div className="relative flex-grow w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar por impressora ou descrição do alarme..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 focus:outline-none focus:border-blue-500/50 text-xs"
              id="input-search-alerts"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto shrink-0 select-none">
            {/* Severity selectivity */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider font-semibold">Severidade:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none cursor-pointer"
                id="select-filter-alerts-severity"
              >
                <option value="all">Todas as Intensidades</option>
                <option value="info">Informação (Info)</option>
                <option value="warning">Aviso (Warning)</option>
                <option value="critical">Crítico (Critical)</option>
              </select>
            </div>

            {/* Status active/resolved selection */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider font-semibold">Status Alerta:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none cursor-pointer"
                id="select-filter-alerts-status"
              >
                <option value="all">Ver Todos</option>
                <option value="active">Pendentes (Ativos)</option>
                <option value="resolved">Resolvidos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Alarm entries column */}
        <div className="space-y-4">
          {filteredAlerts.length === 0 ? (
            <div className="py-24 text-center text-slate-500">
              <BellRing className="h-8 w-8 mx-auto text-slate-700 mb-2.5 animate-bounce" />
              <p className="text-sm font-semibold text-slate-400">Nenhum alerta localizado</p>
              <p className="text-slate-500 text-xs mt-1">Parabéns! Nenhuma anomalia de rede está pendente na categoria filtrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredAlerts.map((alert) => {
                const getSeverityTheme = (sev: string) => {
                  switch (sev) {
                    case "critical":
                      return {
                        border: "border-red-500/20 bg-red-950/20",
                        glow: "glow-red",
                        badge: "bg-red-500/15 text-red-400 border border-red-500/30",
                        icon: Flame,
                      };
                    case "warning":
                      return {
                        border: "border-amber-500/20 bg-amber-950/10",
                        glow: "glow-yellow",
                        badge: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
                        icon: AlertTriangle,
                      };
                    default:
                      return {
                        border: "border-blue-500/20 bg-blue-950/10",
                        glow: "glow-blue",
                        badge: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                        icon: Info,
                      };
                  }
                };

                const theme = getSeverityTheme(alert.severity);
                const IconComponent = theme.icon;
                const isResolved = alert.status === "resolved";

                return (
                  <div
                    key={alert.id}
                    className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition ${
                      isResolved ? "bg-slate-900/15 border-slate-900 opacity-65" : theme.border
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Left vertical ribbon/glow bullet indicator */}
                      <span className={`w-2.5 h-10 rounded-full shrink-0 ${
                        isResolved ? "bg-slate-800" : (alert.severity === "critical" ? "bg-red-500 glow-red" : (alert.severity === "warning" ? "bg-amber-500 glow-yellow" : "bg-blue-500 glow-blue"))
                      }`} />

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-white text-sm sm:text-base">{alert.printerName}</h4>
                          <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded font-mono ${theme.badge}`}>
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-slate-300 text-xs mt-1">{alert.message}</p>
                        
                        <div className="flex items-center gap-4 mt-2 select-none text-[10px] text-slate-500 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Aberto: {new Date(alert.timestamp).toLocaleString("pt-BR")}
                          </span>
                          {isResolved && alert.resolvedAt && (
                            <span className="flex items-center gap-1 text-emerald-500">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Resolvido: {new Date(alert.resolvedAt).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Resolve button action */}
                    {!isResolved && (
                      <button
                        onClick={() => onResolveAlert(alert.id)}
                        className="cursor-pointer font-medium text-xs py-2 px-4 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 select-none shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Encerrar Incidente
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
