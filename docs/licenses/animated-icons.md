# 动画图标的来源与许可证

Pace 的 `apps/desktop/src/shared/ui/animated-icons.tsx` 与 `primitives.css` 改编以下项目的 SVG 几何和动画动作。运行时使用 React 与 CSS；没有复制上游的 Motion 控制器。发行包通过 `electron-builder.yml` 的 `extraResources` 携带本文件，存放在资源目录的 `licenses/` 下。

## Hugeicons Animated

- 项目：[enesgules/hugeicons-animated](https://github.com/enesgules/hugeicons-animated)
- 固定版本：[10d719295bdf4247ae2da4dd10a05db412570ce2](https://github.com/enesgules/hugeicons-animated/tree/10d719295bdf4247ae2da4dd10a05db412570ce2)
- 图标：`history`、`message-add-01`、`settings-01`、`panel-left`、`plus-sign`、`more-horizontal`、`puzzle`。
- [上游 README](https://github.com/enesgules/hugeicons-animated/blob/10d719295bdf4247ae2da4dd10a05db412570ce2/README.md#license) 声明动画代码为 MIT，图形源于 MIT 授权的 `@hugeicons/core-free-icons`。该版本未单独附带 LICENSE 文件。

Hugeicons 官方项目的 [MIT 许可原文](https://github.com/hugeicons/hugeicons-react/blob/main/LICENSE.md)：

```text
# MIT License

## Copyright (c) 2024 Halal Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lucide Animated

- 项目：[pqoqubbw/icons](https://github.com/pqoqubbw/icons)
- 图标：`chart-pie`。
- 许可证：[MIT](https://github.com/pqoqubbw/icons/blob/main/LICENSE)。

```text
MIT License

Copyright (c) 2024-2026 pqoqubbw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lucide 图形

`chart-pie` 的底层图形来自 [Lucide](https://github.com/lucide-icons/lucide)，其 [ISC 许可](https://github.com/lucide-icons/lucide/blob/main/LICENSE) 如下。该图形不在上游列出的 Feather 派生图标清单中。

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
