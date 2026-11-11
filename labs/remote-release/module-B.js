(function () {
  let initialized = false;
  register({
    version: "B",
    async init(core) {
      if (initialized) throw Error("Inicialização duplicada");
      initialized = true;
      await core.set("release-B");
      if ((await core.get()) !== "release-B") throw Error("Storage GM não confirmado");
      return core.ping();
    },
    dispose() {
      initialized = false;
    },
  });
})();
