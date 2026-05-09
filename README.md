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

### 2. 查看/切换 repo

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

### 3. 抓取并分析 trace

```
/sw-trace <trace_ids> [--name <name>] [--repo <repo>]
```

**参数：**

| 参数 | 说明 |
|------|------|
| `trace_ids` | 一个或多个 SkyWalking trace ID（空格或逗号分隔） |
| `--name, -n` | 输出文件夹名称（默认 `trace-<时间戳>`） |
| `--repo, -r` | 指定 repo（默认使用上次，也可用 `/sw-trace repo <name>` 切换） |
| `--no-analyze` | 跳过自动分析 |
| `--no-locate` | 跳过代码定位 |
| `--no-csv` | 跳过 CSV 导出 |

**示例：**

```
/sw-trace abc123.1.123 --name login-bug
/sw-trace id1 id2 id3 --name order-flow --repo bjs_newb
```

### 4. 全链路详细设计文档

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

### 5. 重置配置

```
/sw-trace reset
```

清空所有 repo 和配置，重新开始。

### 6. 查看帮助

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
