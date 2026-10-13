#!/bin/bash
# 压缩 extension 目录为 o-maid.zip 插件包（版本号独立管理，零污染仓库）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📦 正在打包 O-Maid 插件..."

VERSION_FILE="version.txt"
DEFAULT_VERSION="1.4"

# 1. 读取并自增版本号（末位加 1，写回 version.txt）
NEW_VERSION=$(node -e "
const fs = require('fs');
let ver = '$DEFAULT_VERSION';
if (fs.existsSync('$VERSION_FILE')) {
  const content = fs.readFileSync('$VERSION_FILE', 'utf8').trim();
  if (content) ver = content;
}
const parts = ver.split('.');
parts[parts.length - 1] = parseInt(parts[parts.length - 1] || 0) + 1;
const nextVer = parts.join('.');
fs.writeFileSync('$VERSION_FILE', nextVer + '\n');
console.log(nextVer);
")

echo "🆙 扩展版本号已更新至: v$NEW_VERSION (独立记录于 $VERSION_FILE)"

# 2. 准备临时构建目录，确保源码仓库 100% 干净
TEMP_BUILD_DIR=".build_temp"
rm -rf "$TEMP_BUILD_DIR"
mkdir -p "$TEMP_BUILD_DIR"

# 复制 extension 文件到临时目录
cp -R extension/. "$TEMP_BUILD_DIR/"

# 将独立版本号注入到临时构建目录中的 manifest.json
node -e "
const fs = require('fs');
const path = '$TEMP_BUILD_DIR/manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.version = '$NEW_VERSION';
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
"

# 3. 压缩打包
rm -f o-maid.zip
(
  cd "$TEMP_BUILD_DIR"
  zip -r ../o-maid.zip * -x "*.DS_Store" "*__MACOSX*" > /dev/null
)

# 4. 清理临时构建目录
rm -rf "$TEMP_BUILD_DIR"

echo "✅ 打包完成！生成文件：o-maid.zip (版本: v$NEW_VERSION，源码工作区保持干净)"
