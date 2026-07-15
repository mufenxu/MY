#!/bin/bash

# HGU Campus Hub Docker 镜像一键构建与推送脚本 (Linux/macOS)

echo "==================================================="
echo "  HGU Campus Hub Docker 镜像一键构建与推送工具"
echo "==================================================="
echo

# 检查 Docker 是否在运行
if ! docker info >/dev/null 2>&1; then
    echo "[错误] Docker 守护进程未启动，请确保 Docker 已正确启动并在后台运行！"
    exit 1
fi

# 从 package.json 读取默认版本号
VERSION="latest"
if [ -f "package.json" ]; then
    VERSION=$(grep '"version"' package.json | head -n 1 | awk -F '"' '{print $4}')
fi

echo "默认读取到项目版本号为: $VERSION"
read -p "请输入要打包的镜像 Tag [默认: $VERSION]: " TAG
if [ -z "$TAG" ]; then
    TAG=$VERSION
fi

IMAGE_NAME="mufenxu/hgu:$TAG"
echo
echo "将构建并推送镜像: $IMAGE_NAME"
echo "---------------------------------------------------"

echo "[1/3] 开始构建本地 Docker 镜像..."
docker build -t "$IMAGE_NAME" -t mufenxu/hgu:latest .
if [ $? -ne 0 ]; then
    echo "[错误] 镜像构建失败！如果因网络问题超时，请配置系统代理或镜像源后重试。"
    exit 1
fi

echo
echo "[2/3] 检查 Docker Hub 登录状态..."
read -p "是否已完成 docker login? (y/n) [默认: y]: " CHOICE
CHOICE=${CHOICE:-y}

if [ "$CHOICE" != "y" ] && [ "$CHOICE" != "Y" ]; then
    echo "请先运行 'docker login' 并输入您的 Docker Hub 凭据后，再次执行此脚本。"
    exit 1
fi

echo
echo "[3/3] 开始推送镜像到 Docker Hub 仓库..."
docker push "$IMAGE_NAME"
if [ $? -ne 0 ]; then
    echo "[警告] 推送 $IMAGE_NAME 失败！请确认您是否对 mufenxu/hgu 仓库拥有推送权限。"
else
    echo
    echo "==================================================="
    echo "[成功] 镜像 $IMAGE_NAME 已成功推送到 Docker Hub!"
    echo "==================================================="
fi

# 问是否需要推送 latest
read -p "是否同时推送 latest 标签? (y/n) [默认: n]: " PUSH_LATEST
PUSH_LATEST=${PUSH_LATEST:-n}
if [ "$PUSH_LATEST" = "y" ] || [ "$PUSH_LATEST" = "Y" ]; then
    docker push mufenxu/hgu:latest
fi
