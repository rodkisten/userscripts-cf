export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m",
  bgRed: "\x1b[41m\x1b[37m",
  bgMagenta: "\x1b[45m\x1b[37m",
};

export const fmt = {
  duration: (ms) => (ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`),
  bytes: (b) => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} kB`),
  badge: (label, bg = C.bgCyan) => `${bg}${C.bold} ${label} ${C.reset}`,
  dim: (str) => `${C.dim}${str}${C.reset}`,
  bold: (str) => `${C.bold}${str}${C.reset}`,
  cyan: (str) => `${C.cyan}${str}${C.reset}`,
  green: (str) => `${C.green}${str}${C.reset}`,
  yellow: (str) => `${C.yellow}${str}${C.reset}`,
  red: (str) => `${C.red}${str}${C.reset}`,
};
