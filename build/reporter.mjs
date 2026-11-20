import { performance } from "node:perf_hooks";
import { C, fmt } from "./format.mjs";

const isCI = Boolean(process.env.GITHUB_ACTIONS);

export class BuildReporter {
  constructor(title, version) {
    this.title = title;
    this.version = version;
    this.startTime = performance.now();
    this.steps = [];
  }

  banner() {
    console.log(
      `\n ${fmt.badge("BUILD", C.bgCyan)} ${fmt.bold(this.title)} ${fmt.dim(`v${this.version}`)} ${isCI ? fmt.badge("CI", C.bgMagenta) : ""}\n`,
    );
  }

  /**
   * Executa um step isolado no estilo suite do Vitest com medição automática,
   * tratamento de erro e ::group:: no GitHub Actions.
   */
  async step(name, fn) {
    const stepIndex = this.steps.length + 1;
    const stepStart = performance.now();
    const header = `${fmt.cyan("❯")} ${fmt.bold(name)}`;

    if (isCI) {
      console.log(`::group::${header}`);
    } else {
      console.log(` ${header}`);
    }

    const ctx = {
      pass: (label, meta = "") => {
        const suffix = meta ? ` ${fmt.dim(meta)}` : "";
        console.log(`   ${fmt.green("✓")} ${label}${suffix}`);
      },
      skip: (label, reason = "") => {
        const suffix = reason ? ` ${fmt.dim(`(${reason})`)}` : "";
        console.log(`   ${fmt.yellow("↓")} ${fmt.dim(label)}${suffix}`);
      },
      info: (label, value = "") => {
        const val = value !== "" ? ` ${fmt.cyan(String(value))}` : "";
        console.log(`   ${fmt.dim("·")} ${fmt.dim(label)}${val}`);
      },
      warn: (msg) => {
        if (isCI) console.log(`::warning::${msg}`);
        else console.log(`   ${fmt.yellow("⚠")} ${fmt.yellow(msg)}`);
      },
      table: (title, rows) => {
        if (!rows.length) return;
        console.log(`\n   ${fmt.dim("┌─")} ${fmt.bold(title)}`);
        console.table(rows);
      },
    };

    try {
      const result = await fn(ctx);
      const elapsed = performance.now() - stepStart;
      this.steps.push({ index: stepIndex, name, status: "passed", elapsed });

      console.log(
        ` ${fmt.green("✓")} ${fmt.dim(name)} ${fmt.dim(`(${fmt.duration(elapsed)})`)}\n`,
      );
      if (isCI) console.log("::endgroup::");
      return result;
    } catch (err) {
      const elapsed = performance.now() - stepStart;
      this.steps.push({ index: stepIndex, name, status: "failed", elapsed });

      if (isCI) {
        console.error(`::error title=${name}::${err.message}`);
        console.log("::endgroup::");
      }
      console.error(
        `\n ${fmt.badge("FAIL", C.bgRed)} ${fmt.bold(name)} ${fmt.dim(`(${fmt.duration(elapsed)})`)}`,
      );
      console.error(`   ${fmt.red("×")} ${fmt.red(err.stack || err.message)}\n`);
      throw err;
    }
  }

  summary(metrics = {}) {
    const totalMs = performance.now() - this.startTime;
    const passed = this.steps.filter((s) => s.status === "passed").length;

    console.log(fmt.dim(" ─────────────────────────────────────────────────────────────"));
    console.log(
      ` ${fmt.bold("Steps")}      ${fmt.green(`${passed} passed`)} ${fmt.dim(`(${this.steps.length})`)}`,
    );
    for (const [key, val] of Object.entries(metrics)) {
      console.log(` ${fmt.bold(key.padEnd(10))} ${fmt.cyan(String(val))}`);
    }
    console.log(
      ` ${fmt.bold("Duration")}   ${fmt.bold(fmt.duration(totalMs))} ${fmt.dim(`(at ${new Date().toTimeString().slice(0, 8)})`)}\n`,
    );
  }
}
