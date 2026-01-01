# 准备(可忽略)
## 用户设置sudo免密
## 配置github域名解析
```
20.205.243.166 github.com
185.199.108.133 raw.githubusercontent.com
```
## Github配置公钥匙，配置远程登录免密
## PS1
```
export PS1="\[\e[1;34m\]# \[\e[1;36m\]\u \[\e[1;0m\]@ \[\e[1;32m\]\h \[\e[1;0m\]in \[\e[1;33m\]\w \[\e[1;0m\][\[\e[1;0m\]\t\[\e[1;0m\]]\n\[\e[1;31m\]$\[\e[0m\] "
```

# 编译安装Postgres(正式开始)
## 下载postgres源码
```
git clone git@github.com:postgres/postgres.git
```

## 配置环境变量(添加到.bashrc中)
```
export PGHOME=$HOME$/PGhome
export PGDATA=$PGHOME/data
export PATH=$PGHOME/bin:$PATH
export LD_LIBRARY_PATH=$PGHOME/lib:$LD_LIBRARY_PATH
```

## 安装依赖
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
sudo apt install llvm llvm-dev clang libclang-dev pkg-config perl libperl-dev systemtap-sdt-dev libicu-dev
```

## make && install
```
make install -sj
```

## make test
```
# 运行测试用例
make check -sj
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
            "program": "/home/teletele/PGhome/bin/postgres", //根据实际情况修改即可
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