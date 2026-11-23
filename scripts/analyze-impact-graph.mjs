import { existsSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { basename, dirname, extname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
const toPosix = (p) => p.split('\\').join('/');
const escapeMermaidLabel = (text) => text.replaceAll('"', '&quot;');
const logger = {
 banner: (...args) => console.log(...args),
 step: async (label, callback) => { console.log(label); return callback(); },
 item: (...args) => console.log(...args),
 divider: () => {},
 success: (...args) => console.log(...args),
};
const style = { bold: (value) => value };
const cmd = async (command, args) => {
 try { return { exitCode: 0, stdout: execFileSync(command, args, { encoding: 'utf8' }) }; }
 catch (error) { return { exitCode: error.status || 1, stdout: error.stdout?.toString() || '' }; }
};
const setOutputs = (values) => {
 if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key,value]) => key + '=' + String(value) + '\n').join(''));
};
const summary = {
 heading(text) { this.lines = [text]; return this; },
 text(text) { this.lines.push(text); return this; },
 code(text, lang) { this.lines.push('\\`\\`\\`' + lang + '\n' + text + '\n\\`\\`\\`'); return this; },
 write() { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, this.lines.join('\n') + '\n'); },
};
function walkTests(dir, acc = []) {
 if (!existsSync(dir)) return acc;
 for (const entry of readdirSync(dir)) {
  const full = dir + '/' + entry;
  if (statSync(full).isDirectory()) walkTests(full, acc);
  else if (/\.(test|spec)\\.(js|ts|mjs|mts|jsx|tsx)$/.test(entry)) acc.push(toPosix(full));
 }
 return acc;
}
(async () => {
  const baseRef = (process.env.BASE_REF || 'main').trim();
  logger.banner('Impact & Test Map', `Base: ${baseRef}`);

  const { diffTarget, rawChanged } = await logger.step('Resolve Git diff in src/', async () => {
    await cmd('git', ['fetch', 'origin', baseRef, '--depth=1']).nothrow();

    const originVerify = await cmd('git', ['rev-parse', '--verify', `origin/${baseRef}`]).nothrow();
    const target =
      originVerify.exitCode === 0
        ? originVerify.stdout.trim()
        : (await cmd('git', ['rev-parse', '--verify', baseRef])).stdout.trim();

    const diffRes = await cmd('git', [
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      `${target}...HEAD`,
      '--',
      'src',
    ]);

    const changed = diffRes.stdout
      .split(/\r?\n/)
      .map(toPosix)
      .filter((f) => f && /\.(js|ts|mjs|mts|jsx|tsx)$/.test(f));

    logger.item('Base SHA', `${target.slice(0, 7)} (${baseRef})`);
    logger.item('Changed files in src/', changed.length, true);

    return { diffTarget: target, rawChanged: changed };
  });

  const { folders, matchedNodeTests } = await logger.step('Map affected scopes & tests', () => {
    const allTestFiles = [...new Set([...walkTests('src'), ...walkTests('tests')])];
    const grouped = new Map();
    const tests = new Set();

    for (const file of rawChanged) {
      const rel = toPosix(relative('src', file));
      const parts = rel.split('/');
      const folder = parts.length > 1 ? `src/${parts[0]}` : 'src (raiz)';

      if (!grouped.has(folder)) {
        grouped.set(folder, { sourceFiles: [], testFiles: [] });
      }

      const bucket = grouped.get(folder);
      const isTest = /\.(test|spec)\./.test(file);

      if (isTest) {
        bucket.testFiles.push(file);
        tests.add(file);
      } else {
        bucket.sourceFiles.push(file);
        const stem = basename(file, extname(file));
        const fileDir = toPosix(dirname(file));
        const mirroredDir = fileDir.replace(/^src(?=\/|$)/, 'tests');

        const related = allTestFiles.filter((t) => {
          const testDir = toPosix(dirname(t));
          return (
            basename(t).startsWith(`${stem}.`) ||
            testDir === fileDir ||
            testDir === mirroredDir
          );
        });

        for (const testFile of related) {
          bucket.testFiles.push(testFile);
          tests.add(testFile);
        }
      }
    }

    logger.item('Affected scopes', grouped.size);
    logger.item('Related test files', tests.size, true);

    return { folders: grouped, matchedNodeTests: tests };
  });

  const mermaid = [
    'flowchart LR',
    '  classDef folder fill:#1e293b,stroke:#38bdf8,color:#f8fafc,stroke-width:2px;',
    '  classDef src fill:#0f172a,stroke:#94a3b8,color:#e2e8f0;',
    '  classDef test fill:#064e3b,stroke:#34d399,color:#ecfdf5;',
  ];
  let nodeIdx = 0;

  if (folders.size === 0) {
    mermaid.push('  empty["✅ Nenhuma modificação encontrada em src/"]');
  } else {
    for (const [folder, { sourceFiles, testFiles }] of folders.entries()) {
      const fId = `folder_${nodeIdx++}`;
      mermaid.push(`  subgraph ${fId}["📁 ${escapeMermaidLabel(folder)}"]`);
      mermaid.push('    direction TB');

      const srcIds = [...new Set(sourceFiles)].map((s) => {
        const id = `src_${nodeIdx++}`;
        mermaid.push(`    ${id}["📄 ${escapeMermaidLabel(basename(s))}"]:::src`);
        return id;
      });

      const testIds = [...new Set(testFiles)].map((t) => {
        const id = `tst_${nodeIdx++}`;
        mermaid.push(`    ${id}(["🧪 ${escapeMermaidLabel(basename(t))}"]):::test`);
        return id;
      });

      mermaid.push('  end');
      mermaid.push(`  class ${fId} folder`);

      if (srcIds.length > 0 && testIds.length > 0) {
        for (const sId of srcIds) {
          for (const tId of testIds) {
            mermaid.push(`  ${sId} -.-> ${tId}`);
          }
        }
      }
    }
  }

  logger.divider('Outputs & Job Summary');

  setOutputs({
    has_files: rawChanged.length > 0,
    changed_files: rawChanged.join(' '),
    node_tests: [...matchedNodeTests].join(' '),
  });

  await summary
    .heading('📊 Mapa de Impacto & Testes Relacionados', 2)
    .text(
      `**Base comparada:** \`${baseRef}\` (\`${diffTarget.slice(0, 7)}\`) · **Arquivos modificados em \`src/\`:** \`${rawChanged.length}\``
    )
    .code(mermaid.join('\n'), 'mermaid')
    .write();

  logger.success(
    `Mapped ${style.bold(`${rawChanged.length} file(s)`)} across ${style.bold(`${folders.size} scope(s)`)}`
  );
  logger.divider('', '═');
})().catch((error) => { console.error(error); process.exitCode = 1; });