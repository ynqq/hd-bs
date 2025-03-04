# docker 构建、部署工具

### 初始化

1. 执行 <font color="#00baff">config</font> 命令，查看 rc 文件地址。打开配置文件，因为配置有些复杂，建议手动修改。

```node
    hd-bs config ls
```

2. 随便创建一个文件夹，然后执行 <font color="#00baff">init</font> 命令，将文件夹地址当做工作目录。

```node
    hd-bs init <工作目录地址>
```

### 构建并且部署

- (如果不需要执行 build 可以加-p 跳过)

```node
    hd-bs bs [-p]
```

### 只部署

- hd-bs d 192.168.0.12:6002/vue/doc:dev.1.0.0.1.2345

```node
    hd-bs d <tag>
```

### 配置

1. 查看配置

   ```node
       hd-bs config ls
   ```

2. 设置配置
   ```node
       hd-bs config set <key> <value>
   ```
3. 添加分支
   ```node
       hd-bs config add-branch <分支名称> <服务器host> <服务器上docker所处文件夹>
   ```
4. 删除分支
   ```node
       hd-bs config delete-branch <分支名称>
   ```
