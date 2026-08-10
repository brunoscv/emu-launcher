import type { GamepadProfile } from "./types";

const STORAGE_KEY = "emu-launcher:gamepad-profiles";

/**
 * Por enquanto usa localStorage (funciona idêntico no modo web e dentro
 * do WebView do Tauri). Se depois você quiser que o perfil sobreviva a
 * "limpar dados do navegador" no modo nativo, dá pra trocar essa
 * implementação por um comando Rust (`save_gamepad_profile` /
 * `load_gamepad_profiles`) que escreve num JSON em ~/.config/ — a
 * interface abaixo não muda, só a implementação por dentro.
 */
function loadAll(): Record<string, GamepadProfile> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(profiles: Record<string, GamepadProfile>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function getProfile(deviceId: string): GamepadProfile | null {
  return loadAll()[deviceId] ?? null;
}

export function saveProfile(profile: GamepadProfile): void {
  const all = loadAll();
  all[profile.deviceId] = profile;
  saveAll(all);
}

export function deleteProfile(deviceId: string): void {
  const all = loadAll();
  delete all[deviceId];
  saveAll(all);
}

export function listProfiles(): GamepadProfile[] {
  return Object.values(loadAll());
}
