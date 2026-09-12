import type { MessagePortMain } from "electron";
import { homedir } from "node:os";
import { createBackendService, migrateDataDir, prepareSystemNode } from "@pace/backend";

const { parentPort } = process;
const serviceReady = prepareSystemNode().then(() => createBackendService({
  dataDir: migrateDataDir(process.env, homedir()),
}));

parentPort.on("message", (event) => {
  if (event.data?.type === "connect") {
    const [port] = event.ports;
    if (port) {
      connect(port);
    }
  }
});

async function connect(port: MessagePortMain) {
  const service = await serviceReady;
  service.onEvent((event) => {
    port.postMessage(event);
  });
  port.on("message", async ({ data }) => {
    port.postMessage(await service.handleRequest(data));
  });
  port.start();
}
