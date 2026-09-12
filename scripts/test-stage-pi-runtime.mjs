import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stagePiRuntime } from "./stage-pi-runtime.mjs";

function fixture(t, required = false) {
  const root = mkdtempSync(join(tmpdir(), "pace-stage-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const backend = join(root, "backend");
  function pkg(name, extra = {}) {
    const dir = name ? join(backend, "node_modules", name) : backend;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", ...extra }));
  }
  pkg("", { dependencies: { "@earendil-works/pi-coding-agent": "1.0.0", "@earendil-works/pi-ai": "1.0.0" } });
  pkg("@earendil-works/pi-ai");
  pkg("@earendil-works/pi-coding-agent", {
    [required ? "dependencies" : "optionalDependencies"]: { "native-darwin": "1.0.0", "native-linux": "1.0.0" },
  });
  pkg("native-darwin", { os: ["darwin"], cpu: ["arm64"] });
  pkg("native-linux", { os: ["!darwin"], cpu: ["x64"] });
  return { backend, target: join(root, "staged") };
}

test("staging excludes incompatible optional packages for each target", (t) => {
  const input = fixture(t);
  for (const [platform, arch, present, absent] of [
    ["linux", "x64", "native-linux", "native-darwin"],
    ["darwin", "arm64", "native-darwin", "native-linux"],
  ]) {
    stagePiRuntime({ ...input, platform, arch });
    assert.ok(existsSync(join(input.target, "node_modules", present)));
    assert.equal(existsSync(join(input.target, "node_modules", absent)), false);
  }
  stagePiRuntime({ ...input, platform: "darwin", arch: "x64" });
  assert.equal(existsSync(join(input.target, "node_modules/native-darwin")), false);
  assert.equal(existsSync(join(input.target, "node_modules/native-linux")), false);
});

test("staging rejects incompatible required dependencies before replacing output", (t) => {
  const input = fixture(t, true);
  assert.throws(() => stagePiRuntime({ ...input, platform: "linux", arch: "x64" }), /native-darwin.*linux\/x64/);
  assert.equal(existsSync(input.target), false);
});
