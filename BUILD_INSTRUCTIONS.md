# Build Instructions for Mozilla Add-on Reviewers

This document provides instructions for reviewing and building the **O-Maid** Firefox Extension from source code.

---

## 1. Project Overview / 项目概述

- **Architecture**: The extension is built using **native modern JavaScript (ES Modules)** and Manifest V3.
- **Transpilers / Minifiers**: **NO transpilers (Babel/TypeScript)**, **NO bundlers (Webpack/Rollup/Vite)**, and **NO code minifiers/obfuscators** are used for the extension's proprietary code.
- **Source Code**: All source files under `extension/firefox/` are human-readable, raw source code.

---

## 2. Environment Prerequisites / 环境要求

- **Operating System**: Linux, macOS, or Windows (via WSL / Git Bash).
- **Node.js**: Version `18.0.0` or higher (only used for version injection into `manifest.json` during packaging; no build dependencies required).
- **Zip utility**: Standard command-line `zip` tool.

---

## 3. How to Build / Reproduce the Extension Package / 构建步骤

From the root directory of this source package, simply run the packaging script:

```bash
# Build the Firefox extension package
./package-extension.sh firefox
```

### Build Result:
- The script packages `extension/firefox/` into **`o-maid-firefox.zip`** in the root directory.
- The output zip file is identical to the submitted add-on binary.

Alternatively, you can manually create the zip file without scripts:
```bash
cd extension/firefox
zip -r ../../o-maid-firefox.zip ./* -x "*.DS_Store" "*__MACOSX*"
```

---

## 4. Third-Party Libraries / 第三方开源库说明

The extension includes one third-party open-source library under `extension/firefox/vendor/`:

- **Intro.js** (`vendor/intro.min.js`, `vendor/introjs.min.css`)
  - **Purpose**: Provides user onboarding and step-by-step tour tooltips.
  - **Official Website**: https://introjs.com/
  - **Source Code Repository**: https://github.com/usablica/intro.js
  - **License**: AGPL-3.0 / Commercial License

No modifications were made to the original upstream `intro.js` library files.

