#!/bin/bash
# 压缩 extension/chrome 与 extension/firefox 目录为插件包（版本号独立管理，零污染仓库）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TARGET="${1:-all}" # all | chrome | firefox

echo "📦 正在打包 O-Maid 插件 (目标: $TARGET)..."

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

# 打包函数
package_target() {
  local browser_type="$1"
  local src_dir="extension/$browser_type"
  local output_zip="o-maid-$browser_type.zip"

  if [ ! -d "$src_dir" ]; then
    echo "❌ 目录 $src_dir 不存在，跳过打包"
    return
  fi

  local temp_dir=".build_temp_$browser_type"
  rm -rf "$temp_dir"
  mkdir -p "$temp_dir"

  # 复制源码到临时目录
  cp -R "$src_dir/." "$temp_dir/"

  # 注入版本号到 manifest.json
  node -e "
  const fs = require('fs');
  const path = '$temp_dir/manifest.json';
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  manifest.version = '$NEW_VERSION';
  fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  "

  # 压缩打包
  rm -f "$output_zip"
  (
    cd "$temp_dir"
    zip -r "../$output_zip" * -x "*.DS_Store" "*__MACOSX*" > /dev/null
  )

  # 清理临时目录
  rm -rf "$temp_dir"

  echo "✅ 打包完成：$output_zip (适用于 $browser_type, v$NEW_VERSION)"

  # 如果是 chrome，同时同步一份 o-maid.zip 保持向后兼容
  if [ "$browser_type" = "chrome" ]; then
    cp -f "$output_zip" o-maid.zip
    echo "ℹ️  已同步更新 o-maid.zip (兼容旧脚本与说明)"
  fi
}

if [ "$TARGET" = "source" ]; then
  exec "$SCRIPT_DIR/package-source.sh"
fi

if [ "$TARGET" = "chrome" ] || [ "$TARGET" = "all" ]; then
  package_target "chrome"
fi

if [ "$TARGET" = "firefox" ] || [ "$TARGET" = "all" ]; then
  package_target "firefox"
fi

echo "🎉 打包流程全部结束！源码工作区保持干净。"
