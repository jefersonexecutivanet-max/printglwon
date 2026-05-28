export interface Printer {
  id: string;
  name: string;
  hostname?: string;
  ip: string;
  location?: string;
  model?: string;
  notes?: string;
  status: "online" | "offline" | "sleep_mode" | "warning" | "error" | "instável" | "instavel" | "sem_resposta" | "sem_ip" | "ip_invalido" | "local_usb";
  latency: number;
  lastChecked: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  consecutiveFailures?: number;
  currentMessage?: string;
  lastActivity?: string;
  uptimePercentage?: number;

  // Real spreadsheet and database fields
  setor?: string;
  tipo?: string;
  marca?: string;
  modelo?: string;
  tombo?: string;
  serial?: string;
  ultimaVerificacao?: string | null;
  responseTime?: number | null;
  mensagem?: string | null;

  // SNMP Counters
  totalPages?: number;
  colorPages?: number;
  monoPages?: number;
  scannerCount?: number;
  copyCount?: number;
}

export interface UsbInventoryEntry {
  id: string;
  name: string;
  model: string;
  serial: string;
  driver: string;
  host: string;
  createdAt: string; // ISO string
}

export interface EventLog {
  id: string;
  printerId: string;
  printerName: string;
  eventType: "status_change" | "config_change" | "incident" | "recovery";
  message: string;
  previousStatus?: string;
  currentStatus?: string;
  timestamp: string; // ISO string
}

export interface Alert {
  id: string;
  printerId: string;
  printerName: string;
  message: string;
  severity: "info" | "warning" | "critical";
  status: "active" | "resolved";
  timestamp: string; // ISO string
  resolvedAt?: string; // ISO string
}

export interface UserProfile {
  uid: string;
  email: string;
  role: "admin" | "viewer";
  createdAt: string; // ISO string
}
