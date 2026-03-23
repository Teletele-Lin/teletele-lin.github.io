FROM ubuntu:22.04

# Set explicit UTF-8 locale to fix git log Chinese display issues
ENV LANG=C.UTF-8 C_ALL=C.UTF-8 LESSCHARSET=utf-8

# Install necessary dependencies, Node.js, and docsify-cli
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y curl git sudo nodejs npm \
    && npm install -g docsify-cli \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

ARG USERNAME=teletele
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create the user 'teletele' with sudo privileges
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /bin/bash \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME


# Set the active user
USER $USERNAME

# 6. 终端美化与 Git 配置
RUN cat >> /home/$USERNAME/.bashrc <<'EOF'
export PS1="\[\e[1;34m\]# \[\e[1;36m\]\u \[\e[1;0m\]@ \[\e[1;32m\]\h \[\e[1;0m\]in \[\e[1;33m\]\w \[\e[1;0m\][\[\e[1;0m\]\t\[\e[1;0m\]]\n\[\e[1;31m\]$\[\e[0m\] "
EOF

RUN git config --global core.excludesfile ~/.gitignore_global \
    && echo ".vscode/" >> ~/.gitignore_global \
    && echo ".cache/" >> ~/.gitignore_global