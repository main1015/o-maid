#!/bin/bash
# 压缩 extension 目录为 o-maid.zip 插件包

echo "📦 正在打包 O-Maid 插件..."

# 自动递增版本号 (末位加1)
NEW_VERSION=$(node -e "
const fs = require('fs');
const path = './extension/manifest.json';
const manifest = JSON.parse(fs.readFileSync(path));
const parts = manifest.version.split('.');
parts[parts.length - 1] = parseInt(parts[parts.length - 1]) + 1;
manifest.version = parts.join('.');
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log(manifest.version);
")

echo "🆙 扩展版本号已自动升级至: v$NEW_VERSION"

# 进入 extension 目录
cd extension || { echo "❌ 找不到 extension 目录"; exit 1; }

# 删除可能存在的旧包
rm -f ../o-maid.zip

# 将所有文件打包为 o-maid.zip，排除 Mac 系统隐藏文件
zip -r ../o-maid.zip * -x "*.DS_Store" "*__MACOSX*"

echo "✅ 打包完成！生成文件：o-maid.zip (位于项目根目录)"
