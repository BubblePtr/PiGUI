import type { MessagePortMain } from "electron";
import { createBackendService } from "../src/backend/service";

const { parentPort } = process;
const service = createBackendService();

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
