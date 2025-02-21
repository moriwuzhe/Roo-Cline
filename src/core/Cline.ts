import { Anthropic } from "@anthropic-ai/sdk"
import cloneDeep from "clone-deep"
import { DiffStrategy, getDiffStrategy, UnifiedDiffStrategy } from "./diff/DiffStrategy"
import { validateToolUse, isToolAllowedForMode, ToolName } from "./mode-validator"
import delay from "delay"
import fs from "fs/promises"
import os from "os"
import pWaitFor from "p-wait-for"
import * as path from "path"
import { serializeError } from "serialize-error"
import * as vscode from "vscode"
import { ApiHandler, SingleCompletionHandler, buildApiHandler } from "../api"
import { ApiStream } from "../api/transform/stream"
import { DIFF_VIEW_URI_SCHEME, DiffViewProvider } from "../integrations/editor/DiffViewProvider"
import { CheckpointService } from "../services/checkpoints/CheckpointService"
import { findToolName, formatContentBlockToMarkdown } from "../integrations/misc/export-markdown"
import {
	extractTextFromFile,
	addLineNumbers,
	stripLineNumbers,
	everyLineHasLineNumbers,
	truncateOutput,
} from "../integrations/misc/extract-text"
import { TerminalManager } from "../integrations/terminal/TerminalManager"
import { UrlContentFetcher } from "../services/browser/UrlContentFetcher"
import { listFiles } from "../services/glob/list-files"
import { regexSearchFiles } from "../services/ripgrep"
import { parseSourceCodeForDefinitionsTopLevel } from "../services/tree-sitter"
import { ApiConfiguration } from "../shared/api"
import { findLastIndex } from "../shared/array"
import { combineApiRequests } from "../shared/combineApiRequests"
import { combineCommandSequences } from "../shared/combineCommandSequences"
import {
	BrowserAction,
	BrowserActionResult,
	browserActions,
	ClineApiReqCancelReason,
	ClineApiReqInfo,
	ClineAsk,
	ClineAskUseMcpServer,
	ClineMessage,
	ClineSay,
	ClineSayBrowserAction,
	ClineSayTool,
} from "../shared/ExtensionMessage"
import { getApiMetrics } from "../shared/getApiMetrics"
import { HistoryItem } from "../shared/HistoryItem"
import { ClineAskResponse } from "../shared/WebviewMessage"
import { calculateApiCost } from "../utils/cost"
import { fileExistsAtPath } from "../utils/fs"
import { arePathsEqual, getReadablePath } from "../utils/path"
import { parseMentions } from "./mentions"
import { AssistantMessageContent, parseAssistantMessage, ToolParamName, ToolUseName } from "./assistant-message"
import { formatResponse } from "./prompts/responses"
import { SYSTEM_PROMPT } from "./prompts/system"
import { modes, defaultModeSlug, getModeBySlug } from "../shared/modes"
import { truncateConversationIfNeeded } from "./sliding-window"
import { ClineProvider, GlobalFileNames } from "./webview/ClineProvider"
import { detectCodeOmission } from "../integrations/editor/detect-omission"
import { BrowserSession } from "../services/browser/BrowserSession"
import { OpenRouterHandler } from "../api/providers/openrouter"
import { McpHub } from "../services/mcp/McpHub"
import crypto from "crypto"
import { insertGroups } from "./diff/insert-groups"
import { EXPERIMENT_IDS, experiments as Experiments } from "../shared/experiments"

const cwd =
	vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? path.join(os.homedir(), "Desktop") // 可能存在也可能不存在，但文件系统检查存在性会立即请求权限，这会带来不好的用户体验，需要想出更好的解决方案

type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
type UserContent = Array<
	Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam
>

// 定义 Cline 类
export class Cline {
	readonly taskId: string // 任务 ID
	api: ApiHandler // API 处理程序
	private terminalManager: TerminalManager // 终端管理器
	private urlContentFetcher: UrlContentFetcher // URL 内容获取器
	private browserSession: BrowserSession // 浏览器会话
	private didEditFile: boolean = false // 是否编辑了文件
	customInstructions?: string // 自定义指令
	diffStrategy?: DiffStrategy // 差异策略
	diffEnabled: boolean = false // 是否启用差异
	fuzzyMatchThreshold: number = 1.0 // 模糊匹配阈值

	apiConversationHistory: (Anthropic.MessageParam & { ts?: number })[] = [] // API 对话历史
	clineMessages: ClineMessage[] = [] // Cline 消息
	private askResponse?: ClineAskResponse // 请求响应
	private askResponseText?: string // 请求响应文本
	private askResponseImages?: string[] // 请求响应图像
	private lastMessageTs?: number // 最后一条消息的时间戳
	private consecutiveMistakeCount: number = 0 // 连续错误计数
	private consecutiveMistakeCountForApplyDiff: Map<string, number> = new Map() // 应用差异的连续错误计数
	private providerRef: WeakRef<ClineProvider> // 提供者引用
	private abort: boolean = false // 是否中止
	didFinishAbortingStream = false // 是否完成中止流
	abandoned = false // 是否被放弃
	private diffViewProvider: DiffViewProvider // 差异视图提供者
	private lastApiRequestTime?: number // 最后一次 API 请求时间
	isInitialized = false // 是否已初始化

	// 检查点
	checkpointsEnabled: boolean = false // 是否启用检查点
	private checkpointService?: CheckpointService // 检查点服务

	// 流式传输
	isWaitingForFirstChunk = false // 是否在等待第一个块
	isStreaming = false // 是否在流式传输
	private currentStreamingContentIndex = 0 // 当前流式传输内容索引
	private assistantMessageContent: AssistantMessageContent[] = [] // 助手消息内容
	private presentAssistantMessageLocked = false // 是否锁定助手消息呈现
	private presentAssistantMessageHasPendingUpdates = false // 是否有待处理的助手消息更新
	private userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [] // 用户消息内容
	private userMessageContentReady = false // 用户消息内容是否准备好
	private didRejectTool = false // 是否拒绝了工具
	private didAlreadyUseTool = false // 是否已经使用了工具
	private didCompleteReadingStream = false // 是否完成了读取流

	// 构造函数
	constructor(
		provider: ClineProvider, // 提供者
		apiConfiguration: ApiConfiguration, // API 配置
		customInstructions?: string, // 自定义指令
		enableDiff?: boolean, // 是否启用差异
		enableCheckpoints?: boolean, // 是否启用检查点
		fuzzyMatchThreshold?: number, // 模糊匹配阈值
		task?: string | undefined, // 任务
		images?: string[] | undefined, // 图像
		historyItem?: HistoryItem | undefined, // 历史项目
	) {
		if (!task && !images && !historyItem) {
			throw new Error("Either historyItem or task/images must be provided") // 必须提供历史项目或任务/图像
		}

		this.taskId = crypto.randomUUID() // 生成随机任务 ID
		this.api = buildApiHandler(apiConfiguration) // 构建 API 处理程序
		this.terminalManager = new TerminalManager() // 初始化终端管理器
		this.urlContentFetcher = new UrlContentFetcher(provider.context) // 初始化 URL 内容获取器
		this.browserSession = new BrowserSession(provider.context) // 初始化浏览器会话
		this.customInstructions = customInstructions // 设置自定义指令
		this.diffEnabled = enableDiff ?? false // 设置是否启用差异
		this.fuzzyMatchThreshold = fuzzyMatchThreshold ?? 1.0 // 设置模糊匹配阈值
		this.providerRef = new WeakRef(provider) // 设置提供者引用
		this.diffViewProvider = new DiffViewProvider(cwd) // 初始化差异视图提供者
		this.checkpointsEnabled = process.platform !== "win32" && !!enableCheckpoints // 设置是否启用检查点

		if (historyItem) {
			this.taskId = historyItem.id // 如果有历史项目，设置任务 ID
		}

		// 根据当前状态初始化差异策略
		this.updateDiffStrategy(Experiments.isEnabled(experiments ?? {}, EXPERIMENT_IDS.DIFF_STRATEGY))

		if (task || images) {
			this.startTask(task, images) // 如果有任务或图像，开始任务
		} else if (historyItem) {
			this.resumeTaskFromHistory() // 如果有历史项目，从历史中恢复任务
		}
	}

	// 添加方法以更新差异策略
	async updateDiffStrategy(experimentalDiffStrategy?: boolean) {
		// 如果未提供，从当前状态获取
		if (experimentalDiffStrategy === undefined) {
			const { experiments: stateExperimental } = (await this.providerRef.deref()?.getState()) ?? {}
			experimentalDiffStrategy = stateExperimental?.[EXPERIMENT_IDS.DIFF_STRATEGY] ?? false
		}
		this.diffStrategy = getDiffStrategy(this.api.getModel().id, this.fuzzyMatchThreshold, experimentalDiffStrategy)
	}

	// 将任务存储到磁盘以供历史记录使用
	private async ensureTaskDirectoryExists(): Promise<string> {
		const globalStoragePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
		if (!globalStoragePath) {
			throw new Error("Global storage uri is invalid")
		}
		const taskDir = path.join(globalStoragePath, "tasks", this.taskId)
		await fs.mkdir(taskDir, { recursive: true })
		return taskDir
	}

	private async getSavedApiConversationHistory(): Promise<Anthropic.MessageParam[]> {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			return JSON.parse(await fs.readFile(filePath, "utf8"))
		}
		return []
	}

	private async addToApiConversationHistory(message: Anthropic.MessageParam) {
		const messageWithTs = { ...message, ts: Date.now() }
		this.apiConversationHistory.push(messageWithTs)
		await this.saveApiConversationHistory()
	}

	async overwriteApiConversationHistory(newHistory: Anthropic.MessageParam[]) {
		this.apiConversationHistory = newHistory
		await this.saveApiConversationHistory()
	}

	private async saveApiConversationHistory() {
		try {
			const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
			await fs.writeFile(filePath, JSON.stringify(this.apiConversationHistory))
		} catch (error) {
			// 在极少数情况下，如果保存失败，我们不希望任务停止
			console.error("Failed to save API conversation history:", error)
		}
	}

	private async getSavedClineMessages(): Promise<ClineMessage[]> {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)
		if (await fileExistsAtPath(filePath)) {
			return JSON.parse(await fs.readFile(filePath, "utf8"))
		} else {
			// 检查旧位置
			const oldPath = path.join(await this.ensureTaskDirectoryExists(), "claude_messages.json")
			if (await fileExistsAtPath(oldPath)) {
				const data = JSON.parse(await fs.readFile(oldPath, "utf8"))
				await fs.unlink(oldPath) // 删除旧文件
				return data
			}
		}
		return []
	}

	private async addToClineMessages(message: ClineMessage) {
		this.clineMessages.push(message)
		await this.saveClineMessages()
	}

	public async overwriteClineMessages(newMessages: ClineMessage[]) {
		this.clineMessages = newMessages
		await this.saveClineMessages()
	}

	private async saveClineMessages() {
		try {
			const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)
			await fs.writeFile(filePath, JSON.stringify(this.clineMessages))
			// 组合，因为它们在 ChatView 中
			const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.clineMessages.slice(1))))
			const taskMessage = this.clineMessages[0] // 第一条消息总是任务消息
			const lastRelevantMessage =
				this.clineMessages[
					findLastIndex(
						this.clineMessages,
						(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
					)
				]
			await this.providerRef.deref()?.updateTaskHistory({
				id: this.taskId,
				ts: lastRelevantMessage.ts,
				task: taskMessage.text ?? "",
				tokensIn: apiMetrics.totalTokensIn,
				tokensOut: apiMetrics.totalTokensOut,
				cacheWrites: apiMetrics.totalCacheWrites,
				cacheReads: apiMetrics.totalCacheReads,
				totalCost: apiMetrics.totalCost,
			})
		} catch (error) {
			console.error("Failed to save cline messages:", error)
		}
	}

	// 与 Webview 通信

	// partial 有三种有效状态 true（部分消息），false（部分消息的完成），undefined（单个完整消息）
	async ask(
		type: ClineAsk,
		text?: string,
		partial?: boolean,
	): Promise<{ response: ClineAskResponse; text?: string; images?: string[] }> {
		// 如果此 Cline 实例被提供者中止，那么唯一让我们活着的是后台仍在运行的 promise，在这种情况下，我们不希望将其结果发送到 Webview，因为它现在附加到新的 Cline 实例。因此，我们可以安全地忽略任何活动 promise 的结果，并且此类将被释放。（尽管我们在提供者中将 Cline 设置为 undefined，但这只是删除对该实例的引用，但该实例仍然存在，直到此 promise 解析或拒绝。）
		if (this.abort) {
			throw new Error("Roo Code instance aborted")
		}
		let askTs: number
		if (partial !== undefined) {
			const lastMessage = this.clineMessages.at(-1)
			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "ask" && lastMessage.ask === type
			if (partial) {
				if (isUpdatingPreviousPartial) {
					// 现有的部分消息，因此更新它
					lastMessage.text = text
					lastMessage.partial = partial
					// todo 更高效地保存和发布新数据或一次一个完整消息，因此忽略部分保存，并且仅发布部分消息的一部分而不是新侦听器中的整个数组
					// await this.saveClineMessages()
					// await this.providerRef.deref()?.postStateToWebview()
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
					throw new Error("Current ask promise was ignored 1")
				} else {
					// 这是一个新的部分消息，因此添加它并带有部分状态
					// this.askResponse = undefined
					// this.askResponseText = undefined
					// this.askResponseImages = undefined
					askTs = Date.now()
					this.lastMessageTs = askTs
					await this.addToClineMessages({ ts: askTs, type: "ask", ask: type, text, partial })
					await this.providerRef.deref()?.postStateToWebview()
					throw new Error("Current ask promise was ignored 2")
				}
			} else {
				// partial=false 意味着它是先前部分消息的完整版本
				if (isUpdatingPreviousPartial) {
					// 这是先前部分消息的完整版本，因此用完整版本替换部分消息
					this.askResponse = undefined
					this.askResponseText = undefined
					this.askResponseImages = undefined

					/*
					历史书中的错误：
					在 Webview 中，我们使用 ts 作为 virtuoso 列表的 chatrow 键。由于我们会在流式传输结束时更新此 ts，这会导致视图闪烁。key prop 必须是稳定的，否则 react 在渲染之间难以协调项目，导致组件卸载和重新加载（闪烁）。
					这里的教训是，如果在渲染列表时看到闪烁，很可能是因为 key prop 不稳定。
					因此，在这种情况下，我们必须确保消息 ts 在首次设置后永远不会更改。
					*/
					askTs = lastMessage.ts
					this.lastMessageTs = askTs
					// lastMessage.ts = askTs
					lastMessage.text = text
					lastMessage.partial = false
					await this.saveClineMessages()
					// await this.providerRef.deref()?.postStateToWebview()
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
				} else {
					// 这是一个新的 partial=false 消息，因此像往常一样添加它
					this.askResponse = undefined
					this.askResponseText = undefined
					this.askResponseImages = undefined
					askTs = Date.now()
					this.lastMessageTs = askTs
					await this.addToClineMessages({ ts: askTs, type: "ask", ask: type, text })
					await this.providerRef.deref()?.postStateToWebview()
				}
			}
		} else {
			// 这是一个新的非部分消息，因此像往常一样添加它
			// const lastMessage = this.clineMessages.at(-1)
			this.askResponse = undefined
			this.askResponseText = undefined
			this.askResponseImages = undefined
			askTs = Date.now()
			this.lastMessageTs = askTs
			await this.addToClineMessages({ ts: askTs, type: "ask", ask: type, text })
			await this.providerRef.deref()?.postStateToWebview()
		}

		await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTs, { interval: 100 })
		if (this.lastMessageTs !== askTs) {
			throw new Error("Current ask promise was ignored") // 可能发生在我们连续发送多个请求时，即 command_output。重要的是，当我们知道请求可能会失败时，它会被优雅地处理
		}
		const result = { response: this.askResponse!, text: this.askResponseText, images: this.askResponseImages }
		this.askResponse = undefined
		this.askResponseText = undefined
		this.askResponseImages = undefined
		return result
	}

	async handleWebviewAskResponse(askResponse: ClineAskResponse, text?: string, images?: string[]) {
		this.askResponse = askResponse
		this.askResponseText = text
		this.askResponseImages = images
	}

	async say(type: ClineSay, text?: string, images?: string[], partial?: boolean): Promise<undefined> {
		if (this.abort) {
			throw new Error("Roo Code instance aborted")
		}

		if (partial !== undefined) {
			const lastMessage = this.clineMessages.at(-1)
			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "say" && lastMessage.say === type
			if (partial) {
				if (isUpdatingPreviousPartial) {
					// 现有的部分消息，因此更新它
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = partial
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
				} else {
					// 这是一个新的部分消息，因此添加它并带有部分状态
					const sayTs = Date.now()
					this.lastMessageTs = sayTs
					await this.addToClineMessages({ ts: sayTs, type: "say", say: type, text, images, partial })
					await this.providerRef.deref()?.postStateToWebview()
				}
			} else {
				// partial=false 意味着它是先前部分消息的完整版本
				if (isUpdatingPreviousPartial) {
					// 这是先前部分消息的完整版本，因此用完整版本替换部分消息
					this.lastMessageTs = lastMessage.ts
					// lastMessage.ts = sayTs
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = false

					// 而不是流式传输 partialMessage 事件，我们像往常一样进行保存和发布以持久化到磁盘
					await this.saveClineMessages()
					// await this.providerRef.deref()?.postStateToWebview()
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage }) // 比整个 postStateToWebview 更高效
				} else {
					// 这是一个新的 partial=false 消息，因此像往常一样添加它
					const sayTs = Date.now()
					this.lastMessageTs = sayTs
					await this.addToClineMessages({ ts: sayTs, type: "say", say: type, text, images })
					await this.providerRef.deref()?.postStateToWebview()
				}
			}
		} else {
			// 这是一个新的非部分消息，因此像往常一样添加它
			const sayTs = Date.now()
			this.lastMessageTs = sayTs
			await this.addToClineMessages({ ts: sayTs, type: "say", say: type, text, images })
			await this.providerRef.deref()?.postStateToWebview()
		}
	}

	async sayAndCreateMissingParamError(toolName: ToolUseName, paramName: string, relPath?: string) {
		await this.say(
			"error",
			`Roo tried to use ${toolName}${
				relPath ? ` for '${relPath.toPosix()}'` : ""
			} without value for required parameter '${paramName}'. Retrying...`,
		)
		return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
	}

	// 任务生命周期

	private async startTask(task?: string, images?: string[]): Promise<void> {
		// conversationHistory（用于 API）和 clineMessages（用于 Webview）需要同步
		// 如果扩展进程被杀死，那么在重新启动时 clineMessages 可能不会为空，因此我们需要在创建新的 Cline 客户端时将其设置为 []（否则 Webview 会显示上一个会话的陈旧消息）
		this.clineMessages = []
		this.apiConversationHistory = []
		await this.providerRef.deref()?.postStateToWebview()

		await this.say("text", task, images)
		this.isInitialized = true

		let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)
		await this.initiateTaskLoop([
			{
				type: "text",
				text: `<task>\n${task}\n</task>`,
			},
			...imageBlocks,
		])
	}

	private async resumeTaskFromHistory() {
		const modifiedClineMessages = await this.getSavedClineMessages()

		// 删除之前可能已添加的任何恢复消息
		const lastRelevantMessageIndex = findLastIndex(
			modifiedClineMessages,
			(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
		)
		if (lastRelevantMessageIndex !== -1) {
			modifiedClineMessages.splice(lastRelevantMessageIndex + 1)
		}

		// 由于我们不再使用 api_req_finished，因此我们需要检查最后一个 api_req_started 是否具有 cost 值，如果没有并且没有取消原因，则将其删除，因为这表示没有任何部分内容流式传输的 api 请求
		const lastApiReqStartedIndex = findLastIndex(
			modifiedClineMessages,
			(m) => m.type === "say" && m.say === "api_req_started",
		)
		if (lastApiReqStartedIndex !== -1) {
			const lastApiReqStarted = modifiedClineMessages[lastApiReqStartedIndex]
			const { cost, cancelReason }: ClineApiReqInfo = JSON.parse(lastApiReqStarted.text || "{}")
			if (cost === undefined && cancelReason === undefined) {
				modifiedClineMessages.splice(lastApiReqStartedIndex, 1)
			}
		}

		await this.overwriteClineMessages(modifiedClineMessages)
		this.clineMessages = await this.getSavedClineMessages()

		// 现在向用户展示 cline 消息并询问他们是否要恢复（注意：我们之前遇到过一个错误，即在打开旧任务时 apiConversationHistory 未初始化，这是因为我们在等待恢复）。
		// 这在用户删除消息而不先恢复任务的情况下很重要。
		this.apiConversationHistory = await this.getSavedApiConversationHistory()

		const lastClineMessage = this.clineMessages
			.slice()
			.reverse()
			.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task")) // 可能有多个恢复任务
		// const lastClineMessage = this.clineMessages[lastClineMessageIndex]
		// 可能是带有命令的完成结果
		// const secondLastClineMessage = this.clineMessages
		// 	.slice()
		// 	.reverse()
		// 	.find(
		// 		(m, index) =>
		// 			index !== lastClineMessageIndex && !(m.ask === "resume_task" || m.ask === "resume_completed_task")
		// 	)
		// （lastClineMessage?.ask === "command" && secondLastClineMessage?.ask === "completion_result"）

		let askType: ClineAsk
		if (lastClineMessage?.ask === "completion_result") {
			askType = "resume_completed_task"
		} else {
			askType = "resume_task"
		}

		this.isInitialized = true

		const { response, text, images } = await this.ask(askType) // 调用 poststatetowebview
		let responseText: string | undefined
		let responseImages: string[] | undefined
		if (response === "messageResponse") {
			await this.say("user_feedback", text, images)
			responseText = text
			responseImages = images
		}

		// 确保 API 可以恢复对话历史，即使它与 cline 消息不同步。
		let existingApiConversationHistory: Anthropic.Messages.MessageParam[] =
			await this.getSavedApiConversationHistory()

		// v2.0 xml 标签重构注意事项：由于我们不再使用工具，因此我们需要将所有工具使用块替换为文本块，因为 API 不允许没有工具模式的对话
		const conversationWithoutToolBlocks = existingApiConversationHistory.map((message) => {
			if (Array.isArray(message.content)) {
				const newContent = message.content.map((block) => {
					if (block.type === "tool_use") {
						// 重要的是我们将其转换为新的工具模式格式，以免模型对如何调用工具感到困惑
						const inputAsXml = Object.entries(block.input as Record<string, string>)
							.map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
							.join("\n")
						return {
							type: "text",
							text: `<${block.name}>\n${inputAsXml}\n</${block.name}>`,
						} as Anthropic.Messages.TextBlockParam
					} else if (block.type === "tool_result") {
						// 将 block.content 转换为文本块数组，删除图像
						const contentAsTextBlocks = Array.isArray(block.content)
							? block.content.filter((item) => item.type === "text")
							: [{ type: "text", text: block.content }]
						const textContent = contentAsTextBlocks.map((item) => item.text).join("\n")
						const toolName = findToolName(block.tool_use_id, existingApiConversationHistory)
						return {
							type: "text",
							text: `[${toolName} Result]\n\n${textContent}`,
						} as Anthropic.Messages.TextBlockParam
					}
					return block
				})
				return { ...message, content: newContent }
			}
			return message
		})
		existingApiConversationHistory = conversationWithoutToolBlocks

		// FIXME: 完全删除工具使用块

		// 如果最后一条消息是助手消息，我们需要检查是否有工具使用，因为每个工具使用都必须有工具响应
		// 如果没有工具使用，只有一个文本块，那么我们可以只添加一个用户消息
		// （注意这不再相关，因为我们使用自定义工具提示而不是工具使用块，但这是为了遗留目的，以防用户恢复旧任务）

		// 如果最后一条消息是用户消息，我们可以需要获取之前的助手消息，看看它是否调用了工具，如果是，则用“中断”填充剩余的工具响应

		let modifiedOldUserContent: UserContent // 最后一条消息如果是用户消息，或者最后一条（助手）消息之前的用户消息
		let modifiedApiConversationHistory: Anthropic.Messages.MessageParam[] // 需要删除最后一条用户消息以替换为新的修改后的用户消息
		if (existingApiConversationHistory.length > 0) {
			const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]

			if (lastMessage.role === "assistant") {
				const content = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				const hasToolUse = content.some((block) => block.type === "tool_use")

				if (hasToolUse) {
					const toolUseBlocks = content.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]
					const toolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
						type: "tool_result",
						tool_use_id: block.id,
						content: "Task was interrupted before this tool call could be completed.",
					}))
					modifiedApiConversationHistory = [...existingApiConversationHistory] // 没有更改
					modifiedOldUserContent = [...toolResponses]
				} else {
					modifiedApiConversationHistory = [...existingApiConversationHistory]
					modifiedOldUserContent = []
				}
			} else if (lastMessage.role === "user") {
				const previousAssistantMessage: Anthropic.Messages.MessageParam | undefined =
					existingApiConversationHistory[existingApiConversationHistory.length - 2]

				const existingUserContent: UserContent = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				if (previousAssistantMessage && previousAssistantMessage.role === "assistant") {
					const assistantContent = Array.isArray(previousAssistantMessage.content)
						? previousAssistantMessage.content
						: [{ type: "text", text: previousAssistantMessage.content }]

					const toolUseBlocks = assistantContent.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]

					if (toolUseBlocks.length > 0) {
						const existingToolResults = existingUserContent.filter(
							(block) => block.type === "tool_result",
						) as Anthropic.ToolResultBlockParam[]

						const missingToolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks
							.filter(
								(toolUse) => !existingToolResults.some((result) => result.tool_use_id === toolUse.id),
							)
							.map((toolUse) => ({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: "Task was interrupted before this tool call could be completed.",
							}))

						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1) // 删除最后一条用户消息
						modifiedOldUserContent = [...existingUserContent, ...missingToolResponses]
					} else {
						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
						modifiedOldUserContent = [...existingUserContent]
					}
				} else {
					modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
					modifiedOldUserContent = [...existingUserContent]
				}
			} else {
				throw new Error("Unexpected: Last message is not a user or assistant message")
			}
		} else {
			throw new Error("Unexpected: No existing API conversation history")
		}

		let newUserContent: UserContent = [...modifiedOldUserContent]

		const agoText = ((): string => {
			const timestamp = lastClineMessage?.ts ?? Date.now()
			const now = Date.now()
			const diff = now - timestamp
			const minutes = Math.floor(diff / 60000)
			const hours = Math.floor(minutes / 60)
			const days = Math.floor(hours / 24)

			if (days > 0) {
				return `${days} day${days > 1 ? "s" : ""} ago`
			}
			if (hours > 0) {
				return `${hours} hour${hours > 1 ? "s" : ""} ago`
			}
			if (minutes > 0) {
				return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
			}
			return "just now"
		})()

		const wasRecent = lastClineMessage?.ts && Date.now() - lastClineMessage.ts < 30_000

		newUserContent.push({
			type: "text",
			text:
				`[TASK RESUMPTION] This task was interrupted ${agoText}. It may or may not be complete, so please reassess the task context. Be aware that the project state may have changed since then. The current working directory is now '${cwd.toPosix()}'. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed.${
					wasRecent
						? "\n\nIMPORTANT: If the last tool use was a write_to_file that was interrupted, the file was reverted back to its original state before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents."
						: ""
				}` +
				(responseText
					? `\n\nNew instructions for task continuation:\n<user_message>\n${responseText}\n</user_message>`
					: ""),
		})

		if (responseImages && responseImages.length > 0) {
			newUserContent.push(...formatResponse.imageBlocks(responseImages))
		}

		await this.overwriteApiConversationHistory(modifiedApiConversationHistory)
		await this.initiateTaskLoop(newUserContent)
	}

	private async initiateTaskLoop(userContent: UserContent): Promise<void> {
		let nextUserContent = userContent
		let includeFileDetails = true
		while (!this.abort) {
			const didEndLoop = await this.recursivelyMakeClineRequests(nextUserContent, includeFileDetails)
			includeFileDetails = false // 我们只需要第一次的文件详细信息

			// 这种代理循环的工作方式是，cline 将被赋予一个任务，然后他调用工具来完成任务。除非有 attempt_completion 调用，否则我们会继续用他的工具响应回复他，直到他要么 attempt_completion，要么不再使用工具。如果他不再使用工具，我们会要求他考虑是否已完成任务，然后调用 attempt_completion，否则继续完成任务。
			// 有一个 MAX_REQUESTS_PER_TASK 限制，以防止无限请求，但 Cline 被提示尽可能高效地完成任务。

			//const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
			if (didEndLoop) {
				// 目前任务永远不会“完成”。这只会在用户达到最大请求并拒绝重置计数时发生。
				//this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
				break
			} else {
				// this.say(
				// 	"tool",
				// 	"Cline responded with only text blocks but has not called attempt_completion yet. Forcing him to continue with task..."
				// )
				nextUserContent = [
					{
						type: "text",
						text: formatResponse.noToolsUsed(),
					},
				]
				this.consecutiveMistakeCount++
			}
		}
	}

	async abortTask() {
		this.abort = true // 将停止任何自主运行的 promise。
		this.terminalManager.disposeAll()
		this.urlContentFetcher.closeBrowser()
		this.browserSession.closeBrowser()
		// 需要等待，以确保在从检查点重新启动任务之前目录/文件已恢复。
		await this.diffViewProvider.revertChanges()
	}

	// 工具

	async executeCommandTool(command: string): Promise<[boolean, ToolResponse]> {
		const terminalInfo = await this.terminalManager.getOrCreateTerminal(cwd)
		terminalInfo.terminal.show() // 创建新终端时（即使是手动创建）会出现一个奇怪的视觉错误，即顶部有一个空白区域。
		const process = this.terminalManager.runCommand(terminalInfo, command)

		let userFeedback: { text?: string; images?: string[] } | undefined
		let didContinue = false
		const sendCommandOutput = async (line: string): Promise<void> => {
			try {
				const { response, text, images } = await this.ask("command_output", line)
				if (response === "yesButtonClicked") {
					// 继续运行
				} else {
					userFeedback = { text, images }
				}
				didContinue = true
				process.continue() // 继续等待
			} catch {
				// 这只能发生在此请求 promise 被忽略时，因此忽略此错误
			}
		}

		let lines: string[] = []
		process.on("line", (line) => {
			lines.push(line)
			if (!didContinue) {
				sendCommandOutput(line)
			} else {
				this.say("command_output", line)
			}
		})

		let completed = false
		process.once("completed", () => {
			completed = true
		})

		process.once("no_shell_integration", async () => {
			await this.say("shell_integration_warning")
		})

		await process

		// 等待短暂的延迟以确保所有消息都发送到 Webview
		// 这种延迟允许时间创建未等待的 promise 并发送其关联的消息到 Webview，从而保持消息的正确顺序（尽管 Webview 对于分组 command_output 消息尽管有任何间隙仍然很聪明）
		await delay(50)

		const { terminalOutputLineLimit } = (await this.providerRef.deref()?.getState()) ?? {}
		const output = truncateOutput(lines.join("\n"), terminalOutputLineLimit)
		const result = output.trim()

		if (userFeedback) {
			await this.say("user_feedback", userFeedback.text, userFeedback.images)
			return [
				true,
				formatResponse.toolResult(
					`Command is still running in the user's terminal.${
						result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
					}\n\nThe user provided the following feedback:\n<feedback>\n${userFeedback.text}\n</feedback>`,
					userFeedback.images,
				),
			]
		}

		if (completed) {
			return [false, `Command executed.${result.length > 0 ? `\nOutput:\n${result}` : ""}`]
		} else {
			return [
				false,
				`Command is still running in the user's terminal.${
					result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
				}\n\nYou will be updated on the terminal status and new output in the future.`,
			]
		}
	}

	async *attemptApiRequest(previousApiReqIndex: number, retryAttempt: number = 0): ApiStream {
		let mcpHub: McpHub | undefined

		const { mcpEnabled, alwaysApproveResubmit, requestDelaySeconds, rateLimitSeconds } =
			(await this.providerRef.deref()?.getState()) ?? {}

		let finalDelay = 0

		// 仅在这不是第一次请求时应用速率限制
		if (this.lastApiRequestTime) {
			const now = Date.now()
			const timeSinceLastRequest = now - this.lastApiRequestTime
			const rateLimit = rateLimitSeconds || 0
			const rateLimitDelay = Math.max(0, rateLimit * 1000 - timeSinceLastRequest)
			finalDelay = rateLimitDelay
		}

		// 为重试添加指数退避延迟
		if (retryAttempt > 0) {
			const baseDelay = requestDelaySeconds || 5
			const exponentialDelay = Math.ceil(baseDelay * Math.pow(2, retryAttempt)) * 1000
			finalDelay = Math.max(finalDelay, exponentialDelay)
		}

		if (finalDelay > 0) {
			// 显示倒计时
			for (let i = Math.ceil(finalDelay / 1000); i > 0; i--) {
				const delayMessage =
					retryAttempt > 0 ? `Retrying in ${i} seconds...` : `Rate limiting for ${i} seconds...`
				await this.say("api_req_retry_delayed", delayMessage, undefined, true)
				await delay(1000)
			}
		}

		// 在发出请求之前更新最后请求时间
		this.lastApiRequestTime = Date.now()

		if (mcpEnabled ?? true) {
			mcpHub = this.providerRef.deref()?.getMcpHub()
			if (!mcpHub) {
				throw new Error("MCP hub not available")
			}
			// 在生成系统提示之前等待 MCP 服务器连接
			await pWaitFor(() => mcpHub!.isConnecting !== true, { timeout: 10_000 }).catch(() => {
				console.error("MCP servers failed to connect in time")
			})
		}

		const {
			browserViewportSize,
			mode,
			customModePrompts,
			preferredLanguage,
			experiments,
			enableMcpServerCreation,
		} = (await this.providerRef.deref()?.getState()) ?? {}
		const { customModes } = (await this.providerRef.deref()?.getState()) ?? {}
		const systemPrompt = await (async () => {
			const provider = this.providerRef.deref()
			if (!provider) {
				throw new Error("Provider not available")
			}
			return SYSTEM_PROMPT(
				provider.context,
				cwd,
				this.api.getModel().info.supportsComputerUse ?? false,
				mcpHub,
				this.diffStrategy,
				browserViewportSize,
				mode,
				customModePrompts,
				customModes,
				this.customInstructions,
				preferredLanguage,
				this.diffEnabled,
				experiments,
				enableMcpServerCreation,
			)
		})()

		// 如果上一个 API 请求的总令牌使用量接近上下文窗口，则截断对话历史以为新请求腾出空间
		if (previousApiReqIndex >= 0) {
			const previousRequest = this.clineMessages[previousApiReqIndex]?.text
			if (!previousRequest) return

			const {
				tokensIn = 0,
				tokensOut = 0,
				cacheWrites = 0,
				cacheReads = 0,
			}: ClineApiReqInfo = JSON.parse(previousRequest)
			const totalTokens = tokensIn + tokensOut + cacheWrites + cacheReads

			const trimmedMessages = truncateConversationIfNeeded(
				this.apiConversationHistory,
				totalTokens,
				this.api.getModel().info,
			)

			if (trimmedMessages !== this.apiConversationHistory) {
				await this.overwriteApiConversationHistory(trimmedMessages)
			}
		}

		// 通过以下方式清理对话历史：
		// 1. 通过扩展仅 API 所需的属性将其转换为 Anthropic.MessageParam
		// 2. 如果模型不支持图像，则将图像块转换为文本描述
		const cleanConversationHistory = this.apiConversationHistory.map(({ role, content }) => {
			// 处理数组内容（可能包含图像块）
			if (Array.isArray(content)) {
				if (!this.api.getModel().info.supportsImages) {
					// 将图像块转换为文本描述
					content = content.map((block) => {
						if (block.type === "image") {
							// 将图像块转换为文本描述
							// 注意：由于 API 限制，我们无法访问实际的图像内容/URL，但我们可以指示对话中存在图像
							return {
								type: "text",
								text: "[Referenced image in conversation]",
							}
						}
						return block
					})
				}
			}
			return { role, content }
		})
		const stream = this.api.createMessage(systemPrompt, cleanConversationHistory)
		const iterator = stream[Symbol.asyncIterator]()

		try {
			// 等待第一个块以查看是否会抛出错误
			this.isWaitingForFirstChunk = true
			const firstChunk = await iterator.next()
			yield firstChunk.value
			this.isWaitingForFirstChunk = false
		} catch (error) {
			// 注意，这个 api_req_failed 请求是独特的，因为我们只在 API 尚未流式传输任何内容时（即由于速率限制错误而在第一个块上失败）才提供此选项，因为它允许他们点击重试按钮。但是，如果 API 在流式传输中途失败，它可能处于任何任意状态，其中一些工具可能已执行，因此该错误会以不同方式处理，需要完全取消任务。
			if (alwaysApproveResubmit) {
				const errorMsg = error.message ?? "Unknown error"
				const baseDelay = requestDelaySeconds || 5
				const exponentialDelay = Math.ceil(baseDelay * Math.pow(2, retryAttempt))

				// 显示带有指数退避的倒计时
				for (let i = exponentialDelay; i > 0; i--) {
					await this.say(
						"api_req_retry_delayed",
						`${errorMsg}\n\nRetry attempt ${retryAttempt + 1}\nRetrying in ${i} seconds...`,
						undefined,
						true,
					)
					await delay(1000)
				}

				await this.say(
					"api_req_retry_delayed",
					`${errorMsg}\n\nRetry attempt ${retryAttempt + 1}\nRetrying now...`,
					undefined,
					false,
				)

				// 递归调用，增加重试次数
				yield* this.attemptApiRequest(previousApiReqIndex, retryAttempt + 1)
				return
			} else {
				const { response } = await this.ask(
					"api_req_failed",
					error.message ?? JSON.stringify(serializeError(error), null, 2),
				)
				if (response !== "yesButtonClicked") {
					// 这永远不会发生，因为如果 noButtonClicked，我们将清除当前任务，销毁此实例
					throw new Error("API request failed")
				}
				await this.say("api_req_retried")
				// 递归调用
				yield* this.attemptApiRequest(previousApiReqIndex)
				return
			}
		}

		// 没有错误，因此我们可以继续生成所有剩余的块
		// （需要放在 try/catch 之外，因为我们希望调用者处理错误，而不是使用 api_req_failed，因为这仅适用于第一个块失败的情况）
		// 这将委托给另一个生成器或可迭代对象。在这种情况下，它表示“从此迭代器生成所有剩余的值”。这有效地传递了原始流中的所有后续块。
		yield* iterator
	}

	async presentAssistantMessage() {
		if (this.abort) {
			throw new Error("Roo Code instance aborted")
		}

		if (this.presentAssistantMessageLocked) {
			this.presentAssistantMessageHasPendingUpdates = true
			return
		}
		this.presentAssistantMessageLocked = true
		this.presentAssistantMessageHasPendingUpdates = false

		if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
			// 这可能发生在最后一个内容块在流式传输完成之前完成。如果流式传输完成，并且我们超出范围，则表示我们已经呈现/执行了最后一个内容块，并准备继续下一个请求
			if (this.didCompleteReadingStream) {
				this.userMessageContentReady = true
			}
			// console.log("no more content blocks to stream! this shouldn't happen?")
			this.presentAssistantMessageLocked = false
			return
			//throw new Error("No more content blocks to stream! This shouldn't happen...") // 测试后删除
		}

		const block = cloneDeep(this.assistantMessageContent[this.currentStreamingContentIndex]) // 需要创建副本，因为在流式传输更新数组时，它可能也会更新引用块的属性

		let isCheckpointPossible = false

		switch (block.type) {
			case "text": {
				if (this.didRejectTool || this.didAlreadyUseTool) {
					break
				}
				let content = block.content
				if (content) {
					// （必须为部分和完整执行此操作，因为将内容发送到 markdown 渲染器的思考标签将自动删除）
					// 删除 <thinking 或 </thinking 的结束子字符串（下面的 xml 解析仅适用于打开标签）
					// （这已在下面的 xml 解析中完成，但保留在此处以供参考）
					// content = content.replace(/<\/?t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?$/, "")
					// 删除所有 <thinking>（可选换行符后）和 </thinking>（可选换行符前）的实例
					// - 需要分开，因为我们不希望删除第一个标签之前的换行符
					// - 需要在下面的 xml 解析之前进行
					content = content.replace(/<thinking>\s?/g, "")
					content = content.replace(/\s?<\/thinking>/g, "")

					// 删除内容末尾的部分 XML 标签（用于工具使用和思考标签）
					// （防止这些工件在聊天中显示）
					const lastOpenBracketIndex = content.lastIndexOf("<")
					if (lastOpenBracketIndex !== -1) {
						const possibleTag = content.slice(lastOpenBracketIndex)
						// 检查最后一个 '<' 后是否有 '>'（即标签是否完整）（完整的思考和工具标签将已被删除）
						const hasCloseBracket = possibleTag.includes(">")
						if (!hasCloseBracket) {
							// 提取可能的标签名称
							let tagContent: string
							if (possibleTag.startsWith("</")) {
								tagContent = possibleTag.slice(2).trim()
							} else {
								tagContent = possibleTag.slice(1).trim()
							}
							// 检查 tagContent 是否可能是一个不完整的标签名称（仅字母和下划线）
							const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
							// 预先删除 < 或 </ 以防止这些工件在聊天中显示（也处理关闭思考标签）
							const isOpeningOrClosing = possibleTag === "<" || possibleTag === "</"
							// 如果标签不完整且在末尾，则从内容中删除它
							if (isOpeningOrClosing || isLikelyTagName) {
								content = content.slice(0, lastOpenBracketIndex).trim()
							}
						}
					}
				}
				await this.say("text", content, undefined, block.partial)
				break
			}
			case "tool_use":
				const toolDescription = (): string => {
					switch (block.name) {
						case "execute_command":
							return `[${block.name} for '${block.params.command}']`
						case "read_file":
							return `[${block.name} for '${block.params.path}']`
						case "write_to_file":
							return `[${block.name} for '${block.params.path}']`
						case "apply_diff":
							return `[${block.name} for '${block.params.path}']`
						case "search_files":
							return `[${block.name} for '${block.params.regex}'${
								block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""
							}]`
						case "insert_content":
							return `[${block.name} for '${block.params.path}']`
						case "search_and_replace":
							return `[${block.name} for '${block.params.path}']`
						case "list_files":
							return `[${block.name} for '${block.params.path}']`
						case "list_code_definition_names":
							return `[${block.name} for '${block.params.path}']`
						case "browser_action":
							return `[${block.name} for '${block.params.action}']`
						case "use_mcp_tool":
							return `[${block.name} for '${block.params.server_name}']`
						case "access_mcp_resource":
							return `[${block.name} for '${block.params.server_name}']`
						case "ask_followup_question":
							return `[${block.name} for '${block.params.question}']`
						case "attempt_completion":
							return `[${block.name}]`
						case "switch_mode":
							return `[${block.name} to '${block.params.mode_slug}'${
								block.params.reason ? ` because: ${block.params.reason}` : ""
							}]`
						case "new_task": {
							const mode = block.params.mode ?? defaultModeSlug
							const message = block.params.message ?? "(no message)"
							const modeName = getModeBySlug(mode, customModes)?.name ?? mode
							return `[${block.name} in ${modeName} mode: '${message}']`
						}
					}
				}

				if (this.didRejectTool) {
					// 如果用户已拒绝一次工具，则忽略任何工具内容
					if (!block.partial) {
						this.userMessageContent.push({
							type: "text",
							text: `Skipping tool ${toolDescription()} due to user rejecting a previous tool.`,
						})
					} else {
						// 用户拒绝先前工具后的部分工具
						this.userMessageContent.push({
							type: "text",
							text: `Tool ${toolDescription()} was interrupted and not executed due to user rejecting a previous tool.`,
						})
					}
					break
				}

				if (this.didAlreadyUseTool) {
					// 忽略已使用工具后的任何内容
					this.userMessageContent.push({
						type: "text",
						text: `Tool [${block.name}] was not executed because a tool has already been used in this message. Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,
					})
					break
				}

				const pushToolResult = (content: ToolResponse) => {
					this.userMessageContent.push({
						type: "text",
						text: `${toolDescription()} Result:`,
					})
					if (typeof content === "string") {
						this.userMessageContent.push({
							type: "text",
							text: content || "(tool did not return anything)",
						})
					} else {
						this.userMessageContent.push(...content)
					}
					// 一旦收集到工具结果，忽略所有其他工具使用，因为我们每条消息只应呈现一个工具结果
					this.didAlreadyUseTool = true

					// 一旦使用了工具，标记检查点为可能，因为它可能已更改文件系统。
					isCheckpointPossible = true
				}

				const askApproval = async (type: ClineAsk, partialMessage?: string) => {
					const { response, text, images } = await this.ask(type, partialMessage, false)
					if (response !== "yesButtonClicked") {
						// 处理带有文本的 messageResponse 和 noButtonClicked
						if (text) {
							await this.say("user_feedback", text, images)
							pushToolResult(
								formatResponse.toolResult(formatResponse.toolDeniedWithFeedback(text), images),
							)
						} else {
							pushToolResult(formatResponse.toolDenied())
						}
						this.didRejectTool = true
						return false
					}
					// 处理带有文本的 yesButtonClicked
					if (text) {
						await this.say("user_feedback", text, images)
						pushToolResult(formatResponse.toolResult(formatResponse.toolApprovedWithFeedback(text), images))
					}
					return true
				}

				const handleError = async (action: string, error: Error) => {
					const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
					await this.say(
						"error",
						`Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
					)
					// this.toolResults.push({
					// 	type: "tool_result",
					// 	tool_use_id: toolUseId,
					// 	content: await this.formatToolError(errorString),
					// })
					pushToolResult(formatResponse.toolError(errorString))
				}

				// 如果块是部分的，请删除部分关闭标签，以便不呈现给用户
				const removeClosingTag = (tag: ToolParamName, text?: string) => {
					if (!block.partial) {
						return text || ""
					}
					if (!text) {
						return ""
					}
					// 此正则表达式动态构建一个模式以匹配关闭标签：
					// - 可选地匹配标签前的空白
					// - 匹配 '<' 或 '</' 后跟标签名称的任何子集
					const tagRegex = new RegExp(
						`\\s?<\/?${tag
							.split("")
							.map((char) => `(?:${char})?`)
							.join("")}$`,
						"g",
					)
					return text.replace(tagRegex, "")
				}

				if (block.name !== "browser_action") {
					await this.browserSession.closeBrowser()
				}

				// 在执行之前验证工具使用
				const { mode, customModes } = (await this.providerRef.deref()?.getState()) ?? {}
				try {
					validateToolUse(
						block.name as ToolName,
						mode ?? defaultModeSlug,
						customModes ?? [],
						{
							apply_diff: this.diffEnabled,
						},
						block.params,
					)
				} catch (error) {
					this.consecutiveMistakeCount++
					pushToolResult(formatResponse.toolError(error.message))
					break
				}

				switch (block.name) {
					case "write_to_file": {
						const relPath: string | undefined = block.params.path
						let newContent: string | undefined = block.params.content
						let predictedLineCount: number | undefined = parseInt(block.params.line_count ?? "0")
						if (!relPath || !newContent) {
							// 检查 newContent 确保 relPath 完整
							// 等待以确定它是新文件还是编辑现有文件
							break
						}
						// 使用缓存的映射或 fs.access 检查文件是否存在
						let fileExists: boolean
						if (this.diffViewProvider.editType !== undefined) {
							fileExists = this.diffViewProvider.editType === "modify"
						} else {
							const absolutePath = path.resolve(cwd, relPath)
							fileExists = await fileExistsAtPath(absolutePath)
							this.diffViewProvider.editType = fileExists ? "modify" : "create"
						}

						// 预处理 newContent，以防较弱的模型可能添加工件，如 markdown 代码块标记（deepseek/llama）或额外的转义字符（gemini）
						if (newContent.startsWith("```")) {
							// 这处理包括语言说明符的情况，如 ```python ```js
							newContent = newContent.split("\n").slice(1).join("\n").trim()
						}
						if (newContent.endsWith("```")) {
							newContent = newContent.split("\n").slice(0, -1).join("\n").trim()
						}

						if (!this.api.getModel().id.includes("claude")) {
							// 似乎不仅是 llama 模型在这样做，还有 gemini 和其他可能的模型
							if (
								newContent.includes("&gt;") ||
								newContent.includes("&lt;") ||
								newContent.includes("&quot;")
							) {
								newContent = newContent
									.replace(/&gt;/g, ">")
									.replace(/&lt;/g, "<")
									.replace(/&quot;/g, '"')
							}
						}

						const sharedMessageProps: ClineSayTool = {
							tool: fileExists ? "editedExistingFile" : "newFileCreated",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}
						try {
							if (block.partial) {
								// 更新 GUI 消息
								const partialMessage = JSON.stringify(sharedMessageProps)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								// 更新编辑器
								if (!this.diffViewProvider.isEditing) {
									// 打开编辑器并准备流式传输内容
									await this.diffViewProvider.open(relPath)
								}
								// 编辑器已打开，流式传输内容
								await this.diffViewProvider.update(
									everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
									false,
								)
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("write_to_file", "path"))
									await this.diffViewProvider.reset()
									break
								}
								if (!newContent) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("write_to_file", "content"))
									await this.diffViewProvider.reset()
									break
								}
								if (!predictedLineCount) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("write_to_file", "line_count"),
									)
									await this.diffViewProvider.reset()
									break
								}
								this.consecutiveMistakeCount = 0

								// 如果 isEditingFile 为 false，这意味着我们已经拥有文件的完整内容。
								// 重要的是要注意此函数的工作方式，不能假设 block.partial 条件总是会被调用，因为它可能会立即获得完整的非部分数据。因此，这部分逻辑将始终被调用。
								// 换句话说，必须始终在此处重复 block.partial 逻辑
								if (!this.diffViewProvider.isEditing) {
									// 在显示编辑动画之前显示 GUI 消息
									const partialMessage = JSON.stringify(sharedMessageProps)
									await this.ask("tool", partialMessage, true).catch(() => {}) // 发送 true 表示部分，即使它不是部分，这会在内容流式传输到编辑器之前显示编辑行
									await this.diffViewProvider.open(relPath)
								}
								await this.diffViewProvider.update(
									everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
									true,
								)
								await delay(300) // 等待差异视图更新
								this.diffViewProvider.scrollToFirstDiff()

								// 在继续之前检查代码遗漏
								if (
									detectCodeOmission(
										this.diffViewProvider.originalContent || "",
										newContent,
										predictedLineCount,
									)
								) {
									if (this.diffStrategy) {
										await this.diffViewProvider.revertChanges()
										pushToolResult(
											formatResponse.toolError(
												`Content appears to be truncated (file has ${
													newContent.split("\n").length
												} lines but was predicted to have ${predictedLineCount} lines), and found comments indicating omitted code (e.g., '// rest of code unchanged', '/* previous code */'). Please provide the complete file content without any omissions if possible, or otherwise use the 'apply_diff' tool to apply the diff to the original file.`,
											),
										)
										break
									} else {
										vscode.window
											.showWarningMessage(
												"Potential code truncation detected. This happens when the AI reaches its max output limit.",
												"Follow this guide to fix the issue",
											)
											.then((selection) => {
												if (selection === "Follow this guide to fix the issue") {
													vscode.env.openExternal(
														vscode.Uri.parse(
															"https://github.com/cline/cline/wiki/Troubleshooting-%E2%80%90-Cline-Deleting-Code-with-%22Rest-of-Code-Here%22-Comments",
														),
													)
												}
											})
									}
								}

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: fileExists ? undefined : newContent,
									diff: fileExists
										? formatResponse.createPrettyPatch(
												relPath,
												this.diffViewProvider.originalContent,
												newContent,
											)
										: undefined,
								} satisfies ClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									await this.diffViewProvider.revertChanges()
									break
								}
								const { newProblemsMessage, userEdits, finalContent } =
									await this.diffViewProvider.saveChanges()
								this.didEditFile = true // 用于确定我们是否应该等待繁忙的终端更新，然后再发送 API 请求
								if (userEdits) {
									await this.say(
										"user_feedback_diff",
										JSON.stringify({
												tool: fileExists ? "editedExistingFile" : "newFileCreated",
												path: getReadablePath(cwd, relPath),
												diff: userEdits,
											} satisfies ClineSayTool),
									)
									pushToolResult(
										`The user made the following updates to your content:\n\n${userEdits}\n\n` +
											`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
											`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(
												finalContent || "",
											)}\n</final_file_content>\n\n` +
											`Please note:\n` +
											`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
											`2. Proceed with the task using this updated file content as the new baseline.\n` +
											`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
											`${newProblemsMessage}`,
									)
								} else {
									pushToolResult(
										`The content was successfully saved to ${relPath.toPosix()}.${newProblemsMessage}`,
									)
								}
								await this.diffViewProvider.reset()
								break
							}
						} catch (error) {
							await handleError("writing file", error)
							await this.diffViewProvider.reset()
							break
						}
					}
					case "apply_diff": {
						const relPath: string | undefined = block.params.path
						const diffContent: string | undefined = block.params.diff

						const sharedMessageProps: ClineSayTool = {
							tool: "appliedDiff",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}

						try {
							if (block.partial) {
								// 更新 GUI 消息
								const partialMessage = JSON.stringify(sharedMessageProps)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("apply_diff", "path"))
									break
								}
								if (!diffContent) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("apply_diff", "diff"))
									break
								}

								const absolutePath = path.resolve(cwd, relPath)
								const fileExists = await fileExistsAtPath(absolutePath)

								if (!fileExists) {
									this.consecutiveMistakeCount++
									const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
									await this.say("error", formattedError)
									pushToolResult(formattedError)
									break
								}

								const originalContent = await fs.readFile(absolutePath, "utf-8")

								// 将差异应用于原始内容
								const diffResult = (await this.diffStrategy?.applyDiff(
									originalContent,
									diffContent,
									parseInt(block.params.start_line ?? ""),
									parseInt(block.params.end_line ?? ""),
								)) ?? {
									success: false,
									error: "No diff strategy available",
								}
								if (!diffResult.success) {
									this.consecutiveMistakeCount++
									const currentCount =
										(this.consecutiveMistakeCountForApplyDiff.get(relPath) || 0) + 1
									this.consecutiveMistakeCountForApplyDiff.set(relPath, currentCount)
									const errorDetails = diffResult.details
										? JSON.stringify(diffResult.details, null, 2)
										: ""
									const formattedError = `Unable to apply diff to file: ${absolutePath}\n\n<error_details>\n${
										diffResult.error
									}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n</error_details>`
									if (currentCount >= 2) {
										await this.say("error", formattedError)
									}
									pushToolResult(formattedError)
									break
								}

								this.consecutiveMistakeCount = 0
								this.consecutiveMistakeCountForApplyDiff.delete(relPath)
								// 在请求批准之前显示差异视图
								this.diffViewProvider.editType = "modify"
								await this.diffViewProvider.open(relPath)
								await this.diffViewProvider.update(diffResult.content, true)
								await this.diffViewProvider.scrollToFirstDiff()

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									diff: diffContent,
								} satisfies ClineSayTool)

								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									await this.diffViewProvider.revertChanges() // 这可能会处理关闭差异视图
									break
								}

								const { newProblemsMessage, userEdits, finalContent } =
									await this.diffViewProvider.saveChanges()
								this.didEditFile = true // 用于确定我们是否应该等待繁忙的终端更新，然后再发送 API 请求
								if (userEdits) {
									await this.say(
										"user_feedback_diff",
										JSON.stringify({
											tool: fileExists ? "editedExistingFile" : "newFileCreated",
											path: getReadablePath(cwd, relPath),
											diff: userEdits,
										} satisfies ClineSayTool),
									)
									pushToolResult(
										`The user made the following updates to your content:\n\n${userEdits}\n\n` +
											`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
											`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(
												finalContent || "",
											)}\n</final_file_content>\n\n` +
											`Please note:\n` +
											`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
											`2. Proceed with the task using this updated file content as the new baseline.\n` +
											`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
											`${newProblemsMessage}`,
									)
								} else {
									pushToolResult(
										`Changes successfully applied to ${relPath.toPosix()}:\n\n${newProblemsMessage}`,
									)
								}
								await this.diffViewProvider.reset()
								break
							}
						} catch (error) {
							await handleError("applying diff", error)
							await this.diffViewProvider.reset()
							break
						}
					}

					case "insert_content": {
						const relPath: string | undefined = block.params.path
						const operations: string | undefined = block.params.operations

						const sharedMessageProps: ClineSayTool = {
							tool: "appliedDiff",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}

						try {
							if (block.partial) {
								const partialMessage = JSON.stringify(sharedMessageProps)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							}

							// 验证必需的参数
							if (!relPath) {
								this.consecutiveMistakeCount++
								pushToolResult(await this.sayAndCreateMissingParamError("insert_content", "path"))
								break
							}

							if (!operations) {
								this.consecutiveMistakeCount++
								pushToolResult(await this.sayAndCreateMissingParamError("insert_content", "operations"))
								break
							}

							const absolutePath = path.resolve(cwd, relPath)
							const fileExists = await fileExistsAtPath(absolutePath)

							if (!fileExists) {
								this.consecutiveMistakeCount++
								const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
								await this.say("error", formattedError)
								pushToolResult(formattedError)
								break
							}

							let parsedOperations: Array<{
								start_line: number
								content: string
							}>

							try {
								parsedOperations = JSON.parse(operations)
								if (!Array.isArray(parsedOperations)) {
									throw new Error("Operations must be an array")
								}
							} catch (error) {
								this.consecutiveMistakeCount++
								await this.say("error", `Failed to parse operations JSON: ${error.message}`)
								pushToolResult(formatResponse.toolError("Invalid operations JSON format"))
								break
							}

							this.consecutiveMistakeCount = 0

							// 读取文件
							const fileContent = await fs.readFile(absolutePath, "utf8")
							this.diffViewProvider.editType = "modify"
							this.diffViewProvider.originalContent = fileContent
							const lines = fileContent.split("\n")

							const updatedContent = insertGroups(
								lines,
								parsedOperations.map((elem) => {
									return {
										index: elem.start_line - 1,
										elements: elem.content.split("\n"),
									}
								}),
							).join("\n")

							// 在差异视图中显示更改
							if (!this.diffViewProvider.isEditing) {
								await this.ask("tool", JSON.stringify(sharedMessageProps), true).catch(() => {})
								// 首先打开原始内容
								await this.diffViewProvider.open(relPath)
								await this.diffViewProvider.update(fileContent, false)
								this.diffViewProvider.scrollToFirstDiff()
								await delay(200)
							}

							const diff = formatResponse.createPrettyPatch(relPath, fileContent, updatedContent)

							if (!diff) {
								pushToolResult(`No changes needed for '${relPath}'`)
								break
							}

							await this.diffViewProvider.update(updatedContent, true)

							const completeMessage = JSON.stringify({
								...sharedMessageProps,
								diff,
							} satisfies ClineSayTool)

							const didApprove = await this.ask("tool", completeMessage, false).then(
								(response) => response.response === "yesButtonClicked",
							)

							if (!didApprove) {
								await this.diffViewProvider.revertChanges()
								pushToolResult("Changes were rejected by the user.")
								break
							}

							const { newProblemsMessage, userEdits, finalContent } =
								await this.diffViewProvider.saveChanges()
							this.didEditFile = true

							if (!userEdits) {
								pushToolResult(
									`The content was successfully inserted in ${relPath.toPosix()}.${newProblemsMessage}`,
								)
								await this.diffViewProvider.reset()
								break
							}

							const userFeedbackDiff = JSON.stringify({
								tool: "appliedDiff",
								path: getReadablePath(cwd, relPath),
								diff: userEdits,
							} satisfies ClineSayTool)

							console.debug("[DEBUG] User made edits, sending feedback diff:", userFeedbackDiff)
							await this.say("user_feedback_diff", userFeedbackDiff)
							pushToolResult(
								`The user made the following updates to your content:\n\n${userEdits}\n\n` +
									`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file:\n\n` +
									`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
									`Please note:\n` +
									`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
									`2. Proceed with the task using this updated file content as the new baseline.\n` +
									`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
									`${newProblemsMessage}`,
							)
							await this.diffViewProvider.reset()
						} catch (error) {
							handleError("insert content", error)
							await this.diffViewProvider.reset()
						}
						break
					}

					case "search_and_replace": {
						const relPath: string | undefined = block.params.path
						const operations: string | undefined = block.params.operations

						const sharedMessageProps: ClineSayTool = {
							tool: "appliedDiff",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}

						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									path: removeClosingTag("path", relPath),
									operations: removeClosingTag("operations", operations),
								})
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("search_and_replace", "path"),
									)
									break
								}
								if (!operations) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("search_and_replace", "operations"),
									)
									break
								}

								const absolutePath = path.resolve(cwd, relPath)
								const fileExists = await fileExistsAtPath(absolutePath)

								if (!fileExists) {
									this.consecutiveMistakeCount++
									const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
									await this.say("error", formattedError)
									pushToolResult(formattedError)
									break
								}

								let parsedOperations: Array<{
									search: string
									replace: string
									start_line?: number
									end_line?: number
									use_regex?: boolean
									ignore_case?: boolean
									regex_flags?: string
								}>

								try {
									parsedOperations = JSON.parse(operations)
									if (!Array.isArray(parsedOperations)) {
										throw new Error("Operations must be an array")
									}
								} catch (error) {
									this.consecutiveMistakeCount++
									await this.say("error", `Failed to parse operations JSON: ${error.message}`)
									pushToolResult(formatResponse.toolError("Invalid operations JSON format"))
									break
								}

								// 读取原始文件内容
								const fileContent = await fs.readFile(absolutePath, "utf-8")
								this.diffViewProvider.editType = "modify"
								this.diffViewProvider.originalContent = fileContent
								let lines = fileContent.split("\n")

								for (const op of parsedOperations) {
									const flags = op.regex_flags ?? (op.ignore_case ? "gi" : "g")
									const multilineFlags = flags.includes("m") ? flags : flags + "m"

									const searchPattern = op.use_regex
										? new RegExp(op.search, multilineFlags)
										: new RegExp(escapeRegExp(op.search), multilineFlags)

									if (op.start_line || op.end_line) {
										const startLine = Math.max((op.start_line ?? 1) - 1, 0)
										const endLine = Math.min((op.end_line ?? lines.length) - 1, lines.length - 1)

										// 获取目标部分之前和之后的内容
										const beforeLines = lines.slice(0, startLine)
										const afterLines = lines.slice(endLine + 1)

										// 获取目标部分并执行替换
										const targetContent = lines.slice(startLine, endLine + 1).join("\n")
										const modifiedContent = targetContent.replace(searchPattern, op.replace)
										const modifiedLines = modifiedContent.split("\n")

										// 使用修改后的部分重建完整内容
										lines = [...beforeLines, ...modifiedLines, ...afterLines]
									} else {
										// 全局替换
										const fullContent = lines.join("\n")
										const modifiedContent = fullContent.replace(searchPattern, op.replace)
										lines = modifiedContent.split("\n")
									}
								}

								const newContent = lines.join("\n")

								this.consecutiveMistakeCount = 0

								// 显示差异预览
								const diff = formatResponse.createPrettyPatch(relPath, fileContent, newContent)

								if (!diff) {
									pushToolResult(`No changes needed for '${relPath}'`)
									break
								}

								await this.diffViewProvider.open(relPath)
								await this.diffViewProvider.update(newContent, true)
								this.diffViewProvider.scrollToFirstDiff()

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									diff: diff,
								} satisfies ClineSayTool)

								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									await this.diffViewProvider.revertChanges() // 这可能会处理关闭差异视图
									break
								}

								const { newProblemsMessage, userEdits, finalContent } =
									await this.diffViewProvider.saveChanges()
								this.didEditFile = true // 用于确定我们是否应该等待繁忙的终端更新，然后再发送 API 请求
								if (userEdits) {
									await this.say(
										"user_feedback_diff",
										JSON.stringify({
											tool: fileExists ? "editedExistingFile" : "newFileCreated",
											path: getReadablePath(cwd, relPath),
											diff: userEdits,
										} satisfies ClineSayTool),
									)
									pushToolResult(
										`The user made the following updates to your content:\n\n${userEdits}\n\n` +
											`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
											`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(finalContent || "")}\n</final_file_content>\n\n` +
											`Please note:\n` +
											`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
											`2. Proceed with the task using this updated file content as the new baseline.\n` +
											`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
											`${newProblemsMessage}`,
									)
								} else {
									pushToolResult(
										`Changes successfully applied to ${relPath.toPosix()}:\n\n${newProblemsMessage}`,
									)
								}
								await this.diffViewProvider.reset()
								break
							}
						} catch (error) {
							await handleError("applying search and replace", error)
							await this.diffViewProvider.reset()
							break
						}
					}

					case "read_file": {
						const relPath: string | undefined = block.params.path
						const sharedMessageProps: ClineSayTool = {
							tool: "readFile",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: undefined,
								} satisfies ClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("read_file", "path"))
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = path.resolve(cwd, relPath)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: absolutePath,
								} satisfies ClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								// 现在像往常一样执行工具
								const content = await extractTextFromFile(absolutePath)
								pushToolResult(content)
								break
							}
						} catch (error) {
							await handleError("reading file", error)
							break
						}
					}
					case "list_files": {
						const relDirPath: string | undefined = block.params.path
						const recursiveRaw: string | undefined = block.params.recursive
						const recursive = recursiveRaw?.toLowerCase() === "true"
						const sharedMessageProps: ClineSayTool = {
							tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
							path: getReadablePath(cwd, removeClosingTag("path", relDirPath)),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: "",
								} satisfies ClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relDirPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("list_files", "path"))
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = path.resolve(cwd, relDirPath)
								const [files, didHitLimit] = await listFiles(absolutePath, recursive, 200)
								const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: result,
								} satisfies ClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								pushToolResult(result)
								break
							}
						} catch (error) {
							await handleError("listing files", error)
							break
						}
					}
					case "list_code_definition_names": {
						const relDirPath: string | undefined = block.params.path
						const sharedMessageProps: ClineSayTool = {
							tool: "listCodeDefinitionNames",
							path: getReadablePath(cwd, removeClosingTag("path", relDirPath)),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: "",
								} satisfies ClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relDirPath) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("list_code_definition_names", "path"),
									)
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = path.resolve(cwd, relDirPath)
								const result = await parseSourceCodeForDefinitionsTopLevel(absolutePath)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: result,
								} satisfies ClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								pushToolResult(result)
								break
							}
						} catch (error) {
							await handleError("parsing source code definitions", error)
							break
						}
					}
					case "search_files": {
						const relDirPath: string | undefined = block.params.path
						const regex: string | undefined = block.params.regex
						const filePattern: string | undefined = block.params.file_pattern
						const sharedMessageProps: ClineSayTool = {
							tool: "searchFiles",
							path: getReadablePath(cwd, removeClosingTag("path", relDirPath)),
							regex: removeClosingTag("regex", regex),
							filePattern: removeClosingTag("file_pattern", filePattern),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: "",
								} satisfies ClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relDirPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("search_files", "path"))
									break
								}
								if (!regex) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("search_files", "regex"))
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = path.resolve(cwd, relDirPath)
								const results = await regexSearchFiles(cwd, absolutePath, regex, filePattern)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: results,
								} satisfies ClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								pushToolResult(results)
								break
							}
						} catch (error) {
							await handleError("searching files", error)
							break
						}
					}
					case "browser_action": {
						const action: BrowserAction | undefined = block.params.action as BrowserAction
						const url: string | undefined = block.params.url
						const coordinate: string | undefined = block.params.coordinate
						const text: string | undefined = block.params.text
						if (!action || !browserActions.includes(action)) {
							// 检查 action 以确保其完整且有效
							if (!block.partial) {
								// 如果块是完整的并且我们没有有效的操作，这是一个错误
								this.consecutiveMistakeCount++
								pushToolResult(await this.sayAndCreateMissingParamError("browser_action", "action"))
								await this.browserSession.closeBrowser()
							}
							break
						}

						try {
							if (block.partial) {
								if (action === "launch") {
									await this.ask(
										"browser_action_launch",
										removeClosingTag("url", url),
										block.partial,
									).catch(() => {})
								} else {
									await this.say(
										"browser_action",
										JSON.stringify({
											action: action as BrowserAction,
											coordinate: removeClosingTag("coordinate", coordinate),
											text: removeClosingTag("text", text),
										} satisfies ClineSayBrowserAction),
										undefined,
										block.partial,
									)
								}
								break
							} else {
								let browserActionResult: BrowserActionResult
								if (action === "launch") {
									if (!url) {
										this.consecutiveMistakeCount++
										pushToolResult(
											await this.sayAndCreateMissingParamError("browser_action", "url"),
										)
										await this.browserSession.closeBrowser()
										break
									}
									this.consecutiveMistakeCount = 0
									const didApprove = await askApproval("browser_action_launch", url)
									if (!didApprove) {
										break
									}

									// 注意：可以调用此消息，因为部分 inspect_site 已完成流式传输。唯一需要避免的是在部分消息存在于消息数组末尾时发送消息。例如，api_req_finished 消息会干扰部分消息，因此我们需要删除它。
									// await this.say("inspect_site_result", "") // 没有结果，启动加载指示器等待结果
									await this.say("browser_action_result", "") // 启动加载指示器

									await this.browserSession.launchBrowser()
									browserActionResult = await this.browserSession.navigateToUrl(url)
								} else {
									if (action === "click") {
										if (!coordinate) {
											this.consecutiveMistakeCount++
											pushToolResult(
												await this.sayAndCreateMissingParamError(
													"browser_action",
													"coordinate",
												),
											)
											await this.browserSession.closeBrowser()
											break // 不能在内部 switch 中
										}
									}
									if (action === "type") {
										if (!text) {
											this.consecutiveMistakeCount++
											pushToolResult(
												await this.sayAndCreateMissingParamError("browser_action", "text"),
											)
											await this.browserSession.closeBrowser()
											break
										}
									}
									this.consecutiveMistakeCount = 0
									await this.say(
										"browser_action",
										JSON.stringify({
											action: action as BrowserAction,
											coordinate,
											text,
										} satisfies ClineSayBrowserAction),
										undefined,
										false,
									)
									switch (action) {
										case "click":
											browserActionResult = await this.browserSession.click(coordinate!)
											break
										case "type":
											browserActionResult = await this.browserSession.type(text!)
											break
										case "scroll_down":
											browserActionResult = await this.browserSession.scrollDown()
											break
										case "scroll_up":
											browserActionResult = await this.browserSession.scrollUp()
											break
										case "close":
											browserActionResult = await this.browserSession.closeBrowser()
											break
									}
								}

								switch (action) {
									case "launch":
									case "click":
									case "type":
									case "scroll_down":
									case "scroll_up":
										await this.say("browser_action_result", JSON.stringify(browserActionResult))
										pushToolResult(
											formatResponse.toolResult(
												`The browser action has been executed. The console logs and screenshot have been captured for your analysis.\n\nConsole logs:\n${
													browserActionResult.logs || "(No new logs)"
												}\n\n(REMEMBER: if you need to proceed to using non-\`browser_action\` tools or launch a new browser, you MUST first close this browser. For example, if after analyzing the logs and screenshot you need to edit a file, you must first close the browser before you can use the write_to_file tool.)`,
												browserActionResult.screenshot ? [browserActionResult.screenshot] : [],
											),
										)
										break
									case "close":
										pushToolResult(
											formatResponse.toolResult(
												`The browser has been closed. You may now proceed to using other tools.`,
											),
										)
										break
								}
								break
							}
						} catch (error) {
							await this.browserSession.closeBrowser() // 如果发生任何错误，浏览器会话将终止
							await handleError("executing browser action", error)
							break
						}
					}
					case "execute_command": {
						const command: string | undefined = block.params.command
						try {
							if (block.partial) {
								await this.ask("command", removeClosingTag("command", command), block.partial).catch(
									() => {},
								)
								break
							} else {
								if (!command) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("execute_command", "command"),
									)
									break
								}
								this.consecutiveMistakeCount = 0

								const didApprove = await askApproval("command", command)
								if (!didApprove) {
									break
								}
								const [userRejected, result] = await this.executeCommandTool(command)
								if (userRejected) {
									this.didRejectTool = true
								}
								pushToolResult(result)
								break
							}
						} catch (error) {
							await handleError("executing command", error)
							break
						}
					}
					case "use_mcp_tool": {
						const server_name: string | undefined = block.params.server_name
						const tool_name: string | undefined = block.params.tool_name
						const mcp_arguments: string | undefined = block.params.arguments
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									type: "use_mcp_tool",
									serverName: removeClosingTag("server_name", server_name),
									toolName: removeClosingTag("tool_name", tool_name),
									arguments: removeClosingTag("arguments", mcp_arguments),
								} satisfies ClineAskUseMcpServer)
								await this.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!server_name) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("use_mcp_tool", "server_name"),
									)
									break
								}
								if (!tool_name) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("use_mcp_tool", "tool_name"),
									)
									break
								}
								// 参数是可选的，但如果提供，它们必须是有效的 JSON
								// if (!mcp_arguments) {
								// 	this.consecutiveMistakeCount++
								// 	pushToolResult(await this.sayAndCreateMissingParamError("use_mcp_tool", "arguments"))
								// 	break
								// }
								let parsedArguments: Record<string, unknown> | undefined
								if (mcp_arguments) {
									try {
										parsedArguments = JSON.parse(mcp_arguments)
									} catch (error) {
										this.consecutiveMistakeCount++
										await this.say(
											"error",
											`Roo tried to use ${tool_name} with an invalid JSON argument. Retrying...`,
										)
										pushToolResult(
											formatResponse.toolError(
												formatResponse.invalidMcpToolArgumentError(server_name, tool_name),
											),
										)
										break
									}
								}
								this.consecutiveMistakeCount = 0
								const completeMessage = JSON.stringify({
									type: "use_mcp_tool",
									serverName: server_name,
									toolName: tool_name,
									arguments: mcp_arguments,
								} satisfies ClineAskUseMcpServer)
								const didApprove = await askApproval("use_mcp_server", completeMessage)
								if (!didApprove) {
									break
								}
								// 现在执行工具
								await this.say("mcp_server_request_started") // 与 browser_action_result 相同
								const toolResult = await this.providerRef
									.deref()
									?.getMcpHub()
									?.callTool(server_name, tool_name, parsedArguments)

								// TODO: 添加进度指示器并解析图像和非文本响应的能力
								const toolResultPretty =
									(toolResult?.isError ? "Error:\n" : "") +
										toolResult?.content
											.map((item) => {
												if (item.type === "text") {
													return item.text
												}
												if (item.type === "resource") {
													const { blob, ...rest } = item.resource
													return JSON.stringify(rest, null, 2)
												}
												return ""
											})
											.filter(Boolean)
											.join("\n\n") || "(No response)"
								await this.say("mcp_server_response", toolResultPretty)
								pushToolResult(formatResponse.toolResult(toolResultPretty))
								break
							}
						} catch (error) {
							await handleError("executing MCP tool", error)
							break
						}
					}
					case "access_mcp_resource": {
						const server_name: string | undefined = block.params.server_name
						const uri: string | undefined = block.params.uri
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									type: "access_mcp_resource",
									serverName: removeClosingTag("server_name", server_name),
									uri: removeClosingTag("uri", uri),
								} satisfies ClineAskUseMcpServer)
								await this.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!server_name) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("access_mcp_resource", "server_name"),
									)
									break
								}
								if (!uri) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("access_mcp_resource", "uri"),
									)
									break
								}
								this.consecutiveMistakeCount = 0
								const completeMessage = JSON.stringify({
									type: "access_mcp_resource",
									serverName: server_name,
									uri,
								} satisfies ClineAskUseMcpServer)
								const didApprove = await askApproval("use_mcp_server", completeMessage)
								if (!didApprove) {
									break
								}
								// 现在执行工具
								await this.say("mcp_server_request_started")
								const resourceResult = await this.providerRef
									.deref()
									?.getMcpHub()
									?.readResource(server_name, uri)
								const resourceResultPretty =
									resourceResult?.contents
										.map((item) => {
											if (item.text) {
												return item.text
											}
											return ""
										})
										.filter(Boolean)
										.join("\n\n") || "(Empty response)"
								await this.say("mcp_server_response", resourceResultPretty)
								pushToolResult(formatResponse.toolResult(resourceResultPretty))
								break
							}
						} catch (error) {
							await handleError("accessing MCP resource", error)
							break
						}
					}
					case "ask_followup_question": {
						const question: string | undefined = block.params.question
						try {
							if (block.partial) {
								await this.ask("followup", removeClosingTag("question", question), block.partial).catch(
									() => {},
								)
								break
							} else {
								if (!question) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("ask_followup_question", "question"),
									)
									break
								}
								this.consecutiveMistakeCount = 0
								const { text, images } = await this.ask("followup", question, false)
								await this.say("user_feedback", text ?? "", images)
								pushToolResult(formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images))
								break
							}
						} catch (error) {
							await handleError("asking question", error)
							break
						}
					}
					case "switch_mode": {
						const mode_slug: string | undefined = block.params.mode_slug
						const reason: string | undefined = block.params.reason
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									tool: "switchMode",
									mode: removeClosingTag("mode_slug", mode_slug),
									reason: removeClosingTag("reason", reason),
								})
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!mode_slug) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("switch_mode", "mode_slug"))
									break
								}
								this.consecutiveMistakeCount = 0

								// 验证模式是否存在
								const targetMode = getModeBySlug(
									mode_slug,
									(await this.providerRef.deref()?.getState())?.customModes,
								)
								if (!targetMode) {
									pushToolResult(formatResponse.toolError(`Invalid mode: ${mode_slug}`))
									break
								}

								// 检查是否已在请求的模式中
								const currentMode =
									(await this.providerRef.deref()?.getState())?.mode ?? defaultModeSlug
								if (currentMode === mode_slug) {
									pushToolResult(`Already in ${targetMode.name} mode.`)
									break
								}

								const completeMessage = JSON.stringify({
									tool: "switchMode",
									mode: mode_slug,
									reason,
								})

								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}

								// 使用共享处理程序切换模式
								const provider = this.providerRef.deref()
								if (provider) {
									await provider.handleModeSwitch(mode_slug)
								}
								pushToolResult(
									`Successfully switched from ${getModeBySlug(currentMode)?.name ?? currentMode} mode to ${
										targetMode.name
									} mode${reason ? ` because: ${reason}` : ""}.`,
								)
								await delay(500) // 延迟以允许模式更改生效，然后再执行下一个工具
								break
							}
						} catch (error) {
							await handleError("switching mode", error)
							break
						}
					}

					case "new_task": {
						const mode: string | undefined = block.params.mode
						const message: string | undefined = block.params.message
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									tool: "newTask",
									mode: removeClosingTag("mode", mode),
									message: removeClosingTag("message", message),
								})
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!mode) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("new_task", "mode"))
									break
								}
								if (!message) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("new_task", "message"))
									break
								}
								this.consecutiveMistakeCount = 0

								// 验证模式是否存在
								const targetMode = getModeBySlug(
									mode,
									(await this.providerRef.deref()?.getState())?.customModes,
								)
								if (!targetMode) {
									pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
									break
								}

								// 显示我们即将做的事情
								const toolMessage = JSON.stringify({
									tool: "newTask",
									mode: targetMode.name,
									content: message,
								})

								const didApprove = await askApproval("tool", toolMessage)
								if (!didApprove) {
									break
								}

								// 首先切换模式，然后创建新任务实例
								const provider = this.providerRef.deref()
								if (provider) {
									await provider.handleModeSwitch(mode)
									await provider.initClineWithTask(message)
									pushToolResult(
										`Successfully created new task in ${targetMode.name} mode with message: ${message}`,
									)
								} else {
									pushToolResult(
										formatResponse.toolError("Failed to create new task: provider not available"),
									)
								}
								break
							}
						} catch (error) {
							await handleError("creating new task", error)
							break
						}
					}

					case "attempt_completion": {
						/*
						this.consecutiveMistakeCount = 0
						let resultToSend = result
						if (command) {
							await this.say("completion_result", resultToSend)
							// TODO: currently we don't handle if this command fails, it could be useful to let cline know and retry
							const [didUserReject, commandResult] = await this.executeCommand(command, true)
							// if we received non-empty string, the command was rejected or failed
							if (commandResult) {
								return [didUserReject, commandResult]
							}
							resultToSend = ""
						}
						const { response, text, images } = await this.ask("completion_result", resultToSend) // this prompts webview to show 'new task' button, and enable text input (which would be the 'text' here)
						if (response === "yesButtonClicked") {
							return [false, ""] // signals to recursive loop to stop (for now this never happens since yesButtonClicked will trigger a new task)
						}
						await this.say("user_feedback", text ?? "", images)
						return [
						*/
						const result: string | undefined = block.params.result
						const command: string | undefined = block.params.command
						try {
							const lastMessage = this.clineMessages.at(-1)
							if (block.partial) {
								if (command) {
									// attempt_completion 文本已完成，现在我们获取命令
									// 删除之前的部分 attempt_completion 请求，替换为 say，发布状态到 Webview，然后流式传输命令

									// const secondLastMessage = this.clineMessages.at(-2)
									if (lastMessage && lastMessage.ask === "command") {
										// 更新命令
										await this.ask(
											"command",
											removeClosingTag("command", command),
											block.partial,
										).catch(() => {})
									} else {
										// 最后一条消息是 completion_result
										// 我们有命令字符串，这意味着我们也有结果，因此完成它（不必存在）
										await this.say(
											"completion_result",
											removeClosingTag("result", result),
											undefined,
											false,
										)
										await this.ask(
											"command",
											removeClosingTag("command", command),
											block.partial,
										).catch(() => {})
									}
								} else {
									// 没有命令，仍在输出部分结果
									await this.say(
										"completion_result",
										removeClosingTag("result", result),
										undefined,
										block.partial,
									)
								}
								break
							} else {
								if (!result) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("attempt_completion", "result"),
									)
									break
								}
								this.consecutiveMistakeCount = 0

								let commandResult: ToolResponse | undefined
								if (command) {
									if (lastMessage && lastMessage.ask !== "command") {
										// 尚未发送命令消息，因此首先发送 completion_result 然后发送命令
										await this.say("completion_result", result, undefined, false)
									}

									// 完成命令消息
									const didApprove = await askApproval("command", command)
									if (!didApprove) {
										break
									}
									const [userRejected, execCommandResult] = await this.executeCommandTool(command!)
									if (userRejected) {
										this.didRejectTool = true
										pushToolResult(execCommandResult)
										break
									}
									// 用户未拒绝，但命令可能有输出
									commandResult = execCommandResult
								} else {
									await this.say("completion_result", result, undefined, false)
								}

								// 我们已经发送了 completion_result 消息，空字符串请求放弃按钮和字段的控制
								const { response, text, images } = await this.ask("completion_result", "", false)
								if (response === "yesButtonClicked") {
									pushToolResult("") // 向递归循环发出停止信号（目前这永远不会发生，因为 yesButtonClicked 会触发新任务）
									break
								}
								await this.say("user_feedback", text ?? "", images)

								const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
								if (commandResult) {
									if (typeof commandResult === "string") {
										toolResults.push({ type: "text", text: commandResult })
									} else if (Array.isArray(commandResult)) {
										toolResults.push(...commandResult)
									}
								}
								toolResults.push({
									type: "text",
									text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
								})
								toolResults.push(...formatResponse.imageBlocks(images))
								this.userMessageContent.push({
									type: "text",
									text: `${toolDescription()} Result:`,
								})
								this.userMessageContent.push(...toolResults)

								break
							}
						} catch (error) {
							await handleError("inspecting site", error)
							break
						}
					}
				}
				break
		}

		if (isCheckpointPossible) {
			await this.checkpointSave()
		}

		/*
		看到超出范围是正常的，这意味着下一个工具调用正在构建并准备添加到 assistantMessageContent 以呈现。
		当您在此期间看到 UI 不活动时，这意味着工具在不呈现任何 UI 的情况下中断。例如，当 relpath 未定义时，write_to_file 工具中断，对于无效的 relpath，它从未呈现 UI。
		*/
		this.presentAssistantMessageLocked = false // 需要放在这里，否则调用 this.presentAssistantMessage 下面会失败（有时）因为它被锁定
		// 注意：当工具被拒绝时，迭代器流会中断并等待 userMessageContentReady 为 true。未来对 present 的调用将跳过执行，因为 didRejectTool 并迭代直到 contentIndex 设置为消息长度并将 userMessageContentReady 设置为 true（而不是在迭代器中预先设置）
		if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
			// 块已完成流式传输和执行
			if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
				// 可以增加，如果 !didCompleteReadingStream，它会返回，因为超出范围，并且随着流式传输的继续，它会在新块准备好时调用 presentAssitantMessage。如果流式传输完成，则在超出范围时将 userMessageContentReady 设置为 true。这优雅地允许流继续并呈现所有潜在的内容块。
				// 最后一个块已完成并已执行
				this.userMessageContentReady = true // 允许 pwaitfor 继续
			}

			// 如果存在下一个块，则调用下一个块（如果不存在，则读取流将在准备好时调用它）
			this.currentStreamingContentIndex++ // 需要增加，无论如何，所以当读取流再次调用此函数时，它将流式传输下一个块

			if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
				// 已经有更多的内容块要流式传输，因此我们将自己调用此函数
				// await this.presentAssistantContent()

				this.presentAssistantMessage()
				return
			}
		}
		// 块是部分的，但读取流可能已完成
		if (this.presentAssistantMessageHasPendingUpdates) {
			this.presentAssistantMessage()
		}
	}

	async recursivelyMakeClineRequests(
		userContent: UserContent,
		includeFileDetails: boolean = false,
	): Promise<boolean> {
		if (this.abort) {
			throw new Error("Roo Code instance aborted")
		}

		if (this.consecutiveMistakeCount >= 3) {
			const { response, text, images } = await this.ask(
				"mistake_limit_reached",
				this.api.getModel().id.includes("claude")
					? `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
					: "Roo Code uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.5 Sonnet for its advanced agentic coding capabilities.",
			)
			if (response === "messageResponse") {
				userContent.push(
					...[
						{
							type: "text",
							text: formatResponse.tooManyMistakes(text),
						} as Anthropic.Messages.TextBlockParam,
						...formatResponse.imageBlocks(images),
					],
				)
			}
			this.consecutiveMistakeCount = 0
		}

		// 获取上一个 api 请求的索引以检查令牌使用情况并确定是否需要截断对话历史
		const previousApiReqIndex = findLastIndex(this.clineMessages, (m) => m.say === "api_req_started")

		// 获取详细信息是一个昂贵的操作，它使用 globby 自上而下构建项目的文件结构，对于大型项目可能需要几秒钟
		// 为了获得最佳的用户体验，我们在此期间显示一个占位符 api_req_started 消息，并带有加载指示器
		await this.say(
			"api_req_started",
			JSON.stringify({
				request:
					userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n") + "\n\nLoading...",
			}),
		)

		const [parsedUserContent, environmentDetails] = await this.loadContext(userContent, includeFileDetails)
		userContent = parsedUserContent
		// 将环境详细信息添加为单独的文本块，与工具结果分开
		userContent.push({ type: "text", text: environmentDetails })

		await this.addToApiConversationHistory({ role: "user", content: userContent })

		// 由于我们发送了一个占位符 api_req_started 消息以更新 Webview，同时等待实际启动 API 请求（例如加载潜在的详细信息），我们需要更新该消息的文本
		const lastApiReqIndex = findLastIndex(this.clineMessages, (m) => m.say === "api_req_started")
		this.clineMessages[lastApiReqIndex].text = JSON.stringify({
			request: userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n"),
		} satisfies ClineApiReqInfo)
		await this.saveClineMessages()
		await this.providerRef.deref()?.postStateToWebview()

		try {
			let cacheWriteTokens = 0
			let cacheReadTokens = 0
			let inputTokens = 0
			let outputTokens = 0
			let totalCost: number | undefined

			// 更新 api_req_started。我们不能再使用 api_req_finished，因为它是一个独特的情况，它可能会在流式传输消息之后（即在更新或执行的中间）
			// 幸运的是，api_req_finished 总是被解析出来用于 GUI，因此它仅用于遗留目的，以跟踪历史任务中的价格
			// （值得在几个月后删除）
			const updateApiReqMsg = (cancelReason?: ClineApiReqCancelReason, streamingFailedMessage?: string) => {
				this.clineMessages[lastApiReqIndex].text = JSON.stringify({
					...JSON.parse(this.clineMessages[lastApiReqIndex].text || "{}"),
					tokensIn: inputTokens,
					tokensOut: outputTokens,
					cacheWrites: cacheWriteTokens,
					cacheReads: cacheReadTokens,
					cost:
						totalCost ??
						calculateApiCost(
							this.api.getModel().info,
							inputTokens,
							outputTokens,
							cacheWriteTokens,
							cacheReadTokens,
						),
					cancelReason,
					streamingFailedMessage,
				} satisfies ClineApiReqInfo)
			}

			const abortStream = async (cancelReason: ClineApiReqCancelReason, streamingFailedMessage?: string) => {
				if (this.diffViewProvider.isEditing) {
					await this.diffViewProvider.revertChanges() // 关闭差异视图
				}

				// 如果最后一条消息是部分的，我们需要更新并保存它
				const lastMessage = this.clineMessages.at(-1)
				if (lastMessage && lastMessage.partial) {
					// lastMessage.ts = Date.now() 不要更新 ts，因为它用于 virtuoso 列表的键
					lastMessage.partial = false
					// 而不是流式传输 partialMessage 事件，我们像往常一样进行保存和发布以持久化到磁盘
					console.log("updating partial message", lastMessage)
					// await this.saveClineMessages()
				}

				// 让助手知道他们的响应被中断，以便在任务恢复时
				await this.addToApiConversationHistory({
					role: "assistant",
					content: [
						{
							type: "text",
							text:
								assistantMessage +
								`\n\n[${
									cancelReason === "streaming_failed"
										? "Response interrupted by API Error"
										: "Response interrupted by user"
								}]`,
						},
					],
				})

				// 更新 api_req_started 以包含取消和成本，以便我们可以显示部分流的成本
				updateApiReqMsg(cancelReason, streamingFailedMessage)
				await this.saveClineMessages()

				// 向提供者发出信号，表明它可以从磁盘检索保存的消息，因为 abortTask 本质上无法等待
				this.didFinishAbortingStream = true
			}

			// 重置流式传输状态
			this.currentStreamingContentIndex = 0
			this.assistantMessageContent = []
			this.didCompleteReadingStream = false
			this.userMessageContent = []
			this.userMessageContentReady = false
			this.didRejectTool = false
			this.didAlreadyUseTool = false
			this.presentAssistantMessageLocked = false
			this.presentAssistantMessageHasPendingUpdates = false
			await this.diffViewProvider.reset()

			const stream = this.attemptApiRequest(previousApiReqIndex) // 仅在第一个块成功时生成，否则将允许用户重试请求（最有可能由于速率限制错误而在第一个块上抛出错误）
			let assistantMessage = ""
			let reasoningMessage = ""
			try {
				for await (const chunk of stream) {
					if (!chunk) {
						// 有时 chunk 是未定义的，不知道是什么原因导致的，但这种解决方法似乎可以解决它
						continue
					}
					switch (chunk.type) {
						case "reasoning":
							reasoningMessage += chunk.text
							await this.say("reasoning", reasoningMessage, undefined, true)
							break
						case "usage":
							inputTokens += chunk.inputTokens
							outputTokens += chunk.outputTokens
							cacheWriteTokens += chunk.cacheWriteTokens ?? 0
							cacheReadTokens += chunk.cacheReadTokens ?? 0
							totalCost = chunk.totalCost
							break
						case "text":
							assistantMessage += chunk.text
							// 将原始助手消息解析为内容块
							const prevLength = this.assistantMessageContent.length
							this.assistantMessageContent = parseAssistantMessage(assistantMessage)
							if (this.assistantMessageContent.length > prevLength) {
								this.userMessageContentReady = false // 新内容需要呈现，重置为 false，以防之前的内容将其设置为 true
							}
							// 向用户呈现内容
							this.presentAssistantMessage()
							break
					}

					if (this.abort) {
						console.log("aborting stream...")
						if (!this.abandoned) {
							// 仅在此实例未被放弃时优雅地中止（有时 openrouter 流挂起，在这种情况下，这会影响 cline 的未来实例）
							await abortStream("user_cancelled")
						}
						break // 中止流
					}

					if (this.didRejectTool) {
						// userContent 有一个工具拒绝，因此中断助手的响应以呈现用户的反馈
						assistantMessage += "\n\n[Response interrupted by user feedback]"
						// this.userMessageContentReady = true // 而不是预先设置这个，我们允许 present 迭代器完成并在准备好时设置 userMessageContentReady
						break
					}

					// 之前：我们需要让请求完成以获取 openrouter 的生成详细信息
					// 更新：以中断请求为代价获得更好的用户体验，而不是获取 API 成本
					if (this.didAlreadyUseTool) {
						assistantMessage +=
							"\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
						break
					}
				}
			} catch (error) {
				// 放弃发生在扩展不再等待 cline 实例完成中止时（当此.abort 导致 for 循环中的任何函数抛出错误时，此处会抛出错误）
				if (!this.abandoned) {
					this.abortTask() // 如果流失败，任务可能处于各种状态（即可能已流式传输一些用户可能已执行的工具），因此我们只会恢复到复制取消任务
					await abortStream(
						"streaming_failed",
						error.message ?? JSON.stringify(serializeError(error), null, 2),
					)
					const history = await this.providerRef.deref()?.getTaskWithId(this.taskId)
					if (history) {
						await this.providerRef.deref()?.initClineWithHistoryItem(history.historyItem)
						// await this.providerRef.deref()?.postStateToWebview()
					}
				}
			}

			// 需要在流中止的情况下调用此处
			if (this.abort) {
				throw new Error("Roo Code instance aborted")
			}

			this.didCompleteReadingStream = true

			// 设置任何块为完成，以允许 presentAssistantMessage 完成并将 userMessageContentReady 设置为 true
			// （可能是没有后续工具使用的文本块，或在非常末尾的文本块，或无效的工具使用，无论如何，presentAssistantMessage 依赖于这些块要么完成，要么用户拒绝一个块以继续并最终将 userMessageContentReady 设置为 true）
			const partialBlocks = this.assistantMessageContent.filter((block) => block.partial)
			partialBlocks.forEach((block) => {
				block.partial = false
			})
			// this.assistantMessageContent.forEach((e) => (e.partial = false)) // 不能这样做，因为工具可能正在执行中（）
			if (partialBlocks.length > 0) {
				this.presentAssistantMessage() // 如果有内容要更新，它将完成并将 userMessageContentReady 更新为 true，这样我们在发出下一个请求之前会等待。所有这些实际上都是在呈现我们刚刚设置为完成的最后一个部分消息
			}

			updateApiReqMsg()
			await this.saveClineMessages()
			await this.providerRef.deref()?.postStateToWebview()

			// 现在添加到 apiconversationhistory
			// 需要在继续工具使用之前保存助手响应到文件，因为用户可以随时退出，我们将无法保存助手的响应
			let didEndLoop = false
			if (assistantMessage.length > 0) {
				await this.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: assistantMessage }],
				})

				// 注意：此注释在此处供将来参考 - 这是 userMessageContent 未设置为 true 的解决方法。由于它未递归调用部分块时 didRejectTool，因此它会卡在等待部分块完成之前无法继续。
				// 如果内容块已完成
				// 可能是 api 流在最后一个解析的内容块执行后完成，因此我们能够检测到超出范围并将 userMessageContentReady 设置为 true（注意不应调用 presentAssistantMessage，因为如果最后一个块已完成，它将再次呈现）
				// const completeBlocks = this.assistantMessageContent.filter((block) => !block.partial) // 如果流结束后有任何部分块，我们可以认为它们无效
				// if (this.currentStreamingContentIndex >= completeBlocks.length) {
				// 	this.userMessageContentReady = true
				// }

				await pWaitFor(() => this.userMessageContentReady)

				// 如果模型没有使用工具，那么我们需要告诉它要么使用工具，要么尝试完成
				const didToolUse = this.assistantMessageContent.some((block) => block.type === "tool_use")
				if (!didToolUse) {
					this.userMessageContent.push({
						type: "text",
						text: formatResponse.noToolsUsed(),
					})
					this.consecutiveMistakeCount++
				}

				const recDidEndLoop = await this.recursivelyMakeClineRequests(this.userMessageContent)
				didEndLoop = recDidEndLoop
			} else {
				// 如果没有助手响应，这意味着我们没有从 API 获取任何文本或工具使用内容块，我们应该假设这是一个错误
				await this.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
				)
				await this.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}

			return didEndLoop // 目前总是 false
		} catch (error) {
			// 这永远不应该发生，因为唯一可能抛出错误的是 attemptApiRequest，它被 try catch 包装，发送一个请求，如果 noButtonClicked，将清除当前任务并销毁此实例。但是为了避免未处理的 promise 拒绝，我们将结束此循环，这将结束此实例的执行（请参阅 startTask）
			return true // 需要为 true 以便父循环知道结束任务
		}
	}

	async loadContext(userContent: UserContent, includeFileDetails: boolean = false) {
		return await Promise.all([
			// 处理 userContent 数组，其中包含各种块类型：
			// TextBlockParam、ImageBlockParam、ToolUseBlockParam 和 ToolResultBlockParam。
			// 我们需要将 parseMentions() 应用于：
			// 1. 所有 TextBlockParam 的文本（第一个用户消息带有任务）
			// 2. ToolResultBlockParam 的内容/上下文文本数组，如果它包含 "<feedback>"（请参阅 formatToolDeniedFeedback、attemptCompletion、executeCommand 和 consecutiveMistakeCount >= 3），我们将所有用户生成的内容放在这些标签中，以便它们可以有效地用作我们应该解析提及的标记）
			Promise.all(
				userContent.map(async (block) => {
					const shouldProcessMentions = (text: string) =>
						text.includes("<task>") || text.includes("<feedback>")

					if (block.type === "text") {
						if (shouldProcessMentions(block.text)) {
							return {
								...block,
								text: await parseMentions(block.text, cwd, this.urlContentFetcher),
							}
						}
						return block
					} else if (block.type === "tool_result") {
						if (typeof block.content === "string") {
							if (shouldProcessMentions(block.content)) {
								return {
									...block,
									content: await parseMentions(block.content, cwd, this.urlContentFetcher),
								}
							}
							return block
						} else if (Array.isArray(block.content)) {
							const parsedContent = await Promise.all(
								block.content.map(async (contentBlock) => {
									if (contentBlock.type === "text" && shouldProcessMentions(contentBlock.text)) {
										return {
											...contentBlock,
											text: await parseMentions(contentBlock.text, cwd, this.urlContentFetcher),
										}
									}
									return contentBlock
								}),
							)
							return {
								...block,
								content: parsedContent,
							}
						}
						return block
					}
					return block
				}),
			),
			this.getEnvironmentDetails(includeFileDetails),
		])
	}

	async getEnvironmentDetails(includeFileDetails: boolean = false) {
		let details = ""

		// 可能对 cline 有用的是知道用户在消息之间从一个文件或没有文件切换到另一个文件，因此我们始终包含此上下文
		details += "\n\n# VSCode Visible Files"
		const visibleFiles = vscode.window.visibleTextEditors
			?.map((editor) => editor.document?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath) => path.relative(cwd, absolutePath).toPosix())
			.join("\n")
		if (visibleFiles) {
			details += `\n${visibleFiles}`
		} else {
			details += "\n(No visible files)"
		}

		details += "\n\n# VSCode Open Tabs"
		const openTabs = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.map((tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath) => path.relative(cwd, absolutePath).toPosix())
			.join("\n")
		if (openTabs) {
			details += `\n${openTabs}`
		} else {
			details += "\n(No open tabs)"
		}

		const busyTerminals = this.terminalManager.getTerminals(true)
		const inactiveTerminals = this.terminalManager.getTerminals(false)
		// const allTerminals = [...busyTerminals, ...inactiveTerminals]

		if (busyTerminals.length > 0 && this.didEditFile) {
			//  || this.didEditFile
			await delay(300) // 保存文件后延迟以让终端赶上
		}

		// let terminalWasBusy = false
		if (busyTerminals.length > 0) {
			// 等待终端冷却
			// terminalWasBusy = allTerminals.some((t) => this.terminalManager.isProcessHot(t.id))
			await pWaitFor(() => busyTerminals.every((t) => !this.terminalManager.isProcessHot(t.id)), {
				interval: 100,
				timeout: 15_000,
			}).catch(() => {})
		}

		// 我们希望在终端冷却后获取诊断信息，有几个原因：终端可能正在构建项目，开发服务器（如 webpack 的编译器）将首先重新编译，然后发送诊断信息等
		/*
		let diagnosticsDetails = ""
		const diagnostics = await this.diagnosticsMonitor.getCurrentDiagnostics(this.didEditFile || terminalWasBusy) // 如果 cline 运行了命令（如 npm install）或编辑了工作区，则等待一段时间以获取更新的诊断信息
		for (const [uri, fileDiagnostics] of diagnostics) {
			const problems = fileDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
			if (problems.length > 0) {
				diagnosticsDetails += `\n## ${path.relative(cwd, uri.fsPath)}`
				for (const diagnostic of problems) {
					// let severity = diagnostic.severity === vscode.DiagnosticSeverity.Error ? "Error" : "Warning"
					const line = diagnostic.range.start.line + 1 // VSCode 行是从 0 开始的
					const source = diagnostic.source ? `[${diagnostic.source}] ` : ""
					diagnosticsDetails += `\n- ${source}Line ${line}: ${diagnostic.message}`
				}
			}
		}
		*/
		this.didEditFile = false // 重置，这让我们知道何时等待保存的文件更新终端

		// 等待更新的诊断信息让终端输出尽可能最新
		let terminalDetails = ""
		if (busyTerminals.length > 0) {
			// 终端已冷却，让我们检索其输出
			terminalDetails += "\n\n# Actively Running Terminals"
			for (const busyTerminal of busyTerminals) {
				terminalDetails += `\n## Original command: \`${busyTerminal.lastCommand}\``
				const newOutput = this.terminalManager.getUnretrievedOutput(busyTerminal.id)
				if (newOutput) {
					terminalDetails += `\n### New Output\n${newOutput}`
				} else {
					// details += `\n(Still running, no new output)` // 不想在运行命令后立即显示这个
				}
			}
		}
		// 仅在有输出要显示时显示非活动终端
		if (inactiveTerminals.length > 0) {
			const inactiveTerminalOutputs = new Map<number, string>()
			for (const inactiveTerminal of inactiveTerminals) {
				const newOutput = this.terminalManager.getUnretrievedOutput(inactiveTerminal.id)
				if (newOutput) {
					inactiveTerminalOutputs.set(inactiveTerminal.id, newOutput)
				}
			}
			if (inactiveTerminalOutputs.size > 0) {
				terminalDetails += "\n\n# Inactive Terminals"
				for (const [terminalId, newOutput] of inactiveTerminalOutputs) {
					const inactiveTerminal = inactiveTerminals.find((t) => t.id === terminalId)
					if (inactiveTerminal) {
						terminalDetails += `\n## ${inactiveTerminal.lastCommand}`
						terminalDetails += `\n### New Output\n${newOutput}`
					}
				}
			}
		}

		// details += "\n\n# VSCode Workspace Errors"
		// if (diagnosticsDetails) {
		// 	details += diagnosticsDetails
		// } else {
		// 	details += "\n(No errors detected)"
		// }

		if (terminalDetails) {
			details += terminalDetails
		}

		// 添加当前时间信息和时区
		const now = new Date()
		const formatter = new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			hour12: true,
		})
		const timeZone = formatter.resolvedOptions().timeZone
		const timeZoneOffset = -now.getTimezoneOffset() / 60 // 转换为小时并反转符号以匹配常规表示法
		const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}:00`
		details += `\n\n# Current Time\n${formatter.format(now)} (${timeZone}, UTC${timeZoneOffsetStr})`

		// 添加上下文令牌信息
		const { contextTokens } = getApiMetrics(this.clineMessages)
		const modelInfo = this.api.getModel().info
		const contextWindow = modelInfo.contextWindow
		const contextPercentage =
			contextTokens && contextWindow ? Math.round((contextTokens / contextWindow) * 100) : undefined
		details += `\n\n# Current Context Size (Tokens)\n${contextTokens ? `${contextTokens.toLocaleString()} (${contextPercentage}%)` : "(Not available)"}`

		// 添加当前模式和任何模式特定的警告
		const { mode, customModes } = (await this.providerRef.deref()?.getState()) ?? {}
		const currentMode = mode ?? defaultModeSlug
		details += `\n\n# Current Mode\n${currentMode}`

		// 如果不在代码模式下添加警告
		if (
			!isToolAllowedForMode("write_to_file", currentMode, customModes ?? [], {
				apply_diff: this.diffEnabled,
			}) &&
			!isToolAllowedForMode("apply_diff", currentMode, customModes ?? [], { apply_diff: this.diffEnabled })
		) {
			const currentModeName = getModeBySlug(currentMode, customModes)?.name ?? currentMode
			const defaultModeName = getModeBySlug(defaultModeSlug, customModes)?.name ?? defaultModeSlug
			details += `\n\nNOTE: You are currently in '${currentModeName}' mode which only allows read-only operations. To write files or execute commands, the user will need to switch to '${defaultModeName}' mode. Note that only the user can switch modes.`
		}

		if (includeFileDetails) {
			details += `\n\n# Current Working Directory (${cwd.toPosix()}) Files\n`
			const isDesktop = arePathsEqual(cwd, path.join(os.homedir(), "Desktop"))
			if (isDesktop) {
				// 不想立即访问桌面，因为这会显示权限弹出窗口
				details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
			} else {
				const [files, didHitLimit] = await listFiles(cwd, true, 200)
				const result = formatResponse.formatFilesList(cwd, files, didHitLimit)
				details += result
			}
		}

		return `<environment_details>\n${details.trim()}\n</environment_details>`
	}

	// 检查点

	private async getCheckpointService() {
		if (!this.checkpointService) {
			this.checkpointService = await CheckpointService.create({
				taskId: this.taskId,
				baseDir: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? "",
				log: (message) => this.providerRef.deref()?.log(message),
			})
		}

		return this.checkpointService
	}

	public async checkpointDiff({
		ts,
		commitHash,
		mode,
	}: {
		ts: number
		commitHash: string
		mode: "full" | "checkpoint"
	}) {
		if (!this.checkpointsEnabled) {
			return
		}

		let previousCommitHash = undefined

		if (mode === "checkpoint") {
			const previousCheckpoint = this.clineMessages
				.filter(({ say }) => say === "checkpoint_saved")
				.sort((a, b) => b.ts - a.ts)
				.find((message) => message.ts < ts)

			previousCommitHash = previousCheckpoint?.text
		}

		try {
			const service = await this.getCheckpointService()
			const changes = await service.getDiff({ from: previousCommitHash, to: commitHash })

			if (!changes?.length) {
				vscode.window.showInformationMessage("No changes found.")
				return
			}

			await vscode.commands.executeCommand(
				"vscode.changes",
				mode === "full" ? "Changes since task started" : "Changes since previous checkpoint",
				changes.map((change) => [
					vscode.Uri.file(change.paths.absolute),
					vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.paths.relative}`).with({
						query: Buffer.from(change.content.before ?? "").toString("base64"),
					}),
					vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.paths.relative}`).with({
						query: Buffer.from(change.content.after ?? "").toString("base64"),
					}),
				]),
			)
		} catch (err) {
			this.providerRef
				.deref()
				?.log(
					`[checkpointDiff] Encountered unexpected error: $${err instanceof Error ? err.message : String(err)}`,
				)

			this.checkpointsEnabled = false
		}
	}

	public async checkpointSave() {
		if (!this.checkpointsEnabled) {
			return
		}

		try {
			const service = await this.getCheckpointService()
			const commit = await service.saveCheckpoint(`Task: ${this.taskId}, Time: ${Date.now()}`)

			if (commit?.commit) {
				await this.providerRef
					.deref()
					?.postMessageToWebview({ type: "currentCheckpointUpdated", text: service.currentCheckpoint })

				await this.say("checkpoint_saved", commit.commit)
			}
		} catch (err) {
			this.providerRef
				.deref()
				?.log(
					`[checkpointSave] Encountered unexpected error: $${err instanceof Error ? err.message : String(err)}`,
				)

			this.checkpointsEnabled = false
		}
	}

	public async checkpointRestore({
		ts,
		commitHash,
		mode,
	}: {
		ts: number
		commitHash: string
		mode: "preview" | "restore"
	}) {
		if (!this.checkpointsEnabled) {
			return
		}

		const index = this.clineMessages.findIndex((m) => m.ts === ts)

		if (index === -1) {
			return
		}

		try {
			const service = await this.getCheckpointService()
			await service.restoreCheckpoint(commitHash)

			await this.providerRef
				.deref()
				?.postMessageToWebview({ type: "currentCheckpointUpdated", text: service.currentCheckpoint })

			if (mode === "restore") {
				await this.overwriteApiConversationHistory(
					this.apiConversationHistory.filter((m) => !m.ts || m.ts < ts),
				)

				const deletedMessages = this.clineMessages.slice(index + 1)

				const { totalTokensIn, totalTokensOut, totalCacheWrites, totalCacheReads, totalCost } = getApiMetrics(
					combineApiRequests(combineCommandSequences(deletedMessages)),
				)

				await this.overwriteClineMessages(this.clineMessages.slice(0, index + 1))

				// TODO: Verify that this is working as expected.
				await this.say(
					"api_req_deleted",
					JSON.stringify({
						tokensIn: totalTokensIn,
						tokensOut: totalTokensOut,
						cacheWrites: totalCacheWrites,
						cacheReads: totalCacheReads,
						cost: totalCost,
					} satisfies ClineApiReqInfo),
				)
			}

			// 任务已被提供者取消，但我们需要重新初始化以获取更新的消息。
			//
			// 这是从 Cline 的检查点功能实现中获取的。如果我们不取消两次，cline 实例将挂起，因此目前这是必要的，但这似乎是一个复杂且笨拙的解决方案，我并不完全理解这个问题。我希望在未来重新审视这个问题，并尝试改进任务流程和 Webview 与 Cline 实例之间的通信。
			this.providerRef.deref()?.cancelTask()
		} catch (err) {
			this.providerRef
				.deref()
				?.log(
					`[restoreCheckpoint] Encountered unexpected error: $${err instanceof Error ? err.message : String(err)}`,
				)

			this.checkpointsEnabled = false
		}
	}
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
