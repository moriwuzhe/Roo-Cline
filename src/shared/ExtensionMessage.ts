// 表示从扩展发送到 Webview 的 JSON 数据类型，称为 ExtensionMessage，并具有 'type' 枚举，可以是 'plusButtonClicked'、'settingsButtonClicked' 或 'hello'

import { ApiConfiguration, ApiProvider, ModelInfo } from "./api"
import { HistoryItem } from "./HistoryItem"
import { McpServer } from "./mcp"
import { GitCommit } from "../utils/git"
import { Mode, CustomModePrompts, ModeConfig } from "./modes"
import { CustomSupportPrompts } from "./support-prompt"
import { ExperimentId } from "./experiments"

// 定义 LanguageModelChatSelector 接口
export interface LanguageModelChatSelector {
	vendor?: string // 供应商
	family?: string // 家族
	version?: string // 版本
	id?: string // ID
}

// Webview 将持有状态
export interface ExtensionMessage {
	type:
		| "action" // 动作
		| "state" // 状态
		| "selectedImages" // 选中的图片
		| "ollamaModels" // Ollama 模型
		| "lmStudioModels" // LM Studio 模型
		| "theme" // 主题
		| "workspaceUpdated" // 工作区更新
		| "invoke" // 调用
		| "partialMessage" // 部分消息
		| "glamaModels" // Glama 模型
		| "openRouterModels" // Open Router 模型
		| "openAiModels" // OpenAI 模型
		| "requestyModels" // Requesty 模型
		| "mcpServers" // MCP 服务器
		| "enhancedPrompt" // 增强提示
		| "commitSearchResults" // 提交搜索结果
		| "listApiConfig" // 列出 API 配置
		| "vsCodeLmModels" // VSCode LM 模型
		| "vsCodeLmApiAvailable" // VSCode LM API 可用
		| "requestVsCodeLmModels" // 请求 VSCode LM 模型
		| "updatePrompt" // 更新提示
		| "systemPrompt" // 系统提示
		| "autoApprovalEnabled" // 自动批准启用
		| "updateCustomMode" // 更新自定义模式
		| "deleteCustomMode" // 删除自定义模式
		| "unboundModels" // 未绑定模型
		| "refreshUnboundModels" // 刷新未绑定模型
		| "currentCheckpointUpdated" // 当前检查点更新
	text?: string // 文本
	action?:
		| "chatButtonClicked" // 聊天按钮点击
		| "mcpButtonClicked" // MCP 按钮点击
		| "settingsButtonClicked" // 设置按钮点击
		| "historyButtonClicked" // 历史按钮点击
		| "promptsButtonClicked" // 提示按钮点击
		| "didBecomeVisible" // 变得可见
	invoke?: "sendMessage" | "primaryButtonClick" | "secondaryButtonClick" | "setChatBoxMessage" // 调用类型
	state?: ExtensionState // 扩展状态
	images?: string[] // 图片数组
	ollamaModels?: string[] // Ollama 模型数组
	lmStudioModels?: string[] // LM Studio 模型数组
	vsCodeLmModels?: { vendor?: string; family?: string; version?: string; id?: string }[] // VSCode LM 模型数组
	filePaths?: string[] // 文件路径数组
	openedTabs?: Array<{
		label: string // 标签
		isActive: boolean // 是否激活
		path?: string // 路径
	}>
	partialMessage?: ClineMessage // 部分消息
	glamaModels?: Record<string, ModelInfo> // Glama 模型记录
	requestyModels?: Record<string, ModelInfo> // Requesty 模型记录
	openRouterModels?: Record<string, ModelInfo> // Open Router 模型记录
	openAiModels?: string[] // OpenAI 模型数组
	unboundModels?: Record<string, ModelInfo> // 未绑定模型记录
	mcpServers?: McpServer[] // MCP 服务器数组
	commits?: GitCommit[] // 提交数组
	listApiConfig?: ApiConfigMeta[] // API 配置元数据数组
	mode?: Mode // 模式
	customMode?: ModeConfig // 自定义模式
	slug?: string // Slug
}

// 定义 ApiConfigMeta 接口
export interface ApiConfigMeta {
	id: string // ID
	name: string // 名称
	apiProvider?: ApiProvider // API 提供者
}

// 定义 ExtensionState 接口
export interface ExtensionState {
	version: string // 版本
	clineMessages: ClineMessage[] // Cline 消息数组
	taskHistory: HistoryItem[] // 任务历史数组
	shouldShowAnnouncement: boolean // 是否显示公告
	apiConfiguration?: ApiConfiguration // API 配置
	currentApiConfigName?: string // 当前 API 配置名称
	listApiConfigMeta?: ApiConfigMeta[] // API 配置元数据数组
	customInstructions?: string // 自定义指令
	customModePrompts?: CustomModePrompts // 自定义模式提示
	customSupportPrompts?: CustomSupportPrompts // 自定义支持提示
	alwaysAllowReadOnly?: boolean // 始终允许只读
	alwaysAllowWrite?: boolean // 始终允许写入
	alwaysAllowExecute?: boolean // 始终允许执行
	alwaysAllowBrowser?: boolean // 始终允许浏览器
	alwaysAllowMcp?: boolean // 始终允许 MCP
	alwaysApproveResubmit?: boolean // 始终批准重新提交
	alwaysAllowModeSwitch?: boolean // 始终允许模式切换
	requestDelaySeconds: number // 请求延迟秒数
	rateLimitSeconds: number // 最小请求间隔秒数（0 = 禁用）
	uriScheme?: string // URI 方案
	allowedCommands?: string[] // 允许的命令数组
	soundEnabled?: boolean // 启用声音
	soundVolume?: number // 声音音量
	diffEnabled?: boolean // 启用差异
	checkpointsEnabled: boolean // 启用检查点
	browserViewportSize?: string // 浏览器视口大小
	screenshotQuality?: number // 截图质量
	fuzzyMatchThreshold?: number // 模糊匹配阈值
	preferredLanguage: string // 首选语言
	writeDelayMs: number // 写入延迟毫秒数
	terminalOutputLineLimit?: number // 终端输出行限制
	mcpEnabled: boolean // 启用 MCP
	enableMcpServerCreation: boolean // 启用 MCP 服务器创建
	mode: Mode // 模式
	modeApiConfigs?: Record<Mode, string> // 模式 API 配置记录
	enhancementApiConfigId?: string // 增强 API 配置 ID
	experiments: Record<ExperimentId, boolean> // 实验 ID 到启用状态的映射
	autoApprovalEnabled?: boolean // 启用自动批准
	customModes: ModeConfig[] // 自定义模式数组
	toolRequirements?: Record<string, boolean> // 工具名称到其要求的映射（例如 {"apply_diff": true} 如果启用差异）
}

// 定义 ClineMessage 接口
export interface ClineMessage {
	ts: number // 时间戳
	type: "ask" | "say" // 类型
	ask?: ClineAsk // 询问类型
	say?: ClineSay // 说类型
	text?: string // 文本
	images?: string[] // 图片数组
	partial?: boolean // 是否部分
	reasoning?: string // 推理
	conversationHistoryIndex?: number // 对话历史索引
}

// 定义 ClineAsk 类型
export type ClineAsk =
	| "followup" // 跟进
	| "command" // 命令
	| "command_output" // 命令输出
	| "completion_result" // 完成结果
	| "tool" // 工具
	| "api_req_failed" // API 请求失败
	| "resume_task" // 恢复任务
	| "resume_completed_task" // 恢复已完成任务
	| "mistake_limit_reached" // 达到错误限制
	| "browser_action_launch" // 浏览器动作启动
	| "use_mcp_server" // 使用 MCP 服务器

// 定义 ClineSay 类型
export type ClineSay =
	| "task" // 任务
	| "error" // 错误
	| "api_req_started" // API 请求开始
	| "api_req_finished" // API 请求完成
	| "api_req_retried" // API 请求重试
	| "api_req_retry_delayed" // API 请求重试延迟
	| "api_req_deleted" // API 请求删除
	| "text" // 文本
	| "reasoning" // 推理
	| "completion_result" // 完成结果
	| "user_feedback" // 用户反馈
	| "user_feedback_diff" // 用户反馈差异
	| "command_output" // 命令输出
	| "tool" // 工具
	| "shell_integration_warning" // Shell 集成警告
	| "browser_action" // 浏览器动作
	| "browser_action_result" // 浏览器动作结果
	| "command" // 命令
	| "mcp_server_request_started" // MCP 服务器请求开始
	| "mcp_server_response" // MCP 服务器响应
	| "new_task_started" // 新任务开始
	| "new_task" // 新任务
	| "checkpoint_saved" // 检查点保存

// 定义 ClineSayTool 接口
export interface ClineSayTool {
	tool:
		| "editedExistingFile" // 编辑现有文件
		| "appliedDiff" // 应用差异
		| "newFileCreated" // 创建新文件
		| "readFile" // 读取文件
		| "listFilesTopLevel" // 列出顶级文件
		| "listFilesRecursive" // 递归列出文件
		| "listCodeDefinitionNames" // 列出代码定义名称
		| "searchFiles" // 搜索文件
		| "switchMode" // 切换模式
		| "newTask" // 新任务
	path?: string // 路径
	diff?: string // 差异
	content?: string // 内容
	regex?: string // 正则表达式
	filePattern?: string // 文件模式
	mode?: string // 模式
	reason?: string // 原因
}

// 必须与系统提示保持同步
export const browserActions = ["launch", "click", "type", "scroll_down", "scroll_up", "close"] as const
export type BrowserAction = (typeof browserActions)[number]

// 定义 ClineSayBrowserAction 接口
export interface ClineSayBrowserAction {
	action: BrowserAction // 动作
	coordinate?: string // 坐标
	text?: string // 文本
}

// 定义 BrowserActionResult 类型
export type BrowserActionResult = {
	screenshot?: string // 截图
	logs?: string // 日志
	currentUrl?: string // 当前 URL
	currentMousePosition?: string // 当前鼠标位置
}

// 定义 ClineAskUseMcpServer 接口
export interface ClineAskUseMcpServer {
	serverName: string // 服务器名称
	type: "use_mcp_tool" | "access_mcp_resource" // 类型
	toolName?: string // 工具名称
	arguments?: string // 参数
	uri?: string // URI
}

// 定义 ClineApiReqInfo 接口
export interface ClineApiReqInfo {
	request?: string // 请求
	tokensIn?: number // 输入令牌数
	tokensOut?: number // 输出令牌数
	cacheWrites?: number // 缓存写入数
	cacheReads?: number // 缓存读取数
	cost?: number // 成本
	cancelReason?: ClineApiReqCancelReason // 取消原因
	streamingFailedMessage?: string // 流式传输失败消息
}

// 定义 ClineApiReqCancelReason 类型
export type ClineApiReqCancelReason = "streaming_failed" | "user_cancelled" // 流式传输失败或用户取消
