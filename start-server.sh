#!/bin/bash

# 确保脚本在任何目录下执行都能正确进入 server 目录
cd "$(dirname "$0")/server"

if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  echo "用法: $0 [端口号]"
  echo "  端口号   运行服务器的端口 (默认: 8632)"
  exit 0
fi

# 允许通过第一个参数指定端口，默认 8632
export PORT=${1:-8632}

# 验证端口是否为数字
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "错误: 端口号必须是一个纯数字。"
  exit 1
fi

echo "======================================"
echo "    🚀 正在启动 O-Maid 云端后端服务 (端口: $PORT)"
echo "======================================"

echo "[1/2] 正在检查并安装后端依赖 (npm install)..."
# npm install

echo "[2/2] 正在启动服务器..."
npm start
