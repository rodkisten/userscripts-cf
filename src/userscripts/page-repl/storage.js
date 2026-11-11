export function createStorage(storage, origin) {
  const key = "workspace:" + origin;
  let timer;
  return {
    async read() {
      return await storage.get(key, {
        code: '// Ctrl/Cmd+Enter executa. Variáveis de topo persistem na sessão.\nconst title = document.title;\nconsole.log("Página:", location.href);\nawait Promise.resolve(title)',
        history: [],
        timeout: 3000,
        position: { x: 12, y: 90 },
      });
    },
    save(value) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void storage.set(key, value).catch(console.warn);
      }, 400);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
