import * as assert from "assert"
import * as vscode from "vscode"

// 定义测试套件 "Roo Code Modes"
suite("Roo Code Modes", () => {
	// 定义一个测试用例 "Should handle switching modes correctly"
	test("Should handle switching modes correctly", async function () {
		const timeout = 30000 // 超时时间 30 秒
		const interval = 1000 // 轮询间隔 1 秒

		// 检查全局扩展是否存在
		if (!globalThis.extension) {
			assert.fail("Extension not found") // 如果扩展不存在，则测试失败
		}

		try {
			let startTime = Date.now()

			// 确保 webview 已经启动
			while (Date.now() - startTime < timeout) {
				if (globalThis.provider.viewLaunched) {
					break // 如果 webview 已启动，则退出循环
				}

				await new Promise((resolve) => setTimeout(resolve, interval)) // 等待一段时间后继续检查
			}

			// 更新全局状态
			await globalThis.provider.updateGlobalState("mode", "Ask")
			await globalThis.provider.updateGlobalState("alwaysAllowModeSwitch", true)
			await globalThis.provider.updateGlobalState("autoApprovalEnabled", true)

			 // 启动一个新任务
			await globalThis.api.startNewTask(
				"For each mode (Code, Architect, Ask) respond with the mode name and what it specializes in after switching to that mode, do not start with the current mode, be sure to say 'I AM DONE' after the task is complete",
			)

			 // 等待任务出现在历史记录中并带有 tokens
			startTime = Date.now()

			while (Date.now() - startTime < timeout) {
				const messages = globalThis.provider.messages

				if (
					messages.some(
						({ type, text }) =>
							type === "say" && text?.includes("I AM DONE") && !text?.includes("be sure to say"),
					)
				) {
					break // 如果收到包含 "I AM DONE" 的消息，则退出循环
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
					({ type, text }) => type === "say" && text?.includes(`"request":"[switch_mode to 'code' because:`),
				),
				"Did not receive expected response containing 'Roo wants to switch to code mode'",
			)
			assert.ok(
				globalThis.provider.messages.some(
					({ type, text }) => type === "say" && text?.includes("software engineer"),
				),
				"Did not receive expected response containing 'I am Roo in Code mode, specializing in software engineering'",
			)

			assert.ok(
				globalThis.provider.messages.some(
					({ type, text }) =>
						type === "say" && text?.includes(`"request":"[switch_mode to 'architect' because:`),
				),
				"Did not receive expected response containing 'Roo wants to switch to architect mode'",
			)
			assert.ok(
				globalThis.provider.messages.some(
					({ type, text }) =>
						type === "say" && (text?.includes("technical planning") || text?.includes("technical leader")),
				),
				"Did not receive expected response containing 'I am Roo in Architect mode, specializing in analyzing codebases'",
			)

			assert.ok(
				globalThis.provider.messages.some(
					({ type, text }) => type === "say" && text?.includes(`"request":"[switch_mode to 'ask' because:`),
				),
				"Did not receive expected response containing 'Roo wants to switch to ask mode'",
			)
			assert.ok(
				globalThis.provider.messages.some(
					({ type, text }) =>
						type === "say" && (text?.includes("technical knowledge") || text?.includes("technical assist")),
				),
				"Did not receive expected response containing 'I am Roo in Ask mode, specializing in answering questions'",
			)
		} finally {
			// 清理操作（如果有）
		}
	})
})
