/* Direct privileged Native Messaging client shared by popup and manager. */
globalThis.GLGNative = (() => {
  const browserApi = globalThis.browser || globalThis.chrome;
  const HOST = "br.com.redclaw.gear_lever_grab";
  const request = (message) => new Promise((resolve, reject) => {
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
      reject(new Error("O Gear Lever demorou muito a responder."));
    }, message.action === "updateApp" ? 3605000 : message.action === "listUpdates" ? 135000 : 190000);
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
      reject(new Error(browserApi.runtime.lastError?.message || "Conexão com o serviço Gear Lever Grab indisponível. Execute o instalador novamente."));
    });
    try {
      port.postMessage(message);
    } catch (error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      port.disconnect();
      reject(new Error(String(error?.message || error)));
    }
  });
  return Object.freeze({ request });
})();
