import * as vscode from "vscode" // 导入 VSCode 模块
import { ClineProvider } from "../core/webview/ClineProvider" // 导入 ClineProvider 模块
import { ClineAPI } from "./cline" // 导入 ClineAPI 类型

export function createClineAPI(outputChannel: vscode.OutputChannel, sidebarProvider: ClineProvider): ClineAPI {
	const api: ClineAPI = {
		setCustomInstructions: async (value: string) => {
			await sidebarProvider.updateCustomInstructions(value) // 更新自定义指令
			outputChannel.appendLine("Custom instructions set") // 输出日志
		},

		getCustomInstructions: async () => {
			return (await sidebarProvider.getGlobalState("customInstructions")) as string | undefined // 获取自定义指令
		},

		startNewTask: async (task?: string, images?: string[]) => {
			outputChannel.appendLine("Starting new task") // 输出日志
			await sidebarProvider.clearTask() // 清除任务
			await sidebarProvider.postStateToWebview() // 将状态发送到 Webview
			await sidebarProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" }) // 发送消息到 Webview
			await sidebarProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: task,
				images: images,
			}) // 发送消息到 Webview
			outputChannel.appendLine(
				`Task started with message: ${task ? `"${task}"` : "undefined"} and ${images?.length || 0} image(s)`,
			) // 输出日志
		},

		sendMessage: async (message?: string, images?: string[]) => {
			outputChannel.appendLine(
				`Sending message: ${message ? `"${message}"` : "undefined"} with ${images?.length || 0} image(s)`,
			) // 输出日志
			await sidebarProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: message,
				images: images,
			}) // 发送消息到 Webview
		},

		pressPrimaryButton: async () => {
			outputChannel.appendLine("Pressing primary button") // 输出日志
			await sidebarProvider.postMessageToWebview({
				type: "invoke",
				invoke: "primaryButtonClick",
			}) // 发送消息到 Webview
		},

		pressSecondaryButton: async () => {
			outputChannel.appendLine("Pressing secondary button") // 输出日志
			await sidebarProvider.postMessageToWebview({
				type: "invoke",
				invoke: "secondaryButtonClick",
			}) // 发送消息到 Webview
		},

		sidebarProvider: sidebarProvider, // 侧边栏提供者实例
	}

	return api // 返回 API 对象
}
