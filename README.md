# sw-trace

SkyWalking trace 抓取、代码定位与自动分析工具。支持生成分析报告、详细设计文档和需求规格说明书。作为 Claude Code skill 使用。

## 前置条件

- Node.js 18+
- SkyWalking OAP 服务运行中（GraphQL 端口默认 12800）

### 注意

skywalking的客户端需要做如下配置，否则无法达到最佳效果

#### 一、skywalking的agent.config要做好配置：

agent要做如下配置才能达到最佳效果

```
collector.backend_service=${SW_AGENT_COLLECTOR_BACKEND_SERVICES:127.0.0.1:11800}
agent.service_name=${SW_AGENT_NAME:Your_ApplicationName}
agent.sample_n_per_3_secs=${SW_AGENT_SAMPLE:-1}
agent.is_open_debugging_class=${SW_AGENT_OPEN_DEBUG:true}
plugin.springmvc.use_qualified_name_as_endpoint_name=true
plugin.toolkit.use_qualified_name_as_operation_name=true
plugin.jdbc.trace_sql_parameters=true
plugin.jdbc.sql_parameters_max_length=102400
plugin.jdbc.sql_body_max_length=204800
plugin.tomcat.collect_http_params=true
plugin.springmvc.collect_http_params=true
plugin.httpclient.collect_http_params=true
plugin.http.http_params_length_threshold=102400
plugin.feign.collect_request_body=true
plugin.feign.filter_length_limit=102400
plugin.nettyhttp.collect_request_body=true
agent.keep_tracing=true
```

#### 二、oracle的支持

本项目在官方 `plugins/` 目录中额外添加了以下插件：

apm-oracle-10.x-plugin-2.3.1.jar

| 属性       | 值                                                         |
| ---------- | ---------------------------------------------------------- |
| 来源       | `org.openskywalking`（OpenSkyWalking 社区，非官方 Apache） |
| 版本       | 2.3.0（2022-11-23 构建）                                   |
| 字节码版本 | Java 8 (major version 52)                                  |
| Maven 坐标 | `org.openskywalking:apm-oracle-10.x-plugin:2.3.1`          |

**为什么需要**：Apache SkyWalking 从 v9.x 起移除了官方 Oracle JDBC 插件（License 问题，Oracle JDBC 驱动不允许再分发）。如果你的项目使用 Oracle 数据库（如 `ojdbc14`、`ojdbc6`、`ojdbc8`），必须手动添加此社区插件。

**注意**：此插件来自 OpenSkyWalking 社区，不是 Apache 官方维护。与 Agent 9.3.0 的兼容性未经完整测试，使用前需验证。





## 安装

```bash
cd ~/.claude/skills/sw-trace
npm install
npm run build
```

安装后 `/sw-trace` 命令自动在 Claude Code 中可用。

## Repo 概念

所有配置按 repo（工程）隔离。每个 repo 独立保存 SkyWalking 地址、代码仓库路径等。

- 配置存储位置：`~/.claude/sw-trace/repos/<repo名>/config.yaml`
- 自动记住上次使用的 repo，下次默认使用
- 可通过 `--repo` 指定使用其他 repo
- `/sw-trace reset` 清空所有 repo

## 使用方法

### 1. 配置（首次使用必须）

在 Claude Code 中输入：

```
/sw-trace config
```

Claude Code 会交互式引导你：
1. 选择已有 repo 或创建新 repo
2. 配置 SkyWalking OAP 地址（host、port、protocol）
3. 配置代码仓库路径（支持多个工程，每个指定类型 springboot/springmvc/ejb/generic）
4. 输出目录（默认 `.trace`）

也可以手动创建配置文件到 `~/.claude/sw-trace/repos/<repo名>/config.yaml`：

```yaml
skywalking:
  host: "127.0.0.1"
  port: 12800
  protocol: "http"
  timeout: 30

codebases:
  - name: "my-service"
    path: "/path/to/project"
    type: "springboot"        # springboot | springmvc | ejb | generic
    source_roots:
      - "src/main/java"

output:
  directory: ".trace"         # 支持相对路径或绝对路径（如 /Users/xxx/output）

# 可选：外部提示词覆盖
# prompt_override: "/path/to/custom-prompt.md"
```

### 2. 交互式选择 trace（无需 trace_id）

直接输入 `/sw-trace`，Claude Code 会引导你完成三步选择：

```
/sw-trace
```

1. **选择 trace** — 自动查询 SkyWalking 最近 30 条 trace，多选你要分析的 trace
2. **选择名称** — 预设选项：时间戳 / 端点名 / 自定义输入
3. **选择模式** — analysis（分析报告）、design（详细设计文档）或 requirement（需求规格说明书）

可指定高级参数：

```
/sw-trace --limit 50 --minutes 60   # 查询最近 60 分钟内的 50 条 trace
/sw-trace --repo bjs_newb           # 指定 repo
```

### 3. 查看/切换 repo

```
/sw-trace repo              # 列出所有 repo，标记当前使用的
/sw-trace repo <name>       # 切换到指定 repo
```

**示例：**

```
/sw-trace repo
# Available repos:
#   bjs_newb * (current)
#   payment-system

/sw-trace repo payment-system
# Switched to repo: payment-system
```

### 4. 抓取并分析 trace（直接传 trace_id）

```
/sw-trace <trace_ids> [--name <name>] [--repo <repo>] [--design] [--requirement]
```

**参数：**

| 参数 | 说明 |
|------|------|
| `trace_ids` | 一个或多个 SkyWalking trace ID（空格或逗号分隔） |
| `--name, -n` | 输出文件夹名称（默认 `trace-<时间戳>`） |
| `--repo, -r` | 指定 repo（默认使用上次，也可用 `/sw-trace repo <name>` 切换） |
| `--design` | 生成全链路详细设计文档 |
| `--requirement` | 生成需求规格说明书 |
| `--no-analyze` | 跳过自动分析 |
| `--no-locate` | 跳过代码定位 |
| `--no-csv` | 跳过 CSV 导出 |

**示例：**

```
/sw-trace abc123.1.123 --name login-bug
/sw-trace id1 id2 id3 --name order-flow --repo bjs_newb
/sw-trace id1 --name payment --design
/sw-trace id1 --name order --requirement
```

### 5. 全链路详细设计文档

```
/sw-trace <trace_ids> --name <name> --design
```

使用 `--design` 选项时，Claude Code 会阅读源代码并生成符合标准详细设计文档规范的 `design.md`，包含：

| 章节 | 内容 |
|------|------|
| 概述 | 涉及的服务、完整链路概述 |
| 全链路流程图 | Mermaid flowchart，标注错误和慢调用 |
| 时序图 | Mermaid sequence diagram，按时间展示服务交互 |
| 状态图 | Mermaid state diagram，关键业务对象状态流转 |
| 接口设计 | 接口列表 + 每个接口的入参/出参定义（从源码提取） |
| 数据库设计 | 涉及的表、SQL 语句、调用位置 |
| 服务间调用关系 | 服务依赖关系图 |
| 性能分析 | 调用耗时分布、瓶颈分析 |
| 异常分析 | 错误详情、传播链路、根因分析 |

### 6. 需求规格说明书

```
/sw-trace <trace_ids> --name <name> --requirement
```

使用 `--requirement` 选项时，Claude Code 会阅读源代码从业务视角分析，生成 `requirement.md`，包含：

| 章节 | 内容 |
|------|------|
| 概述 | 涉及的业务模块、核心业务流程简述 |
| 业务状态流转表 | 业务对象的状态列表，以及每个状态变更发生在哪个环节/接口 |
| 业务流程图 | Mermaid flowchart，纯业务视角（非技术调用链） |
| 功能描述 | 按业务模块逐个描述每个环节的业务功能、输入输出、处理逻辑 |
| 业务规则 | 校验规则、状态转换规则、其他业务规则 |

> **注意：** `--requirement` 模式只生成 `requirement.md`，不生成 analysis.md、locations.json 和 CSV 文件。

### 7. 重置配置

```
/sw-trace reset
```

清空所有 repo 和配置，重新开始。

### 8. 查看帮助

```
/sw-trace help
```

## 输出结构

所有输出文件在当前项目目录的 `.trace/<name>/` 下。

### 标准模式

```
.trace/<name>/
├── meta.json              # 抓取元信息（含 repo 名称）
├── raw/
│   └── <trace_id>.json    # 原始 span 数据
├── <trace_id>.csv         # 层级 CSV
├── locations.json         # 代码定位结果
└── analysis.md            # 分析报告
```

### 设计文档模式 (--design)

```
.trace/<name>/
├── meta.json
├── raw/
│   └── <trace_id>.json
├── <trace_id>.csv
├── locations.json
├── analysis.md
└── design.md              # 详细设计文档
```

### 需求规格说明书模式 (--requirement)

```
.trace/<name>/
├── meta.json
├── raw/
│   └── <trace_id>.json
└── requirement.md         # 需求规格说明书
```

## 配置存储位置

```
~/.claude/sw-trace/
└── repos/
    ├── .current                  # 记录上次使用的 repo 名称
    ├── bjs_newb/
    │   └── config.yaml           # 北金所官网的配置
    └── payment-system/
        └── config.yaml           # 支付系统的配置
```

## 支持的工程类型

| 类型 | 说明 |
|------|------|
| `springboot` | Spring Boot 项目，支持 `@RestController` / `@GetMapping` 等注解 |
| `springmvc` | Spring MVC 项目（非 Boot），注解匹配逻辑与 springboot 一致 |
| `ejb` | EJB 项目，支持 `@Path` / `@GET` 等 JAX-RS 注解 |
| `generic` | 通用项目，仅通过 service_code 全文搜索 |

## 代码定位原理

按优先级依次尝试：

1. **class.name 匹配** — 从 span tags 中取 `class.name`，转为文件路径查找 Java 文件，再按 `method.name` 定位行号
2. **endpoint 注解搜索** — 按 HTTP 路径搜索 `@RequestMapping` / `@GetMapping` 等注解
3. **JAX-RS 注解** — 对 EJB 项目搜索 `@Path` / `@GET` 等 JAX-RS 注解
4. **service_code grep** — 兜底：按服务名在代码库中全文搜索

## 提示词外部挂载

在 repo 的 config.yaml 中配置：

```yaml
prompt_override: "/path/to/custom-prompt.md"
```

配置后，Claude Code 执行 `/sw-trace` 时会优先使用该文件中的指令。

## 项目结构

```
sw-trace/
├── SKILL.md                # Claude Code skill 定义
├── README.md               # 本文件
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # CLI 入口
│   ├── config.ts           # 配置管理（repo 隔离）
│   ├── client.ts           # GraphQL 客户端
│   ├── tree.ts             # 调用链树构建
│   ├── csv-writer.ts       # CSV 导出
│   ├── code-locator.ts     # 代码定位
│   ├── analyzer.ts         # 自动分析
│   └── types.ts            # 类型定义
└── dist/                   # 编译输出
```
