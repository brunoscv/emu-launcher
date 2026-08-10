// Espelha as structs Serde em src-tauri/src/scanner.rs e systems.rs.
// Mantenha os dois em sincronia manualmente por enquanto; se o projeto
// crescer, vale gerar isso automaticamente com specta ou ts-rs.

export interface RomEntry {
  name: string;
  path: string;
  extension: string;
  system: string;
  size_bytes: number;
}

export interface SystemDefinition {
  id: string;
  display_name: string;
  emulator_path: string;
  extra_args: string[];
}

export interface SystemConfig {
  system_id: string;
  enabled: boolean;
  rom_folder: string | null;
}

export interface ReindexResult {
  roms: RomEntry[];
  warnings: string[];
}

export interface PlayerCount {
  rom_path: string;
  max_players: number;
}

export interface EnrichProgress {
  checked: number;
  total: number;
}

export interface EnrichResult {
  checked: number;
  found: number;
}

export interface LaunchResult {
  started: boolean;
  pid: number | null;
}

export interface EmulatorClosedPayload {
  exit_code: number | null;
  rom_path: string;
}
