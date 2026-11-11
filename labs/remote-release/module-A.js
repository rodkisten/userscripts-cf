(function () {
  let initialized = false;
  register({
    version: "A",
    async init(core) {
      if (initialized) throw Error("Inicialização duplicada");
      initialized = true;
      await core.set("release-A");
      if ((await core.get()) !== "release-A") throw Error("Storage GM não confirmado");
      return core.ping();
    },
    dispose() {
      initialized = false;
    },
  });
})();
