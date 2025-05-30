# PG性能分析抓取火焰图

## PG 编译配置
```
RUN ./configure CFLAGS="-fno-omit-frame-pointer -fno-stack-protector" --prefix=$PGHOME --with-perl --with-tcl --with-python --with-openssl \
--with-pam --without-ldap --with-libxml --with-libxslt --enable-debug
```
## 下载FlameGraph
```
git clone git@github.com:brendangregg/FlameGraph.git
```

## 配置一键抓取脚本
```
#!/bin/bash
# Flame Graph Generator with POSIX-compatible Output
# Usage: ./flame.sh <graph_name> <process_id> <capture_seconds>

[ $# -ne 3 ] && { echo "Usage: $0 <graph_name> <process_id> <capture_seconds>"; exit 1; }

GRAPH_NAME=$1
PID=$2
SECONDS=$3

# 创建输出目录
OUTPUT_DIR="./${GRAPH_NAME}_data"
mkdir -p "$OUTPUT_DIR" || { echo "Error: Failed to create output directory $OUTPUT_DIR"; exit 1; }

# 文件路径定义
OUTPUT_SVG="${OUTPUT_DIR}/${GRAPH_NAME}.svg"
PERF_DATA="${OUTPUT_DIR}/perf.data"
PERF_UNFOLD="${OUTPUT_DIR}/perf.unfold"
PERF_FOLDED="${OUTPUT_DIR}/perf.folded"

# POSIX兼容的权限检查
check_perf_permissions() {
    PARANOID_FILE="/proc/sys/kernel/perf_event_paranoid"
    
    # 检查文件是否存在
    if [ ! -f "$PARANOID_FILE" ]; then
        printf "\nERROR: Kernel does not expose perf_event_paranoid setting\n"
        echo "This system may not support perf monitoring"
        exit 1
    fi

    # 检查当前值
    CURRENT_VALUE=$(cat "$PARANOID_FILE")
    REQUIRED_VALUE=-1
    
    if [ "$CURRENT_VALUE" -le "$REQUIRED_VALUE" ]; then
        return 0
    fi

    # 兼容的错误提示（无转义字符）
    printf "\nPERMISSION ERROR: perf requires elevated access\n"
    echo "Current perf_event_paranoid = $CURRENT_VALUE (required <= -1)"
    printf "\nSOLUTIONS:\n"
    echo "1. Temporary fix (until reboot):"
    echo "   sudo sysctl -w kernel.perf_event_paranoid=$REQUIRED_VALUE"
    echo ""
    echo "2. Permanent fix (requires root):"
    echo "   echo 'kernel.perf_event_paranoid=$REQUIRED_VALUE' | sudo tee -a /etc/sysctl.conf"
    echo "   sudo sysctl -p"
    echo ""
    echo "3. Run script with sudo:"
    echo "   sudo $0 $GRAPH_NAME $PID $SECONDS"
    echo ""
    echo "4. Alternative for container environments:"
    echo "   Add --cap-add SYS_ADMIN to docker run command"
    
    exit 1
}

# 检查权限
check_perf_permissions

# 下载FlameGraph工具（如果不存在）
if [ ! -d "FlameGraph" ]; then
    echo "Downloading FlameGraph tools..."
    git clone -q --depth 1 https://github.com/brendangregg/FlameGraph.git || {
        echo "Error: Failed to clone FlameGraph repository"
        exit 1
    }
fi

# 核心采集流程
echo "Collecting perf data for ${SECONDS}s (PID: $PID)..."
perf record -F 99 -p $PID -g -o "$PERF_DATA" -- sleep $SECONDS || {
    echo "Error: perf record failed. Check PID and permissions"
    exit 1
}

echo "Processing stacks..."
perf script -i "$PERF_DATA" > "$PERF_UNFOLD" || {
    echo "Error: perf script failed"
    exit 1
}
./FlameGraph/stackcollapse-perf.pl "$PERF_UNFOLD" > "$PERF_FOLDED" || {
    echo "Error: stackcollapse-perf.pl failed"
    exit 1
}
./FlameGraph/flamegraph.pl --title="$GRAPH_NAME" "$PERF_FOLDED" > "$OUTPUT_SVG" || {
    echo "Error: flamegraph.pl failed"
    exit 1
}

# 输出结果
printf "\nFlame graph generated: %s\n" "$OUTPUT_SVG"
echo "Intermediate files saved in: $OUTPUT_DIR"
printf "\nDirectory contents:\n"
ls -lh "$OUTPUT_DIR"

```

## 抓取会话进程的火焰图

```
sudo sh genGraph.sh test1 134628 5
```

![image-20250531142518303](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/image-20250531142518303.png)