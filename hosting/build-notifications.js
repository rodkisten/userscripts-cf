const RELAY_URL = "https://xtelegram-cf.migos.club/notifications/send";

function statusFrom(payload) {
  const event = payload?.data ?? payload?.event ?? payload;
  const raw = String(event?.status ?? event?.build_status ?? event?.outcome ?? event?.result ?? "unknown").toLowerCase();
  const ok = ["success", "successful", "succeeded", "completed", "passed"].includes(raw);
  const failed = ["failed", "failure", "error", "errored", "canceled", "cancelled"].includes(raw);
  if (!ok && !failed) return null;

  const branch = event?.branch ?? event?.branch_name ?? event?.git?.branch ?? "unknown";
  const commit = event?.commit_sha ?? event?.commit ?? event?.git?.commit_sha ?? "unknown";
  const project = event?.worker_name ?? event?.project_name ?? event?.name ?? "userscripts-cf";
  const url = event?.build_url ?? event?.url ?? event?.dashboard_url;
  const error = event?.error?.message ?? event?.error_message ?? event?.message;
  const lines = [
    ok ? "✅ Cloudflare Build concluído" : "❌ Cloudflare Build falhou",
    "",
    `📦 Projeto: ${String(project).slice(0, 100)}`,
    `🌿 Branch: ${String(branch).slice(0, 100)}`,
    `📍 Status: ${raw.toUpperCase()}`,
    `📝 Commit: ${String(commit).slice(0, 12)}`,
  ];
  if (failed && error) {
    lines.push(`⚠️ Erro: ${String(error).slice(0, 600)}`);
  }
  if (url && /^https:\/\//.test(String(url))) {
    lines.push("", `🔗 ${url}`);
  }
  return lines.join("\n");
}

function authorized(request, env) {
  const secret = env.CLOUDFLARE_NOTIFY_WEBHOOK_SECRET;
  if (!secret || secret.length < 24) return false;
  const provided = request.headers.get("x-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

export async function handleBuildNotification(request, env) {
  if (!authorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.RELAY_NOTIFICATION_TOKEN) {
    return new Response("Relay token not configured", { status: 503 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const message = statusFrom(payload);
  if (!message) {
    return new Response("Ignored nonterminal build status", { status: 202 });
  }

  const response = await fetch(RELAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RELAY_NOTIFICATION_TOKEN}`,
    },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    return new Response("Relay delivery failed", { status: 502 });
  }
  return new Response("Notification forwarded", { status: 200 });
}
