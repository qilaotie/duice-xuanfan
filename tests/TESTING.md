# 测试计划与本地完成记录

## 范围与通过条件

浏览器前端、Cloudflare Worker、Flask 及 Python 维护工具分别检查分支覆盖率，每层均须达到 80%，同时要求该层全部测试通过。第三方依赖、测试夹具、SQL 数据和样式表不计入可执行代码分支分母。SQL 迁移由 Worker 测试依序应用到空库，随后通过 API 检查数据结构和约束。

| 层 | 纳入统计 | 覆盖率工具 |
| --- | --- | --- |
| 前端 | `canteen_frontend/app.js`、`config.js` | Playwright 的 Chromium JavaScript 覆盖率，V8 执行范围经 v8-to-istanbul 转换 |
| Worker | `cloudflare/*.mjs` | Node.js test runner 的 V8 分支范围 |
| Python | `canteen_backend`、`cloudflare` 下的 Python 源码 | coverage.py 分支弧 |

各工具的分支定义不同，分别报告各自的分子和分母，避免把不同运行时的结果合成一个百分比。V8 执行范围也不等同于对每个布尔子条件分别计数。

## 测试设计和追溯

| 测试对象 | 用例 | 主要验证 |
| --- | --- | --- |
| 账户、会话与资料 | Worker AUTH-01、Flask `test_account_profile_and_avatars` | 注册确认密码、重复账号、登录失败、访客权限、头像上传与删除 |
| 校内目录与评价 | Worker REV-01、Flask `test_review_lifecycle_and_photos`、浏览器 UI-01/UI-02 | 搜索和楼层组合筛选、无结果、评分边界、菜品、配图、匿名、评价所有权和撤回 |
| 管理与反馈 | Worker ADM-01、Flask `test_admin_workflows`、`test_validation_and_admin_access_matrix`、浏览器 UI-04 | 普通用户权限拒绝、食堂和档口改名、审核入库、举报处理和状态转换 |
| 论坛 | Worker FOR-01、Flask `test_feedback_and_forum`、浏览器 UI-03 | 推荐与避雷筛选、必填字段、回复楼层、翻页参数和帖子删除权限 |
| 同步、导出与兼容入口 | `test_tools.py` | 菜单解析、网络回退、dry-run、保留校内地点、导出图片并清除令牌、兼容命令 |

设计包含输入等价类、边界值、状态转换、权限决策和关键浏览器流程。自动化只使用可丢弃的数据库与合成账号。

## 复现与证据

使用 Node.js 24、Python 3.11，以及 Playwright 安装的 Chromium。Windows 也可以通过 `BROWSER_EXECUTABLE` 指定已安装的 Edge。

```sh
python -m pip install -r tests/requirements.txt
npm ci
npx playwright install chromium
npm run test:worker
python -m coverage run --branch --source=canteen_backend,cloudflare -m unittest discover -s tests -p 'test_*.py'
python -m coverage json -o coverage-flask.json
python tests/check_flask_coverage.py
npm run test:frontend
```

本地执行记录为 2026-11-06，Worker 4 个用例组通过，Python 9 个通过，浏览器 4 个场景通过。分支覆盖率分别为 Worker 81.75%，Python 410/498（82.33%），前端 516/593（87.01%）。CI 保留各层的报告作为运行证据。生产 Cloudflare D1 由 SQLite 适配器模拟，边缘服务绑定和平台限制需另行做部署验证。

2026-11-07 界面与照片查看器更新后，Chromium 运行 9 个浏览器场景全部通过，前端分支覆盖率为 748/831（90.01%）。新增 PHOTO-01 验证照片切换、缩放、Tab 焦点约束、Escape、浏览器前进返回和返回原评价表单，LAYOUT-01 验证 390 像素宽视口的页头高度与横向溢出。

食堂校区和校内美食目录更新后，11 个浏览器场景全部通过，前端分支覆盖率为 847/939（90.20%）。DINING-01 验证南北校区、餐厅和楼层筛选及东区二楼的西军电归属，CAMPUS-01 验证综合楼筛选、楼层筛选及刷新恢复。

## ISO/IEC/IEEE 29119 对照范围

本记录以 29119-2:2021 组织测试范围、执行和退出条件，以 29119-3:2021 组织用例追溯与完成记录，以 29119-4:2021 记录适用的测试设计技术。80% 是本项目的验收门槛。正式符合性判定仍需按标准全文核查适用条款、裁剪依据和组织级记录。

- [29119-2 测试过程](https://www.iso.org/standard/79428.html)
- [29119-3 测试文档](https://www.iso.org/standard/79429.html)
- [29119-4 测试技术](https://www.iso.org/standard/79430.html)
