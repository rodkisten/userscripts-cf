export async function formatYaml(source: string) {
  const [{ format }, yaml] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/yaml"),
  ]);
  return format(source, { parser: "yaml", plugins: [yaml] });
}
