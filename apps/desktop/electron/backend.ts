import type { MessagePortMain } from "electron";
import { homedir } from "node:os";
import { createBackendService, migrateDataDir } from "@pace/backend";

const { parentPort } = process;
const service = createBackendService({
  dataDir: migrateDataDir(process.env, homedir()),
});

parentPort.on("message", (event) => {
  if (event.data?.type === "connect") {
    const [port] = event.ports;
    if (port) {
      connect(port);
    }
  }
});

function connect(port: MessagePortMain) {
  service.onEvent((event) => {
    port.postMessage(event);
  });
  port.on("message", async ({ data }) => {
    port.postMessage(await service.handleRequest(data));
  });
  port.start();
}
