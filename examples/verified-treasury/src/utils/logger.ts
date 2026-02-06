/**
 * Simple colored logger utility using ANSI escape codes.
 * Provides structured output for the CLI walkthrough.
 */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const WHITE = '\x1b[37m';
const MAGENTA = '\x1b[35m';

export const log = {
  /** Print a numbered step header */
  step(num: number, title: string): void {
    console.log(
      `\n${BOLD}${MAGENTA}=== Step ${num}: ${title} ===${RESET}\n`,
    );
  },

  /** Print a gray info line */
  info(msg: string): void {
    console.log(`${GRAY}  ${msg}${RESET}`);
  },

  /** Print a green success message */
  success(msg: string): void {
    console.log(`${GREEN}  [OK] ${msg}${RESET}`);
  },

  /** Print a red error message */
  error(msg: string): void {
    console.log(`${RED}  [ERROR] ${msg}${RESET}`);
  },

  /** Print a yellow warning */
  warn(msg: string): void {
    console.log(`${YELLOW}  [WARN] ${msg}${RESET}`);
  },

  /** Print a labeled data value (cyan label, white value) */
  data(label: string, value: string | number | boolean): void {
    console.log(`${CYAN}  ${label}: ${WHITE}${value}${RESET}`);
  },

  /** Print a horizontal divider */
  divider(): void {
    console.log(`${DIM}${'─'.repeat(60)}${RESET}`);
  },

  /** Print the Invariance banner */
  banner(): void {
    console.log(`
${BOLD}${CYAN}
  ╦╔╗╔╦  ╦╔═╗╦═╗╦╔═╗╔╗╔╔═╗╔═╗
  ║║║║╚╗╔╝╠═╣╠╦╝║╠═╣║║║║  ║╣
  ╩╝╚╝ ╚╝ ╩ ╩╩╚═╩╩ ╩╝╚╝╚═╝╚═╝
${RESET}
${BOLD}  Verified Agent Treasury${RESET}
${GRAY}  Policy-gated spending controls for autonomous agents${RESET}
${GRAY}  Network: Base Sepolia  |  SDK v2.0${RESET}
`);
  },
};
