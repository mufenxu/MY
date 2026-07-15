@echo off
SETLOCAL Enabledelayedexpansion

echo ===================================================
echo   HGU Campus Hub Docker 镜像一键构建与推送工具
echo ===================================================
echo.

:: 检查 Docker 是否在运行
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 守护进程未启动，请先开启 Docker Desktop 软件！
    pause
    exit /b 1
)

:: 从 package.json 中读取版本号作为默认 Tag
set "VERSION=latest"
for /f "tokens=2 delims=:," %%a in ('findstr "\"version\"" package.json') do (
    set "VAL=%%~a"
    :: 去除空格
    set "VAL=!VAL: =!"
    set "VERSION=!VAL!"
)

echo 默认读取到项目版本号为: !VERSION!
set /p TAG="请输入要打包的镜像 Tag [默认: !VERSION!]: "
if "!TAG!"=="" (
    set "TAG=!VERSION!"
)

set IMAGE_NAME=mufenxu/hgu:!TAG!
echo.
echo 将构建并推送镜像: !IMAGE_NAME!
echo ---------------------------------------------------

echo [1/3] 开始构建本地 Docker 镜像...
docker build -t !IMAGE_NAME! -t mufenxu/hgu:latest .
if %errorlevel% neq 0 (
    echo [错误] 镜像构建失败！如果是网络原因导致拉取基础镜像超时，请在 Docker 选项中配置代理后再试。
    pause
    exit /b 1
)
echo.
echo [2/3] 检查 Docker Hub 登录状态...
echo 提示: 如果您没有登录，请在新开的命令行窗口运行 "docker login" 完成登录。
set /p CHOICE="是否已完成 docker login? (y/n) [默认: y]: "
if "!CHOICE!"=="" set "CHOICE=y"
if /i "!CHOICE!" neq "y" (
    echo 请先运行 "docker login" 登录您的 Docker Hub 账户后再运行此脚本。
    pause
    exit /b 1
)

echo.
echo [3/3] 开始推送镜像到 Docker Hub 仓库...
docker push !IMAGE_NAME!
if %errorlevel% neq 0 (
    echo [警告] 推送 !IMAGE_NAME! 失败！请检查您是否拥有 mufenxu/hgu 仓库的写权限以及网络是否畅通。
) else (
    echo.
    echo ===================================================
    echo [成功] 镜像 !IMAGE_NAME! 已成功推送到 Docker Hub!
    echo ===================================================
)

:: 问是否需要同时推送 latest 标签
set /p PUSH_LATEST="是否同时推送 latest 标签? (y/n) [默认: n]: "
if /i "!PUSH_LATEST!"=="y" (
    docker push mufenxu/hgu:latest
)

pause
