# 准备
## 禁用软件更新
## 修改清华源
## 安装软件
- 卸载nano，安装vim
- 安装git

## 用户设置sudo免密
## 配置github域名解析
```
20.205.243.166 github.com
185.199.108.133 raw.githubusercontent.com
```

## Github配置公钥匙，远程登录免密
## PS1
```
export PS1="\[\e[1;34m\]# \[\e[1;36m\]\u \[\e[1;0m\]@ \[\e[1;32m\]\h \[\e[1;0m\]in \[\e[1;33m\]\w \[\e[1;0m\][\[\e[1;0m\]\t\[\e[1;0m\]]\n\[\e[1;31m\]$\[\e[0m\] "
```

# 编译安装Postgres
## 下载postgres源码
```
git clone git@github.com:postgres/postgres.git
```

## 配置环境变量
```
export PGHOME=$HOME$/PGhome
export PGDATA=$PGHOME/data
export PATH=$PGHOME/bin:$PATH
export LD_LIBRARY_PATH=$PGHOME/lib:$LD_LIBRARY_PATH
```

## 安装一波依赖
```
sudo apt install -y build-essential libreadline-dev zlib1g-dev flex bison \
    libxml2-dev libxslt-dev libssl-dev libpam0g-dev libedit-dev \
    libselinux1-dev libsystemd-dev tcl-dev python3-dev 

```
## configure
```
./configure CFLAGS="-fno-omit-frame-pointer -fno-stack-protector" --prefix=$PGHOME --with-perl --with-tcl --with-python --with-openssl \
--with-pam --without-ldap --with-libxml --with-libxslt --enable-debug
```

## 缺啥装啥
```
sudo apt install llvm llvm-dev clang libclang-dev pkg-config perl libperl-dev systemtap-sdt-dev
```

## make && install
```
make install -sj
```

## initdb
```
rm -rf $PGDATA && initdb -D $PGDATA
```

## startdb
```
pg_ctl -D $PGDATA -l $PGDATA/start.log start
```

## stopdb
```
pg_ctl -D $PGDATA stop
```

# VsCode远程开发与调试
- 安装C/C++ 扩展
- 安装gitlens扩展

## launch.json
```
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "name": "PGATTACH",
            "type": "cppdbg",
            "request": "attach",
            "program": "/home/teletele/PGhome/bin/postgres",
            "processId": "${command:pickProcess}",
            "MIMode": "gdb",
            "setupCommands": [
                {
                    "description": "Enable pretty-printing for gdb",
                    "text": "-enable-pretty-printing",
                    "ignoreFailures": true
                },
                {
                    "description":  "Set Disassembly Flavor to Intel",
                    "text": "-gdb-set disassembly-flavor intel",
                    "ignoreFailures": true
                }
          ]
        }
    ]
}
```
## task.json
```
{
    // See https://go.microsoft.com/fwlink/?LinkId=733558
    // for the documentation about the tasks.json format
    "version": "2.0.0",
    "tasks": [
        {
            "label": "Update Code",
            "type": "shell",
            "command": "git pull && make clean && make install -sj"
        },
        {
            "label": "Init DB",
            "type": "shell",
            "command": "rm -rf $PGDATA && initdb -D $PGDATA"
        },
        {
            "label": "Start DB",
            "type": "shell",
            "command": "pg_ctl -D $PGDATA -l $PGDATA/start.log start"
        },
        {
            "label": "Stop DB",
            "type": "shell",
            "command": "pg_ctl -D $PGDATA stop"
        }
    ]
}
```

## Superuser access is required to attach to a process. Attaching as superuser can potentially harm your computer.
```
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

# docker配置参考
```
FROM ubuntu:22.04

# 设置非交互式安装，防止 apt-get 提示交互
ENV DEBIAN_FRONTEND=noninteractive

# 替换apt镜像
RUN sed -i 's@//.*archive.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list && \
    sed -i 's@//.*security.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list

# 更新包列表并安装基本工具和 PostgreSQL 编译依赖
RUN apt-get update && apt install -y \
build-essential libreadline-dev zlib1g-dev flex bison \
libxml2-dev libxslt-dev libssl-dev libpam0g-dev libedit-dev \
libselinux1-dev libsystemd-dev tcl-dev python3-dev

# 创建一个非root用户用于开发
RUN useradd -m developer && \
    echo "developer ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
# 切换到developer用户
USER developer
WORKDIR /home/developer

# 克隆PostgreSQL源码
RUN git clone https://github.com/postgres/postgres.git

# 设置环境变量
ENV PG_SRC_DIR=/home/developer/postgres
ENV PGHOME=/home/developer/pg_install
ENV PGDATA=${PGHOME}/data
ENV PGLOG=${PGHOME}/run.log

WORKDIR $PG_SRC_DIR

# 编译
RUN ./configure CFLAGS="-fno-omit-frame-pointer -fno-stack-protector" --prefix=$PGHOME --with-perl --with-tcl --with-python --with-openssl \
--with-pam --without-ldap --with-libxml --with-libxslt --enable-debug 
RUN make install -sj

# 环境变量
ENV PATH=$PGHOME/bin:$PATH
ENV LD_LIBRARY_PATH=$PGHOME/lib:$LD_LIBRARY_PATH

# initdb and run
RUN initdb -D $PGDATA
RUN pg_ctl -D $PGDATA -l $PGLOG start

# 暴露端口
EXPOSE 5432

```
