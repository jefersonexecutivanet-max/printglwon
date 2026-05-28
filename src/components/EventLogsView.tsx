import React, { useState } from "react";
import { 
  FileClock, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertOctagon, 
  Settings, 
  RefreshCw,
  FileDown
} from "lucide-react";
import { EventLog } from "../types";

interface EventLogsViewProps {
  logs: EventLog[];
}

export default function EventLogsView({ logs }: EventLogsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Filtering
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.printerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === "all" || log.eventType === typeFilter;

    return matchesSearch && matchesType;
  });

  // Export logs to CSV
  const downloadLogsReport = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Impressora,Tipo_Evento,Mensagem,Timestamp\n";

    logs.forEach((log) => {
      const row = [
        `"${log.printerName}"`,
        `"${log.eventType}"`,
        `"${log.message}"`,
        `"${log.timestamp}"`,
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `historico_eventos_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="logs-tab-content">
      {/* Tab Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-medium text-2xl text-white">Log de Histórico de Eventos</h2>
          <p className="text-slate-400 text-sm">Registro sequencial de todas as mudanças de status, incidentes e reconfigurações do pool.</p>
        </div>
        <div>
          <button
            onClick={downloadLogsReport}
            className="cursor-pointer px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 transition flex items-center gap-2 select-none"
            id="btn-export-logs"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-400" />
            Exportar Logs em CSV
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow">
        {/* Top filter bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
          <div className="relative flex-grow w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por termo ou impressora no histórico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 focus:outline-none focus:border-blue-500/50 text-xs"
              id="input-search-logs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 select-none">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none cursor-pointer"
              id="select-filter-logs-type"
            >
              <option value="all">Todos os Eventos</option>
              <option value="status_change">Mudança de Status</option>
              <option value="config_change">Edição de Cadastro</option>
              <option value="incident">Incidentes (Quedas)</option>
              <option value="recovery">Recuperação (Retornos)</option>
            </select>
          </div>
        </div>

        {/* Timeline Log Grid */}
        <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
          {filteredLogs.length === 0 ? (
            <div className="py-24 text-center text-slate-500">
              <FileClock className="h-8 w-8 mx-auto text-slate-700 mb-2.5" />
              <p className="text-sm font-semibold text-slate-400">Sem correspondências no registro</p>
              <p className="text-slate-500 text-xs mt-1">Sua busca pode estar muito restrita.</p>
            </div>
          ) : (
            <div className="relative border-l border-slate-900 ml-4 pl-6 space-y-6 py-2">
              {filteredLogs.map((log) => {
                const getEventStyles = (type: string) => {
                  switch (type) {
                    case "incident":
                      return {
                        icon: AlertOctagon,
                        accent: "bg-red-500/10 border-red-500/20 text-red-400",
                        dot: "bg-red-500 border-red-400 glow-red"
                      };
                    case "recovery":
                      return {
                        icon: CheckCircle2,
                        accent: "bg-green-500/10 border-green-500/20 text-green-400",
                        dot: "bg-green-500 border-green-400 glow-green"
                      };
                    case "config_change":
                      return {
                        icon: Settings,
                        accent: "bg-amber-500/10 border-amber-500/20 text-amber-500",
                        dot: "bg-amber-500 border-amber-400 glow-yellow"
                      };
                    default:
                      return {
                        icon: RefreshCw,
                        accent: "bg-blue-500/10 border-blue-500/20 text-blue-400",
                        dot: "bg-blue-500 border-blue-400 glow-blue"
                      };
                  }
                };

                const style = getEventStyles(log.eventType);
                const IconComponent = style.icon;

                return (
                  <div key={log.id} className="relative group">
                    {/* Glowing status dot on left timeline axis */}
                    <span className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full border transition duration-300 ${style.dot}`} />
                    
                    <div className="p-4 bg-slate-900/30 border border-slate-900 rounded-xl hover:border-slate-800 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-lg text-xs font-mono font-bold ${style.accent}`}>
                            <IconComponent className="w-3.5 h-3.5" />
                          </span>
                          <h4 className="font-semibold text-white text-xs sm:text-sm">
                            {log.printerName}
                          </h4>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(log.timestamp).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      
                      <p className="text-slate-300 text-xs mt-2 font-sans pl-1">
                        {log.message}
                      </p>

                      {log.previousStatus && log.currentStatus && (
                        <div className="mt-2.5 flex items-center gap-2 pl-1 select-none text-[10px] uppercase font-mono tracking-wider text-slate-500">
                          <span>Status anterior: {log.previousStatus}</span>
                          <span>→</span>
                          <span className={log.currentStatus === "online" ? "text-green-400 font-semibold" : "text-red-500 font-semibold"}>
                            status atual: {log.currentStatus}
                          </span>
                        </div>
                      )}
                    </div>
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
