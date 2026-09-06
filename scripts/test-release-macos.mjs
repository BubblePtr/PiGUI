import assert from "node:assert/strict";
import test from "node:test";
import { validateRelease } from "./release-macos.mjs";

const valid = {
  tag: "v0.0.1",
  rootVersion: "0.0.1",
  appVersion: "0.0.1",
  platform: "darwin",
  arch: "arm64",
  secrets: {
    CSC_LINK: "certificate-placeholder",
    CSC_KEY_PASSWORD: "password-placeholder",
    APPLE_API_KEY_P8: "private-key-placeholder",
    APPLE_API_KEY_ID: "key-id-placeholder",
    APPLE_API_ISSUER: "issuer-placeholder",
  },
};

test("a matching stable tag produces the exact ARM64 release artifact name", () => {
  assert.deepEqual(validateRelease(valid), {
    version: "0.0.1",
    prerelease: false,
    artifact: "PiGUI-0.0.1-arm64.dmg",
    zipArtifact: "PiGUI-0.0.1-arm64.zip",
  });
});

test("prerelease tags retain their full version and are marked as prereleases", () => {
  assert.deepEqual(validateRelease({
    ...valid,
    tag: "v1.2.3-rc.1",
    rootVersion: "1.2.3-rc.1",
    appVersion: "1.2.3-rc.1",
  }), {
    version: "1.2.3-rc.1",
    prerelease: true,
    artifact: "PiGUI-1.2.3-rc.1-arm64.dmg",
    zipArtifact: "PiGUI-1.2.3-rc.1-arm64.zip",
  });
});

test("SemVer build metadata is retained without changing prerelease status", () => {
  for (const [version, prerelease] of [["0.0.1+build.001", false], ["0.0.1-rc.1+sha.abc123", true]]) {
    assert.deepEqual(validateRelease({ ...valid, tag: `v${version}`, rootVersion: version, appVersion: version }), {
      version,
      prerelease,
      artifact: `PiGUI-${version}-arm64.dmg`,
      zipArtifact: `PiGUI-${version}-arm64.zip`,
    });
  }
});

test("a tag cannot label binaries built with a different application version", () => {
  assert.throws(() => validateRelease({ ...valid, appVersion: "0.0.9" }), /apps\/desktop\/package\.json/);
  assert.throws(() => validateRelease({ ...valid, rootVersion: "0.0.9" }), /root package\.json/);
  assert.throws(() => validateRelease({ ...valid, tag: "v0.2.0" }), /version/);
});

test("only explicit version tags can enter the release pipeline", () => {
  for (const tag of [undefined, "", "main", "0.1.0", "v01.1.0", "v1.2", "v1.2.3-01", "v1.2.3-rc..1", "v1.2.3+", "v1.2.3+build..1", "v1.2.3+build_1", "v0.1.0\n", "v0.1.0;echo unsafe", "refs/tags/v0.1.0"]) {
    assert.throws(() => validateRelease({ ...valid, tag }), /tag/, String(tag));
  }
});

test("native dependencies must be staged on an Apple Silicon Mac", () => {
  assert.throws(() => validateRelease({ ...valid, arch: "x64" }), /darwin\/arm64/);
  assert.throws(() => validateRelease({ ...valid, platform: "linux" }), /darwin\/arm64/);
});

test("missing signing or notarization secrets fail together without exposing values", () => {
  assert.throws(() => validateRelease({ ...valid, secrets: {} }), (error) => {
    for (const name of Object.keys(valid.secrets)) assert.ok(error.message.includes(name));
    return true;
  });
  for (const name of Object.keys(valid.secrets)) {
    assert.throws(() => validateRelease({ ...valid, secrets: { ...valid.secrets, [name]: "  " } }), (error) => {
      assert.ok(error.message.includes(name));
      for (const value of Object.values(valid.secrets)) assert.ok(!error.message.includes(value));
      return true;
    });
  }
});
