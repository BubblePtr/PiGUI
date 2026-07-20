# macOS 打包与发布

PiGUI 使用 `electron-builder` 生成 Apple Silicon `.app` 与 DMG。发布产物的固定标识为 `com.bubbleptr.pigui`，最低支持 macOS 12。

## 本地验证

没有发布证书时，可以生成未签名 `.app` 并直接跑完整 packaged-app E2E：

```bash
bun run package:mac:unsigned
bun run test:e2e:packaged
```

这个产物仅用于本机验证，不能对外分发。E2E 会从 `dist/mac-arm64/PiGUI.app/Contents/MacOS/PiGUI` 启动真实 bundle，覆盖主进程、preload、renderer、ASAR 内 backend utility process、持久化、Git diff 和 Pi SDK 模型控制。

## 签名 `.app`

钥匙串中需要有可用的 `Developer ID Application` 证书及私钥，并允许 `/usr/bin/codesign` 访问私钥：

```bash
bun run package:mac
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/PiGUI.app
```

如证书存在但构建报 `errSecInternalComponent`，先在「钥匙串访问」中检查对应私钥的访问控制。不要把钥匙串密码、证书私钥或公证凭据写入仓库。

## DMG 与公证

`bun run dist:mac` 会强制签名，并在提供 Apple 公证凭据时自动调用 `notarytool`。自动化环境推荐使用 App Store Connect Team API key（Developer role），在构建进程中提供：

- `APPLE_API_KEY`：本机 `.p8` 文件路径
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

个人 API key 不能用于 `notarytool`。本地开发推荐先把 Team API key 写入钥匙串：

```bash
xcrun notarytool store-credentials "pigui-notary" \
  --key "/absolute/path/AuthKey_KEYID.p8" \
  --key-id "KEY_ID" \
  --issuer "ISSUER_ID"
xcrun notarytool history --keychain-profile "pigui-notary"
```

使用默认钥匙串时，构建只需提供 profile 名：

```bash
APPLE_KEYCHAIN_PROFILE="pigui-notary" bun run dist:mac
```

只有 profile 存在自定义钥匙串时才额外设置 `APPLE_KEYCHAIN`。凭据只应存在于本机钥匙串或 CI secret store 中。

发布前执行：

```bash
bun run dist:mac
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/PiGUI.app
xcrun stapler validate dist/mac-arm64/PiGUI.app
spctl --assess --type execute --verbose=2 dist/mac-arm64/PiGUI.app
bun run test:e2e:packaged
```

最终产物位于 `dist/PiGUI-<version>-arm64.dmg`。只有签名、公证、staple、Gatekeeper 和 packaged-app E2E 全部通过后，DMG 才可发布。
