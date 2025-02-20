import * as vscode from "vscode" // 导入 VSCode API

import { ClineProvider } from "./core/webview/ClineProvider" // 导入 ClineProvider
import { createClineAPI } from "./exports" // 导入 createClineAPI 函数
import "./utils/path" // 必须导入以访问 String.prototype.toPosix。
import { CodeActionProvider } from "./core/CodeActionProvider" // 导入 CodeActionProvider
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider" // 导入 DIFF_VIEW_URI_SCHEME
import { handleUri, registerCommands, registerCodeActions, registerTerminalActions } from "./activate" // 导入相关函数
import { McpServerManager } from "./services/mcp/McpServerManager" // 导入 McpServerManager

/**
 * 使用 https://github.com/microsoft/vscode-webview-ui-toolkit 构建
 *
 * 灵感来源于:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel // 定义输出通道
let extensionContext: vscode.ExtensionContext // 定义扩展上下文

// 当扩展被激活时调用此方法。
// 扩展在第一次执行命令时被激活。
export function activate(context: vscode.ExtensionContext) {
	extensionContext = context // 设置扩展上下文
	outputChannel = vscode.window.createOutputChannel("Roo-Code") // 创建输出通道
	context.subscriptions.push(outputChannel) // 将输出通道添加到订阅中
	outputChannel.appendLine("Roo-Code 扩展已激活") // 输出激活信息

	// 从配置中获取默认命令。
	const defaultCommands = vscode.workspace.getConfiguration("roo-cline").get<string[]>("allowedCommands") || []

	// 如果全局状态尚未设置，则初始化全局状态。
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}

	const sidebarProvider = new ClineProvider(context, outputChannel) // 创建侧边栏提供程序

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true }, // 保持上下文隐藏时保留
		}),
	)

	registerCommands({ context, outputChannel, provider: sidebarProvider }) // 注册命令

	/**
	 * 我们使用文本文档内容提供程序 API 来显示差异视图的左侧，
	 * 通过为原始内容创建虚拟文档。这使其变为只读，
	 * 以便用户知道如果他们想保留更改，应编辑右侧。
	 *
	 * 此 API 允许您从任意来源在 VSCode 中创建只读文档，
	 * 并通过为您的提供程序声明一个 uri-scheme 来返回文本内容。
	 * 注册提供程序时必须提供该 scheme，之后不能更改。
	 *
	 * 请注意，提供程序不会为虚拟文档创建 uri - 它的角色是提供给定 uri 的内容。
	 * 作为回报，内容提供程序被连接到打开文档的逻辑中，因此始终会考虑提供程序。
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8") // 解码并返回文本内容
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider), // 注册内容提供程序
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri })) // 注册 URI 处理程序

	// 注册代码操作提供程序。
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds, // 提供的代码操作种类
		}),
	)

	registerCodeActions(context) // 注册代码操作
	registerTerminalActions(context) // 注册终端操作

	return createClineAPI(outputChannel, sidebarProvider) // 返回 Cline API
}

// 当扩展被停用时调用此方法
export async function deactivate() {
	outputChannel.appendLine("Roo-Code 扩展已停用") // 输出停用信息
	// 清理 MCP 服务器管理器
	await McpServerManager.cleanup(extensionContext) // 清理 MCP 服务器管理器
}
