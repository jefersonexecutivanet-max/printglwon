import React from "react";
import { 
  Printer, 
  LayoutDashboard, 
  FileClock, 
  BellRing, 
  Power, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  RefreshCw,
  Sparkles,
  Cpu
} from "lucide-react";
import { motion } from "motion/react";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: any;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onLogout: () => void;
  printersCount: number;
  activeAlertsCount: number;
  triggerGlobalScan: () => void;
  isScanning: boolean;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  user,
  demoMode,
  setDemoMode,
  soundEnabled,
  setSoundEnabled,
  onLogout,
  printersCount,
  activeAlertsCount,
  triggerGlobalScan,
  isScanning,
}: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "printers", label: "Impressoras", icon: Printer, badge: printersCount },
    { id: "usb_inventory", label: "Inventário USB", icon: Cpu },
    { id: "logs", label: "Histórico", icon: FileClock },
    { id: "alerts", label: "Alertas Ativos", icon: BellRing, badge: activeAlertsCount, badgeColor: "bg-red-500" },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-900 flex flex-col justify-between h-screen sticky top-0" id="admin-sidebar">
      {/* Top Brand Block */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/10 border border-blue-500/20 rounded-lg text-blue-400">
            <Printer className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-white leading-tight">PrintGlow</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Monitoramento Pro</p>
          </div>
        </div>

        {/* Global Action Varredura */}
        <div className="mt-6">
          <button
            onClick={triggerGlobalScan}
            disabled={isScanning}
            className={`w-full py-2.5 px-4 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 select-none ${
              isScanning ? "opacity-70 cursor-not-allowed" : ""
            }`}
            id="btn-sidebar-scan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-blue-400" : "text-slate-400"}`} />
            {isScanning ? "Verificando Rede..." : "Varredura de Rede"}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="mt-8 space-y-1.5">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer select-none ${
                  isActive 
                    ? "bg-slate-900 text-white border-l-2 border-blue-500 font-semibold" 
                    : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                }`}
                id={`sidebar-tab-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <IconComponent className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${item.badgeColor || "bg-slate-800"}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center Settings & Sandbox Banner */}
      <div className="px-4 py-2 space-y-3">
        {/* Toggle sound warnings */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-blue-400" /> : <VolumeX className="h-3.5 w-3.5 text-slate-500" />}
              Chime Sonoro
            </span>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`w-8 h-4 rounded-full transition-colors relative duration-200 cursor-pointer ${
                soundEnabled ? "bg-blue-600" : "bg-slate-700"
              }`}
              id="btn-toggle-sound"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${
                  soundEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Demo Mode Module */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className={`h-3.5 w-3.5 ${demoMode ? "text-amber-400 animate-spin" : "text-slate-500"}`} />
              Simulador Ativo
            </span>
            <button
              onClick={() => setDemoMode(!demoMode)}
              className={`w-8 h-4 rounded-full transition-colors relative duration-200 cursor-pointer ${
                demoMode ? "bg-amber-500" : "bg-slate-700"
              }`}
              id="btn-toggle-demo"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${
                  demoMode ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mt-1 leading-normal">
            Simula flutuações e logs de latência em tempo real para fins de teste.
          </p>
        </div>
      </div>

      {/* Footer User Info */}
      <div className="p-4 border-t border-slate-900 bg-slate-950/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-300 font-bold text-xs shrink-0 aspect-square">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="profile" referrerPolicy="no-referrer" className="w-full h-full rounded-full" />
              ) : (
                (user?.email || "U").substring(0, 1).toUpperCase()
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate text-ellipsis">
                {user?.displayName || "Administrador"}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {user?.email || "admin@printglow.com"}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Desconectar"
            className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded-lg transition shrink-0 cursor-pointer"
            id="btn-sidebar-logout"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
