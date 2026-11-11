// Source can remain private. For unattended updates, use a public distribution URL.
// Override at build time with USERSCRIPTS_BASE_URL=https://your-host/userscripts.
export default {
  repository: "rodkisten/userscripts-cf",
  baseURL:
    process.env.USERSCRIPTS_BASE_URL ||
    "https://github.com/rodkisten/userscripts-cf/releases/latest/download",
};
