import * as vscode from "vscode" // 导入 VS Code API
import { ClineProvider } from "../core/webview/ClineProvider" // 导入 ClineProvider
import { TerminalManager } from "../integrations/terminal/TerminalManager" // 导入 TerminalManager

const TERMINAL_COMMAND_IDS = {
	ADD_TO_CONTEXT: "roo-cline.terminalAddToContext", // 添加到上下文命令 ID
	FIX: "roo-cline.terminalFixCommand", // 修复命令 ID
	FIX_IN_CURRENT_TASK: "roo-cline.terminalFixCommandInCurrentTask", // 在当前任务中修复命令 ID
	EXPLAIN: "roo-cline.terminalExplainCommand", // 解释命令 ID
	EXPLAIN_IN_CURRENT_TASK: "roo-cline.terminalExplainCommandInCurrentTask", // 在当前任务中解释命令 ID
} as const

export const registerTerminalActions = (context: vscode.ExtensionContext) => {
	const terminalManager = new TerminalManager() // 创建 TerminalManager 实例

	registerTerminalAction(context, terminalManager, TERMINAL_COMMAND_IDS.ADD_TO_CONTEXT, "TERMINAL_ADD_TO_CONTEXT") // 注册添加到上下文命令

	registerTerminalActionPair(
		context,
		terminalManager,
		TERMINAL_COMMAND_IDS.FIX,
		"TERMINAL_FIX",
		"What would you like Roo to fix?", // 注册修复命令对
	)

	registerTerminalActionPair(
		context,
		terminalManager,
		TERMINAL_COMMAND_IDS.EXPLAIN,
		"TERMINAL_EXPLAIN",
		"What would you like Roo to explain?", // 注册解释命令对
	)
}

const registerTerminalAction = (
	context: vscode.ExtensionContext,
	terminalManager: TerminalManager,
	command: string,
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN", // 提示类型
	inputPrompt?: string, // 输入提示
) => {
	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (args: any) => {
			let content = args.selection // 获取选中的内容
			if (!content || content === "") {
				content = await terminalManager.getTerminalContents(promptType === "TERMINAL_ADD_TO_CONTEXT" ? -1 : 1) // 获取终端内容
			}

			if (!content) {
				vscode.window.showWarningMessage("No terminal content selected") // 如果没有选中的内容，显示警告消息
				return
			}

			const params: Record<string, any> = {
				terminalContent: content, // 终端内容
			}

			if (inputPrompt) {
				params.userInput =
					(await vscode.window.showInputBox({
						prompt: inputPrompt, // 显示输入框提示
					})) ?? ""
			}

			await ClineProvider.handleTerminalAction(command, promptType, params) // 处理终端操作
		}),
	)
}

const registerTerminalActionPair = (
	context: vscode.ExtensionContext,
	terminalManager: TerminalManager,
	baseCommand: string,
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN", // 提示类型
	inputPrompt?: string, // 输入提示
) => {
	// Register new task version
	// 注册新任务版本
	registerTerminalAction(context, terminalManager, baseCommand, promptType, inputPrompt)
	// Register current task version
	// 注册当前任务版本
	registerTerminalAction(context, terminalManager, `${baseCommand}InCurrentTask`, promptType, inputPrompt)
}
