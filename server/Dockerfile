# 使用 Node.js 18 (Alpine 版本以减小体积)
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 复制项目所有文件
COPY . .

# 暴露服务器端口
EXPOSE 8632

# 设置启动命令：先初始化数据库，再启动服务器
CMD ["sh", "-c", "npm run db:init && npm start"]
