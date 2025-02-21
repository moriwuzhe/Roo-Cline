import * as vscode from "vscode" // 导入 VS Code API
import delay from "delay" // 导入 delay 模块

import { ClineProvider } from "../core/webview/ClineProvider" // 导入 ClineProvider

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext // 扩展上下文
	outputChannel: vscode.OutputChannel // 输出通道
	provider: ClineProvider // ClineProvider 实例
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel } = options // 解构选项

	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback)) // 注册命令
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	return {
		"roo-cline.plusButtonClicked": async () => {
			await provider.clearTask() // 清除任务
			await provider.postStateToWebview() // 将状态发送到 Webview
			await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" }) // 发送聊天按钮点击消息
		},
		"roo-cline.mcpButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" }) // 发送 MCP 按钮点击消息
		},
		"roo-cline.promptsButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" }) // 发送提示按钮点击消息
		},
		"roo-cline.popoutButtonClicked": () => openClineInNewTab({ context, outputChannel }), // 打开 Cline 在新标签页中
		"roo-cline.openInNewTab": () => openClineInNewTab({ context, outputChannel }), // 打开 Cline 在新标签页中
		"roo-cline.settingsButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // 发送设置按钮点击消息
		},
		"roo-cline.historyButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "historyButtonClicked" }) // 发送历史按钮点击消息
		},
	}
}

const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	outputChannel.appendLine("Opening Roo Code in new tab") // 在输出通道中添加消息

	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const tabProvider = new ClineProvider(context, outputChannel) // 创建 ClineProvider 实例
	// const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0)) // 获取最后一个列

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	// 检查是否有可见的文本编辑器，否则在右侧打开一个新组。
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0 // 检查是否有可见的文本编辑器

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight") // 执行命令在右侧打开新组
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two // 目标列

	const panel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Roo Code", targetCol, {
		enableScripts: true, // 启用脚本
		retainContextWhenHidden: true, // 隐藏时保留上下文
		localResourceRoots: [context.extensionUri], // 本地资源根目录
	})

	// TODO: use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	panel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "rocket.png"), // 设置浅色图标路径
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "rocket.png"), // 设置深色图标路径
	}

	await tabProvider.resolveWebviewView(panel) // 解析 Webview 视图

	// Lock the editor group so clicking on files doesn't open them over the panel
	// 锁定编辑器组，以便点击文件不会在面板上打开它们
	await delay(100) // 延迟 100 毫秒
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup") // 执行命令锁定编辑器组
}
