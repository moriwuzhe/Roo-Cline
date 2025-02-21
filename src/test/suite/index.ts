import * as path from "path"
import Mocha from "mocha"
import { glob } from "glob"
import { ClineAPI } from "../../exports/cline"
import { ClineProvider } from "../../core/webview/ClineProvider"
import * as vscode from "vscode"

declare global {
	var api: ClineAPI
	var provider: ClineProvider
	var extension: vscode.Extension<ClineAPI> | undefined
	var panel: vscode.WebviewPanel | undefined
}

// 运行测试的主函数
export async function run(): Promise<void> {
	// 创建 Mocha 测试实例
	const mocha = new Mocha({
		ui: "tdd",
		timeout: 600000, // 10 分钟超时，以补偿在 GHA 中与 LLM 通信的时间
	})

	const testsRoot = path.resolve(__dirname, "..")

	try {
		// 查找所有测试文件
		const files = await glob("**/**.test.js", { cwd: testsRoot })

		// 将文件添加到测试套件中
		files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)))

		// 设置全局扩展、api、provider 和 panel
		globalThis.extension = vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")
		if (!globalThis.extension) {
			throw new Error("Extension not found") // 如果扩展不存在，则抛出错误
		}

		globalThis.api = globalThis.extension.isActive
			? globalThis.extension.exports
			: await globalThis.extension.activate()
		globalThis.provider = globalThis.api.sidebarProvider
		await globalThis.provider.updateGlobalState("apiProvider", "openrouter")
		await globalThis.provider.updateGlobalState("openRouterModelId", "anthropic/claude-3.5-sonnet")
		await globalThis.provider.storeSecret(
			"openRouterApiKey",
			process.env.OPENROUTER_API_KEY || "sk-or-v1-fake-api-key",
		)

		globalThis.panel = vscode.window.createWebviewPanel(
			"roo-cline.SidebarProvider",
			"Roo Code",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				enableCommandUris: true,
				retainContextWhenHidden: true,
				localResourceRoots: [globalThis.extension?.extensionUri],
			},
		)

		await globalThis.provider.resolveWebviewView(globalThis.panel)

		let startTime = Date.now()
		const timeout = 60000
		const interval = 1000

		while (Date.now() - startTime < timeout) {
			if (globalThis.provider.viewLaunched) {
				break // 如果 webview 已启动，则退出循环
			}

			await new Promise((resolve) => setTimeout(resolve, interval)) // 等待一段时间后继续检查
		}

		// 运行 Mocha 测试
		return new Promise((resolve, reject) => {
			try {
				mocha.run((failures: number) => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`)) // 如果有测试失败，则拒绝 Promise
					} else {
						resolve() // 如果所有测试通过，则解析 Promise
					}
				})
			} catch (err) {
				console.error(err)
				reject(err) // 捕获运行时错误并拒绝 Promise
			}
		})
	} catch (err) {
		console.error("Error while running tests:")
		console.error(err)
		throw err // 捕获初始化错误并抛出
	}
}
