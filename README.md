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

## 云部署

Cloudflare Pages 发布前端，通过服务绑定访问 Cloudflare Worker API。GitHub Pages 保留为跳转入口。D1 保存业务数据和压缩后的 JPEG 照片。使用本地 Flask 时，前端继续从同一来源请求 API。

1. 用 Wrangler 登录 Cloudflare，运行 `npx wrangler d1 create duice-xuanfan`，把数据库 ID 填进 `cloudflare/wrangler.jsonc` 的 `database_id`。
2. 在仓库根目录运行 `npx wrangler d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc`。
3. 如需保留已有数据，用 `python cloudflare/export_sqlite.py canteen_backend/instance/canteen.db <临时文件路径.sql>` 导出数据，再运行 `npx wrangler d1 execute DB --remote --config cloudflare/wrangler.jsonc --file <临时文件路径.sql>`。仅向空库导入一次。导出保留密码哈希，清除旧登录令牌，导入文件应放在仓库外。
4. 运行 `npx wrangler deploy --config cloudflare/wrangler.jsonc`。用 Worker 的 `/api/health` 验证数据库绑定。
5. GitHub Pages 选择 GitHub Actions，运行 `Deploy GitHub Pages` 即可发布跳转入口。跳转目标写在 `.github/workflows/pages.yml` 中。

本地 SQLite、管理员密码文件和本机截图均排除在 Git 提交之外。
