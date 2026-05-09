# sw-trace

SkyWalking trace 抓取、代码定位与自动分析工具。作为 Claude Code skill 使用。

## 前置条件

- Node.js 18+
- SkyWalking OAP 服务运行中（GraphQL 端口默认 12800）

## 安装

```bash
cd ~/.claude/skills/sw-trace
npm install
npm run build
```

安装后 `/sw-trace` 命令自动在 Claude Code 中可用。

## 使用方法

### 1. 配置（首次使用必须）

在 Claude Code 中输入：

```
/sw-trace config
```

Claude Code 会交互式引导你配置：
- SkyWalking OAP 地址（host、port、protocol）
- 代码仓库路径（支持多个工程，每个指定类型 springboot/ejb/generic）
- 输出目录（默认 `.trace`）

配置保存到项目根目录的 `.claude/sw-trace.yaml`。

也可以手动创建 `.claude/sw-trace.yaml`：

```yaml
skywalking:
  host: "127.0.0.1"
  port: 12800
  protocol: "http"
  timeout: 30

codebases:
  - name: "my-service"
    path: "/path/to/project"
    type: "springboot"
    source_roots:
      - "src/main/java"

output:
  directory: ".trace"

# 可选：外部提示词覆盖
# prompt_override: "/path/to/custom-prompt.md"
```

### 2. 抓取 trace

```
/sw-trace <trace_ids> [--name <name>] [--no-analyze] [--no-locate] [--no-csv]
```

**参数：**

| 参数 | 说明 |
|------|------|
| `trace_ids` | 一个或多个 SkyWalking trace ID（空格或逗号分隔） |
| `--name, -n` | 输出文件夹名称（默认 `trace-<时间戳>`） |
| `--no-analyze` | 跳过自动分析 |
| `--no-locate` | 跳过代码定位 |
| `--no-csv` | 跳过 CSV 导出 |

**示例：**

```
/sw-trace 52b3b78f4c724dca916460244100cf07.83.17782147329040001 --name login-bug
```

```
/sw-trace id1 id2 id3 --name order-flow
```

### 3. 查看帮助

```
/sw-trace help
```

## 输出结构

抓取后在项目根目录下生成：

```
.trace/<name>/
├── meta.json              # 抓取元信息（trace ID 列表、时间、OAP 地址）
├── raw/
│   ├── <trace_id>.json    # 原始 span 数据
│   └── ...
├── <trace_id>.csv         # 层级 CSV（每个 trace 一个文件）
├── locations.json         # 代码定位结果
└── analysis.md            # 分析报告
```

## 分析报告内容

`analysis.md` 包含：

- **概览** — 总 span 数、总耗时、错误数、慢调用数
- **错误列表** — 出错的 span 及其代码定位
- **慢调用排行** — 超过 1000ms 的调用按耗时排序
- **数据库调用** — SQL 语句、耗时、数据库实例
- **跨 trace 对比** — 多个 trace 共同命中的慢代码位置

## 代码定位原理

按优先级依次尝试：

1. **class.name 匹配** — 从 span tags 中取 `class.name`，转为文件路径查找 Java 文件，再按 `method.name` 定位行号
2. **endpoint 注解搜索** — 按 HTTP 路径搜索 `@RequestMapping` / `@GetMapping` 等注解
3. **JAX-RS 注解** — 对 EJB 项目搜索 `@Path` / `@GET` 等 JAX-RS 注解
4. **service_code grep** — 兜底：按服务名在代码库中全文搜索

## 提示词外部挂载

在 `.claude/sw-trace.yaml` 中配置：

```yaml
prompt_override: "/path/to/custom-prompt.md"
```

配置后，Claude Code 执行 `/sw-trace` 时会优先使用该文件中的指令，未覆盖的部分回退到 SKILL.md 默认指令。

## 独立 CLI 使用

也可以在终端直接调用编译后的 CLI：

```bash
node ~/.claude/skills/sw-trace/dist/index.js <trace_ids> --name <name>
```

注意：`config` 子命令建议通过 Claude Code 执行，CLI 模式下仅支持 fetch 操作。

## 项目结构

```
sw-trace/
├── SKILL.md                # Claude Code skill 定义
├── README.md               # 本文件
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # CLI 入口
│   ├── config.ts           # 配置管理
│   ├── client.ts           # GraphQL 客户端
│   ├── tree.ts             # 调用链树构建
│   ├── csv-writer.ts       # CSV 导出
│   ├── code-locator.ts     # 代码定位
│   ├── analyzer.ts         # 自动分析
│   └── types.ts            # 类型定义
└── dist/                   # 编译输出
```
