import process from 'node:process';
import { AgentReporter, ansi, isGitHubActions } from './ci-logger.mjs';

function escapeGitHubAnnotation(value) {
  return String(value ?? '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

/**
 * Envolve a execução de uma action/script de CI com lifecycle padronizado,
 * captura de exceções não tratadas, exitCode adequado e resumo automático em caso de falha.
 *
 * @param {string} name Nome da action exibido nos logs e anotações
 * @param {(ctx: { log: AgentReporter }) => Promise<unknown> | unknown} handler
 */
export async function runAction(name, handler) {
  const log = new AgentReporter(name);

  try {
    return await handler({ log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : '';

    if (isGitHubActions) {
      process.stdout.write(`::error::${escapeGitHubAnnotation(`[${name}] ${message}`)}\n`);
    }

    log.fail(`${name} failed`, message);

    if (stack) {
      const trace = stack.split('\n').slice(1).join('\n');
      if (trace) {
        process.stderr.write(`${ansi.dim(trace)}\n`);
      }
    }

    log.summary('fail', {
      Action: name,
      Error: message,
    });

    process.exitCode = typeof err?.exitCode === 'number' ? err.exitCode : 1;
    return undefined;
  }
}
