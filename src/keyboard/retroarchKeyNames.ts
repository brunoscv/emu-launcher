/**
 * Tradução `KeyboardEvent.code` (nome do browser) → nome de tecla que o
 * RetroArch entende no `retroarch.cfg`/`--appendconfig`
 * (`input_player{N}_{botão} = "{tecla}"`). Cobre o teclado padrão — o
 * suficiente pra configurar Player 1/2 de SNES/NES/PSX (sem numpad
 * dedicado, a maioria dos notebooks não tem).
 *
 * Confirmado na prática (11/08/2026, ver IDEAS.md #009): letras, dígitos,
 * setas, enter, rshift e f1 já foram usados de verdade num `retroarch.cfg`
 * real e funcionaram (calibração manual do Player 2 durante os testes de
 * multiplayer). O resto da tabela segue a mesma convenção observada
 * (nome descritivo em minúsculo), mas não foi testado tecla por tecla.
 */
export const KEY_CODE_TO_RETROARCH: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Space: "space",
  Escape: "escape",
  Tab: "tab",
  Backspace: "backspace",
  ShiftLeft: "shift",
  ShiftRight: "rshift",
  ControlLeft: "ctrl",
  ControlRight: "rctrl",
  AltLeft: "alt",
  AltRight: "ralt",
  CapsLock: "capslock",
  Insert: "insert",
  Delete: "del",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Comma: "comma",
  Period: "period",
  Slash: "slash",
  Semicolon: "semicolon",
  Quote: "quote",
  BracketLeft: "leftbracket",
  BracketRight: "rightbracket",
  Backslash: "backslash",
  Minus: "minus",
  Equal: "equals",
  Backquote: "backquote",
  ...Object.fromEntries(
    "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => [`Key${letter.toUpperCase()}`, letter])
  ),
  ...Object.fromEntries(
    "0123456789".split("").map((digit) => [`Digit${digit}`, digit])
  ),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [`F${n}`, `f${n}`])),
};

/**
 * Teclas que o RetroArch já usa como hotkey GLOBAL por padrão (não são
 * por-jogador) — ver `input_hold_fast_forward`/`input_menu_toggle`/etc no
 * `retroarch.cfg`. Escolher uma dessas pra um botão de jogador faz os dois
 * dispararem juntos (bug real encontrado e corrigido durante os testes de
 * multiplayer de hoje — Player 2 com A="l" também acionava "hold fast
 * forward" toda vez que apertava A). Assume a instalação gerenciada padrão
 * (`ensure_retroarch_installed`, sempre a mesma versão fixa) sem hotkeys
 * customizadas manualmente pelo usuário no menu do RetroArch.
 *
 * Só um AVISO, não bloqueio (decisão do Bruno, 11/08/2026): algumas teclas
 * "óbvias" de movimento (WASD, por exemplo) colidem com hotkey — travar de
 * vez tiraria opções razoáveis do usuário. Quem calibra decide se quer
 * usar mesmo assim (ver `KeyboardCalibration.tsx`).
 */
export const RESERVED_HOTKEYS: Record<string, string> = {
  escape: "Sair do emulador",
  k: "Avançar 1 frame",
  l: "Avançar rápido (segurar)",
  e: "Câmera lenta (segurar)",
  f4: "Carregar estado salvo",
  f1: "Abrir menu do RetroArch",
  p: "Pausar",
  h: "Reiniciar o jogo",
  r: "Rebobinar (rewind)",
  f2: "Salvar estado",
  f8: "Capturar tela",
  m: "Próximo shader",
  n: "Shader anterior",
  space: "Avançar rápido (alternar)",
  f: "Tela cheia (alternar)",
};
