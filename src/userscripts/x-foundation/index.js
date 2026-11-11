// Infrastructure demo only. This is not the migration of the giant RodX script.
export default {
  async init(ctx) {
    const count = (await ctx.storage.get("activations", 0)) + 1;
    if (ctx.signal.aborted) return;
    await ctx.storage.set("activations", count);
    ctx.state.set({ activations: count });
    console.info("[Userscripts CF] X base modular ativa", ctx.state.get());
  },
};
