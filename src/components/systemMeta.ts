/**
 * Fonte única de verdade pra cor, nome de exibição e ano de lançamento de
 * cada sistema. Usado pelo ConsoleCarousel e pelo menu de configurar
 * consoles pra manter consistência.
 */
const SYSTEM_META: Record<string, { color: string; label: string; year: number | null }> = {
  snes: { color: "var(--system-snes)", label: "Super Nintendo", year: 1990 },
  nes: { color: "var(--system-nes)", label: "Nintendo (NES)", year: 1983 },
  psx: { color: "var(--system-psx)", label: "PlayStation", year: 1994 },
  n64: { color: "var(--system-n64)", label: "Nintendo 64", year: 1996 },
  gba: { color: "var(--system-gba)", label: "Game Boy Advance", year: 2001 },
  megadrive: { color: "var(--system-megadrive)", label: "Mega Drive", year: 1988 },
  arcade: { color: "var(--system-arcade)", label: "Arcade", year: null },
};

/** Todos os consoles que o app sabe reconhecer — usado pelo carrossel e pelo menu de seleção. */
export const KNOWN_SYSTEM_IDS = Object.keys(SYSTEM_META);

export function systemColor(systemId: string): string {
  return SYSTEM_META[systemId]?.color ?? "var(--system-default)";
}

export function systemLabel(systemId: string): string {
  return SYSTEM_META[systemId]?.label ?? systemId.toUpperCase();
}

/** `null` quando o sistema não tem um ano único (ex: Arcade, várias gerações). */
export function systemYear(systemId: string): number | null {
  return SYSTEM_META[systemId]?.year ?? null;
}
