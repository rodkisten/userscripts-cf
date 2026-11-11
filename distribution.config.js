// Source can remain private. For unattended updates, use a public distribution URL.
// Override at build time with USERSCRIPTS_BASE_URL=https://your-host/userscripts.
export default {
  unified: { name: "RodX Studio — X/Twitter mobile-first", namespace: "https://rodx.local/userscripts" },
  repository: "rodkisten/userscripts-cf",
  baseURL: process.env.USERSCRIPTS_BASE_URL || "https://userscripts-cf.kisten.workers.dev",
};
