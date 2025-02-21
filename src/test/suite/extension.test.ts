import * as assert from "assert"
import * as vscode from "vscode"

// 定义测试套件 "Roo Code Extension"
suite("Roo Code Extension", () => {
	// 测试 OPENROUTER_API_KEY 环境变量是否设置
	test("OPENROUTER_API_KEY environment variable is set", () => {
		if (!process.env.OPENROUTER_API_KEY) {
			assert.fail("OPENROUTER_API_KEY environment variable is not set") // 如果环境变量未设置，则测试失败
		}
	})

	// 测试命令是否已注册
	test("Commands should be registered", async () => {
		const timeout = 10 * 1_000 // 超时时间 10 秒
		const interval = 1_000 // 轮询间隔 1 秒
		const startTime = Date.now()

		const expectedCommands = [
			"roo-cline.plusButtonClicked",
			"roo-cline.mcpButtonClicked",
			"roo-cline.historyButtonClicked",
			"roo-cline.popoutButtonClicked",
			"roo-cline.settingsButtonClicked",
			"roo-cline.openInNewTab",
			"roo-cline.explainCode",
			"roo-cline.fixCode",
			"roo-cline.improveCode",
		]

		while (Date.now() - startTime < timeout) {
			const commands = await vscode.commands.getCommands(true)
			const missingCommands = []

			for (const cmd of expectedCommands) {
				if (!commands.includes(cmd)) {
					missingCommands.push(cmd) // 如果命令未注册，则添加到缺失命令列表
				}
			}

			if (missingCommands.length === 0) {
				break // 如果所有命令都已注册，则退出循环
			}

			await new Promise((resolve) => setTimeout(resolve, interval)) // 等待一段时间后继续检查
		}

		const commands = await vscode.commands.getCommands(true)

		for (const cmd of expectedCommands) {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`) // 检查每个命令是否已注册
		}
	})
})
