import { describe, expect, it } from "vitest";
import { prepareSystemNode } from "./system-node";

const nodeInfo = (executable: string, version = "24.13.0") => JSON.stringify({ executable, version, hooks: true });

describe("the extension Node environment", () => {
  it("recovers the selected Node from a noisy login shell when a GUI PATH cannot find it", async () => {
    const env = { PATH: "/usr/bin:/bin", SHELL: "/bin/zsh", HOME: "/Users/test", KEEP: "unchanged" };
    const result = await prepareSystemNode(env, {
      platform: "darwin",
      run: async (command) => {
        if (command === "/bin/zsh") return "shell greeting\n\0PACE_PATH\0/Users/test/Node Versions/current/bin:/usr/bin\0shell goodbye";
        if (command === "/Users/test/Node Versions/current/bin/node") return nodeInfo("/Users/test/Node Versions/24/bin/node");
        throw new Error("not found");
      },
    });
    expect(result).toMatchObject({ status: "available", executable: "/Users/test/Node Versions/24/bin/node", version: "24.13.0" });
    expect(env.PATH.split(":")[0]).toBe("/Users/test/Node Versions/24/bin");
    expect(env.KEEP).toBe("unchanged");
  });

  it("rejects an explicitly configured old Node without silently selecting another installation", async () => {
    const env = { PATH: "/good/bin", PACE_NODE_PATH: "/old/bin/node" };
    const result = await prepareSystemNode(env, {
      run: async (command) => nodeInfo(command, command === "/old/bin/node" ? "20.18.0" : "24.13.0"),
    });
    expect(result).toMatchObject({ status: "unavailable", detail: expect.stringMatching(/22\.19\.0/) });
    expect(result.detail).toContain("/old/bin/node");
    expect(env.PATH).toBe("/good/bin");
  });

  it("keeps the host usable when the shell and Node installations cannot run", async () => {
    const env = { PATH: "", SHELL: "/bin/zsh", HOME: "/missing" };
    const result = await prepareSystemNode(env, { run: async () => { throw new Error("unavailable"); } });
    expect(result).toMatchObject({ status: "unavailable", detail: expect.stringContaining("PACE_NODE_PATH") });
    expect(env.PATH).toBe("");
  });
});
