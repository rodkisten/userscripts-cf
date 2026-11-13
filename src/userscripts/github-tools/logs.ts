export type StepAddress = { owner: string; repo: string; jobId: string; stepNumber: number };

export function stepLogURL(step: StepAddress) {
  if (!/^\d+$/.test(step.jobId) || !Number.isSafeInteger(step.stepNumber) || step.stepNumber < 1)
    throw Error("Step ou job inválido");
  return `https://api.github.com/repos/${encodeURIComponent(step.owner)}/${encodeURIComponent(step.repo)}/actions/jobs/${step.jobId}/steps/${step.stepNumber}/logs`;
}

// Fetch the complete server log. The rendered UI is virtualized and cannot be
// used as a fallback without silently losing lines or collapsed groups.
export async function loadStepOutput(step: StepAddress, token = "", signal?: AbortSignal) {
  const response = await fetch(stepLogURL(step), {
    credentials: "omit",
    redirect: "follow",
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw Error("Configure um token GitHub com Actions: read no menu do userscript.");
    if (response.status === 404 || response.status === 410)
      throw Error("Log ainda indisponível, expirado ou sem acesso. Tente após o step terminar.");
    throw Error(`GitHub HTTP ${response.status}`);
  }
  const text = await response.text();
  if (/text\/html|application\/json/i.test(response.headers.get("content-type") || ""))
    throw Error("GitHub não retornou um arquivo de log.");
  if (!text.trim()) throw Error("Este step ainda não possui output.");
  return text;
}

export function stepNumber(element: Element): number | null {
  const raw =
    element.getAttribute("data-step-number") ||
    element.getAttribute("data-number") ||
    element.id.match(/^step:(\d+)(?::|$)/)?.[1] ||
    element.querySelector('[id^="step:"]')?.id.match(/^step:(\d+)(?::|$)/)?.[1];
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function navigationSize(width: number, count: number) {
  const slot = Math.max(1, width) / Math.max(1, count);
  return {
    slot,
    font: Math.max(10, Math.min(14, slot / 7)),
    padding: Math.max(0, Math.min(10, slot / 12)),
    iconsOnly: slot < 66,
  };
}
