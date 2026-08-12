import type { KeyboardLayout } from "./types";

const STORAGE_KEY = "emu-launcher:keyboard-layouts";

/** Mesmo padrão do `gamepad/storage.ts` — localStorage por ora, chave por
 * número do jogador (1 ou 2) em vez de device id. */
function loadAll(): Record<number, KeyboardLayout> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(layouts: Record<number, KeyboardLayout>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export function getLayout(player: 1 | 2): KeyboardLayout | null {
  return loadAll()[player] ?? null;
}

export function saveLayout(layout: KeyboardLayout): void {
  const all = loadAll();
  all[layout.player] = layout;
  saveAll(all);
}

export function deleteLayout(player: 1 | 2): void {
  const all = loadAll();
  delete all[player];
  saveAll(all);
}

export function listLayouts(): KeyboardLayout[] {
  return Object.values(loadAll());
}
