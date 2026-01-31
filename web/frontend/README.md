# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## GitHub Pages 部署

本项目已配置为支持 GitHub Pages 部署。

### 部署步骤

1. **安装依赖**（如果还没有安装 gh-pages）：
   ```bash
   npm install
   ```

2. **部署到 GitHub Pages**：
   ```bash
   npm run deploy
   ```

   这个命令会：
   - 自动运行 `npm run build` 构建生产版本
   - 将 `build` 文件夹的内容部署到 GitHub Pages 的 `gh-pages` 分支

3. **配置 GitHub Pages**：
   - 前往 GitHub 仓库的 Settings > Pages
   - 将 Source 设置为 `gh-pages` 分支
   - 保存后，网站将在几分钟内可用

### 访问地址

部署成功后，网站将在以下地址可用：
- https://THE3-EDU.github.io/installation-ankorau

### 注意事项

- 如果仓库名称或组织名称不同，请修改 `package.json` 中的 `homepage` 字段
- 路由已配置为支持 GitHub Pages 的 base path
- 每次更新代码后，运行 `npm run deploy` 即可更新网站

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
