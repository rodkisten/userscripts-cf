const endpoint = "https://xtelegram-cf.migos.club/notifications/send";
const outcome = process.argv[2];

if (!["success", "failed"].includes(outcome)) {
  throw Error("Usage: node build/notify-circleci.mjs success|failed");
}

const token = process.env.RELAY_NOTIFICATION_TOKEN;
if (!token) {
  console.error("RELAY_NOTIFICATION_TOKEN not configured; CircleCI notification skipped.");
  process.exitCode = 1;
} else {
  const sha = process.env.CIRCLE_SHA1 || "unknown";
  const branch = process.env.CIRCLE_BRANCH || process.env.CIRCLE_TAG || "unknown";
  const project = process.env.CIRCLE_PROJECT_REPONAME || "userscripts-cf";
  const job = process.env.CIRCLE_JOB || "autoformat";
  const url = process.env.CIRCLE_BUILD_URL;
  const lines = [
    outcome === "success" ? "✅ CircleCI concluído" : "❌ CircleCI falhou",
    "",
    `📦 Projeto: ${project}`,
    `🌿 Branch: ${branch}`,
    `🔧 Job: ${job}`,
    `📍 Status: ${outcome.toUpperCase()}`,
    `📝 Commit: ${sha.slice(0, 12)}`,
  ];

  if (url?.startsWith("https://")) {
    lines.push("", `🔗 ${url}`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: lines.join("\n") }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    console.error(`Relay notification failed: HTTP ${response.status}`);
    process.exitCode = 1;
  } else {
    console.log(`CircleCI ${outcome} notification delivered to Relay.`);
  }
}
