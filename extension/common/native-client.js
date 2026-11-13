/* Direct privileged Native Messaging client shared by popup and manager. */
globalThis.AIGNative = (() => {
  const browserApi = globalThis.browser || globalThis.chrome;
  const HOST = "br.com.redclaw.appimage_grab";
  const request = async (message) => {
    // Shared setting applies to popup, manager, background downloads and
    // notifications. Never silently use another backend after a storage error.
    const saved = await browserApi.storage.local.get('integrationBackend');
    const backend = message.backend || (saved.integrationBackend === 'shelly' ? 'shelly' : 'gearlever');
    return new Promise((resolve, reject) => {
    let port;
    try {
      port = browserApi.runtime.connectNative(HOST);
    } catch (error) {
      reject(new Error(String(error?.message || error)));
      return;
    }
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      port.disconnect();
      reject(new Error("O gerenciador de AppImages demorou muito a responder."));
    }, ["updateApp", "updateAllAppImages"].includes(message.action) ? 3605000
      : message.action === "listUpdates" ? 185000 : 390000);
    port.onMessage.addListener(reply => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      port.disconnect();
      if (reply?.ok) resolve(reply);
      else reject(new Error(String(reply?.error || "Erro inesperado do serviço local")));
    });
    port.onDisconnect.addListener(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(browserApi.runtime.lastError?.message || "Conexão com o serviço AppImage Grab indisponível. Execute o instalador novamente."));
    });
    try {
      port.postMessage({...message, backend});
    } catch (error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      port.disconnect();
      reject(new Error(String(error?.message || error)));
    }
    });
  };
  return Object.freeze({ request });
})();
