#!/bin/bash
# 打包 Firefox 扩展源代码包 (供 Mozilla AMO 审核员复现验证使用)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUTPUT_ZIP="o-maid-firefox-source.zip"
TEMP_DIR=".source_build_temp"

echo "📦 正在打包 O-Maid 源代码包 (用于提交至 Mozilla AMO 审核)..."

# 1. 清理旧文件
rm -f "$OUTPUT_ZIP"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 2. 复制纯净源码结构
echo "📂 复制源码文件..."

# 复制 Firefox 扩展全部源码
mkdir -p "$TEMP_DIR/extension"
cp -R extension/firefox "$TEMP_DIR/extension/"

# 复制打包脚本与核心说明
cp package-extension.sh "$TEMP_DIR/"
cp BUILD_INSTRUCTIONS.md "$TEMP_DIR/"
cp README.md "$TEMP_DIR/"
if [ -f "version.txt" ]; then
  cp version.txt "$TEMP_DIR/"
fi

# 确保脚本权限
chmod +x "$TEMP_DIR/package-extension.sh"

# 3. 压缩打包
echo "🗜️  正在生成压缩包 $OUTPUT_ZIP..."
(
  cd "$TEMP_DIR"
  zip -r "../$OUTPUT_ZIP" ./* -x "*.DS_Store" "*__MACOSX*" > /dev/null
)

# 4. 清理临时目录
rm -rf "$TEMP_DIR"

# 5. 输出结果与信息
FILE_SIZE=$(ls -lh "$OUTPUT_ZIP" | awk '{print $5}')
FILE_COUNT=$(unzip -l "$OUTPUT_ZIP" | tail -n 1 | awk '{print $2}')

echo "=========================================================="
echo "✅ 源代码包生成成功！"
echo "📄 文件名称: $OUTPUT_ZIP"
echo "📊 文件大小: $FILE_SIZE (AMO 限制最大 200 MB)"
echo "📑 包含文件: 共 $FILE_COUNT 个源码文件"
echo "ℹ️  包内已附带针对审核员的 BUILD_INSTRUCTIONS.md 说明文件"
echo "=========================================================="

