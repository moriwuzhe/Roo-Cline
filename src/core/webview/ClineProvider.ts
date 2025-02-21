// 导入所需模块
import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import axios from "axios"
import fs from "fs/promises"
import os from "os"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"
import simpleGit from "simple-git"

import { buildApiHandler } from "../../api"
import { downloadTask } from "../../integrations/misc/export-markdown"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { selectImages } from "../../integrations/misc/process-images"
import { getTheme } from "../../integrations/theme/getTheme"
import { getDiffStrategy } from "../diff/DiffStrategy"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { McpHub } from "../../services/mcp/McpHub"
import { ApiConfiguration, ApiProvider, ModelInfo } from "../../shared/api"
import { findLast } from "../../shared/array"
import { ApiConfigMeta, ExtensionMessage } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem"
import { checkoutDiffPayloadSchema, checkoutRestorePayloadSchema, WebviewMessage } from "../../shared/WebviewMessage"
import { Mode, CustomModePrompts, PromptComponent, defaultModeSlug } from "../../shared/modes"
import { SYSTEM_PROMPT } from "../prompts/system"
import { fileExistsAtPath } from "../../utils/fs"
import { Cline } from "../Cline"
import { openMention } from "../mentions"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { playSound, setSoundEnabled, setSoundVolume } from "../../utils/sound"
import { checkExistKey } from "../../shared/checkExistApiConfig"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { searchCommits } from "../../utils/git"
import { ConfigManager } from "../config/ConfigManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { EXPERIMENT_IDS, experiments as Experiments, experimentDefault, ExperimentId } from "../../shared/experiments"
import { CustomSupportPrompts, supportPrompt } from "../../shared/support-prompt"

import { ACTION_NAMES } from "../CodeActionProvider"
import { McpServerManager } from "../../services/mcp/McpServerManager"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

// 定义 SecretKey 类型
type SecretKey =
	| "apiKey"
	| "glamaApiKey"
	| "openRouterApiKey"
	| "awsAccessKey"
	| "awsSecretKey"
	| "awsSessionToken"
	| "openAiApiKey"
	| "geminiApiKey"
	| "openAiNativeApiKey"
	| "deepSeekApiKey"
	| "mistralApiKey"
	| "unboundApiKey"
	| "requestyApiKey"

// 定义 GlobalStateKey 类型
type GlobalStateKey =
	| "apiProvider"
	| "apiModelId"
	| "glamaModelId"
	| "glamaModelInfo"
	| "awsRegion"
	| "awsUseCrossRegionInference"
	| "awsProfile"
	| "awsUseProfile"
	| "vertexProjectId"
	| "vertexRegion"
	| "lastShownAnnouncementId"
	| "customInstructions"
	| "alwaysAllowReadOnly"
	| "alwaysAllowWrite"
	| "alwaysAllowExecute"
	| "alwaysAllowBrowser"
	| "alwaysAllowMcp"
	| "alwaysAllowModeSwitch"
	| "taskHistory"
	| "openAiBaseUrl"
	| "openAiModelId"
	| "openAiCustomModelInfo"
	| "openAiUseAzure"
	| "ollamaModelId"
	| "ollamaBaseUrl"
	| "lmStudioModelId"
	| "lmStudioBaseUrl"
	| "anthropicBaseUrl"
	| "azureApiVersion"
	| "openAiStreamingEnabled"
	| "openRouterModelId"
	| "openRouterModelInfo"
	| "openRouterBaseUrl"
	| "openRouterUseMiddleOutTransform"
	| "allowedCommands"
	| "soundEnabled"
	| "soundVolume"
	| "diffEnabled"
	| "checkpointsEnabled"
	| "browserViewportSize"
	| "screenshotQuality"
	| "fuzzyMatchThreshold"
	| "preferredLanguage" // Language setting for Cline's communication
	| "writeDelayMs"
	| "terminalOutputLineLimit"
	| "mcpEnabled"
	| "enableMcpServerCreation"
	| "alwaysApproveResubmit"
	| "requestDelaySeconds"
	| "rateLimitSeconds"
	| "currentApiConfigName"
	| "listApiConfigMeta"
	| "vsCodeLmModelSelector"
	| "mode"
	| "modeApiConfigs"
	| "customModePrompts"
	| "customSupportPrompts"
	| "enhancementApiConfigId"
	| "experiments" // Map of experiment IDs to their enabled state
	| "autoApprovalEnabled"
	| "customModes" // Array of custom modes
	| "unboundModelId"
	| "requestyModelId"
	| "requestyModelInfo"
	| "unboundModelInfo"
	| "modelTemperature"

// 定义全局文件名
export const GlobalFileNames = {
	apiConversationHistory: "api_conversation_history.json",
	uiMessages: "ui_messages.json",
	glamaModels: "glama_models.json",
	openRouterModels: "openrouter_models.json",
	requestyModels: "requesty_models.json",
	mcpSettings: "cline_mcp_settings.json",
	unboundModels: "unbound_models.json",
}

// 定义 ClineProvider 类
export class ClineProvider implements vscode.WebviewViewProvider {
	public static readonly sideBarId = "roo-cline.SidebarProvider" // 用于 package.json 作为视图的 id。由于 vscode 基于其 id 缓存视图，因此此值不能更改，更新 id 会破坏扩展的现有实例。
	public static readonly tabPanelId = "roo-cline.TabPanelProvider"
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private isViewLaunched = false
	private cline?: Cline
	private workspaceTracker?: WorkspaceTracker
	protected mcpHub?: McpHub // 从 private 更改为 protected
	private latestAnnouncementId = "jan-21-2025-custom-modes" // 添加新公告时更新为唯一标识符
	configManager: ConfigManager
	customModesManager: CustomModesManager

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
	) {
		this.outputChannel.appendLine("ClineProvider 实例化")
		ClineProvider.activeInstances.add(this)
		this.workspaceTracker = new WorkspaceTracker(this)
		this.configManager = new ConfigManager(this.context)
		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})

		// 通过单例管理器初始化 MCP Hub
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub
			})
			.catch((error) => {
				this.outputChannel.appendLine(`初始化 MCP Hub 失败: ${error}`)
			})
	}

	/*
	VSCode 扩展使用可释放模式在用户或系统关闭侧边栏/编辑器选项卡时清理资源。这适用于事件监听、命令、与 UI 交互等。
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		this.outputChannel.appendLine("正在释放 ClineProvider...")
		await this.clearTask()
		this.outputChannel.appendLine("任务已清除")
		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.outputChannel.appendLine("Webview 已释放")
		}
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.workspaceTracker?.dispose()
		this.workspaceTracker = undefined
		this.mcpHub?.dispose()
		this.mcpHub = undefined
		this.customModesManager?.dispose()
		this.outputChannel.appendLine("所有可释放对象已释放")
		ClineProvider.activeInstances.delete(this)

		// 从 McpServerManager 注销
		McpServerManager.unregisterProvider(this)
	}

	public static getVisibleInstance(): ClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	public static async getInstance(): Promise<ClineProvider | undefined> {
		let visibleProvider = ClineProvider.getVisibleInstance()

		// 如果没有可见的提供者，尝试显示侧边栏视图
		if (!visibleProvider) {
			await vscode.commands.executeCommand("roo-cline.SidebarProvider.focus")
			// 短暂等待视图变为可见
			await delay(100)
			visibleProvider = ClineProvider.getVisibleInstance()
		}

		// 如果仍然没有可见的提供者，返回
		if (!visibleProvider) {
			return
		}

		return visibleProvider
	}

	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return false
		}

		if (visibleProvider.cline) {
			return true
		}

		return false
	}

	public static async handleCodeAction(
		command: string,
		promptType: keyof typeof ACTION_NAMES,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command.endsWith("addToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})

			return
		}

		if (visibleProvider.cline && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: prompt,
			})

			return
		}

		await visibleProvider.initClineWithTask(prompt)
	}

	public static async handleTerminalAction(
		command: string,
		promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command.endsWith("AddToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})
			return
		}

		if (visibleProvider.cline && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: prompt,
			})
			return
		}

		await visibleProvider.initClineWithTask(prompt)
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.outputChannel.appendLine("解析 Webview 视图")
		this.view = webviewView

		// 初始化声音启用状态
		this.getState().then(({ soundEnabled }) => {
			setSoundEnabled(soundEnabled ?? false)
		})

		webviewView.webview.options = {
			// 允许 Webview 中的脚本
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		webviewView.webview.html =
			this.context.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: this.getHtmlContent(webviewView.webview)

		// 设置事件监听器以监听从 Webview 视图上下文传递的消息
		// 并根据接收到的消息执行代码
		this.setWebviewMessageListener(webviewView.webview)

		// 日志显示在底部面板 > 调试控制台
		//console.log("注册监听器")

		// 监听面板变为可见时
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView 和 WebviewPanel 具有相同的属性，除了此可见性监听器
			// 面板
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			// 侧边栏
			webviewView.onDidChangeVisibility(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		}

		// 监听视图被释放时
		// 当用户关闭视图或通过编程方式关闭视图时发生
		webviewView.onDidDispose(
			async () => {
				await this.dispose()
			},
			null,
			this.disposables,
		)

		// 监听颜色变化
		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					// 发送最新的主题名称到 Webview
					await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
				}
			},
			null,
			this.disposables,
		)

		// 如果扩展正在启动新会话，清除先前的任务状态
		this.clearTask()

		this.outputChannel.appendLine("Webview 视图已解析")
	}

	public async initClineWithTask(task?: string, images?: string[]) {
		await this.clearTask()
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()

		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		this.cline = new Cline(
			this,
			apiConfiguration,
			effectiveInstructions,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			task,
			images,
			undefined,
			experiments,
		)
	}

	public async initClineWithHistoryItem(historyItem: HistoryItem) {
		await this.clearTask()

		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()

		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		this.cline = new Cline(
			this,
			apiConfiguration,
			effectiveInstructions,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			undefined,
			undefined,
			historyItem,
			experiments,
		)
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		const localPort = "5173"
		const localServerUrl = `localhost:${localPort}`

		// 检查本地开发服务器是否正在运行。
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(
				"本地开发服务器未运行，HMR 将无法工作。请在启动扩展之前运行 'npm run dev' 以启用 HMR。",
			)

			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} data:`,
			`script-src 'unsafe-eval' https://* http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src https://* ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<title>Roo Code</title>
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * 定义并返回应在 Webview 面板中呈现的 HTML。
	 *
	 * @remarks 这也是创建和插入对 React Webview 构建文件的引用到 Webview HTML 的地方。
	 *
	 * @param webview Webview 的引用
	 * @param extensionUri 包含扩展的目录的 URI
	 * @returns 包含应在 Webview 面板中呈现的 HTML 的模板字符串
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		// 获取在 Webview 中运行的主脚本的本地路径，
		// 然后将其转换为可以在 Webview 中使用的 URI。

		// 从 React 构建输出中获取 CSS 文件
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		// 从 React 构建输出中获取 JS 文件
		const scriptUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.js"])

		// 从 React 构建输出中获取 codicon 字体
		// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-codicons-sample/src/extension.ts
		// 我们在扩展中安装了此包，以便我们可以按预期方式从扩展中访问它（字体文件可能捆绑在 vscode 中），我们只需将 css 文件导入到我们的 React 应用中，我们无法访问它
		// 不要忘记在 meta 标签中添加 font-src ${webview.cspSource};
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		// const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.js"))

		// const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "reset.css"))
		// const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "vscode.css"))

		// // 同样适用于样式表
		// const stylesheetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.css"))

		// 使用 nonce 仅允许运行特定脚本。
		/*
		将 Webview 的内容安全策略设置为仅允许具有特定 nonce 的脚本
		创建内容安全策略 meta 标签，以便仅允许加载具有 nonce 的脚本
		随着扩展的增长，您可能希望向 Webview 添加自定义样式、字体和/或图像。如果这样做，您需要更新内容安全策略 meta 标签，以明确允许这些资源。例如：
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
		- 由于 vscode-webview-toolkit 的动态样式注入，样式需要 'unsafe-inline'
		- 由于我们将 base64 图像传递给 Webview，我们需要指定 img-src ${webview.cspSource} data:;

		在 meta 标签中添加 nonce 属性：一个加密的 nonce（仅使用一次）以允许脚本。服务器必须在每次传输策略时生成唯一的 nonce 值。提供无法猜测的 nonce 非常重要，因为否则绕过资源的策略非常简单。
		*/
		const nonce = getNonce()

		// 提示：安装 es6-string-html VS Code 扩展以启用下面的代码高亮
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
            <title>Roo Code</title>
          </head>
          <body>
            <noscript>您需要启用 JavaScript 才能运行此应用程序。</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	/**
	 * 设置事件监听器以监听从 Webview 上下文传递的消息
	 * 并根据接收到的消息执行代码。
	 *
	 * @param webview Webview 的引用
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case "webviewDidLaunch":
						// 首先加载自定义模式
						const customModes = await this.customModesManager.getCustomModes()
						await this.updateGlobalState("customModes", customModes)

						this.postStateToWebview()
						this.workspaceTracker?.initializeFilePaths() // 不要等待
						getTheme().then((theme) =>
							this.postMessageToWebview({ type: "theme", text: JSON.stringify(theme) }),
						)
						// 在调用端点失败的情况下发布最后缓存的模型
						this.readOpenRouterModels().then((openRouterModels) => {
							if (openRouterModels) {
								this.postMessageToWebview({ type: "openRouterModels", openRouterModels })
							}
						})

						// 如果 MCP Hub 已初始化，使用当前服务器列表更新 Webview
						if (this.mcpHub) {
							this.postMessageToWebview({
								type: "mcpServers",
								mcpServers: this.mcpHub.getAllServers(),
							})
						}

						// gui 依赖于最新的模型信息以提供最准确的定价，因此我们需要在启动时获取最新的详细信息。
						// 我们对所有用户都这样做，因为许多用户在 API 提供商之间切换，如果他们切换回 openrouter，它将显示过时的模型信息，如果我们没有在此时检索到最新的信息
						// （请参阅 normalizeApiConfiguration > openrouter）
						this.refreshOpenRouterModels().then(async (openRouterModels) => {
							if (openRouterModels) {
								// 更新状态中的模型信息（需要在此处完成，因为我们不希望在设置打开时更新状态，并且我们可能会在此处刷新模型）
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.openRouterModelId) {
									await this.updateGlobalState(
										"openRouterModelInfo",
										openRouterModels[apiConfiguration.openRouterModelId],
									)
									await this.postStateToWebview()
								}
							}
						})
						this.readGlamaModels().then((glamaModels) => {
							if (glamaModels) {
								this.postMessageToWebview({ type: "glamaModels", glamaModels })
							}
						})
						this.refreshGlamaModels().then(async (glamaModels) => {
							if (glamaModels) {
								// 更新状态中的模型信息（需要在此处完成，因为我们不希望在设置打开时更新状态，并且我们可能会在此处刷新模型）
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.glamaModelId) {
									await this.updateGlobalState(
										"glamaModelInfo",
										glamaModels[apiConfiguration.glamaModelId],
									)
									await this.postStateToWebview()
								}
							}
						})

						this.readUnboundModels().then((unboundModels) => {
							if (unboundModels) {
								this.postMessageToWebview({ type: "unboundModels", unboundModels })
							}
						})
						this.refreshUnboundModels().then(async (unboundModels) => {
							if (unboundModels) {
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration?.unboundModelId) {
									await this.updateGlobalState(
										"unboundModelInfo",
										unboundModels[apiConfiguration.unboundModelId],
									)
									await this.postStateToWebview()
								}
							}
						})

						this.readRequestyModels().then((requestyModels) => {
							if (requestyModels) {
								this.postMessageToWebview({ type: "requestyModels", requestyModels })
							}
						})
						this.refreshRequestyModels().then(async (requestyModels) => {
							if (requestyModels) {
								// 更新状态中的模型信息（需要在此处完成，因为我们不希望在设置打开时更新状态，并且我们可能会在此处刷新模型）
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.requestyModelId) {
									await this.updateGlobalState(
										"requestyModelInfo",
										requestyModels[apiConfiguration.requestyModelId],
									)
									await this.postStateToWebview()
								}
							}
						})

						this.configManager
							.listConfig()
							.then(async (listApiConfig) => {
								if (!listApiConfig) {
									return
								}

								if (listApiConfig.length === 1) {
									// 检查是否首次初始化然后与现有配置同步
									if (!checkExistKey(listApiConfig[0])) {
										const { apiConfiguration } = await this.getState()
										await this.configManager.saveConfig(
											listApiConfig[0].name ?? "default",
											apiConfiguration,
										)
										listApiConfig[0].apiProvider = apiConfiguration.apiProvider
									}
								}

								const currentConfigName = (await this.getGlobalState("currentApiConfigName")) as string

								if (currentConfigName) {
									if (!(await this.configManager.hasConfig(currentConfigName))) {
										// 当前配置名称无效，获取列表中的第一个配置
										await this.updateGlobalState("currentApiConfigName", listApiConfig?.[0]?.name)
										if (listApiConfig?.[0]?.name) {
											const apiConfig = await this.configManager.loadConfig(
												listApiConfig?.[0]?.name,
											)

											await Promise.all([
												this.updateGlobalState("listApiConfigMeta", listApiConfig),
												this.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
												this.updateApiConfiguration(apiConfig),
											])
											await this.postStateToWebview()
											return
										}
									}
								}

								await Promise.all([
									await this.updateGlobalState("listApiConfigMeta", listApiConfig),
									await this.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
								])
							})
							.catch((error) =>
								this.outputChannel.appendLine(
									`列出 API 配置时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								),
							)

						this.isViewLaunched = true
						break
					case "newTask":
						// 应对 hello 消息命令运行的代码
						//vscode.window.showInformationMessage(message.text!)

						// 发送消息到我们的 Webview。
						// 您可以发送任何 JSON 可序列化的数据。
						// 也可以在扩展 .ts 中执行此操作
						//this.postMessageToWebview({ type: "text", text: `Extension: ${Date.now()}` })
						// 初始化新的 Cline 实例将确保旧实例中任何正在运行的代理性 promise 不会影响我们的新任务。这本质上为新任务创建了一个新的起点
						await this.initClineWithTask(message.text, message.images)
						break
					case "apiConfiguration":
						if (message.apiConfiguration) {
							await this.updateApiConfiguration(message.apiConfiguration)
						}
						await this.postStateToWebview()
						break
					case "customInstructions":
						await this.updateCustomInstructions(message.text)
						break
					case "alwaysAllowReadOnly":
						await this.updateGlobalState("alwaysAllowReadOnly", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowWrite":
						await this.updateGlobalState("alwaysAllowWrite", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowExecute":
						await this.updateGlobalState("alwaysAllowExecute", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowBrowser":
						await this.updateGlobalState("alwaysAllowBrowser", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowMcp":
						await this.updateGlobalState("alwaysAllowMcp", message.bool)
						await this.postStateToWebview()
						break
					case "alwaysAllowModeSwitch":
						await this.updateGlobalState("alwaysAllowModeSwitch", message.bool)
						await this.postStateToWebview()
						break
					case "askResponse":
						this.cline?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
						break
					case "clearTask":
						// newTask 将启动一个具有给定任务文本的新任务，而 clear task 将重置当前会话并允许启动新任务
						await this.clearTask()
						await this.postStateToWebview()
						break
					case "didShowAnnouncement":
						await this.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
						await this.postStateToWebview()
						break
					case "selectImages":
						const images = await selectImages()
						await this.postMessageToWebview({ type: "selectedImages", images })
						break
					case "exportCurrentTask":
						const currentTaskId = this.cline?.taskId
						if (currentTaskId) {
							this.exportTaskWithId(currentTaskId)
						}
						break
					case "showTaskWithId":
						this.showTaskWithId(message.text!)
						break
					case "deleteTaskWithId":
						this.deleteTaskWithId(message.text!)
						break
					case "exportTaskWithId":
						this.exportTaskWithId(message.text!)
						break
					case "resetState":
						await this.resetState()
						break
					case "requestOllamaModels":
						const ollamaModels = await this.getOllamaModels(message.text)
						this.postMessageToWebview({ type: "ollamaModels", ollamaModels })
						break
					case "requestLmStudioModels":
						const lmStudioModels = await this.getLmStudioModels(message.text)
						this.postMessageToWebview({ type: "lmStudioModels", lmStudioModels })
						break
					case "requestVsCodeLmModels":
						const vsCodeLmModels = await this.getVsCodeLmModels()
						this.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
						break
					case "refreshGlamaModels":
						await this.refreshGlamaModels()
						break
					case "refreshOpenRouterModels":
						await this.refreshOpenRouterModels()
						break
					case "refreshOpenAiModels":
						if (message?.values?.baseUrl && message?.values?.apiKey) {
							const openAiModels = await this.getOpenAiModels(
								message?.values?.baseUrl,
								message?.values?.apiKey,
							)
							this.postMessageToWebview({ type: "openAiModels", openAiModels })
						}
						break
					case "refreshUnboundModels":
						await this.refreshUnboundModels()
						break
					case "refreshRequestyModels":
						if (message?.values?.apiKey) {
							const requestyModels = await this.refreshRequestyModels(message?.values?.apiKey)
							this.postMessageToWebview({ type: "requestyModels", requestyModels: requestyModels })
						}
						break
					case "openImage":
						openImage(message.text!)
						break
					case "openFile":
						openFile(message.text!, message.values as { create?: boolean; content?: string })
						break
					case "openMention":
						openMention(message.text)
						break
					case "checkpointDiff":
						const result = checkoutDiffPayloadSchema.safeParse(message.payload)

						if (result.success) {
							await this.cline?.checkpointDiff(result.data)
						}

						break
					case "checkpointRestore": {
						const result = checkoutRestorePayloadSchema.safeParse(message.payload)

						if (result.success) {
							await this.cancelTask()

							try {
								await pWaitFor(() => this.cline?.isInitialized === true, { timeout: 3_000 })
							} catch (error) {
								vscode.window.showErrorMessage("尝试恢复检查点时超时。")
							}

							try {
								await this.cline?.checkpointRestore(result.data)
							} catch (error) {
								vscode.window.showErrorMessage("恢复检查点失败。")
							}
						}

						break
					}
					case "cancelTask":
						await this.cancelTask()
						break
					case "allowedCommands":
						await this.context.globalState.update("allowedCommands", message.commands)
						// 还更新工作区设置
						await vscode.workspace
							.getConfiguration("roo-cline")
							.update("allowedCommands", message.commands, vscode.ConfigurationTarget.Global)
						break
					case "openMcpSettings": {
						const mcpSettingsFilePath = await this.mcpHub?.getMcpSettingsFilePath()
						if (mcpSettingsFilePath) {
							openFile(mcpSettingsFilePath)
						}
						break
					}
					case "openCustomModesSettings": {
						const customModesFilePath = await this.customModesManager.getCustomModesFilePath()
						if (customModesFilePath) {
							openFile(customModesFilePath)
						}
						break
					}
					case "restartMcpServer": {
						try {
							await this.mcpHub?.restartConnection(message.text!)
						} catch (error) {
							this.outputChannel.appendLine(
								`重试连接 ${message.text} 失败: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
						}
						break
					}
					case "toggleToolAlwaysAllow": {
						try {
							await this.mcpHub?.toggleToolAlwaysAllow(
								message.serverName!,
								message.toolName!,
								message.alwaysAllow!,
							)
						} catch (error) {
							this.outputChannel.appendLine(
								`切换工具 ${message.toolName} 的自动批准失败: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
						}
						break
					}
					case "toggleMcpServer": {
						try {
							await this.mcpHub?.toggleServerDisabled(message.serverName!, message.disabled!)
						} catch (error) {
							this.outputChannel.appendLine(
								`切换 MCP 服务器 ${message.serverName} 失败: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
						}
						break
					}
					case "mcpEnabled":
						const mcpEnabled = message.bool ?? true
						await this.updateGlobalState("mcpEnabled", mcpEnabled)
						await this.postStateToWebview()
						break
					case "enableMcpServerCreation":
						await this.updateGlobalState("enableMcpServerCreation", message.bool ?? true)
						await this.postStateToWebview()
						break
					case "playSound":
						if (message.audioType) {
							const soundPath = path.join(this.context.extensionPath, "audio", `${message.audioType}.wav`)
							playSound(soundPath)
						}
						break
					case "soundEnabled":
						const soundEnabled = message.bool ?? true
						await this.updateGlobalState("soundEnabled", soundEnabled)
						setSoundEnabled(soundEnabled) // 添加此行以更新声音实用程序
						await this.postStateToWebview()
						break
					case "soundVolume":
						const soundVolume = message.value ?? 0.5
						await this.updateGlobalState("soundVolume", soundVolume)
						setSoundVolume(soundVolume)
						await this.postStateToWebview()
						break
					case "diffEnabled":
						const diffEnabled = message.bool ?? true
						await this.updateGlobalState("diffEnabled", diffEnabled)
						await this.postStateToWebview()
						break
					case "checkpointsEnabled":
						const checkpointsEnabled = message.bool ?? false
						await this.updateGlobalState("checkpointsEnabled", checkpointsEnabled)
						await this.postStateToWebview()
						break
					case "browserViewportSize":
						const browserViewportSize = message.text ?? "900x600"
						await this.updateGlobalState("browserViewportSize", browserViewportSize)
						await this.postStateToWebview()
						break
					case "fuzzyMatchThreshold":
						await this.updateGlobalState("fuzzyMatchThreshold", message.value)
						await this.postStateToWebview()
						break
					case "alwaysApproveResubmit":
						await this.updateGlobalState("alwaysApproveResubmit", message.bool ?? false)
						await this.postStateToWebview()
						break
					case "requestDelaySeconds":
						await this.updateGlobalState("requestDelaySeconds", message.value ?? 5)
						await this.postStateToWebview()
						break
					case "rateLimitSeconds":
						await this.updateGlobalState("rateLimitSeconds", message.value ?? 0)
						await this.postStateToWebview()
						break
					case "preferredLanguage":
						await this.updateGlobalState("preferredLanguage", message.text)
						await this.postStateToWebview()
						break
					case "writeDelayMs":
						await this.updateGlobalState("writeDelayMs", message.value)
						await this.postStateToWebview()
						break
					case "terminalOutputLineLimit":
						await this.updateGlobalState("terminalOutputLineLimit", message.value)
						await this.postStateToWebview()
						break
					case "mode":
						await this.handleModeSwitch(message.text as Mode)
						break
					case "updateSupportPrompt":
						try {
							if (Object.keys(message?.values ?? {}).length === 0) {
								return
							}

							const existingPrompts = (await this.getGlobalState("customSupportPrompts")) || {}

							const updatedPrompts = {
								...existingPrompts,
								...message.values,
							}

							await this.updateGlobalState("customSupportPrompts", updatedPrompts)
							await this.postStateToWebview()
						} catch (error) {
							this.outputChannel.appendLine(
								`更新支持提示时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("更新支持提示失败")
						}
						break
					case "resetSupportPrompt":
						try {
							if (!message?.text) {
								return
							}

							const existingPrompts = ((await this.getGlobalState("customSupportPrompts")) ||
								{}) as Record<string, any>

							const updatedPrompts = {
								...existingPrompts,
							}

							updatedPrompts[message.text] = undefined

							await this.updateGlobalState("customSupportPrompts", updatedPrompts)
							await this.postStateToWebview()
						} catch (error) {
							this.outputChannel.appendLine(
								`重置支持提示时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("重置支持提示失败")
						}
						break
					case "updatePrompt":
						if (message.promptMode && message.customPrompt !== undefined) {
							const existingPrompts = (await this.getGlobalState("customModePrompts")) || {}

							const updatedPrompts = {
								...existingPrompts,
								[message.promptMode]: message.customPrompt,
							}

							await this.updateGlobalState("customModePrompts", updatedPrompts)

							// 获取当前状态并显式包含 customModePrompts
							const currentState = await this.getState()

							const stateWithPrompts = {
								...currentState,
								customModePrompts: updatedPrompts,
							}

							// 发布包含提示的状态
							this.view?.webview.postMessage({
								type: "state",
								state: stateWithPrompts,
							})
						}
						break
					case "deleteMessage": {
						const answer = await vscode.window.showInformationMessage(
							"您想删除什么？",
							{ modal: true },
							"仅此消息",
							"此消息及所有后续消息",
						)
						if (
							(answer === "仅此消息" || answer === "此消息及所有后续消息") &&
							this.cline &&
							typeof message.value === "number" &&
							message.value
						) {
							const timeCutoff = message.value - 1000 // 消息前 1 秒的缓冲区
							const messageIndex = this.cline.clineMessages.findIndex(
								(msg) => msg.ts && msg.ts >= timeCutoff,
							)
							const apiConversationHistoryIndex = this.cline.apiConversationHistory.findIndex(
								(msg) => msg.ts && msg.ts >= timeCutoff,
							)

							if (messageIndex !== -1) {
								const { historyItem } = await this.getTaskWithId(this.cline.taskId)

								if (answer === "仅此消息") {
									// 首先找到下一个用户消息
									const nextUserMessage = this.cline.clineMessages
										.slice(messageIndex + 1)
										.find((msg) => msg.type === "say" && msg.say === "user_feedback")

									// 处理 UI 消息
									if (nextUserMessage) {
										// 查找下一个用户消息的绝对索引
										const nextUserMessageIndex = this.cline.clineMessages.findIndex(
											(msg) => msg === nextUserMessage,
										)
										// 保留当前消息之前和下一个用户消息之后的消息
										await this.cline.overwriteClineMessages([
											...this.cline.clineMessages.slice(0, messageIndex),
											...this.cline.clineMessages.slice(nextUserMessageIndex),
										])
									} else {
										// 如果没有下一个用户消息，则仅保留当前消息之前的消息
										await this.cline.overwriteClineMessages(
											this.cline.clineMessages.slice(0, messageIndex),
										)
									}

									// 处理 API 消息
									if (apiConversationHistoryIndex !== -1) {
										if (nextUserMessage && nextUserMessage.ts) {
											// 保留当前 API 消息之前和下一个用户消息之后的消息
											await this.cline.overwriteApiConversationHistory([
												...this.cline.apiConversationHistory.slice(
													0,
													apiConversationHistoryIndex,
												),
												...this.cline.apiConversationHistory.filter(
													(msg) => msg.ts && msg.ts >= nextUserMessage.ts,
												),
											])
										} else {
											// 如果没有下一个用户消息，则仅保留当前 API 消息之前的消息
											await this.cline.overwriteApiConversationHistory(
												this.cline.apiConversationHistory.slice(0, apiConversationHistoryIndex),
											)
										}
									}
								} else if (answer === "此消息及所有后续消息") {
									// 删除此消息及其后的所有消息
									await this.cline.overwriteClineMessages(
										this.cline.clineMessages.slice(0, messageIndex),
									)
									if (apiConversationHistoryIndex !== -1) {
										await this.cline.overwriteApiConversationHistory(
											this.cline.apiConversationHistory.slice(0, apiConversationHistoryIndex),
										)
									}
								}

								await this.initClineWithHistoryItem(historyItem)
							}
						}
						break
					}
					case "screenshotQuality":
						await this.updateGlobalState("screenshotQuality", message.value)
						await this.postStateToWebview()
						break
					case "enhancementApiConfigId":
						await this.updateGlobalState("enhancementApiConfigId", message.text)
						await this.postStateToWebview()
						break
					case "autoApprovalEnabled":
						await this.updateGlobalState("autoApprovalEnabled", message.bool ?? false)
						await this.postStateToWebview()
						break
					case "enhancePrompt":
						if (message.text) {
							try {
								const {
									apiConfiguration,
									customSupportPrompts,
									listApiConfigMeta,
									enhancementApiConfigId,
								} = await this.getState()

								// 尝试首先获取增强配置，回退到当前配置
								let configToUse: ApiConfiguration = apiConfiguration
								if (enhancementApiConfigId) {
									const config = listApiConfigMeta?.find((c) => c.id === enhancementApiConfigId)
									if (config?.name) {
										const loadedConfig = await this.configManager.loadConfig(config.name)
										if (loadedConfig.apiProvider) {
											configToUse = loadedConfig
										}
									}
								}

								const enhancedPrompt = await singleCompletionHandler(
									configToUse,
									supportPrompt.create(
										"ENHANCE",
										{
											userInput: message.text,
										},
										customSupportPrompts,
									),
								)

								await this.postMessageToWebview({
									type: "enhancedPrompt",
									text: enhancedPrompt,
								})
							} catch (error) {
								this.outputChannel.appendLine(
									`增强提示时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("增强提示失败")
								await this.postMessageToWebview({
									type: "enhancedPrompt",
								})
							}
						}
						break
					case "getSystemPrompt":
						try {
							const {
								apiConfiguration,
								customModePrompts,
								customInstructions,
								preferredLanguage,
								browserViewportSize,
								diffEnabled,
								mcpEnabled,
								fuzzyMatchThreshold,
								experiments,
								enableMcpServerCreation,
							} = await this.getState()

							// 根据当前模型和设置创建 diffStrategy
							const diffStrategy = getDiffStrategy(
								apiConfiguration.apiModelId || apiConfiguration.openRouterModelId || "",
								fuzzyMatchThreshold,
								Experiments.isEnabled(experiments, EXPERIMENT_IDS.DIFF_STRATEGY),
							)
							const cwd =
								vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) || ""

							const mode = message.mode ?? defaultModeSlug
							const customModes = await this.customModesManager.getCustomModes()

							const systemPrompt = await SYSTEM_PROMPT(
								this.context,
								cwd,
								apiConfiguration.openRouterModelInfo?.supportsComputerUse ?? false,
								mcpEnabled ? this.mcpHub : undefined,
								diffStrategy,
								browserViewportSize ?? "900x600",
								mode,
								customModePrompts,
								customModes,
								customInstructions,
								preferredLanguage,
								diffEnabled,
								experiments,
								enableMcpServerCreation,
							)

							await this.postMessageToWebview({
								type: "systemPrompt",
								text: systemPrompt,
								mode: message.mode,
							})
						} catch (error) {
							this.outputChannel.appendLine(
								`获取系统提示时出错:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("获取系统提示失败")
						}
						break
					case "searchCommits": {
						const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
						if (cwd) {
							try {
								const commits = await searchCommits(message.query || "", cwd)
								await this.postMessageToWebview({
									type: "commitSearchResults",
									commits,
								})
							} catch (error) {
								this.outputChannel.appendLine(
									`搜索提交时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("搜索提交失败")
							}
						}
						break
					}
					case "upsertApiConfiguration":
						if (message.text && message.apiConfiguration) {
							try {
								await this.configManager.saveConfig(message.text, message.apiConfiguration)
								const listApiConfig = await this.configManager.listConfig()

								await Promise.all([
									this.updateGlobalState("listApiConfigMeta", listApiConfig),
									this.updateApiConfiguration(message.apiConfiguration),
									this.updateGlobalState("currentApiConfigName", message.text),
								])

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`创建新 API 配置时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("创建 API 配置失败")
							}
						}
						break
					case "renameApiConfiguration":
						if (message.values && message.apiConfiguration) {
							try {
								const { oldName, newName } = message.values

								if (oldName === newName) {
									break
								}

								await this.configManager.saveConfig(newName, message.apiConfiguration)
								await this.configManager.deleteConfig(oldName)

								const listApiConfig = await this.configManager.listConfig()
								const config = listApiConfig?.find((c) => c.name === newName)

								// 首先更新 listApiConfigMeta 以确保 UI 具有最新数据
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)

								await Promise.all([this.updateGlobalState("currentApiConfigName", newName)])

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`创建新 API 配置时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("创建 API 配置失败")
							}
						}
						break
					case "loadApiConfiguration":
						if (message.text) {
							try {
								const apiConfig = await this.configManager.loadConfig(message.text)
								const listApiConfig = await this.configManager.listConfig()

								await Promise.all([
									this.updateGlobalState("listApiConfigMeta", listApiConfig),
									this.updateGlobalState("currentApiConfigName", message.text),
									this.updateApiConfiguration(apiConfig),
								])

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`加载 API 配置时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("加载 API 配置失败")
							}
						}
						break
					case "deleteApiConfiguration":
						if (message.text) {
							const answer = await vscode.window.showInformationMessage(
								"您确定要删除此配置文件吗？",
								{ modal: true },
								"是",
							)

							if (answer !== "是") {
								break
							}

							try {
								await this.configManager.deleteConfig(message.text)
								const listApiConfig = await this.configManager.listConfig()

								// 首先更新 listApiConfigMeta 以确保 UI 具有最新数据
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)

								// 如果这是当前配置，请切换到第一个可用配置
								const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
								if (message.text === currentApiConfigName && listApiConfig?.[0]?.name) {
									const apiConfig = await this.configManager.loadConfig(listApiConfig[0].name)
									await Promise.all([
										this.updateGlobalState("currentApiConfigName", listApiConfig[0].name),
										this.updateApiConfiguration(apiConfig),
									])
								}

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`删除 API 配置时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("删除 API 配置失败")
							}
						}
						break
					case "getListApiConfiguration":
						try {
							const listApiConfig = await this.configManager.listConfig()
							await this.updateGlobalState("listApiConfigMeta", listApiConfig)
							this.postMessageToWebview({ type: "listApiConfig", listApiConfig })
						} catch (error) {
							this.outputChannel.appendLine(
								`获取 API 配置列表时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("获取 API 配置列表失败")
						}
						break
					case "updateExperimental": {
						if (!message.values) {
							break
						}

						const updatedExperiments = {
							...((await this.getGlobalState("experiments")) ?? experimentDefault),
							...message.values,
						} as Record<ExperimentId, boolean>

						await this.updateGlobalState("experiments", updatedExperiments)

						// 如果存在当前 Cline 实例，则更新 diffStrategy
						if (message.values[EXPERIMENT_IDS.DIFF_STRATEGY] !== undefined && this.cline) {
							await this.cline.updateDiffStrategy(
								Experiments.isEnabled(updatedExperiments, EXPERIMENT_IDS.DIFF_STRATEGY),
							)
						}

						await this.postStateToWebview()
						break
					}
					case "updateMcpTimeout":
						if (message.serverName && typeof message.timeout === "number") {
							try {
								await this.mcpHub?.updateServerTimeout(message.serverName, message.timeout)
							} catch (error) {
								this.outputChannel.appendLine(
									`更新 ${message.serverName} 的超时时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("更新服务器超时失败")
							}
						}
						break
					case "updateCustomMode":
						if (message.modeConfig) {
							await this.customModesManager.updateCustomMode(message.modeConfig.slug, message.modeConfig)
							// 保存模式后更新状态
							const customModes = await this.customModesManager.getCustomModes()
							await this.updateGlobalState("customModes", customModes)
							await this.updateGlobalState("mode", message.modeConfig.slug)
							await this.postStateToWebview()
						}
						break
					case "deleteCustomMode":
						if (message.slug) {
							const answer = await vscode.window.showInformationMessage(
								"您确定要删除此自定义模式吗？",
								{ modal: true },
								"是",
							)

							if (answer !== "是") {
								break
							}

							await this.customModesManager.deleteCustomMode(message.slug)
							// 删除后切换回默认模式
							await this.updateGlobalState("mode", defaultModeSlug)
							await this.postStateToWebview()
						}
				}
			},
			null,
			this.disposables,
		)
	}

	/**
	 * 处理切换到新模式，包括更新关联的 API 配置
	 * @param newMode 要切换到的模式
	 */
	public async handleModeSwitch(newMode: Mode) {
		await this.updateGlobalState("mode", newMode)

		// 如果存在，加载新模式的已保存 API 配置
		const savedConfigId = await this.configManager.getModeConfigId(newMode)
		const listApiConfig = await this.configManager.listConfig()

		// 首先更新 listApiConfigMeta 以确保 UI 具有最新数据
		await this.updateGlobalState("listApiConfigMeta", listApiConfig)

		// 如果此模式有已保存的配置，请使用它
		if (savedConfigId) {
			const config = listApiConfig?.find((c) => c.id === savedConfigId)
			if (config?.name) {
				const apiConfig = await this.configManager.loadConfig(config.name)
				await Promise.all([
					this.updateGlobalState("currentApiConfigName", config.name),
					this.updateApiConfiguration(apiConfig),
				])
			}
		} else {
			// 如果此模式没有已保存的配置，请将当前配置保存为默认配置
			const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
			if (currentApiConfigName) {
				const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
				if (config?.id) {
					await this.configManager.setModeConfig(newMode, config.id)
				}
			}
		}

		await this.postStateToWebview()
	}

	private async updateApiConfiguration(apiConfiguration: ApiConfiguration) {
		// 更新模式的默认配置
		const { mode } = await this.getState()
		if (mode) {
			const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
			const listApiConfig = await this.configManager.listConfig()
			const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
			if (config?.id) {
				await this.configManager.setModeConfig(mode, config.id)
			}
		}

		const {
			apiProvider,
			apiModelId,
			apiKey,
			glamaModelId,
			glamaModelInfo,
			glamaApiKey,
			openRouterApiKey,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			awsUseCrossRegionInference,
			awsProfile,
			awsUseProfile,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiCustomModelInfo,
			openAiUseAzure,
			ollamaModelId,
			ollamaBaseUrl,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			openAiNativeApiKey,
			deepSeekApiKey,
			azureApiVersion,
			openAiStreamingEnabled,
			openRouterModelId,
			openRouterModelInfo,
			openRouterBaseUrl,
			openRouterUseMiddleOutTransform,
			vsCodeLmModelSelector,
			mistralApiKey,
			unboundApiKey,
			unboundModelId,
			unboundModelInfo,
			requestyApiKey,
			requestyModelId,
			requestyModelInfo,
			modelTemperature,
		} = apiConfiguration
		await this.updateGlobalState("apiProvider", apiProvider)
		await this.updateGlobalState("apiModelId", apiModelId)
		await this.storeSecret("apiKey", apiKey)
		await this.updateGlobalState("glamaModelId", glamaModelId)
		await this.updateGlobalState("glamaModelInfo", glamaModelInfo)
		await this.storeSecret("glamaApiKey", glamaApiKey)
		await this.storeSecret("openRouterApiKey", openRouterApiKey)
		await this.storeSecret("awsAccessKey", awsAccessKey)
		await this.storeSecret("awsSecretKey", awsSecretKey)
		await this.storeSecret("awsSessionToken", awsSessionToken)
		await this.updateGlobalState("awsRegion", awsRegion)
		await this.updateGlobalState("awsUseCrossRegionInference", awsUseCrossRegionInference)
		await this.updateGlobalState("awsProfile", awsProfile)
		await this.updateGlobalState("awsUseProfile", awsUseProfile)
		await this.updateGlobalState("vertexProjectId", vertexProjectId)
		await this.updateGlobalState("vertexRegion", vertexRegion)
		await this.updateGlobalState("openAiBaseUrl", openAiBaseUrl)
		await this.storeSecret("openAiApiKey", openAiApiKey)
		await this.updateGlobalState("openAiModelId", openAiModelId)
		await this.updateGlobalState("openAiCustomModelInfo", openAiCustomModelInfo)
		await this.updateGlobalState("openAiUseAzure", openAiUseAzure)
		await this.updateGlobalState("ollamaModelId", ollamaModelId)
		await this.updateGlobalState("ollamaBaseUrl", ollamaBaseUrl)
		await this.updateGlobalState("lmStudioModelId", lmStudioModelId)
		await this.updateGlobalState("lmStudioBaseUrl", lmStudioBaseUrl)
		await this.updateGlobalState("anthropicBaseUrl", anthropicBaseUrl)
		await this.storeSecret("geminiApiKey", geminiApiKey)
		await this.storeSecret("openAiNativeApiKey", openAiNativeApiKey)
		await this.storeSecret("deepSeekApiKey", deepSeekApiKey)
		await this.updateGlobalState("azureApiVersion", azureApiVersion)
		await this.updateGlobalState("openAiStreamingEnabled", openAiStreamingEnabled)
		await this.updateGlobalState("openRouterModelId", openRouterModelId)
		await this.updateGlobalState("openRouterModelInfo", openRouterModelInfo)
		await this.updateGlobalState("openRouterBaseUrl", openRouterBaseUrl)
		await this.updateGlobalState("openRouterUseMiddleOutTransform", openRouterUseMiddleOutTransform)
		await this.updateGlobalState("vsCodeLmModelSelector", vsCodeLmModelSelector)
		await this.storeSecret("mistralApiKey", mistralApiKey)
		await this.storeSecret("unboundApiKey", unboundApiKey)
		await this.updateGlobalState("unboundModelId", unboundModelId)
		await this.updateGlobalState("unboundModelInfo", unboundModelInfo)
		await this.storeSecret("requestyApiKey", requestyApiKey)
		await this.updateGlobalState("requestyModelId", requestyModelId)
		await this.updateGlobalState("requestyModelInfo", requestyModelInfo)
		await this.updateGlobalState("modelTemperature", modelTemperature)
		if (this.cline) {
			this.cline.api = buildApiHandler(apiConfiguration)
		}
	}

	async cancelTask() {
		if (this.cline) {
			const { historyItem } = await this.getTaskWithId(this.cline.taskId)
			this.cline.abortTask()

			await pWaitFor(
				() =>
					this.cline === undefined ||
					this.cline.isStreaming === false ||
					this.cline.didFinishAbortingStream ||
					// 如果仅处理了第一个块，则无需等待优雅的中止（关闭编辑、浏览器等）。
					this.cline.isWaitingForFirstChunk,
				{
					timeout: 3_000,
				},
			).catch(() => {
				console.error("中止任务失败")
			})

			if (this.cline) {
				// 'abandoned' 将防止此 Cline 实例影响未来的 Cline 实例。如果它挂在流请求上，可能会发生这种情况。
				this.cline.abandoned = true
			}

			// 再次清除任务，因此我们需要在上面手动中止任务。
			await this.initClineWithHistoryItem(historyItem)
		}
	}

	async updateCustomInstructions(instructions?: string) {
		// 用户可能正在清除字段
		await this.updateGlobalState("customInstructions", instructions || undefined)
		if (this.cline) {
			this.cline.customInstructions = instructions || undefined
		}
		await this.postStateToWebview()
	}

	// MCP

	async ensureMcpServersDirectoryExists(): Promise<string> {
		const mcpServersDir = path.join(os.homedir(), "Documents", "Cline", "MCP")
		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			return "~/Documents/Cline/MCP" // 如果由于某种原因（例如权限）在文档中创建目录失败 - 这是可以的，因为此路径仅在系统提示中使用
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const settingsDir = path.join(this.context.globalStorageUri.fsPath, "settings")
		await fs.mkdir(settingsDir, { recursive: true })
		return settingsDir
	}

	// Ollama

	async getOllamaModels(baseUrl?: string) {
		try {
			if (!baseUrl) {
				baseUrl = "http://localhost:11434"
			}
			if (!URL.canParse(baseUrl)) {
				return []
			}
			const response = await axios.get(`${baseUrl}/api/tags`)
			const modelsArray = response.data?.models?.map((model: any) => model.name) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
		}
	}

	// LM Studio

	async getLmStudioModels(baseUrl?: string) {
		try {
			if (!baseUrl) {
				baseUrl = "http://localhost:1234"
			}
			if (!URL.canParse(baseUrl)) {
				return []
			}
			const response = await axios.get(`${baseUrl}/v1/models`)
			const modelsArray = response.data?.data?.map((model: any) => model.id) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
		}
	}

	// VSCode LM API
	private async getVsCodeLmModels() {
		try {
			const models = await vscode.lm.selectChatModels({})
			return models || []
		} catch (error) {
			this.outputChannel.appendLine(
				`获取 VS Code LM 模型时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			return []
		}
	}

	// OpenAi

	async getOpenAiModels(baseUrl?: string, apiKey?: string) {
		try {
			if (!baseUrl) {
				return []
			}

			if (!URL.canParse(baseUrl)) {
				return []
			}

			const config: Record<string, any> = {}
			if (apiKey) {
				config["headers"] = { Authorization: `Bearer ${apiKey}` }
			}

			const response = await axios.get(`${baseUrl}/models`, config)
			const modelsArray = response.data?.data?.map((model: any) => model.id) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
		}
	}

	// Requesty
	async readRequestyModels(): Promise<Record<string, ModelInfo> | undefined> {
		const requestyModelsFilePath = path.join(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.requestyModels,
		)
		const fileExists = await fileExistsAtPath(requestyModelsFilePath)
		if (fileExists) {
			const fileContents = await fs.readFile(requestyModelsFilePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
	}

	async refreshRequestyModels(apiKey?: string) {
		const requestyModelsFilePath = path.join(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.requestyModels,
		)

		const models: Record<string, ModelInfo> = {}
		try {
			const config: Record<string, any> = {}
			if (!apiKey) {
				apiKey = (await this.getSecret("requestyApiKey")) as string
			}

			if (!apiKey) {
				this.outputChannel.appendLine("未找到 Requesty API 密钥")
				return models
			}

			if (apiKey) {
				config["headers"] = { Authorization: `Bearer ${apiKey}` }
			}

			const response = await axios.get("https://router.requesty.ai/v1/models", config)
			/*
				{
					"id": "anthropic/claude-3-5-sonnet-20240620",
					"object": "model",
					"created": 1738243330,
					"owned_by": "system",
					"input_price": 0.000003,
					"caching_price": 0.00000375,
					"cached_price": 3E-7,
					"output_price": 0.000015,
					"max_output_tokens": 8192,
					"context_window": 200000,
					"supports_caching": true,
					"description": "Anthropic's most intelligent model. Highest level of intelligence and capability"
					},
				}
			*/
			if (response.data) {
				const rawModels = response.data.data
				const parsePrice = (price: any) => {
					if (price) {
						return parseFloat(price) * 1_000_000
					}
					return undefined
				}
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.max_output_tokens,
						contextWindow: rawModel.context_window,
						supportsImages: rawModel.support_image,
						supportsComputerUse: rawModel.support_computer_use,
						supportsPromptCache: rawModel.supports_caching,
						inputPrice: parsePrice(rawModel.input_price),
						outputPrice: parsePrice(rawModel.output_price),
						description: rawModel.description,
						cacheWritesPrice: parsePrice(rawModel.caching_price),
						cacheReadsPrice: parsePrice(rawModel.cached_price),
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				this.outputChannel.appendLine("Requesty API 响应无效")
			}
			await fs.writeFile(requestyModelsFilePath, JSON.stringify(models))
		} catch (error) {
			this.outputChannel.appendLine(
				`获取 Requesty 模型时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "requestyModels", requestyModels: models })
		return models
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://openrouter.ai/api/v1/auth/keys", { code })
			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("OpenRouter API 响应无效")
			}
		} catch (error) {
			this.outputChannel.appendLine(
				`交换代码获取 API 密钥时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const openrouter: ApiProvider = "openrouter"
		await this.updateGlobalState("apiProvider", openrouter)
		await this.storeSecret("openRouterApiKey", apiKey)
		await this.postStateToWebview()
		if (this.cline) {
			this.cline.api = buildApiHandler({ apiProvider: openrouter, openRouterApiKey: apiKey })
		}
		// await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // 如果用户在欢迎页面上，用户体验不佳
	}

	private async ensureCacheDirectoryExists(): Promise<string> {
		const cacheDir = path.join(this.context.globalStorageUri.fsPath, "cache")
		await fs.mkdir(cacheDir, { recursive: true })
		return cacheDir
	}

	async handleGlamaCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code })
			if (response.data && response.data.apiKey) {
				apiKey = response.data.apiKey
			} else {
				throw new Error("Glama API 响应无效")
			}
		} catch (error) {
			this.outputChannel.appendLine(
				`交换代码获取 API 密钥时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const glama: ApiProvider = "glama"
		await this.updateGlobalState("apiProvider", glama)
		await this.storeSecret("glamaApiKey", apiKey)
		await this.postStateToWebview()
		if (this.cline) {
			this.cline.api = buildApiHandler({
				apiProvider: glama,
				glamaApiKey: apiKey,
			})
		}
		// await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // 如果用户在欢迎页面上，用户体验不佳
	}

	private async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined> {
		const filePath = path.join(await this.ensureCacheDirectoryExists(), filename)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			const fileContents = await fs.readFile(filePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
	}

	async readGlamaModels(): Promise<Record<string, ModelInfo> | undefined> {
		return this.readModelsFromCache(GlobalFileNames.glamaModels)
	}

	async refreshGlamaModels() {
		const glamaModelsFilePath = path.join(await this.ensureCacheDirectoryExists(), GlobalFileNames.glamaModels)

		const models: Record<string, ModelInfo> = {}
		try {
			const response = await axios.get("https://glama.ai/api/gateway/v1/models")
			/*
				{
					"added": "2024-12-24T15:12:49.324Z",
					"capabilities": [
						"adjustable_safety_settings",
						"caching",
						"code_execution",
						"function_calling",
						"json_mode",
						"json_schema",
						"system_instructions",
						"tuning",
						"input:audio",
						"input:image",
						"input:text",
						"input:video",
						"output:text"
					],
					"id": "google-vertex/gemini-1.5-flash-002",
					"maxTokensInput": 1048576,
					"maxTokensOutput": 8192,
					"pricePerToken": {
						"cacheRead": null,
						"cacheWrite": null,
						"input": "0.000000075",
						"output": "0.0000003"
					}
				}
			*/
			if (response.data) {
				const rawModels = response.data
				const parsePrice = (price: any) => {
					if (price) {
						return parseFloat(price) * 1_000_000
					}
					return undefined
				}
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.maxTokensOutput,
						contextWindow: rawModel.maxTokensInput,
						supportsImages: rawModel.capabilities?.includes("input:image"),
						supportsComputerUse: rawModel.capabilities?.includes("computer_use"),
						supportsPromptCache: rawModel.capabilities?.includes("caching"),
						inputPrice: parsePrice(rawModel.pricePerToken?.input),
						outputPrice: parsePrice(rawModel.pricePerToken?.output),
						description: undefined,
						cacheWritesPrice: parsePrice(rawModel.pricePerToken?.cacheWrite),
						cacheReadsPrice: parsePrice(rawModel.pricePerToken?.cacheRead),
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				this.outputChannel.appendLine("Glama API 响应无效")
			}
			await fs.writeFile(glamaModelsFilePath, JSON.stringify(models))
		} catch (error) {
			this.outputChannel.appendLine(
				`获取 Glama 模型时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "glamaModels", glamaModels: models })
		return models
	}

	async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
		return this.readModelsFromCache(GlobalFileNames.openRouterModels)
	}

	async refreshOpenRouterModels() {
		const openRouterModelsFilePath = path.join(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.openRouterModels,
		)

		const models: Record<string, ModelInfo> = {}
		try {
			const response = await axios.get("https://openrouter.ai/api/v1/models")
			/*
			{
				"id": "anthropic/claude-3.5-sonnet",
				"name": "Anthropic: Claude 3.5 Sonnet",
				"created": 1718841600,
				"description": "Claude 3.5 Sonnet delivers better-than-Opus capabilities, faster-than-Sonnet speeds, at the same Sonnet prices. Sonnet is particularly good at:\n\n- Coding: Autonomously writes, edits, and runs code with reasoning and troubleshooting\n- Data science: Augments human data science expertise; navigates unstructured data while using multiple tools for insights\n- Visual processing: excelling at interpreting charts, graphs, and images, accurately transcribing text to derive insights beyond just the text alone\n- Agentic tasks: exceptional tool use, making it great at agentic tasks (i.e. complex, multi-step problem solving tasks that require engaging with other systems)\n\n#multimodal",
				"context_length": 200000,
				"architecture": {
					"modality": "text+image-\u003Etext",
					"tokenizer": "Claude",
					"instruct_type": null
				},
				"pricing": {
					"prompt": "0.000003",
					"completion": "0.000015",
					"image": "0.0048",
					"request": "0"
				},
				"top_provider": {
					"context_length": 200000,
					"max_completion_tokens": 8192,
					"is_moderated": true
				},
				"per_request_limits": null
			},
			*/
			if (response.data?.data) {
				const rawModels = response.data.data
				const parsePrice = (price: any) => {
					if (price) {
						return parseFloat(price) * 1_000_000
					}
					return undefined
				}
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.top_provider?.max_completion_tokens,
						contextWindow: rawModel.context_length,
						supportsImages: rawModel.architecture?.modality?.includes("image"),
						supportsPromptCache: false,
						inputPrice: parsePrice(rawModel.pricing?.prompt),
						outputPrice: parsePrice(rawModel.pricing?.completion),
						description: rawModel.description,
					}

					switch (rawModel.id) {
						case "anthropic/claude-3.5-sonnet":
						case "anthropic/claude-3.5-sonnet:beta":
							// 注意：这需要与 api.ts/openrouter 默认模型信息同步
							modelInfo.supportsComputerUse = true
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 3.75
							modelInfo.cacheReadsPrice = 0.3
							break
						case "anthropic/claude-3.5-sonnet-20240620":
						case "anthropic/claude-3.5-sonnet-20240620:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 3.75
							modelInfo.cacheReadsPrice = 0.3
							break
						case "anthropic/claude-3-5-haiku":
						case "anthropic/claude-3-5-haiku:beta":
						case "anthropic/claude-3-5-haiku-20241022":
						case "anthropic/claude-3-5-haiku-20241022:beta":
						case "anthropic/claude-3.5-haiku":
						case "anthropic/claude-3.5-haiku:beta":
						case "anthropic/claude-3.5-haiku-20241022":
						case "anthropic/claude-3.5-haiku-20241022:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 1.25
							modelInfo.cacheReadsPrice = 0.1
							break
						case "anthropic/claude-3-opus":
						case "anthropic/claude-3-opus:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 18.75
							modelInfo.cacheReadsPrice = 1.5
							break
						case "anthropic/claude-3-haiku":
						case "anthropic/claude-3-haiku:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 0.3
							modelInfo.cacheReadsPrice = 0.03
							break
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				this.outputChannel.appendLine("OpenRouter API 响应无效")
			}
			await fs.writeFile(openRouterModelsFilePath, JSON.stringify(models))
		} catch (error) {
			this.outputChannel.appendLine(
				`获取 OpenRouter 模型时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "openRouterModels", openRouterModels: models })
		return models
	}

	async readUnboundModels(): Promise<Record<string, ModelInfo> | undefined> {
		return this.readModelsFromCache(GlobalFileNames.unboundModels)
	}

	async refreshUnboundModels() {
		const unboundModelsFilePath = path.join(await this.ensureCacheDirectoryExists(), GlobalFileNames.unboundModels)

		const models: Record<string, ModelInfo> = {}
		try {
			const response = await axios.get("https://api.getunbound.ai/models")

			if (response.data) {
				const rawModels: Record<string, any> = response.data

				for (const [modelId, model] of Object.entries(rawModels)) {
					models[modelId] = {
						maxTokens: model.maxTokens ? parseInt(model.maxTokens) : undefined,
						contextWindow: model.contextWindow ? parseInt(model.contextWindow) : 0,
						supportsImages: model.supportsImages ?? false,
						supportsPromptCache: model.supportsPromptCaching ?? false,
						supportsComputerUse: model.supportsComputerUse ?? false,
						inputPrice: model.inputTokenPrice ? parseFloat(model.inputTokenPrice) : undefined,
						outputPrice: model.outputTokenPrice ? parseFloat(model.outputTokenPrice) : undefined,
						cacheWritesPrice: model.cacheWritePrice ? parseFloat(model.cacheWritePrice) : undefined,
						cacheReadsPrice: model.cacheReadPrice ? parseFloat(model.cacheReadPrice) : undefined,
					}
				}
			}
			await fs.writeFile(unboundModelsFilePath, JSON.stringify(models))
		} catch (error) {
			this.outputChannel.appendLine(
				`获取 Unbound 模型时出错: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "unboundModels", unboundModels: models })
		return models
	}

	// 任务历史

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks", id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			}
		}
		// 如果我们尝试获取不存在的任务，请从状态中删除它
		// FIXME: 这有时似乎会发生，当 json 文件由于某种原因未保存到磁盘时
		await this.deleteTaskFromState(id)
		throw new Error("未找到任务")
	}

	async showTaskWithId(id: string) {
		if (id !== this.cline?.taskId) {
			// 非当前任务
			const { historyItem } = await this.getTaskWithId(id)
			await this.initClineWithHistoryItem(historyItem) // 清除现有任务
		}
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	async deleteTaskWithId(id: string) {
		if (id === this.cline?.taskId) {
			await this.clearTask()
		}

		const { taskDirPath, apiConversationHistoryFilePath, uiMessagesFilePath } = await this.getTaskWithId(id)

		await this.deleteTaskFromState(id)

		// 删除任务文件
		const apiConversationHistoryFileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
		if (apiConversationHistoryFileExists) {
			await fs.unlink(apiConversationHistoryFilePath)
		}
		const uiMessagesFileExists = await fileExistsAtPath(uiMessagesFilePath)
		if (uiMessagesFileExists) {
			await fs.unlink(uiMessagesFilePath)
		}
		const legacyMessagesFilePath = path.join(taskDirPath, "claude_messages.json")
		if (await fileExistsAtPath(legacyMessagesFilePath)) {
			await fs.unlink(legacyMessagesFilePath)
		}
		await fs.rmdir(taskDirPath) // 如果目录为空，则成功

		const { checkpointsEnabled } = await this.getState()
		const baseDir = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
		const branch = `roo-code-checkpoints-${id}`

		if (checkpointsEnabled && baseDir) {
			try {
				await simpleGit(baseDir).branch(["-D", branch])
				console.log(`[deleteTaskWithId] 已删除分支 ${branch}`)
			} catch (err) {
				console.error(
					`[deleteTaskWithId] 删除分支 ${branch} 时出错: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
	}

	async deleteTaskFromState(id: string) {
		// 从历史记录中删除任务
		const taskHistory = ((await this.getGlobalState("taskHistory")) as HistoryItem[]) || []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)

		// 通知 Webview 任务已删除
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })
	}

	async getStateToPostToWebview() {
		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowWrite,
			alwaysAllowExecute,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			soundEnabled,
			diffEnabled,
			checkpointsEnabled,
			taskHistory,
			soundVolume,
			browserViewportSize,
			screenshotQuality,
			preferredLanguage,
			writeDelayMs,
			terminalOutputLineLimit,
			fuzzyMatchThreshold,
			mcpEnabled,
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			rateLimitSeconds,
			currentApiConfigName,
			listApiConfigMeta,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			experiments,
		} = await this.getState()

		const allowedCommands = vscode.workspace.getConfiguration("roo-cline").get<string[]>("allowedCommands") || []

		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			uriScheme: vscode.env.uriScheme,
			clineMessages: this.cline?.clineMessages || [],
			taskHistory: (taskHistory || [])
				.filter((item: HistoryItem) => item.ts && item.task)
				.sort((a: HistoryItem, b: HistoryItem) => b.ts - a.ts),
			soundEnabled: soundEnabled ?? false,
			diffEnabled: diffEnabled ?? true,
			checkpointsEnabled: checkpointsEnabled ?? false,
			shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
			allowedCommands,
			soundVolume: soundVolume ?? 0.5,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			preferredLanguage: preferredLanguage ?? "English",
			writeDelayMs: writeDelayMs ?? 1000,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			mcpEnabled: mcpEnabled ?? true,
			enableMcpServerCreation: enableMcpServerCreation ?? true,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: requestDelaySeconds ?? 10,
			rateLimitSeconds: rateLimitSeconds ?? 0,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			mode: mode ?? defaultModeSlug,
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			customModes: await this.customModesManager.getCustomModes(),
			experiments: experiments ?? experimentDefault,
			mcpServers: this.mcpHub?.getAllServers() ?? [],
		}
	}

	async clearTask() {
		this.cline?.abortTask()
		this.cline = undefined // 删除对它的引用，因此一旦 promise 结束，它将被垃圾回收
	}

	// 缓存机制，用于跟踪每个提供者实例的 Webview 消息 + API 对话历史

	/*
	现在我们使用 retainContextWhenHidden，我们不必在用户状态中存储 cline 消息的缓存，但我们可以这样做以减少长对话中的内存占用。

	- 我们必须小心在 ClineProvider 实例之间共享的状态，因为可能会同时运行多个扩展实例。例如，当我们使用相同的键缓存 cline 消息时，两个扩展实例可能会使用相同的键并覆盖彼此的消息。
	- 一些状态确实需要在实例之间共享，即 API 密钥 - 但是似乎没有好的方法通知其他实例 API 密钥已更改。

	我们需要为每个 ClineProvider 实例的消息缓存使用唯一标识符，因为我们可能在侧边栏之外运行多个扩展实例，例如在编辑器面板中。

	// 在 API 请求中发送的对话历史

	/*
	似乎某些 API 消息不符合 vscode 状态要求。要么 Anthropic 库在后端以某种方式操纵这些值，从而创建循环引用，要么 API 返回函数或符号作为消息内容的一部分。
	VSCode 关于状态的文档：“值必须是 JSON 可序列化的 ... 值 - 必须不包含循环引用。”
	目前我们将对话历史存储在内存中，如果我们需要直接存储在状态中，我们需要进行手动转换以确保正确的 json 序列化。
	*/

	// getApiConversationHistory(): Anthropic.MessageParam[] {
	// 	// const history = await this.getGlobalState(
	// 	// 	this.getApiConversationHistoryStateKey()
	// 	// ) as Anthropic.MessageParam[]
	// 	// return history || []
	// 	return this.apiConversationHistory
	// }

	// setApiConversationHistory(history: Anthropic.MessageParam[] | undefined) {
	// 	// await this.updateGlobalState(this.getApiConversationHistoryStateKey(), history)
	// 	this.apiConversationHistory = history || []
	// }

	// addMessageToApiConversationHistory(message: Anthropic.MessageParam): Anthropic.MessageParam[] {
	// 	// const history = await this.getApiConversationHistory()
	// 	// history.push(message)
	// 	// await this.setApiConversationHistory(history)
	// 	// return history
	// 	this.apiConversationHistory.push(message)
	// 	return this.apiConversationHistory
	// }

	/*
	存储
	https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	https://www.eliostruyf.com/devhack-code-extension-storage-options/
	*/

	async getState() {
		const [
			storedApiProvider,
			apiModelId,
			apiKey,
			glamaApiKey,
			glamaModelId,
			glamaModelInfo,
			openRouterApiKey,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			awsUseCrossRegionInference,
			awsProfile,
			awsUseProfile,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiCustomModelInfo,
			openAiUseAzure,
			ollamaModelId,
			ollamaBaseUrl,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			openAiNativeApiKey,
			deepSeekApiKey,
			mistralApiKey,
			azureApiVersion,
			openAiStreamingEnabled,
			openRouterModelId,
			openRouterModelInfo,
			openRouterBaseUrl,
			openRouterUseMiddleOutTransform,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowWrite,
			alwaysAllowExecute,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			taskHistory,
			allowedCommands,
			soundEnabled,
			diffEnabled,
			checkpointsEnabled,
			soundVolume,
			browserViewportSize,
			fuzzyMatchThreshold,
			preferredLanguage,
			writeDelayMs,
			screenshotQuality,
			terminalOutputLineLimit,
			mcpEnabled,
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			rateLimitSeconds,
			currentApiConfigName,
			listApiConfigMeta,
			vsCodeLmModelSelector,
			mode,
			modeApiConfigs,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			customModes,
			experiments,
			unboundApiKey,
			unboundModelId,
			unboundModelInfo,
			requestyApiKey,
			requestyModelId,
			requestyModelInfo,
			modelTemperature,
		] = await Promise.all([
			this.getGlobalState("apiProvider") as Promise<ApiProvider | undefined>,
			this.getGlobalState("apiModelId") as Promise<string | undefined>,
			this.getSecret("apiKey") as Promise<string | undefined>,
			this.getSecret("glamaApiKey") as Promise<string | undefined>,
			this.getGlobalState("glamaModelId") as Promise<string | undefined>,
			this.getGlobalState("glamaModelInfo") as Promise<ModelInfo | undefined>,
			this.getSecret("openRouterApiKey") as Promise<string | undefined>,
			this.getSecret("awsAccessKey") as Promise<string | undefined>,
			this.getSecret("awsSecretKey") as Promise<string | undefined>,
			this.getSecret("awsSessionToken") as Promise<string | undefined>,
			this.getGlobalState("awsRegion") as Promise<string | undefined>,
			this.getGlobalState("awsUseCrossRegionInference") as Promise<boolean | undefined>,
			this.getGlobalState("awsProfile") as Promise<string | undefined>,
			this.getGlobalState("awsUseProfile") as Promise<boolean | undefined>,
			this.getGlobalState("vertexProjectId") as Promise<string | undefined>,
			this.getGlobalState("vertexRegion") as Promise<string | undefined>,
			this.getGlobalState("openAiBaseUrl") as Promise<string | undefined>,
			this.getSecret("openAiApiKey") as Promise<string | undefined>,
			this.getGlobalState("openAiModelId") as Promise<string | undefined>,
			this.getGlobalState("openAiCustomModelInfo") as Promise<ModelInfo | undefined>,
			this.getGlobalState("openAiUseAzure") as Promise<boolean | undefined>,
			this.getGlobalState("ollamaModelId") as Promise<string | undefined>,
			this.getGlobalState("ollamaBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("lmStudioModelId") as Promise<string | undefined>,
			this.getGlobalState("lmStudioBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("anthropicBaseUrl") as Promise<string | undefined>,
			this.getSecret("geminiApiKey") as Promise<string | undefined>,
			this.getSecret("openAiNativeApiKey") as Promise<string | undefined>,
			this.getSecret("deepSeekApiKey") as Promise<string | undefined>,
			this.getSecret("mistralApiKey") as Promise<string | undefined>,
			this.getGlobalState("azureApiVersion") as Promise<string | undefined>,
			this.getGlobalState("openAiStreamingEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("openRouterModelId") as Promise<string | undefined>,
			this.getGlobalState("openRouterModelInfo") as Promise<ModelInfo | undefined>,
			this.getGlobalState("openRouterBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("openRouterUseMiddleOutTransform") as Promise<boolean | undefined>,
			this.getGlobalState("lastShownAnnouncementId") as Promise<string | undefined>,
			this.getGlobalState("customInstructions") as Promise<string | undefined>,
			this.getGlobalState("alwaysAllowReadOnly") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowWrite") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowExecute") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowBrowser") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowMcp") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowModeSwitch") as Promise<boolean | undefined>,
			this.getGlobalState("taskHistory") as Promise<HistoryItem[] | undefined>,
			this.getGlobalState("allowedCommands") as Promise<string[] | undefined>,
			this.getGlobalState("soundEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("diffEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("checkpointsEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("soundVolume") as Promise<number | undefined>,
			this.getGlobalState("browserViewportSize") as Promise<string | undefined>,
			this.getGlobalState("fuzzyMatchThreshold") as Promise<number | undefined>,
			this.getGlobalState("preferredLanguage") as Promise<string | undefined>,
			this.getGlobalState("writeDelayMs") as Promise<number | undefined>,
			this.getGlobalState("screenshotQuality") as Promise<number | undefined>,
			this.getGlobalState("terminalOutputLineLimit") as Promise<number | undefined>,
			this.getGlobalState("mcpEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("enableMcpServerCreation") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysApproveResubmit") as Promise<boolean | undefined>,
			this.getGlobalState("requestDelaySeconds") as Promise<number | undefined>,
			this.getGlobalState("rateLimitSeconds") as Promise<number | undefined>,
			this.getGlobalState("currentApiConfigName") as Promise<string | undefined>,
			this.getGlobalState("listApiConfigMeta") as Promise<ApiConfigMeta[] | undefined>,
			this.getGlobalState("vsCodeLmModelSelector") as Promise<vscode.LanguageModelChatSelector | undefined>,
			this.getGlobalState("mode") as Promise<Mode | undefined>,
			this.getGlobalState("modeApiConfigs") as Promise<Record<Mode, string> | undefined>,
			this.getGlobalState("customModePrompts") as Promise<CustomModePrompts | undefined>,
			this.getGlobalState("customSupportPrompts") as Promise<CustomSupportPrompts | undefined>,
			this.getGlobalState("enhancementApiConfigId") as Promise<string | undefined>,
			this.getGlobalState("autoApprovalEnabled") as Promise<boolean | undefined>,
			this.customModesManager.getCustomModes(),
			this.getGlobalState("experiments") as Promise<Record<ExperimentId, boolean> | undefined>,
			this.getSecret("unboundApiKey") as Promise<string | undefined>,
			this.getGlobalState("unboundModelId") as Promise<string | undefined>,
			this.getGlobalState("unboundModelInfo") as Promise<ModelInfo | undefined>,
			this.getSecret("requestyApiKey") as Promise<string | undefined>,
			this.getGlobalState("requestyModelId") as Promise<string | undefined>,
			this.getGlobalState("requestyModelInfo") as Promise<ModelInfo | undefined>,
			this.getGlobalState("modelTemperature") as Promise<number | undefined>,
		])

		let apiProvider: ApiProvider
		if (storedApiProvider) {
			apiProvider = storedApiProvider
		} else {
			// 新用户或没有在状态中存储 apiProvider 的旧用户
			// （如果他们使用 OpenRouter 或 Bedrock，则 apiProvider 状态将存在）
			if (apiKey) {
				apiProvider = "anthropic"
			} else {
				// 新用户应默认为 openrouter
				apiProvider = "openrouter"
			}
		}

		return {
			apiConfiguration: {
				apiProvider,
				apiModelId,
				apiKey,
				glamaApiKey,
				glamaModelId,
				glamaModelInfo,
				openRouterApiKey,
				awsAccessKey,
				awsSecretKey,
				awsSessionToken,
				awsRegion,
				awsUseCrossRegionInference,
				awsProfile,
				awsUseProfile,
				vertexProjectId,
				vertexRegion,
				openAiBaseUrl,
				openAiApiKey,
				openAiModelId,
				openAiCustomModelInfo,
				openAiUseAzure,
				ollamaModelId,
				ollamaBaseUrl,
				lmStudioModelId,
				lmStudioBaseUrl,
				anthropicBaseUrl,
				geminiApiKey,
				openAiNativeApiKey,
				deepSeekApiKey,
				mistralApiKey,
				azureApiVersion,
				openAiStreamingEnabled,
				openRouterModelId,
				openRouterModelInfo,
				openRouterBaseUrl,
				openRouterUseMiddleOutTransform,
				vsCodeLmModelSelector,
				unboundApiKey,
				unboundModelId,
				unboundModelInfo,
				requestyApiKey,
				requestyModelId,
				requestyModelInfo,
				modelTemperature,
			},
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			taskHistory,
			allowedCommands,
			soundEnabled: soundEnabled ?? false,
			diffEnabled: diffEnabled ?? true,
			checkpointsEnabled: checkpointsEnabled ?? false,
			soundVolume,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			writeDelayMs: writeDelayMs ?? 1000,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			mode: mode ?? defaultModeSlug,
			preferredLanguage:
				preferredLanguage ??
				(() => {
					// 获取 VSCode 的语言设置
					const vscodeLang = vscode.env.language
					// 将 VSCode 语言映射到我们支持的语言
					const langMap: { [key: string]: string } = {
						en: "English",
						ar: "Arabic",
						"pt-br": "Brazilian Portuguese",
						cs: "Czech",
						fr: "French",
						de: "German",
						hi: "Hindi",
						hu: "Hungarian",
						it: "Italian",
						ja: "Japanese",
						ko: "Korean",
						pl: "Polish",
						pt: "Portuguese",
						ru: "Russian",
						"zh-cn": "Simplified Chinese",
						es: "Spanish",
						"zh-tw": "Traditional Chinese",
						tr: "Turkish",
					}
					// 返回映射的语言或默认为英语
					return langMap[vscodeLang.split("-")[0]] ?? "English"
				})(),
			mcpEnabled: mcpEnabled ?? true,
			enableMcpServerCreation: enableMcpServerCreation ?? true,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: Math.max(5, requestDelaySeconds ?? 10),
			rateLimitSeconds: rateLimitSeconds ?? 0,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			modeApiConfigs: modeApiConfigs ?? ({} as Record<Mode, string>),
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			experiments: experiments ?? experimentDefault,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			customModes,
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)

		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		await this.updateGlobalState("taskHistory", history)
		return history
	}

	// 全局

	async updateGlobalState(key: GlobalStateKey, value: any) {
		await this.context.globalState.update(key, value)
	}

	async getGlobalState(key: GlobalStateKey) {
		return await this.context.globalState.get(key)
	}

	// 工作区

	private async updateWorkspaceState(key: string, value: any) {
		await this.context.workspaceState.update(key, value)
	}

	private async getWorkspaceState(key: string) {
		return await this.context.workspaceState.get(key)
	}

	// private async clearState() {
	// 	this.context.workspaceState.keys().forEach((key) => {
	// 		this.context.workspaceState.update(key, undefined)
	// 	})
	// 	this.context.globalState.keys().forEach((key) => {
	// 		this.context.globalState.update(key, undefined)
	// 	})
	// 	this.context.secrets.delete("apiKey")
	// }

	// 秘密

	public async storeSecret(key: SecretKey, value?: string) {
		if (value) {
			await this.context.secrets.store(key, value)
		} else {
			await this.context.secrets.delete(key)
		}
	}

	private async getSecret(key: SecretKey) {
		return await this.context.secrets.get(key)
	}

	// 开发

	async resetState() {
		const answer = await vscode.window.showInformationMessage(
			"您确定要重置扩展中的所有状态和秘密存储吗？此操作无法撤消。",
			{ modal: true },
			"是",
		)

		if (answer !== "是") {
			return
		}

		for (const key of this.context.globalState.keys()) {
			await this.context.globalState.update(key, undefined)
		}
		const secretKeys: SecretKey[] = [
			"apiKey",
			"glamaApiKey",
			"openRouterApiKey",
			"awsAccessKey",
			"awsSecretKey",
			"awsSessionToken",
			"openAiApiKey",
			"geminiApiKey",
			"openAiNativeApiKey",
			"deepSeekApiKey",
			"mistralApiKey",
			"unboundApiKey",
			"requestyApiKey",
		]
		for (const key of secretKeys) {
			await this.storeSecret(key, undefined)
		}
		await this.configManager.resetAllConfigs()
		await this.customModesManager.resetCustomModes()
		if (this.cline) {
			this.cline.abortTask()
			this.cline = undefined
		}
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	// 日志记录

	public log(message: string) {
		this.outputChannel.appendLine(message)
	}

	// 集成测试

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.cline?.clineMessages || []
	}

	// 添加公共 getter
	public getMcpHub(): McpHub | undefined {
		return this.mcpHub
	}
}
