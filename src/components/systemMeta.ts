/**
 * Fonte única de verdade pra cor e nome de exibição de cada sistema.
 * Usado pela SystemTabs e pelo CartridgeShelf pra manter consistência.
 */
const SYSTEM_META: Record<string, { color: string; label: string }> = {
  snes: { color: "var(--system-snes)", label: "Super Nintendo" },
  nes: { color: "var(--system-nes)", label: "Nintendo (NES)" },
  psx: { color: "var(--system-psx)", label: "PlayStation" },
  n64: { color: "var(--system-n64)", label: "Nintendo 64" },
  gba: { color: "var(--system-gba)", label: "Game Boy Advance" },
  megadrive: { color: "var(--system-megadrive)", label: "Mega Drive" },
  arcade: { color: "var(--system-arcade)", label: "Arcade" },
};

/** Todos os consoles que o app sabe reconhecer — usado pelo menu de seleção de consoles. */
export const KNOWN_SYSTEM_IDS = Object.keys(SYSTEM_META);

export function systemColor(systemId: string): string {
  return SYSTEM_META[systemId]?.color ?? "var(--system-default)";
}

export function systemLabel(systemId: string): string {
  return SYSTEM_META[systemId]?.label ?? systemId.toUpperCase();
}
