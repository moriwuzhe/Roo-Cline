// npx jest src/core/webview/__tests__/ClineProvider.test.ts

import * as vscode from "vscode"
import axios from "axios"

import { ClineProvider } from "../ClineProvider"
import { ExtensionMessage, ExtensionState } from "../../../shared/ExtensionMessage"
import { setSoundEnabled } from "../../../utils/sound"
import { defaultModeSlug } from "../../../shared/modes"
import { experimentDefault } from "../../../shared/experiments"

// 模拟 custom-instructions 模块
const mockAddCustomInstructions = jest.fn()

jest.mock("../../prompts/sections/custom-instructions", () => ({
	addCustomInstructions: mockAddCustomInstructions,
}))

// 模拟 delay 模块
jest.mock("delay", () => {
	const delayFn = (ms: number) => Promise.resolve()
	delayFn.createDelay = () => delayFn
	delayFn.reject = () => Promise.reject(new Error("Delay rejected"))
	delayFn.range = () => Promise.resolve()
	return delayFn
})

// 模拟 MCP 相关模块
jest.mock(
	"@modelcontextprotocol/sdk/types.js",
	() => ({
		CallToolResultSchema: {},
		ListResourcesResultSchema: {},
		ListResourceTemplatesResultSchema: {},
		ListToolsResultSchema: {},
		ReadResourceResultSchema: {},
		ErrorCode: {
			InvalidRequest: "InvalidRequest",
			MethodNotFound: "MethodNotFound",
			InternalError: "InternalError",
		},
		McpError: class McpError extends Error {
			code: string
			constructor(code: string, message: string) {
				super(message)
				this.code = code
				this.name = "McpError"
			}
		},
	}),
	{ virtual: true },
)

jest.mock(
	"@modelcontextprotocol/sdk/client/index.js",
	() => ({
		Client: jest.fn().mockImplementation(() => ({
			connect: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined),
			listTools: jest.fn().mockResolvedValue({ tools: [] }),
			callTool: jest.fn().mockResolvedValue({ content: [] }),
		})),
	}),
	{ virtual: true },
)

jest.mock(
	"@modelcontextprotocol/sdk/client/stdio.js",
	() => ({
		StdioClientTransport: jest.fn().mockImplementation(() => ({
			connect: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined),
		})),
	}),
	{ virtual: true },
)

// 模拟 DiffStrategy
jest.mock("../../diff/DiffStrategy", () => ({
	getDiffStrategy: jest.fn().mockImplementation(() => ({
		getToolDescription: jest.fn().mockReturnValue("apply_diff tool description"),
	})),
}))

// 模拟依赖项
jest.mock("vscode", () => ({
	ExtensionContext: jest.fn(),
	OutputChannel: jest.fn(),
	WebviewView: jest.fn(),
	Uri: {
		joinPath: jest.fn(),
		file: jest.fn(),
	},
	window: {
		showInformationMessage: jest.fn(),
		showErrorMessage: jest.fn(),
	},
	workspace: {
		getConfiguration: jest.fn().mockReturnValue({
			get: jest.fn().mockReturnValue([]),
			update: jest.fn(),
		}),
		onDidChangeConfiguration: jest.fn().mockImplementation((callback) => ({
			dispose: jest.fn(),
		})),
		onDidSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
		onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
		onDidOpenTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
		onDidCloseTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
	},
	env: {
		uriScheme: "vscode",
		language: "en",
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
}))

// 模拟 sound utility
jest.mock("../../../utils/sound", () => ({
	setSoundEnabled: jest.fn(),
}))

// 模拟 ESM 模块
jest.mock("p-wait-for", () => ({
	__esModule: true,
	default: jest.fn().mockResolvedValue(undefined),
}))

// 模拟 fs/promises
jest.mock("fs/promises", () => ({
	mkdir: jest.fn(),
	writeFile: jest.fn(),
	readFile: jest.fn(),
	unlink: jest.fn(),
	rmdir: jest.fn(),
}))

// 模拟 axios
jest.mock("axios", () => ({
	get: jest.fn().mockResolvedValue({ data: { data: [] } }),
	post: jest.fn(),
}))

// 模拟 buildApiHandler
jest.mock("../../../api", () => ({
	buildApiHandler: jest.fn(),
}))

// 模拟 system prompt
jest.mock("../../prompts/system", () => ({
	SYSTEM_PROMPT: jest.fn().mockImplementation(async () => "mocked system prompt"),
	codeMode: "code",
}))

// 模拟 WorkspaceTracker
jest.mock("../../../integrations/workspace/WorkspaceTracker", () => {
	return jest.fn().mockImplementation(() => ({
		initializeFilePaths: jest.fn(),
		dispose: jest.fn(),
	}))
})

// 模拟 Cline
jest.mock("../../Cline", () => ({
	Cline: jest
		.fn()
		.mockImplementation(
			(provider, apiConfiguration, customInstructions, diffEnabled, fuzzyMatchThreshold, task, taskId) => ({
				abortTask: jest.fn(),
				handleWebviewAskResponse: jest.fn(),
				clineMessages: [],
				apiConversationHistory: [],
				overwriteClineMessages: jest.fn(),
				overwriteApiConversationHistory: jest.fn(),
				taskId: taskId || "test-task-id",
			}),
		),
}))

// 模拟 extract-text
jest.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: jest.fn().mockImplementation(async (filePath: string) => {
		const content = "const x = 1;\nconst y = 2;\nconst z = 3;"
		const lines = content.split("\n")
		return lines.map((line, index) => `${index + 1} | ${line}`).join("\n")
	}),
}))

// 监视 console.error 和 console.log 以抑制预期的消息
beforeAll(() => {
	jest.spyOn(console, "error").mockImplementation(() => {})
	jest.spyOn(console, "log").mockImplementation(() => {})
})

afterAll(() => {
	jest.restoreAllMocks()
})

describe("ClineProvider", () => {
	let provider: ClineProvider
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockWebviewView: vscode.WebviewView
	let mockPostMessage: jest.Mock

	beforeEach(() => {
		// 重置模拟
		jest.clearAllMocks()

		// 模拟上下文
		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalState: {
				get: jest.fn().mockImplementation((key: string) => {
					switch (key) {
						case "mode":
							return "architect"
						case "currentApiConfigName":
							return "new-config"
						default:
							return undefined
					}
				}),
				update: jest.fn(),
				keys: jest.fn().mockReturnValue([]),
			},
			secrets: {
				get: jest.fn(),
				store: jest.fn(),
				delete: jest.fn(),
			},
			subscriptions: [],
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalStorageUri: {
				fsPath: "/test/storage/path",
			},
		} as unknown as vscode.ExtensionContext

		// 模拟 CustomModesManager
		const mockCustomModesManager = {
			updateCustomMode: jest.fn().mockResolvedValue(undefined),
			getCustomModes: jest.fn().mockResolvedValue({}),
			dispose: jest.fn(),
		}

		// 模拟输出通道
		mockOutputChannel = {
			appendLine: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
		} as unknown as vscode.OutputChannel

		// 模拟 webview
		mockPostMessage = jest.fn()
		mockWebviewView = {
			webview: {
				postMessage: mockPostMessage,
				html: "",
				options: {},
				onDidReceiveMessage: jest.fn(),
				asWebviewUri: jest.fn(),
			},
			visible: true,
			onDidDispose: jest.fn().mockImplementation((callback) => {
				callback()
				return { dispose: jest.fn() }
			}),
			onDidChangeVisibility: jest.fn().mockImplementation((callback) => {
				return { dispose: jest.fn() }
			}),
		} as unknown as vscode.WebviewView

		provider = new ClineProvider(mockContext, mockOutputChannel)

		// @ts-ignore - 访问私有属性进行测试。
		provider.customModesManager = mockCustomModesManager
	})

	test("构造函数正确初始化", () => {
		expect(provider).toBeInstanceOf(ClineProvider)
		// 由于 getVisibleInstance 返回 view.visible 为 true 的最后一个实例
		// @ts-ignore - 访问私有属性进行测试
		provider.view = mockWebviewView
		expect(ClineProvider.getVisibleInstance()).toBe(provider)
	})

	test("resolveWebviewView 正确设置 webview", async () => {
		await provider.resolveWebviewView(mockWebviewView)

		expect(mockWebviewView.webview.options).toEqual({
			enableScripts: true,
			localResourceRoots: [mockContext.extensionUri],
		})

		expect(mockWebviewView.webview.html).toContain("<!DOCTYPE html>")
	})

	test("resolveWebviewView 在开发模式下即使本地服务器未运行也能正确设置 webview", async () => {
		provider = new ClineProvider(
			{ ...mockContext, extensionMode: vscode.ExtensionMode.Development },
			mockOutputChannel,
		)
		;(axios.get as jest.Mock).mockRejectedValueOnce(new Error("Network error"))

		await provider.resolveWebviewView(mockWebviewView)

		expect(mockWebviewView.webview.options).toEqual({
			enableScripts: true,
			localResourceRoots: [mockContext.extensionUri],
		})

		expect(mockWebviewView.webview.html).toContain("<!DOCTYPE html>")
	})

	test("postMessageToWebview 发送消息到 webview", async () => {
		await provider.resolveWebviewView(mockWebviewView)

		const mockState: ExtensionState = {
			version: "1.0.0",
			preferredLanguage: "English",
			clineMessages: [],
			taskHistory: [],
			shouldShowAnnouncement: false,
			apiConfiguration: {
				apiProvider: "openrouter",
			},
			customInstructions: undefined,
			alwaysAllowReadOnly: false,
			alwaysAllowWrite: false,
			alwaysAllowExecute: false,
			alwaysAllowBrowser: false,
			alwaysAllowMcp: false,
			uriScheme: "vscode",
			soundEnabled: false,
			diffEnabled: false,
			checkpointsEnabled: false,
			writeDelayMs: 1000,
			browserViewportSize: "900x600",
			fuzzyMatchThreshold: 1.0,
			mcpEnabled: true,
			enableMcpServerCreation: false,
			requestDelaySeconds: 5,
			rateLimitSeconds: 0,
			mode: defaultModeSlug,
			customModes: [],
			experiments: experimentDefault,
		}

		const message: ExtensionMessage = {
			type: "state",
			state: mockState,
		}
		await provider.postMessageToWebview(message)

		expect(mockPostMessage).toHaveBeenCalledWith(message)
	})

	test("处理 webviewDidLaunch 消息", async () => {
		await provider.resolveWebviewView(mockWebviewView)

		// 从 onDidReceiveMessage 获取消息处理程序
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		// 模拟 webviewDidLaunch 消息
		await messageHandler({ type: "webviewDidLaunch" })

		// 应该将状态和主题发送到 webview
		expect(mockPostMessage).toHaveBeenCalled()
	})

	test("clearTask 中止当前任务", async () => {
		const mockAbortTask = jest.fn()
		// @ts-ignore - 访问私有属性进行测试
		provider.cline = { abortTask: mockAbortTask }

		await provider.clearTask()

		expect(mockAbortTask).toHaveBeenCalled()
		// @ts-ignore - 访问私有属性进行测试
		expect(provider.cline).toBeUndefined()
	})

	test("getState 返回正确的初始状态", async () => {
		const state = await provider.getState()

		expect(state).toHaveProperty("apiConfiguration")
		expect(state.apiConfiguration).toHaveProperty("apiProvider")
		expect(state).toHaveProperty("customInstructions")
		expect(state).toHaveProperty("alwaysAllowReadOnly")
		expect(state).toHaveProperty("alwaysAllowWrite")
		expect(state).toHaveProperty("alwaysAllowExecute")
		expect(state).toHaveProperty("alwaysAllowBrowser")
		expect(state).toHaveProperty("taskHistory")
		expect(state).toHaveProperty("soundEnabled")
		expect(state).toHaveProperty("diffEnabled")
		expect(state).toHaveProperty("writeDelayMs")
	})

	test("preferredLanguage 在未设置时默认为 VSCode 语言", async () => {
		// 模拟 VSCode 语言为西班牙语
		;(vscode.env as any).language = "es-ES"

		const state = await provider.getState()
		expect(state.preferredLanguage).toBe("Spanish")
	})

	test("preferredLanguage 对于不支持的 VSCode 语言默认为英语", async () => {
		// 模拟 VSCode 语言为不支持的语言
		;(vscode.env as any).language = "unsupported-LANG"

		const state = await provider.getState()
		expect(state.preferredLanguage).toBe("English")
	})

	test("diffEnabled 在未设置时默认为 true", async () => {
		// 模拟 globalState.get 返回 undefined 用于 diffEnabled
		;(mockContext.globalState.get as jest.Mock).mockReturnValue(undefined)

		const state = await provider.getState()

		expect(state.diffEnabled).toBe(true)
	})

	test("writeDelayMs 默认为 1000ms", async () => {
		// 模拟 globalState.get 返回 undefined 用于 writeDelayMs
		;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
			if (key === "writeDelayMs") {
				return undefined
			}
			return null
		})

		const state = await provider.getState()
		expect(state.writeDelayMs).toBe(1000)
	})

	test("处理 writeDelayMs 消息", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		await messageHandler({ type: "writeDelayMs", value: 2000 })

		expect(mockContext.globalState.update).toHaveBeenCalledWith("writeDelayMs", 2000)
		expect(mockPostMessage).toHaveBeenCalled()
	})

	test("更新 sound utility 当 sound 设置更改时", async () => {
		await provider.resolveWebviewView(mockWebviewView)

		// 从 onDidReceiveMessage 获取消息处理程序
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		// 模拟设置 sound 为启用
		await messageHandler({ type: "soundEnabled", bool: true })
		expect(setSoundEnabled).toHaveBeenCalledWith(true)
		expect(mockContext.globalState.update).toHaveBeenCalledWith("soundEnabled", true)
		expect(mockPostMessage).toHaveBeenCalled()

		// 模拟设置 sound 为禁用
		await messageHandler({ type: "soundEnabled", bool: false })
		expect(setSoundEnabled).toHaveBeenCalledWith(false)
		expect(mockContext.globalState.update).toHaveBeenCalledWith("soundEnabled", false)
		expect(mockPostMessage).toHaveBeenCalled()
	})

	test("requestDelaySeconds 默认为 5 秒", async () => {
		// 模拟 globalState.get 返回 undefined 用于 requestDelaySeconds
		;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
			if (key === "requestDelaySeconds") {
				return undefined
			}
			return null
		})

		const state = await provider.getState()
		expect(state.requestDelaySeconds).toBe(10)
	})

	test("alwaysApproveResubmit 默认为 false", async () => {
		// 模拟 globalState.get 返回 undefined 用于 alwaysApproveResubmit
		;(mockContext.globalState.get as jest.Mock).mockReturnValue(undefined)

		const state = await provider.getState()
		expect(state.alwaysApproveResubmit).toBe(false)
	})

	test("切换模式时加载保存的 API 配置", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		// 模拟 ConfigManager 方法
		provider.configManager = {
			getModeConfigId: jest.fn().mockResolvedValue("test-id"),
			listConfig: jest.fn().mockResolvedValue([{ name: "test-config", id: "test-id", apiProvider: "anthropic" }]),
			loadConfig: jest.fn().mockResolvedValue({ apiProvider: "anthropic" }),
			setModeConfig: jest.fn(),
		} as any

		// 首先设置模式
		await messageHandler({ type: "mode", text: "architect" })

		// 然后加载配置
		await messageHandler({ type: "loadApiConfiguration", text: "new-config" })

		// 应该将新配置保存为 architect 模式的默认配置
		expect(provider.configManager.setModeConfig).toHaveBeenCalledWith("architect", "new-id")
	})

	test("处理请求延迟设置消息", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		// 测试 alwaysApproveResubmit
		await messageHandler({ type: "alwaysApproveResubmit", bool: true })
		expect(mockContext.globalState.update).toHaveBeenCalledWith("alwaysApproveResubmit", true)
		expect(mockPostMessage).toHaveBeenCalled()

		// 测试 requestDelaySeconds
		await messageHandler({ type: "requestDelaySeconds", value: 10 })
		expect(mockContext.globalState.update).toHaveBeenCalledWith("requestDelaySeconds", 10)
		expect(mockPostMessage).toHaveBeenCalled()
	})

	test("处理 updatePrompt 消息正确", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		// 模拟现有提示
		const existingPrompts = {
			code: "existing code prompt",
			architect: "existing architect prompt",
		}
		;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
			if (key === "customModePrompts") {
				return existingPrompts
			}
			return undefined
		})

		// 测试更新提示
		await messageHandler({
			type: "updatePrompt",
			promptMode: "code",
			customPrompt: "new code prompt",
		})

		// 验证状态是否正确更新
		expect(mockContext.globalState.update).toHaveBeenCalledWith("customModePrompts", {
			...existingPrompts,
			code: "new code prompt",
		})

		// 验证状态是否发送到 webview
		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "state",
				state: expect.objectContaining({
					customModePrompts: {
						...existingPrompts,
						code: "new code prompt",
					},
				}),
			}),
		)
	})

	test("customModePrompts 默认为空对象", async () => {
		// 模拟 globalState.get 返回 undefined 用于 customModePrompts
		;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
			if (key === "customModePrompts") {
				return undefined
			}
			return null
		})

		const state = await provider.getState()
		expect(state.customModePrompts).toEqual({})
	})

	test("在 Cline 初始化中使用模式特定的自定义指令", async () => {
		// 设置模拟状态
		const modeCustomInstructions = "Code mode instructions"
		const mockApiConfig = {
			apiProvider: "openrouter",
			openRouterModelInfo: { supportsComputerUse: true },
		}

		jest.spyOn(provider, "getState").mockResolvedValue({
			apiConfiguration: mockApiConfig,
			customModePrompts: {
				code: { customInstructions: modeCustomInstructions },
			},
			mode: "code",
			diffEnabled: true,
			checkpointsEnabled: false,
			fuzzyMatchThreshold: 1.0,
			experiments: experimentDefault,
		} as any)

		// 重置 Cline 模拟
		const { Cline } = require("../../Cline")
		;(Cline as jest.Mock).mockClear()

		// 使用任务初始化 Cline
		await provider.initClineWithTask("Test task")

		// 验证 Cline 是否使用模式特定的指令初始化
		expect(Cline).toHaveBeenCalledWith(
			provider,
			mockApiConfig,
			modeCustomInstructions,
			true,
			false,
			1.0,
			"Test task",
			undefined,
			undefined,
			experimentDefault,
		)
	})
	test("处理模式特定的自定义指令更新", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		// 模拟现有提示
		const existingPrompts = {
			code: {
				roleDefinition: "Code role",
				customInstructions: "Old instructions",
			},
		}
		mockContext.globalState.get = jest.fn((key: string) => {
			if (key === "customModePrompts") {
				return existingPrompts
			}
			return undefined
		})

		// 更新 code 模式的自定义指令
		await messageHandler({
			type: "updatePrompt",
			promptMode: "code",
			customPrompt: {
				roleDefinition: "Code role",
				customInstructions: "New instructions",
			},
		})

		// 验证状态是否正确更新
		expect(mockContext.globalState.update).toHaveBeenCalledWith("customModePrompts", {
			code: {
				roleDefinition: "Code role",
				customInstructions: "New instructions",
			},
		})
	})

	test("在更新 API 配置时保存模式配置", async () => {
		// 使用模式和配置名称设置模拟上下文
		mockContext = {
			...mockContext,
			globalState: {
				...mockContext.globalState,
				get: jest.fn((key: string) => {
					if (key === "mode") {
						return "code"
					} else if (key === "currentApiConfigName") {
						return "test-config"
					}
					return undefined
				}),
				update: jest.fn(),
				keys: jest.fn().mockReturnValue([]),
			},
		} as unknown as vscode.ExtensionContext

		// 使用更新的模拟上下文创建新提供程序
		provider = new ClineProvider(mockContext, mockOutputChannel)
		await provider.resolveWebviewView(mockWebviewView)
		const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

		provider.configManager = {
			listConfig: jest.fn().mockResolvedValue([{ name: "test-config", id: "test-id", apiProvider: "anthropic" }]),
			setModeConfig: jest.fn(),
		} as any

		// 更新 API 配置
		await messageHandler({
			type: "apiConfiguration",
			apiConfiguration: { apiProvider: "anthropic" },
		})

		// 应该将配置保存为当前模式的默认配置
		expect(provider.configManager.setModeConfig).toHaveBeenCalledWith("code", "test-id")
	})

	test("文件内容包含行号", async () => {
		const { extractTextFromFile } = require("../../../integrations/misc/extract-text")
		const result = await extractTextFromFile("test.js")
		expect(result).toBe("1 | const x = 1;\n2 | const y = 2;\n3 | const z = 3;")
	})

	describe("deleteMessage", () => {
		beforeEach(async () => {
			// 模拟 window.showInformationMessage
			;(vscode.window.showInformationMessage as jest.Mock) = jest.fn()
			await provider.resolveWebviewView(mockWebviewView)
		})

		test('正确处理 "Just this message" 删除', async () => {
			// 模拟用户选择 "Just this message"
			;(vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Just this message")

			// 设置模拟消息
			const mockMessages = [
				{ ts: 1000, type: "say", say: "user_feedback" }, // 用户消息 1
				{ ts: 2000, type: "say", say: "tool" }, // 工具消息
				{ ts: 3000, type: "say", say: "text", value: 4000 }, // 要删除的消息
				{ ts: 4000, type: "say", say: "browser_action" }, // 要删除的响应
				{ ts: 5000, type: "say", say: "user_feedback" }, // 下一个用户消息
				{ ts: 6000, type: "say", say: "user_feedback" }, // 最后一个消息
			]

			const mockApiHistory = [{ ts: 1000 }, { ts: 2000 }, { ts: 3000 }, { ts: 4000 }, { ts: 5000 }, { ts: 6000 }]

			// 使用模拟数据设置 Cline 实例
			const mockCline = {
				clineMessages: mockMessages,
				apiConversationHistory: mockApiHistory,
				overwriteClineMessages: jest.fn(),
				overwriteApiConversationHistory: jest.fn(),
				taskId: "test-task-id",
				abortTask: jest.fn(),
				handleWebviewAskResponse: jest.fn(),
			}
			// @ts-ignore - 访问私有属性进行测试
			provider.cline = mockCline

			// 模拟 getTaskWithId
			;(provider as any).getTaskWithId = jest.fn().mockResolvedValue({
				historyItem: { id: "test-task-id" },
			})

			// 触发消息删除
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]
			await messageHandler({ type: "deleteMessage", value: 4000 })

			// 验证保留了正确的消息
			expect(mockCline.overwriteClineMessages).toHaveBeenCalledWith([
				mockMessages[0],
				mockMessages[1],
				mockMessages[4],
				mockMessages[5],
			])

			// 验证保留了正确的 API 消息
			expect(mockCline.overwriteApiConversationHistory).toHaveBeenCalledWith([
				mockApiHistory[0],
				mockApiHistory[1],
				mockApiHistory[4],
				mockApiHistory[5],
			])
		})

		test('正确处理 "This and all subsequent messages" 删除', async () => {
			// 模拟用户选择 "This and all subsequent messages"
			;(vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("This and all subsequent messages")

			// 设置模拟消息
			const mockMessages = [
				{ ts: 1000, type: "say", say: "user_feedback" },
				{ ts: 2000, type: "say", say: "text", value: 3000 }, // 要删除的消息
				{ ts: 3000, type: "say", say: "user_feedback" },
				{ ts: 4000, type: "say", say: "user_feedback" },
			]

			const mockApiHistory = [{ ts: 1000 }, { ts: 2000 }, { ts: 3000 }, { ts: 4000 }]

			// 使用模拟数据设置 Cline 实例
			const mockCline = {
				clineMessages: mockMessages,
				apiConversationHistory: mockApiHistory,
				overwriteClineMessages: jest.fn(),
				overwriteApiConversationHistory: jest.fn(),
				taskId: "test-task-id",
				abortTask: jest.fn(),
				handleWebviewAskResponse: jest.fn(),
			}
			// @ts-ignore - 访问私有属性进行测试
			provider.cline = mockCline

			// 模拟 getTaskWithId
			;(provider as any).getTaskWithId = jest.fn().mockResolvedValue({
				historyItem: { id: "test-task-id" },
			})

			// 触发消息删除
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]
			await messageHandler({ type: "deleteMessage", value: 3000 })

			// 验证仅保留了删除消息之前的消息
			expect(mockCline.overwriteClineMessages).toHaveBeenCalledWith([mockMessages[0]])

			// 验证仅保留了删除消息之前的 API 消息
			expect(mockCline.overwriteApiConversationHistory).toHaveBeenCalledWith([mockApiHistory[0]])
		})

		test("正确处理取消", async () => {
			// 模拟用户选择 "Cancel"
			;(vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Cancel")

			const mockCline = {
				clineMessages: [{ ts: 1000 }, { ts: 2000 }],
				apiConversationHistory: [{ ts: 1000 }, { ts: 2000 }],
				overwriteClineMessages: jest.fn(),
				overwriteApiConversationHistory: jest.fn(),
				taskId: "test-task-id",
			}
			// @ts-ignore - 访问私有属性进行测试
			provider.cline = mockCline

			// 触发消息删除
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]
			await messageHandler({ type: "deleteMessage", value: 2000 })

			// 验证没有删除任何消息
			expect(mockCline.overwriteClineMessages).not.toHaveBeenCalled()
			expect(mockCline.overwriteApiConversationHistory).not.toHaveBeenCalled()
		})
	})

	describe("getSystemPrompt", () => {
		beforeEach(async () => {
			mockPostMessage.mockClear()
			await provider.resolveWebviewView(mockWebviewView)
			// 重置并设置模拟
			mockAddCustomInstructions.mockClear()
			mockAddCustomInstructions.mockImplementation(
				(modeInstructions: string, globalInstructions: string, cwd: string) => {
					return Promise.resolve(modeInstructions || globalInstructions || "")
				},
			)
		})

		const getMessageHandler = () => {
			const mockCalls = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls
			expect(mockCalls.length).toBeGreaterThan(0)
			return mockCalls[0][0]
		}

		test("正确处理 mcpEnabled 设置", async () => {
			// 模拟 getState 返回 mcpEnabled: true
			jest.spyOn(provider, "getState").mockResolvedValue({
				apiConfiguration: {
					apiProvider: "openrouter" as const,
					openRouterModelInfo: {
						supportsComputerUse: true,
						supportsPromptCache: false,
						maxTokens: 4096,
						contextWindow: 8192,
						supportsImages: false,
						inputPrice: 0.0,
						outputPrice: 0.0,
						description: undefined,
					},
				},
				mcpEnabled: true,
				enableMcpServerCreation: false,
				mode: "code" as const,
				experiments: experimentDefault,
			} as any)

			const handler1 = getMessageHandler()
			expect(typeof handler1).toBe("function")
			await handler1({ type: "getSystemPrompt", mode: "code" })

			// 验证 mcpHub 在 mcpEnabled 为 true 时传递
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "systemPrompt",
					text: expect.any(String),
				}),
			)

			// 模拟 getState 返回 mcpEnabled: false
			jest.spyOn(provider, "getState").mockResolvedValue({
				apiConfiguration: {
					apiProvider: "openrouter" as const,
					openRouterModelInfo: {
						supportsComputerUse: true,
						supportsPromptCache: false,
						maxTokens: 4096,
						contextWindow: 8192,
						supportsImages: false,
						inputPrice: 0.0,
						outputPrice: 0.0,
						description: undefined,
					},
				},
				mcpEnabled: false,
				enableMcpServerCreation: false,
				mode: "code" as const,
				experiments: experimentDefault,
			} as any)

			const handler2 = getMessageHandler()
			await handler2({ type: "getSystemPrompt", mode: "code" })

			// 验证 mcpHub 在 mcpEnabled 为 false 时未传递
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "systemPrompt",
					text: expect.any(String),
				}),
			)
		})

		test("优雅地处理错误", async () => {
			// 模拟 SYSTEM_PROMPT 抛出错误
			const systemPrompt = require("../../prompts/system")
			jest.spyOn(systemPrompt, "SYSTEM_PROMPT").mockRejectedValueOnce(new Error("Test error"))

			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]
			await messageHandler({ type: "getSystemPrompt", mode: "code" })

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Failed to get system prompt")
		})

		test("使用代码模式自定义指令", async () => {
			// 获取模拟函数
			const mockAddCustomInstructions = (jest.requireMock("../../prompts/sections/custom-instructions") as any)
				.addCustomInstructions

			// 清除之前的调用
			mockAddCustomInstructions.mockClear()

			// 模拟 SYSTEM_PROMPT
			const systemPromptModule = require("../../prompts/system")
			jest.spyOn(systemPromptModule, "SYSTEM_PROMPT").mockImplementation(async () => {
				await mockAddCustomInstructions("Code mode specific instructions", "", "/mock/path")
				return "mocked system prompt"
			})

			// 触发 getSystemPrompt
			const promptHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]
			await promptHandler({ type: "getSystemPrompt" })

			// 验证模拟是否使用代码模式指令调用
			expect(mockAddCustomInstructions).toHaveBeenCalledWith(
				"Code mode specific instructions",
				"",
				expect.any(String),
			)
		})

		test("在预览时将 diffStrategy 和 diffEnabled 传递给 SYSTEM_PROMPT", async () => {
			// 模拟 getState 返回 experimentalDiffStrategy、diffEnabled 和 fuzzyMatchThreshold
			jest.spyOn(provider, "getState").mockResolvedValue({
				apiConfiguration: {
					apiProvider: "openrouter",
					apiModelId: "test-model",
					openRouterModelInfo: { supportsComputerUse: true },
				},
				customModePrompts: {},
				mode: "code",
				enableMcpServerCreation: true,
				mcpEnabled: false,
				browserViewportSize: "900x600",
				experimentalDiffStrategy: true,
				diffEnabled: true,
				fuzzyMatchThreshold: 0.8,
				experiments: experimentDefault,
			} as any)

			// 模拟 SYSTEM_PROMPT 以验证传递了 diffStrategy 和 diffEnabled
			const systemPromptModule = require("../../prompts/system")
			const systemPromptSpy = jest.spyOn(systemPromptModule, "SYSTEM_PROMPT")

			// 触发 getSystemPrompt
			const handler = getMessageHandler()
			await handler({ type: "getSystemPrompt", mode: "code" })

			// 验证 SYSTEM_PROMPT 是否使用正确的参数调用
			expect(systemPromptSpy).toHaveBeenCalledWith(
				expect.anything(), // context
				expect.any(String), // cwd
				true, // supportsComputerUse
				undefined, // mcpHub (disabled)
				expect.objectContaining({
					// diffStrategy
					getToolDescription: expect.any(Function),
				}),
				"900x600", // browserViewportSize
				"code", // mode
				{}, // customModePrompts
				{}, // customModes
				undefined, // effectiveInstructions
				undefined, // preferredLanguage
				true, // diffEnabled
				experimentDefault,
				true,
			)

			// 再次运行测试以验证其一致性
			await handler({ type: "getSystemPrompt", mode: "code" })
			expect(systemPromptSpy).toHaveBeenCalledTimes(2)
		})

		test("在禁用 diff 时将 diffEnabled: false 传递给 SYSTEM_PROMPT", async () => {
			// 模拟 getState 返回 diffEnabled: false
			jest.spyOn(provider, "getState").mockResolvedValue({
				apiConfiguration: {
					apiProvider: "openrouter",
					apiModelId: "test-model",
					openRouterModelInfo: { supportsComputerUse: true },
				},
				customModePrompts: {},
				mode: "code",
				mcpEnabled: false,
				browserViewportSize: "900x600",
				experimentalDiffStrategy: true,
				diffEnabled: false,
				fuzzyMatchThreshold: 0.8,
				experiments: experimentDefault,
				enableMcpServerCreation: true,
			} as any)

			// 模拟 SYSTEM_PROMPT 以验证传递了 diffEnabled: false
			const systemPromptModule = require("../../prompts/system")
			const systemPromptSpy = jest.spyOn(systemPromptModule, "SYSTEM_PROMPT")

			// 触发 getSystemPrompt
			const handler = getMessageHandler()
			await handler({ type: "getSystemPrompt", mode: "code" })

			// 验证 SYSTEM_PROMPT 是否使用 diffEnabled: false 调用
			expect(systemPromptSpy).toHaveBeenCalledWith(
				expect.anything(), // context
				expect.any(String), // cwd
				true, // supportsComputerUse
				undefined, // mcpHub (disabled)
				expect.objectContaining({
					// diffStrategy
					getToolDescription: expect.any(Function),
				}),
				"900x600", // browserViewportSize
				"code", // mode
				{}, // customModePrompts
				{}, // customModes
				undefined, // effectiveInstructions
				undefined, // preferredLanguage
				false, // diffEnabled
				experimentDefault,
				true,
			)
		})

		test("在指定模式时使用正确的模式特定指令", async () => {
			// 模拟 getState 返回 architect 模式指令
			jest.spyOn(provider, "getState").mockResolvedValue({
				apiConfiguration: {
					apiProvider: "openrouter",
					openRouterModelInfo: { supportsComputerUse: true },
				},
				customModePrompts: {
					architect: { customInstructions: "Architect mode instructions" },
				},
				mode: "architect",
				enableMcpServerCreation: false,
				mcpEnabled: false,
				browserViewportSize: "900x600",
				experiments: experimentDefault,
			} as any)

			// 模拟 SYSTEM_PROMPT 调用 addCustomInstructions
			const systemPromptModule = require("../../prompts/system")
			jest.spyOn(systemPromptModule, "SYSTEM_PROMPT").mockImplementation(async () => {
				await mockAddCustomInstructions("Architect mode instructions", "", "/mock/path")
				return "mocked system prompt"
			})

			// 解析 webview 并触发 getSystemPrompt
			await provider.resolveWebviewView(mockWebviewView)
			const architectHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]
			await architectHandler({ type: "getSystemPrompt" })

			// 验证是否使用了 architect 模式指令
			expect(mockAddCustomInstructions).toHaveBeenCalledWith(
				"Architect mode instructions",
				"",
				expect.any(String),
			)
		})
	})

	describe("handleModeSwitch", () => {
		beforeEach(async () => {
			// 为每个测试设置 webview
			await provider.resolveWebviewView(mockWebviewView)
		})

		test("切换模式时加载保存的 API 配置", async () => {
			// 模拟 ConfigManager 方法
			provider.configManager = {
				getModeConfigId: jest.fn().mockResolvedValue("saved-config-id"),
				listConfig: jest
					.fn()
					.mockResolvedValue([{ name: "saved-config", id: "saved-config-id", apiProvider: "anthropic" }]),
				loadConfig: jest.fn().mockResolvedValue({ apiProvider: "anthropic" }),
				setModeConfig: jest.fn(),
			} as any

			// 切换到 architect 模式
			await provider.handleModeSwitch("architect")

			// 验证模式是否更新
			expect(mockContext.globalState.update).toHaveBeenCalledWith("mode", "architect")

			// 验证是否加载了保存的配置
			expect(provider.configManager.getModeConfigId).toHaveBeenCalledWith("architect")
			expect(provider.configManager.loadConfig).toHaveBeenCalledWith("saved-config")
			expect(mockContext.globalState.update).toHaveBeenCalledWith("currentApiConfigName", "saved-config")

			// 验证状态是否发送到 webview
			expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "state" }))
		})

		test("切换到没有配置的模式时保存当前配置", async () => {
			// 模拟 ConfigManager 方法
			provider.configManager = {
				getModeConfigId: jest.fn().mockResolvedValue(undefined),
				listConfig: jest
					.fn()
					.mockResolvedValue([{ name: "current-config", id: "current-id", apiProvider: "anthropic" }]),
				setModeConfig: jest.fn(),
			} as any

			// 模拟当前配置名称
			mockContext.globalState.get = jest.fn((key: string) => {
				if (key === "currentApiConfigName") return "current-config"
				return undefined
			})

			// 切换到 architect 模式
			await provider.handleModeSwitch("architect")

			// 验证模式是否更新
			expect(mockContext.globalState.update).toHaveBeenCalledWith("mode", "architect")

			// 验证是否将当前配置保存为新模式的默认配置
			expect(provider.configManager.setModeConfig).toHaveBeenCalledWith("architect", "current-id")

			// 验证状态是否发送到 webview
			expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "state" }))
		})
	})

	describe("updateCustomMode", () => {
		test("更新自定义模式时同时更新文件和状态", async () => {
			await provider.resolveWebviewView(mockWebviewView)
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

			// 模拟 CustomModesManager 方法
			provider.customModesManager = {
				updateCustomMode: jest.fn().mockResolvedValue(undefined),
				getCustomModes: jest.fn().mockResolvedValue({
					"test-mode": {
						slug: "test-mode",
						name: "Test Mode",
						roleDefinition: "Updated role definition",
						groups: ["read"] as const,
					},
				}),
				dispose: jest.fn(),
			} as any

			// 测试更新自定义模式
			await messageHandler({
				type: "updateCustomMode",
				modeConfig: {
					slug: "test-mode",
					name: "Test Mode",
					roleDefinition: "Updated role definition",
					groups: ["read"] as const,
				},
			})

			// 验证 CustomModesManager.updateCustomMode 是否被调用
			expect(provider.customModesManager.updateCustomMode).toHaveBeenCalledWith(
				"test-mode",
				expect.objectContaining({
					slug: "test-mode",
					roleDefinition: "Updated role definition",
				}),
			)

			// 验证状态是否更新
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"customModes",
				expect.objectContaining({
					"test-mode": expect.objectContaining({
						slug: "test-mode",
						roleDefinition: "Updated role definition",
					}),
				}),
			)

			// 验证状态是否发送到 webview
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "state",
					state: expect.objectContaining({
						customModes: expect.objectContaining({
							"test-mode": expect.objectContaining({
								slug: "test-mode",
								roleDefinition: "Updated role definition",
							}),
						}),
					}),
				}),
			)
		})
	})

	describe("upsertApiConfiguration", () => {
		test("优雅地处理 upsertApiConfiguration 中的错误", async () => {
			provider.resolveWebviewView(mockWebviewView)
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

			// 模拟 ConfigManager 方法以模拟错误
			provider.configManager = {
				setModeConfig: jest.fn().mockRejectedValue(new Error("Failed to update mode config")),
				listConfig: jest
					.fn()
					.mockResolvedValue([{ name: "test-config", id: "test-id", apiProvider: "anthropic" }]),
			} as any

			// 模拟 getState 以提供必要的数据
			jest.spyOn(provider, "getState").mockResolvedValue({
				mode: "code",
				currentApiConfigName: "test-config",
			} as any)

			// 触发 updateApiConfiguration
			await messageHandler({
				type: "upsertApiConfiguration",
				text: "test-config",
				apiConfiguration: {
					apiProvider: "anthropic",
					apiKey: "test-key",
				},
			})

			// 验证是否记录了错误并通知了用户
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("Error create new api configuration"),
			)
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Failed to create api configuration")
		})

		test("处理成功的 upsertApiConfiguration", async () => {
			provider.resolveWebviewView(mockWebviewView)
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

			// 模拟 ConfigManager 方法
			provider.configManager = {
				saveConfig: jest.fn().mockResolvedValue(undefined),
				listConfig: jest
					.fn()
					.mockResolvedValue([{ name: "test-config", id: "test-id", apiProvider: "anthropic" }]),
			} as any

			const testApiConfig = {
				apiProvider: "anthropic" as const,
				apiKey: "test-key",
			}

			// 触发 upsertApiConfiguration
			await messageHandler({
				type: "upsertApiConfiguration",
				text: "test-config",
				apiConfiguration: testApiConfig,
			})

			// 验证配置是否保存
			expect(provider.configManager.saveConfig).toHaveBeenCalledWith("test-config", testApiConfig)

			// 验证状态更新
			expect(mockContext.globalState.update).toHaveBeenCalledWith("listApiConfigMeta", [
				{ name: "test-config", id: "test-id", apiProvider: "anthropic" },
			])
			expect(mockContext.globalState.update).toHaveBeenCalledWith("currentApiConfigName", "test-config")

			// 验证状态是否发送到 webview
			expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "state" }))
		})

		test("处理 updateApiConfiguration 中的 buildApiHandler 错误", async () => {
			provider.resolveWebviewView(mockWebviewView)
			const messageHandler = (mockWebviewView.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0]

			// 模拟 buildApiHandler 抛出错误
			const { buildApiHandler } = require("../../../api")
			;(buildApiHandler as jest.Mock).mockImplementationOnce(() => {
				throw new Error("API handler error")
			})

			// 模拟 ConfigManager 方法
			provider.configManager = {
				saveConfig: jest.fn().mockResolvedValue(undefined),
				listConfig: jest
					.fn()
					.mockResolvedValue([{ name: "test-config", id: "test-id", apiProvider: "anthropic" }]),
			} as any

			// 设置模拟 Cline 实例
			const mockCline = {
				api: undefined,
				abortTask: jest.fn(),
			}
			// @ts-ignore - 访问私有属性进行测试
			provider.cline = mockCline

			const testApiConfig = {
				apiProvider: "anthropic" as const,
				apiKey: "test-key",
			}

			// 触发 upsertApiConfiguration
			await messageHandler({
				type: "upsertApiConfiguration",
				text: "test-config",
				apiConfiguration: testApiConfig,
			})

			// 验证错误处理
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("Error create new api configuration"),
			)
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Failed to create api configuration")

			// 验证状态仍然更新
			expect(mockContext.globalState.update).toHaveBeenCalledWith("listApiConfigMeta", [
				{ name: "test-config", id: "test-id", apiProvider: "anthropic" },
			])
			expect(mockContext.globalState.update).toHaveBeenCalledWith("currentApiConfigName", "test-config")
		})
	})
})
