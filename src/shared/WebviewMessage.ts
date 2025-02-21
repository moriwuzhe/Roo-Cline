import { z } from "zod"
import { ApiConfiguration, ApiProvider } from "./api"
import { Mode, PromptComponent, ModeConfig } from "./modes"

// 定义 ClineAskResponse 类型
export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"

// 定义 PromptMode 类型
export type PromptMode = Mode | "enhance"

// 定义 AudioType 类型
export type AudioType = "notification" | "celebration" | "progress_loop"

// 定义 WebviewMessage 接口
export interface WebviewMessage {
	// 消息类型
	type:
		| "apiConfiguration"
		| "currentApiConfigName"
		| "upsertApiConfiguration"
		| "deleteApiConfiguration"
		| "loadApiConfiguration"
		| "renameApiConfiguration"
		| "getListApiConfiguration"
		| "customInstructions"
		| "allowedCommands"
		| "alwaysAllowReadOnly"
		| "alwaysAllowWrite"
		| "alwaysAllowExecute"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "resetState"
		| "requestOllamaModels"
		| "requestLmStudioModels"
		| "openImage"
		| "openFile"
		| "openMention"
		| "cancelTask"
		| "refreshGlamaModels"
		| "refreshOpenRouterModels"
		| "refreshOpenAiModels"
		| "refreshUnboundModels"
		| "refreshRequestyModels"
		| "alwaysAllowBrowser"
		| "alwaysAllowMcp"
		| "alwaysAllowModeSwitch"
		| "playSound"
		| "soundEnabled"
		| "soundVolume"
		| "diffEnabled"
		| "checkpointsEnabled"
		| "browserViewportSize"
		| "screenshotQuality"
		| "openMcpSettings"
		| "restartMcpServer"
		| "toggleToolAlwaysAllow"
		| "toggleMcpServer"
		| "updateMcpTimeout"
		| "fuzzyMatchThreshold"
		| "preferredLanguage"
		| "writeDelayMs"
		| "enhancePrompt"
		| "enhancedPrompt"
		| "draggedImages"
		| "deleteMessage"
		| "terminalOutputLineLimit"
		| "mcpEnabled"
		| "enableMcpServerCreation"
		| "searchCommits"
		| "refreshGlamaModels"
		| "alwaysApproveResubmit"
		| "requestDelaySeconds"
		| "rateLimitSeconds"
		| "setApiConfigPassword"
		| "requestVsCodeLmModels"
		| "mode"
		| "updatePrompt"
		| "updateSupportPrompt"
		| "resetSupportPrompt"
		| "getSystemPrompt"
		| "systemPrompt"
		| "enhancementApiConfigId"
		| "updateExperimental"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "setopenAiCustomModelInfo"
		| "openCustomModesSettings"
		| "checkpointDiff"
		| "checkpointRestore"
	// 可选的文本字段
	text?: string
	// 可选的禁用状态
	disabled?: boolean
	// 可选的 askResponse 字段
	askResponse?: ClineAskResponse
	// 可选的 apiConfiguration 字段
	apiConfiguration?: ApiConfiguration
	// 可选的图片数组
	images?: string[]
	// 可选的布尔值
	bool?: boolean
	// 可选的数值
	value?: number
	// 可选的命令数组
	commands?: string[]
	// 可选的音频类型
	audioType?: AudioType
	// 可选的服务器名称
	serverName?: string
	// 可选的工具名称
	toolName?: string
	// 可选的 alwaysAllow 字段
	alwaysAllow?: boolean
	// 可选的模式
	mode?: Mode
	// 可选的 promptMode 字段
	promptMode?: PromptMode
	// 可选的自定义提示组件
	customPrompt?: PromptComponent
	// 可选的数据 URL 数组
	dataUrls?: string[]
	// 可选的键值对
	values?: Record<string, any>
	// 可选的查询字符串
	query?: string
	// 可选的 slug 字段
	slug?: string
	// 可选的模式配置
	modeConfig?: ModeConfig
	// 可选的超时时间
	timeout?: number
	// 可选的 payload 字段
	payload?: WebViewMessagePayload
}

// 定义 checkoutDiffPayloadSchema 模式
export const checkoutDiffPayloadSchema = z.object({
	ts: z.number(), // 时间戳
	commitHash: z.string(), // 提交哈希
	mode: z.enum(["full", "checkpoint"]), // 模式
})

// 定义 CheckpointDiffPayload 类型
export type CheckpointDiffPayload = z.infer<typeof checkoutDiffPayloadSchema>

// 定义 checkoutRestorePayloadSchema 模式
export const checkoutRestorePayloadSchema = z.object({
	ts: z.number(), // 时间戳
	commitHash: z.string(), // 提交哈希
	mode: z.enum(["preview", "restore"]), // 模式
})

// 定义 CheckpointRestorePayload 类型
export type CheckpointRestorePayload = z.infer<typeof checkoutRestorePayloadSchema>

// 定义 WebViewMessagePayload 类型
export type WebViewMessagePayload = CheckpointDiffPayload | CheckpointRestorePayload
