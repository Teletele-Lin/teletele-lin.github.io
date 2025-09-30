# 环境介绍
> 本文通过WSL(Debain)环境配置rust远程开发环境，apt源和ssh已配置完成

# 安装部分组件
```shell
sudo apt install build-essential curl pkg-config libssl-dev
```

# 安装rust
```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

# 验证安装
```shell
source ~/.bashrc
rustc --vesion
cargo --version
```

# 创建一个项目
```shell
mkdir Code && cd Code
cargo new rust-demo
cd rust-demo
cargo run
```

# VSCode远程连接
## 安装C++插件和rust-analyzer插件
