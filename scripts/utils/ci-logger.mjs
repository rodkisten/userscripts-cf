const { performance } = require('node:perf_hooks');

const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const supportsColor =
  !process.env.NO_COLOR &&
  (Boolean(process.env.FORCE_COLOR) || process.stdout.isTTY || isGitHubActions);

// ============================================================================
// ANSI Codes (Estilo Vitest: badges com fundo sólido + texto contrastante)
// ============================================================================
const code = (open, close) => (str) => (supportsColor ? `\x1b[${open}m${str}\x1b[${close}m` : String(str));

const ansi = {
  reset: code(0, 0),
  bold: code(1, 22),
  dim: code(2, 22),
  italic: code(3, 23),

  // Foreground
  black: code(30, 39),
  red: code(31, 39),
  green: code(32, 39),
  yellow: code(33, 39),
  blue: code(34, 39),
  magenta: code(35, 39),
  cyan: code(36, 39),
  white: code(37, 39),
  gray: code(90, 39),

  // Background
  bgRed: code(41, 49),
  bgGreen: code(42, 49),
  bgYellow: code(43, 49),
  bgBlue: code(44, 49),
  bgMagenta: code(45, 49),
  bgCyan: code(46, 49),
  bgWhite: code(47, 49),
};

const badge = {
  run: (label = 'RUN') => ansi.bold(ansi.bgCyan(ansi.black(` ${label} `))),
  pass: (label = 'PASS') => ansi.bold(ansi.bgGreen(ansi.black(` ${label} `))),
  warn: (label = 'WARN') => ansi.bold(ansi.bgYellow(ansi.black(` ${label} `))),
  fail: (label = 'FAIL') => ansi.bold(ansi.bgRed(ansi.white(` ${label} `))),
  info: (label = 'INFO') => ansi.bold(ansi.bgBlue(ansi.white(` ${label} `))),
  skip: (label = 'SKIP') => ansi.bold(ansi.bgMagenta(ansi.white(` ${label} `))),
  step: (label) => ansi.bold(ansi.bgWhite(ansi.black(` ${label} `))),
};

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ============================================================================
// Spinner para Terminal Local (TTY)
// ============================================================================
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class LocalSpinner {
  constructor(text) {
    this.text = text;
    this.frame = 0;
    this.startTime = performance.now();
    this.timer = null;
    this.active = Boolean(process.stdout.isTTY && !isCI);
  }

  start() {
    if (!this.active) return this;
    this.render();
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
    this.timer.unref?.();
    return this;
  }

  update(newText) {
    this.text = newText;
    if (this.active) this.render();
  }

  render() {
    const icon = ansi.cyan(SPINNER_FRAMES[this.frame]);
    const elapsed = ansi.dim(`(${formatDuration(performance.now() - this.startTime)})`);
    process.stdout.write(`\r\x1b[2K  ${icon} ${this.text} ${elapsed}`);
  }

  clearLine() {
    if (this.active) {
      process.stdout.write('\r\x1b[2K');
    }
  }

  stop(finalLine) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearLine();
    if (finalLine) {
      process.stdout.write(`${finalLine}\n`);
    }
  }
}

// ============================================================================
// Reporter Principal (CI + Local TUI)
// ============================================================================
class AgentReporter {
  constructor(title = 'PR PREVIEW AGENT', subtitle = '') {
    this.title = title;
    this.subtitle = subtitle;
    this.startTime = performance.now();
    this.activeSpinner = null;
  }

  banner() {
    const tag = badge.run(this.title);
    const sub = this.subtitle ? ` ${ansi.dim('·')} ${ansi.cyan(this.subtitle)}` : '';
    const mode = isGitHubActions
      ? ansi.dim('[GitHub Actions CI]')
      : isCI
        ? ansi.dim('[CI]')
        : ansi.dim('[Interactive TTY]');

    process.stdout.write(`\n${tag}${sub} ${mode}\n\n`);
  }

  _writeLine(line) {
    if (this.activeSpinner) {
      this.activeSpinner.clearLine();
    }
    process.stdout.write(`${line}\n`);
    if (this.activeSpinner) {
      this.activeSpinner.render();
    }
  }

  pass(title, detail = '') {
    const suffix = detail ? ` ${ansi.dim('→')} ${ansi.dim(detail)}` : '';
    this._writeLine(`  ${badge.pass()} ${ansi.bold(title)}${suffix}`);
  }

  info(title, detail = '') {
    const suffix = detail ? ` ${ansi.dim('·')} ${ansi.gray(detail)}` : '';
    this._writeLine(`  ${badge.info()} ${title}${suffix}`);
  }

  skip(title, reason = '') {
    const suffix = reason ? ` ${ansi.dim(`(${reason})`)}` : '';
    this._writeLine(`  ${badge.skip()} ${ansi.dim(title)}${suffix}`);
  }

  warn(title, detail = '') {
    const suffix = detail ? ` ${ansi.dim('→')} ${ansi.yellow(detail)}` : '';
    this._writeLine(`  ${badge.warn()} ${ansi.yellow(title)}${suffix}`);
    if (isGitHubActions) {
      process.stdout.write(`::warning::${title}${detail ? ` - ${detail}` : ''}\n`);
    }
  }

  fail(title, detail = '') {
    const suffix = detail ? ` ${ansi.dim('→')} ${ansi.red(detail)}` : '';
    this._writeLine(`  ${badge.fail()} ${ansi.red(ansi.bold(title))}${suffix}`);
    if (isGitHubActions) {
      process.stdout.write(`::error::${title}${detail ? ` - ${detail}` : ''}\n`);
    }
  }

  kvTable(rows) {
    const maxKeyLen = Math.max(...rows.map(([k]) => k.length));
    for (const [key, value] of rows) {
      const paddedKey = ansi.dim(key.padEnd(maxKeyLen));
      this._writeLine(`    ${paddedKey}  ${ansi.cyan(value)}`);
    }
  }

  /**
   * Executa uma etapa assíncrona com:
   * - ::group:: no GitHub Actions
   * - Spinner animado no terminal local
   */
  async step(label, fn) {
    const stepStart = performance.now();

    if (isGitHubActions) {
      process.stdout.write(`::group::${badge.step(label)}\n`);
    } else if (!isCI && process.stdout.isTTY) {
      this.activeSpinner = new LocalSpinner(ansi.bold(label)).start();
    } else {
      process.stdout.write(`${badge.run('STEP')} ${ansi.bold(label)}\n`);
    }

    const ctx = {
      status: (msg) => {
        if (this.activeSpinner) {
          this.activeSpinner.update(`${ansi.bold(label)} ${ansi.dim('·')} ${ansi.cyan(msg)}`);
        } else {
          this.info(msg);
        }
      },
      pass: (t, d) => this.pass(t, d),
      info: (t, d) => this.info(t, d),
      warn: (t, d) => this.warn(t, d),
      skip: (t, d) => this.skip(t, d),
      table: (rows) => this.kvTable(rows),
    };

    try {
      const result = await fn(ctx);
      const duration = ansi.dim(formatDuration(performance.now() - stepStart));

      if (this.activeSpinner) {
        this.activeSpinner.stop(`${badge.pass('DONE')} ${ansi.bold(label)} ${duration}`);
        this.activeSpinner = null;
      } else {
        process.stdout.write(`  ${badge.pass('DONE')} ${ansi.bold(label)} ${duration}\n`);
      }

      if (isGitHubActions) {
        process.stdout.write('::endgroup::\n');
      }

      return result;
    } catch (err) {
      const duration = ansi.dim(formatDuration(performance.now() - stepStart));

      if (this.activeSpinner) {
        this.activeSpinner.stop(`${badge.fail('FAIL')} ${ansi.bold(label)} ${duration}`);
        this.activeSpinner = null;
      } else {
        process.stdout.write(`  ${badge.fail('FAIL')} ${ansi.bold(label)} ${duration}\n`);
      }

      if (isGitHubActions) {
        process.stdout.write(`::error::${err.message}\n`);
        process.stdout.write('::endgroup::\n');
      }

      throw err;
    }
  }

  summary(status = 'success', metrics = {}) {
    const total = formatDuration(performance.now() - this.startTime);
    const header =
      status === 'success'
        ? badge.pass('SUCCESS')
        : status === 'warn'
          ? badge.warn('COMPLETED WITH WARNINGS')
          : badge.fail('FAILED');

    process.stdout.write(`\n${header} ${ansi.dim('in')} ${ansi.bold(total)}\n`);

    const entries = Object.entries(metrics);
    if (entries.length > 0) {
      this.kvTable(entries);
    }
    process.stdout.write('\n');
  }
}

module.exports = {
  AgentReporter,
  ansi,
  badge,
  isCI,
  isGitHubActions,
};
