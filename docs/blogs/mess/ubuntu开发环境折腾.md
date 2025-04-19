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
./configure --prefix=$PGHOME --enable-debug --with-python --with-perl --with-tcl --with-icu --with-llvm
```

## 缺啥装啥
```
sudo apt install llvm llvm-dev clang libclang-dev
sudo apt install pkg-config
sudo apt install perl libperl-dev
```

## make && install
```
make install -sj
```

## initdb
```
rm -r $PGDATA && initdb -D $PGDATA
```

## startdb
```
pg_ctl -D /home/teletele/PGhome/data -l $PGDATA/start.log start
```

## stopdb
```
pg_ctl -D /home/teletele/PGhome/data stop
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
## 可以考虑添加task.json执行编译初始化等操作

## Superuser access is required to attach to a process. Attaching as superuser can potentially harm your computer.
```
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```
