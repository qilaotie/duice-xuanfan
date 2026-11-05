# 对策选饭

校园食堂档口与菜品评价网站。前端是静态 HTML、CSS 和 JavaScript，现有后端使用 Flask 和 SQLite。

## 本地运行

在 PowerShell 中运行以下命令。

```powershell
cd canteen_backend
python -m pip install -r requirements.txt
python -c "from app import init_database; init_database()"
python -m flask --app app run --no-debug --host 127.0.0.1 --port 5000
```

打开 http://127.0.0.1:5000/ 。新数据库会从空的档口目录开始。需要初始化管理员时，在执行初始化命令前设置环境变量 `CANTEEN_ADMIN_PASSWORD`，长度为 12 至 100 个字符。已有管理员使用数据库里保存的密码。

## 后续云部署

计划由 GitHub Pages 发布 `canteen_frontend/`，Cloudflare Workers 提供 API，D1 保存业务数据。目前代码运行在 Flask 和 SQLite 上，迁移后再启用 Pages 发布。

迁移时需要把前端的相对 API 和图片路径接到 Worker 地址，在 Worker 上配置 Pages 来源的跨域访问，并把 Flask 数据访问改为 D1 查询。现有数据库可按需要单独迁移，先确定是否保留账号、评价和图片，再生成导入数据。

本地 SQLite、管理员密码文件和本机截图均排除在 Git 提交之外。
