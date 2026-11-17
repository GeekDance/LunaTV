# Cloudflare Workers 独立测试版

本分支基于 MoonTechLab/LunaTV `6c0428d1ae7a8322efa8031909ec77cac22fd866`（100.1.3），使用 OpenNext 将 Next.js 升至 15.5.29，增加 D1 存储适配。正式域名及原站数据库没有迁移。

## 已部署环境

- 地址：<https://lunatv-workers-test.doushuqi0409.workers.dev>
- Worker 与 D1 名称均为 `lunatv-workers-test`，没有使用 R2、队列或 Durable Objects。
- 使用现有 Workers Paid 账号，共享账号额度。没有单独开通新的订阅。
- 管理员用户名为 `IceDcap`，密码通过 Worker Secret `PASSWORD` 保存；本地副本在被忽略的 `.dev.vars`，不提交仓库。
- 仅配置公开演示视频。搜索任意关键词都会返回同一个演示条目，用于验证应用流程，不代表已接入正式站点的内容源。

## 重建与部署

### 真实免费账户测试

已另建 `IceDcap LunaTV Free Test`（Workers Free，US$0），使用 `wrangler.free.jsonc`、独立数据库 `lunatv-free-test` 和命名授权 `lunatv-free`，没有降级原账号。当前地址：<https://lunatv-free-test.icedcap-lunatv-free-test.workers.dev>。

```sh
pnpm cf:build
pnpm cf:deploy:free
```

免费配置不设置 Paid 专属 CPU 覆盖值，使用平台的真实免费限制。2026-11-17 部署与 HTTPS 已通过；真实免费环境下登录、首页 70 个条目、公开演示搜索/HLS 播放、收藏与观看记录持久化均已验证。

最初 118 个演示源仅返回 50 个来源，已通过服务端单来源单页请求、浏览器最多四路并发修复。真实 Free 复测：实时与普通搜索均返回全部 118 个来源，三页覆盖已验证；一个来源故意失败时显示错误，其余 117 个来源与播放正常。完整 Jest 28 项、类型检查、定向 lint 和 OpenNext 构建通过。

资源验收仍有边界：抽样成功请求的 CPU 峰值达 552 毫秒，超过免费标称 10 毫秒。官方说明存在 CPU 结转机制，不能以当前未中断证明长期稳定。118 源三页搜索需要 354 次页面调用，另有配置与其他请求，会消耗账号每日 10 万次额度。用户已选择正式站共用原 Paid 套餐，保留此独立 Free 测试站。

测试库已恢复为单个公开演示源、最大一页，收藏与进度保留，首页 70 个条目和继续观看复验通过。正式域名尚未切换；后续在原账户准备正式部署并核验原站数据。[真实免费测试记录](docs/cloudflare-real-free-validation.json)。

### 原 Paid 对照环境

需要 Node.js 22.13+（SQLite 测试需要 `node:sqlite`）和 pnpm。先登录 Wrangler 并确认目标账号；在自己的账号重建时，必须先创建独立 D1，并替换 `wrangler.jsonc` 中的数据库 ID、Worker 名称及用户名。

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 migrations apply lunatv-workers-test --remote
pnpm exec wrangler secret put PASSWORD
pnpm exec wrangler d1 execute lunatv-workers-test --remote --file scripts/workers-test-seed.sql
pnpm cf:build
pnpm cf:deploy
```

演示初始化脚本仅在配置尚不存在时写入，不覆盖已有配置。它引用本分支中的公开 JSON 测试源；克隆到其他仓库时应同步调整地址。不要对正式数据库运行测试脚本。

本地预览前，将测试密码写入 `.dev.vars`，应用本地迁移后运行：

```sh
pnpm exec wrangler d1 migrations apply lunatv-workers-test --local
pnpm cf:build
pnpm cf:preview
```

`keep_names: false` 用于避免 next-themes 内联脚本出现 `__name is not defined`。D1 在每次操作时从当前请求上下文获取绑定；不会跨请求保存连接对象。SQL 使用绑定参数，用户账号密码采用带随机盐的 PBKDF2 哈希。

## 验证结果与边界

- D1 自动化测试 4 项通过，涵盖用户隔离、配置持久化、密码校验和搜索历史。
- TypeScript 检查及 OpenNext 生产构建通过。
- 云端正常浏览器已验证：管理员登录、首页电影/剧集/新番/综艺加载、演示搜索、HLS 视频实际播放、收藏与观看记录刷新后保留。
- 当前测试没有再出现原站首页的客户端崩溃。原站内容源、直播源、定时任务、多人并发和长时间稳定性尚未验收。
- 搜索历史采用读取后写入，同一用户并发修改可能覆盖；此版本适合独立试用，尚未作生产迁移验收。
- 已将测试 Worker 设置为 `cpu_ms: 10`、`subrequests: 50`，云端版本也已读回确认。账号仍为 Paid，不能把这次结果写成真实 Free 账号已验收。
- 临时对照探针的固定 CPU 计算触发了 Error 1102，日志为 `exceededCpu`，证明运行时确实会执行 CPU 终止。平台存在突发宽限，不能要求每条成功请求的 CPU 都小于 10ms，也不能仅凭少量成功请求推断长期稳定性。
- 已保存不含 Cookie、请求头和查询参数的[限制测试证据](docs/cloudflare-free-limits-evidence.json)。D1 免费套餐的每日读写额度、单库容量与每次调用查询上限还需要单独核验；当前配置不会自动把 Paid 数据库变为 Free。
- [资源核对记录](docs/cloudflare-resource-audit.json)确认测试数据库约 32KiB，播放记录等前缀查询使用主键索引；当前静态资源数量、单文件大小和启动耗时在官方免费限额内。这些是容量与查询方式检查，不替代真实免费账号验收。

```sh
pnpm exec jest --runInBand src/lib/__tests__/d1.db.test.ts
pnpm typecheck
```

不要提交 `.dev.vars`、授权文件、Cookie 或包含请求凭证的完整日志。
