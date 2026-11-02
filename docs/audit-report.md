# 数据源与图床体检报告

- 检查日期：2026-11-02
- 代码版本：`bad4976`（master）
- 范围：`src/common/backend/services/` 26 个后端服务、`src/common/backend/imageHosting/` 12 个图床
- 方式：第三方接口实测（curl）、`tsc --noEmit` 全仓类型检查、i18n 键比对、权限/CORS 核对、上游 issue 交叉印证（226 个 open issue）
- 说明：本次只做检查，未修改任何业务代码。新增的 notion（个人令牌）、edgeever、cloudflare-imgbed 不在问题清单内。

## 结论概览

| 级别 | 数量 | 类型 |
| --- | --- | --- |
| P0 已确认不可用 | 1 | memos |
| P1 高风险（有用户报错 + 代码可定位） | 5 | wolai、dida365、ticktick、joplin/siyuan、confluence、onenote_oauth |
| P2 健壮性 / 安全 / 文案 | 5 类 | server_chan、header 规则泄漏、图床权限缺口、非空断言、i18n |
| P3 维护项 | 4 类 | 静默类型错误、网络可达性、写死文案、配置硬编码 |

## P0：memos 整体不可用

**现象**：账号绑定与剪藏保存都失败。上游 #1365「memos 设置失败 Not Found」、#1344「memos 校验报错」即此问题。

**证据**（实测 <https://demo.usememos.com>）：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://demo.usememos.com/api/v1/auth/status
# 410
# {"code":12,"message":"API v1 has been removed. Use /api/... for REST and /memos.api.<Service>/<Method>..."}

curl -s https://demo.usememos.com/api/memos | head -c 120
# 200 {"memos":[{"name":"memos/webclipper0001","creator":"users/steven","content":"# ✂️ Memos Web Clip...
```

**代码位置**：`services/memos/service.ts`

- `getUserInfo()` 请求 `v1/auth/status`，且用的是 `post`（该接口本应是 GET）
- `createDocument()` 请求 `v1/memos`
- 请求前缀为 `${origin}/api/`，因此实际命中已被移除的 `/api/v1/*`

**修复方向**：适配 Memos 新的 AIP 风格接口（REST 在 `/api/...`，返回体是 `{"memos":[{"name":"memos/xxx"}]}` 这类资源名格式，写入与用户信息路径都需要重新对照官方文档，不是简单改版本号）。同时把写死的 `getId() === '0'`、`getRepositories()` 的「默认分区 Default Repo」一并处理，否则多账号会互相覆盖。

## P1：高风险

### wolai（上游 #1352「wolai 剪藏失败，api 报错」）

- `services/wolai/service.ts:128`：`Object.keys(data.policyData.formData)` 无兜底。wolai 一旦调整对象存储返回结构，这里直接抛 `Cannot convert undefined or null to object`（#1366 的标题就是这个错误）。
- `getFileUrl()` 只接受 `code === 1000`，其余一律抛 `getSignedPostUrl error`，无法区分「接口改版」和「真的失败」。
- 建议：取值加可选链 + 明确错误文案；把 `code` 判断放宽为「有 `policyData` 即继续」。

### dida365 / ticktick（上游 #1342「滴答清单无法绑定」）

- 两个服务同一处缺陷：`dida365/service.ts:81`、`ticktick/service.ts:81` 的 `checkResponse.tags.map(...)`，`tsc` 明确报 `'tags' is possibly 'undefined'`。
- `groupMap.get(groupId)!` 用非空断言，分组不存在时 `groupName` 会是 `undefined`，下拉框显示空白。
- 建议：`?? []` 兜底 + 分组名回退到 `rootGroup`；顺带把 `webRequestService.end(header)` 放进 `try/finally`（见 P2）。

### joplin / siyuan（上游 #1369「localhost 无法通信」）

- 端口硬编码：joplin `http://localhost:41184/`（后端与图床各写一次），siyuan `http://localhost:6806/`。用户改端口即全部失效。
- Firefox 下扩展访问 localhost 的权限模型与 Chrome 不同，`#1369` 报 `invalid token` 与此相关。
- 建议：端口做成可配置项，或至少在错误提示里点明「端口需为 41184/6806」。

### confluence（上游 #1357「Confluence 9.2.1 不兼容」）

- `services/confluence/index.ts` 没有 `permission` 字段，请求与 CORS 全依赖对方站点是否放行。
- `form.tsx:83,85` 用 `_expandable.homepage!` 拼字符串，Atlassian API 少返回该字段就白屏。
- 建议：补 `permission.origins: ['<all_urls>']`；表单里对 `_expandable` 做判空；同步评估 Confluence 9.x 的 `/rest/api/` 变更。

### onenote_oauth（上游 #1295「无法绑定 OneNote」）

- `refreshToken()` 的 scope 仍是 `Notes.Create User.Read offline_access`，微软已弃用 `Notes.Create`，新注册应用应使用 `Notes.ReadWrite`。
- `createDocument()` 直接读 `result.data.links.oneNoteWebUrl.href`，未判空。
- 类型层面 `createDocument` 与 `DocumentService<T>` 签名不匹配（`tsc` TS2416），目前靠 `any` 兜着。

## P2：健壮性与安全

1. **server_chan token 未脱敏**：`services/server_chan/service.ts` 的 `getId()` 直接 `return this.config.accessToken`，token 会出现在账号 id、DOM 与 storage key 中。其他服务（github/piclist/notion）都用 md5。
2. **declarativeNetRequest 规则泄漏**：`dida365`、`ticktick` 的 `createDocument` 在请求后才 `end(header)`，没有 `try/finally`；请求抛错时动态规则残留（`buildin`、`flowus`、`wolai` 是两处 `end`，写法正确）。
3. **图床权限缺口**：`baklib`、`leanote`、`wiznote`、`joplin`、`siyuan` 图床的 `ImageHostingServiceMeta` 都没有 `permission.origins`。实测坚果云 WebDAV 预检不带 `Access-Control-Allow-Origin`，baklib API 同样没有，能否工作取决于用户是否已为后端服务授权过同一域名。
4. **非空断言**：`wiznote/service.ts:62,205`（`this.userInfo!.kbGuid`）、`confluence/form.tsx:83,85`、`imageHosting/github/form.tsx:111`。
5. **i18n 缺口**：代码引用的 108 个 key 中，en-US 缺 8 个（memos 3 个、`backend.services.leanote.form.pwd`、`backend.services.github.accessToken.message`、`backend.services.ulysses.form.confirm`、`backend.imageHosting.github.form.branch`、`wiz_custom_css`），zh-CN 缺 5 个；另有 46 个 key 在 en-US 为空字符串（中文正常，英文靠 `defaultMessage` 兜底）。

## P3：维护项

1. **静默类型错误**：`npx tsc --noEmit` 有 48 条非测试源码错误，但 `ts-loader` 使用 `transpileOnly: true`，构建期全部被忽略。除上文点到的业务缺陷，其余为配置问题：`require.context` 缺 node 类型、`turndown` 无声明文件、`replaceAll` 需要 ES2021 lib。
2. **网络可达性**：`imgur` 实测连接超时（`code=000`），属国内网络不可达，非代码缺陷；`server_chan` 仍在用旧域名 `sc.ftqq.com`（Server酱³ 是 `sctapi.ftqq.com`，两域名目前都存活）。
3. **写死文案**：memos 的 `getRepositories()` 返回中文写死的「默认分区 Default Repo」，未走 i18n。
4. **接口存活确认**（本次实测正常）：`api.wolai.com/v1/authentication/user/getUserInfo`、`note.youdao.com/yws/api/personal/file`、`www.baklib.com/api/v1/tenants`、`www.yuque.com/api/v2/user`、`api.dida365.com/open/v1/project`、`api.ticktick.com/open/v1/project`、`buildin.ai/api/users/me`、`flowus.cn/api/users/me`、`flomoapp.com/api/memo/` 均返回 200/400/401/405 等「端点存在」的响应。

## 建议修复顺序

1. memos 适配新 API（当前等于不可用）
2. wolai、dida365、ticktick 补兜底与明确错误文案，避免再退化成 `Cannot convert undefined or null to object`
3. 自托管 / 自定义域名服务统一补 `permission.origins`，本地服务支持自定义端口
4. server_chan token 脱敏、header 规则 `try/finally`、补 8 个缺失 i18n key

## 附录：复检命令

```bash
# 类型（会包含 node_modules 的类型冲突噪声，用 ^src/ 过滤）
npx tsc --noEmit 2>&1 | grep "^src/"

# 服务与图床清单
ls -d src/common/backend/services/*/ src/common/backend/imageHosting/*/

# memos 新接口探测
curl -s -o /dev/null -w "%{http_code}\n" https://demo.usememos.com/api/v1/auth/status   # 410
curl -s https://demo.usememos.com/api/memos | head -c 120                              # 200
```
