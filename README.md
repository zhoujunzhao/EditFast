# EditFast

弄个记事本玩玩

## 介绍
就是一个记事本，简简单单，没啥功能。

## 开发
#### 初始化
bun install   

#### 开发测试运行
bun run tauri dev 启动开发测试运行

bun dev  仅仅开发调试前端  

#### 还未考虑在 Android 上的运行
bun run tauri android dev

#### 为所有平台打包
bun run tauri build

#### 只为 Windows 打包
##### 如果不需要任何安装包，只想得到一个可直接运行的绿色 .exe 文件，使用 --no-bundle 跳过所有打包步骤。
bun run tauri build --target x86_64-pc-windows-msvc --no-bundle

## bun使用  
• bun install：安装 package.json 中的所有依赖。  
• bun add <package>：添加一个生产依赖包。  
• bun add -d <package>：添加一个开发依赖包。  
• bun remove <package>：卸载并移除指定的依赖包。  
• bun update：更新项目中的依赖包。  
• bun outdated：检查过时的依赖包。  
• bun update：更新所有依赖包。    
• bun update <package>：更新指定的依赖包。  
• bun pm diff <package_name>：比较已安装的包和最新版本的包。  
• bun update <package_name> --latest：将指定包更新到最新版本。  

• 添加 后端rust依赖: bun tauri add clipboard-manager  

## 其他
1、在 src-tauri 文件夹中运行 cargo update 将获取所有依赖项的最新可用语义兼容版本。  
2、添加新前端组件 bunx shadcn-vue@latest add button  安装多个时，控件中间用空格隔开。  