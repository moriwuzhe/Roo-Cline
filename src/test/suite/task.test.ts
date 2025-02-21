import * as assert from "assert"
import * as vscode from "vscode"

// 定义测试套件 "Roo Code Task"
suite("Roo Code Task", () => {
	// 定义一个测试用例 "Should handle prompt and response correctly"
	test("Should handle prompt and response correctly", async function () {
		const timeout = 30000 // 超时时间 30 秒
		const interval = 1000 // 轮询间隔 1 秒

		// 检查全局扩展是否存在
		if (!globalThis.extension) {
			assert.fail("Extension not found") // 如果扩展不存在，则测试失败
		}

		try {
			// 确保 webview 已经启动
			let startTime = Date.now()

			while (Date.now() - startTime < timeout) {
				if (globalThis.provider.viewLaunched) {
					break // 如果 webview 已启动，则退出循环
				}

				await new Promise((resolve) => setTimeout(resolve, interval)) // 等待一段时间后继续检查
			}

			// 启动一个新任务
			await globalThis.api.startNewTask("Hello world, what is your name? Respond with 'My name is ...'")

			// 等待任务出现在历史记录中并带有 tokens
			startTime = Date.now()

			while (Date.now() - startTime < timeout) {
				const state = await globalThis.provider.getState()
				const task = state.taskHistory?.[0]

				if (task && task.tokensOut > 0) {
					break // 如果任务存在且 tokensOut 大于 0，则退出循环
				}

				await new Promise((resolve) => setTimeout(resolve, interval)) // 等待一段时间后继续检查
			}

			// 检查是否收到消息
			if (globalThis.provider.messages.length === 0) {
				assert.fail("No messages received") // 如果没有收到消息，则测试失败
			}

			// 检查是否收到预期的响应
			assert.ok(
				globalThis.provider.messages.some(
					({ type, text }) => type === "say" && text?.includes("My name is Roo"),
				),
				"Did not receive expected response containing 'My name is Roo'",
			)
		} finally {
			// 清理操作（如果有）
		}
	})
})
