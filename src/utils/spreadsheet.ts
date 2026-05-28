import * as XLSX from "xlsx";

export interface ImportedPrinter {
  setor: string;
  tipo: string;
  marca: string;
  modelo: string;
  tombo: string;
  serial: string;
  ip: string;
  rawIp?: string;
  validationStatus: "valid" | "corrected" | "invalid";
  errors: string[];
  
  // Backward compatibility fields
  name: string;
  hostname: string;
  location: string;
  model: string;
  notes: string;
}

function cleanValue(val: any): string {
  if (val === undefined || val === null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.substring(1, s.length - 1).trim();
  } else if (s.startsWith("'") && s.endsWith("'")) {
    s = s.substring(1, s.length - 1).trim();
  }
  return s;
}

function splitCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  let delimiter = ",";
  if (line.includes(";")) {
    const commaCount = (line.match(/,/g) || []).length;
    const semiCount = (line.match(/;/g) || []).length;
    if (semiCount > commaCount) {
      delimiter = ";";
    }
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function validateIPAddress(ipStr: string): boolean {
  if (!ipStr) return false;
  const regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/;

  return regex.test(ipStr.trim());
}

export function isLocalUsbIp(ip?: string): boolean {
  const clean = String(ip || "").trim().toUpperCase();
  if (clean === "" || clean === "SEMREDE" || clean === "USB" || clean === "LOCAL") {
    return true;
  }
  return !validateIPAddress(clean);
}

export function buildPrinterFromRow(row: { [key: string]: string }): ImportedPrinter {
  let setor = "";
  let tipo = "Multifuncional"; // Default backup group
  let marca = "";
  let modelo = "";
  let tombo = "";
  let serial = "";
  let ip = "";
  let rawIp = "";

  Object.keys(row).forEach((key) => {
    const cleanKey = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const val = cleanValue(row[key]);

    if (cleanKey === "setor" || cleanKey === "localizacao" || cleanKey === "local" || cleanKey === "location") {
      setor = val;
    } else if (cleanKey === "tipo" || cleanKey === "type" || cleanKey === "equipamento") {
      tipo = val || tipo;
    } else if (cleanKey === "marca" || cleanKey === "brand" || cleanKey === "fabricante") {
      marca = val;
    } else if (cleanKey === "modelo" || cleanKey === "model") {
      modelo = val;
    } else if (cleanKey === "tombo" || cleanKey === "patrimonio" || cleanKey === "placa") {
      tombo = val;
    } else if (cleanKey === "numerodeserie" || cleanKey === "ndeserie" || cleanKey === "serie" || cleanKey === "serial" || cleanKey === "numeroserie" || cleanKey === "sn") {
      serial = val;
    } else if (cleanKey === "ip" || cleanKey === "endereco" || cleanKey === "enderecoip") {
      ip = val;
      rawIp = val;
    }
  });

  const errors: string[] = [];
  let validationStatus: "valid" | "corrected" | "invalid" = "valid";

  // Check mandatory fields
  if (!setor) errors.push("Setor é obrigatório.");
  if (!marca) errors.push("Marca é obrigatória.");
  if (!modelo) errors.push("Modelo é obrigatório.");
  if (!serial) errors.push("Número de Série é obrigatório.");

  // Intelligent IP validation and local inventory detection
  let finalIp = ip.trim().replace(/\s+/g, "");
  const isLocal = isLocalUsbIp(finalIp);

  if (isLocal) {
    tipo = "LOCAL_USB";
    validationStatus = "valid";
  } else {
    const hasDoubleDots = finalIp.includes("..");
    if (hasDoubleDots) {
      while (finalIp.includes("..")) {
        finalIp = finalIp.replace(/\.\./g, ".");
      }
    }

    if (!validateIPAddress(finalIp)) {
      tipo = "LOCAL_USB";
      validationStatus = "valid";
    } else if (hasDoubleDots) {
      validationStatus = "corrected";
    }
  }

  if (errors.length > 0 && validationStatus !== "corrected") {
    // If there were actual blocking errors (e.g., missing critical fields or completely malformed IP)
    validationStatus = "invalid";
  }

  // Create friendly backward compatibility fields
  const friendlyName = `${marca} ${modelo} - ${setor}`;

  return {
    setor,
    tipo,
    marca,
    modelo,
    tombo,
    serial,
    ip: finalIp,
    rawIp,
    validationStatus,
    errors,

    // Compat:
    name: friendlyName,
    hostname: "",
    location: setor,
    model: `${marca} ${modelo}`,
    notes: [
      tipo ? `Tipo: ${tipo}` : "",
      tombo ? `Tombo: ${tombo}` : "",
      serial ? `S/N: ${serial}` : ""
    ].filter(Boolean).join(" | ")
  };
}

export function parseCSVText(text: string): ImportedPrinter[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const rawHeaders = splitCSVRow(lines[0]).map(cleanValue);
  const printers: ImportedPrinter[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawValues = splitCSVRow(lines[i]).map(cleanValue);
    const rowObj: { [key: string]: string } = {};

    rawHeaders.forEach((header, index) => {
      rowObj[header] = rawValues[index] !== undefined ? rawValues[index] : "";
    });

    const parsed = buildPrinterFromRow(rowObj);
    // Ignore rows where literally all values are empty
    if (parsed.setor || parsed.marca || parsed.modelo || parsed.serial || parsed.ip) {
      printers.push(parsed);
    }
  }

  return printers;
}

export function parseExcelFile(file: File): Promise<ImportedPrinter[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve([]);
          return;
        }
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json<any>(sheet);

        const printers: ImportedPrinter[] = [];

        rawJson.forEach((row) => {
          const rowObj: { [key: string]: string } = {};
          Object.keys(row).forEach((key) => {
            rowObj[key] = String(row[key]).trim();
          });

          const parsed = buildPrinterFromRow(rowObj);
          if (parsed.setor || parsed.marca || parsed.modelo || parsed.serial || parsed.ip) {
            printers.push(parsed);
          }
        });

        resolve(printers);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
