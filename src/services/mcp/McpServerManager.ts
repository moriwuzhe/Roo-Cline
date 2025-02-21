import * as vscode from "vscode" // 导入 VSCode 模块
import { McpHub } from "./McpHub" // 导入 McpHub 模块
import { ClineProvider } from "../../core/webview/ClineProvider" // 导入 ClineProvider 模块

/**
 * MCP 服务器实例的单例管理器。
 * 确保所有 webview 只运行一组 MCP 服务器。
 */
export class McpServerManager {
	private static instance: McpHub | null = null // 单例实例
	private static readonly GLOBAL_STATE_KEY = "mcpHubInstanceId" // 全局状态键
	private static providers: Set<ClineProvider> = new Set() // 追踪的提供者集合
	private static initializationPromise: Promise<McpHub> | null = null // 初始化承诺

	/**
	 * 获取单例 McpHub 实例。
	 * 如果不存在则创建一个新实例。
	 * 使用基于承诺的锁实现线程安全。
	 */
	static async getInstance(context: vscode.ExtensionContext, provider: ClineProvider): Promise<McpHub> {
		// 注册提供者
		this.providers.add(provider)

		// 如果已经有实例，返回它
		if (this.instance) {
			return this.instance
		}

		// 如果初始化正在进行中，等待它
		if (this.initializationPromise) {
			return this.initializationPromise
		}

		// 创建一个新的初始化承诺
		this.initializationPromise = (async () => {
			try {
				// 双重检查实例，以防在等待期间创建了实例
				if (!this.instance) {
					this.instance = new McpHub(provider)
					// 在全局状态中存储唯一标识符以跟踪主实例
					await context.globalState.update(this.GLOBAL_STATE_KEY, Date.now().toString())
				}
				return this.instance
			} finally {
				// 完成或出错后清除初始化承诺
				this.initializationPromise = null
			}
		})()

		return this.initializationPromise
	}

	/**
	 * 从追踪集合中移除提供者。
	 * 在 webview 被释放时调用。
	 */
	static unregisterProvider(provider: ClineProvider): void {
		this.providers.delete(provider)
	}

	/**
	 * 通知所有注册的提供者服务器状态变化。
	 */
	static notifyProviders(message: any): void {
		this.providers.forEach((provider) => {
			provider.postMessageToWebview(message).catch((error) => {
				console.error("Failed to notify provider:", error) // 处理通知失败
			})
		})
	}

	/**
	 * 清理单例实例及其所有资源。
	 */
	static async cleanup(context: vscode.ExtensionContext): Promise<void> {
		if (this.instance) {
			await this.instance.dispose() // 释放实例
			this.instance = null
			await context.globalState.update(this.GLOBAL_STATE_KEY, undefined) // 更新全局状态
		}
		this.providers.clear() // 清空提供者集合
	}
}
