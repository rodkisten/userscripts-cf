register({
  version: "BAD",
  init() {
    throw Error(
      "Falha intencional: candidato não deve substituir versão estável",
    );
  },
  dispose() {},
});
