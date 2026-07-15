#!/bin/sh
set -eu

DATA_DIR="${HGU_DATA_DIR:-/app/data}"
WRITE_PROBE="${DATA_DIR}/.hgu-write-test-$$"

can_write_as() {
  candidate="$1"
  [ -n "$candidate" ] || return 1
  su-exec "$candidate" sh -c '
    probe="$1"
    umask 077
    : > "$probe" 2>/dev/null || exit 1
    rm -f "$probe"
  ' sh "$WRITE_PROBE" >/dev/null 2>&1
}

start_as() {
  candidate="$1"
  shift
  echo "数据目录可写，正在使用用户 ${candidate} 启动服务。"
  exec su-exec "$candidate" "$@"
}

if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

mkdir -p "$DATA_DIR" 2>/dev/null || true

# 标准 Docker/Linux 环境下 node 用户的 UID/GID 是 1000:1000。
# 先直接测试写入，存储允许写入时无需执行 chown。
if can_write_as "node"; then
  start_as "node" "$@"
fi

# NAS、NFS、CIFS 等存储经常禁止 chown，但允许文件原所有者写入。
# 如果用户显式配置了宿主机数据目录的 UID/GID，优先使用该身份。
if [ -n "${HGU_DATA_UID:-}" ]; then
  configured_identity="${HGU_DATA_UID}:${HGU_DATA_GID:-${HGU_DATA_UID}}"
  if can_write_as "$configured_identity"; then
    start_as "$configured_identity" "$@"
  fi
fi

# 已有数据库时，根据数据库文件的数字 UID/GID 自动选择运行身份。
if [ -e "${DATA_DIR}/app.db" ]; then
  database_identity="$(stat -c '%u:%g' "${DATA_DIR}/app.db" 2>/dev/null || true)"
  if [ -n "$database_identity" ] && can_write_as "$database_identity"; then
    start_as "$database_identity" "$@"
  fi
fi

# 新目录或数据库文件所有者不一致时，再尝试目录所有者。
directory_identity="$(stat -c '%u:%g' "$DATA_DIR" 2>/dev/null || true)"
if [ -n "$directory_identity" ] && [ "$directory_identity" != "0:0" ] && can_write_as "$directory_identity"; then
  start_as "$directory_identity" "$@"
fi

# 普通本地 bind mount 通常允许 root 修正权限；失败时静默进入下一种方案。
if chown -R node:node "$DATA_DIR" >/dev/null 2>&1 && chmod 700 "$DATA_DIR" >/dev/null 2>&1; then
  if can_write_as "node"; then
    start_as "node" "$@"
  fi
fi

# 最后检查受限存储是否只允许容器 root 身份写入。此时容器仍受只读根文件系统、
# no-new-privileges 和能力白名单限制；仅数据卷使用 root 身份。
if can_write_as "0:0"; then
  echo "警告：挂载存储不允许切换文件所有者，将使用受限 root 身份访问数据卷。"
  exec "$@"
fi

echo "错误：容器无法写入 ${DATA_DIR}，且该存储不允许自动修改所有者。" >&2
echo "请在 compose 的环境变量中设置宿主机目录所有者，例如 HGU_DATA_UID=1026、HGU_DATA_GID=100。" >&2
echo "可在宿主机执行：stat -c '%u:%g' ./data" >&2
exit 70
