# 前言
数据科学和机器学习工作流程中，当本地计算机无法满足计算任务的需求时，往往需要一个更强大计算能力的远程环境。另一方面，VSCode由于其轻便和易用性，以及丰富的插件生态系统，一直是远程开发的首选编辑器。本文介绍Linux下Miniconda安装与VSCode远程Python环境、Jupyter环境搭建。

# 安装Miniconda
Anaconda一个用于数据科学和机器学习的Python发行版和包管理平台，将Python和对应的包打包成一个容器，实现环境的隔离，这意味着通过切换不同的容器就能够实现不同环境的切换。Miniconda只包含最核心的 Conda、Python 和少量必要的依赖库，安装文件很小。

Miniconda默认会安装到当前用户的$HOME目录下，安装后正常情况下只有当前用户能够使用Miniconda。
## 下载
```shell
wget https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh
```
## 安装
```shell
bash Miniconda3-latest-Linux-x86_64.sh
```
安装过程中会提示协议、安装路径、是否初始化等信息，一路yes即可。

## 不自动激活Conda环境
安装完成后重新连接终端，会进入到Conda的base环境，这个是安装自带的一个Python环境，正常情况下在使用终端的过程中使用原来系统的Python即可，因此配置不推荐默认激活Conda环境。

```shell
conda config --set auto_activate_base false
```

## 配置软件源
自带的源下载包速度较慢，配置国内的软件源，通过vi或者管理终端的软件自带的文件编辑器编辑 `$HOME/.condarc` 文件，将以下内容覆盖到文件里面。完成后重新连接终端。
```shell
channels:
  - defaults
show_channel_urls: true
default_channels:
  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/r
  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/msys2
auto_activate: false
```

## 创建Conda环境
Conda的使用不过多介绍，包的安装建议只使用conda命令，通过conda统一管理包。
```shell
conda create -n remote python=3.13
```

# 配置远程环境
## 安装VSCode
去官网或者Github下载安装VSCode即可。
## profile管理和使用
VSCode中的profile类似于conda，用于管理本地编辑器的不同配置，比如你有远程开发Python、远程开发C++等不同的需求，需要用到的插件也会有所不同，使用profile就能够实现本地不同开发环境隔离。推荐在默认profile中安装主题、安装插件Remote-SSH、设置字体、安装AI插件等基本的公共配置。
## 创建Python开发使用的profile
直接从默认配置中复制，或者新建一个profile，专用于远程Python开发环境的本地设置。
![在这里插入图片描述](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/d313f18d098a445fabef12561f77dfc5.png) 
## 安装SSH插件
插件分为本地插件和远程插件，在左侧插件管理中，连接到远程服务器后，灰色代表插件只在远程服务器生效。安装完SSH插件后，点击左侧SSH管理，连接到远程服务器
![在这里插入图片描述](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/fddeeff23d914ce194b1dea8c99ddc48.png)

左下角绿色SSH表示已经连接到远程服务器，这个时候我们就可以打开远程的工作目录（如果没有，可以创建一个）
![在这里插入图片描述](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/e029a7526e5b4dae94092863ac7c8618.png)
## 安装插件与使用
安装Python、Jupyter两个必要插件，安装完这两个插件后，在运行Python脚本、Jupyter代码cell的时候，就能配置Python的Interpreter
![在这里插入图片描述](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/615f3fed8ded4252ac7576f27b77ed5b.png)
## 其他插件
+ GitLens：有Git使用需求，推荐安装GitLens插件
+ Cline：集成多个平台API的AI插件
![在这里插入图片描述](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/5f8c1b64b8c3495f9b1fef20d37eb660.png)
# 使用
通过以上步骤，远程Python开发环境基本配置好了，如果使用Jupyter，安装jupyterlab包。打开VSCode终端并切换到remote的conda环境安装即可。
```shell
conda activate remote
conda install jupyterlab
```
+ 配置解释器
![image-20250930222438656](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/image-20250930222438656.png)
+ 安装其他包：其他包的安装与jupyterlab类似，统一切换到remote环境后使用conda命令安装
	```shell
	(remote) # teletele @ Teletele-Linux in ~/Code/Python-remote [11:53:19]
	$ conda install numpy pandas matplotlib
	```
+ 代码：完成配置后，编辑这一段代码在远程执行，对于matplotlib的绘图功能，通过执行py文件将图像投影到本地比较麻烦，使用.ipynb文件执行非常方便
	```python
	import matplotlib.pyplot as plt
	import numpy as np
	
	# 创建数据
	x = np.linspace(0, 30, 3000)  # 0到10之间的100个点
	y = np.cos(x)  # 正弦函数
	
	# 创建图形和坐标轴
	plt.figure(figsize=(8, 6))  # 设置图形大小
	
	# 绘制折线图
	plt.plot(x, y, label='sin(x)', color='blue', linewidth=2)
	
	# 添加标题和标签
	plt.title('graph sin(x)', fontsize=16)
	plt.xlabel('X', fontsize=12)
	plt.ylabel('Y', fontsize=12)
	
	# 添加网格和图例
	plt.grid(True, alpha=0.3)
	plt.legend()
	
	# 显示图形
	plt.show()
	```
![image-20250930222354735](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/image-20250930222354735.png)
# 总结
本文主要介绍了Python、Jupter远程开发环境的配置和使用，核心在于环境管理的理念和插件的安装，对环境配置比较感兴趣也可以自行配置SSH免密连接远程服务器。