import pWaitFor from "p-wait-for" // 导入 p-wait-for 模块，用于等待条件满足
import * as vscode from "vscode" // 导入 VSCode 模块
import { arePathsEqual } from "../../utils/path" // 导入路径比较工具函数
import { mergePromise, TerminalProcess, TerminalProcessResultPromise } from "./TerminalProcess" // 导入 TerminalProcess 相关模块
import { TerminalInfo, TerminalRegistry } from "./TerminalRegistry" // 导入 TerminalRegistry 相关模块

/*
TerminalManager:
- 创建/重用终端
- 通过 runCommand() 运行命令，返回一个 TerminalProcess
- 处理 shell 集成事件

TerminalProcess 继承自 EventEmitter 并实现 Promise:
- 在 promise 挂起时发出 'line' 事件，包含输出
- process.continue() 解析 promise 并停止事件发射
- 允许实时输出处理或后台执行

getUnretrievedOutput() 获取正在进行的命令的最新输出

启用灵活的命令执行：
- 等待完成
- 监听实时事件
- 在后台继续执行
- 稍后检索错过的输出

注意：
- 事实证明，一些 shellIntegration API 在 Cursor 上可用，尽管在旧版本的 VSCode 上不可用
- “默认情况下，shell 集成脚本应在从 VS Code 启动的受支持 shell 上自动激活。”
支持的 shell：
Linux/macOS: bash, fish, pwsh, zsh
Windows: pwsh

示例：

const terminalManager = new TerminalManager(context);

// 运行命令
const process = terminalManager.runCommand('npm install', '/path/to/project');

process.on('line', (line) => {
    console.log(line);
});

// 等待进程自然完成：
await process;

// 或者继续执行，即使命令仍在运行：
process.continue();

// 稍后，如果需要获取未检索的输出：
const unretrievedOutput = terminalManager.getUnretrievedOutput(terminalId);
console.log('Unretrieved output:', unretrievedOutput);

资源：
- https://github.com/microsoft/vscode/issues/226655
- https://code.visualstudio.com/updates/v1_93#_terminal-shell-integration-api
- https://code.visualstudio.com/docs/terminal/shell-integration
- https://code.visualstudio.com/api/references/vscode-api#Terminal
- https://github.com/microsoft/vscode-extension-samples/blob/main/terminal-sample/src/extension.ts
- https://github.com/microsoft/vscode-extension-samples/blob/main/shell-integration-sample/src/extension.ts
*/

/*
新的 shellIntegration API 使我们能够处理终端命令执行输出。
然而，我们不会更新我们的 VSCode 类型定义或引擎要求，以保持与旧版本 VSCode 的兼容性。使用旧版本的用户将自动回退到使用 sendText 进行终端命令执行。
有趣的是，一些环境如 Cursor 即使没有最新的 VSCode 引擎也能启用这些 API。
这种方法允许我们在可用时利用高级功能，同时确保广泛的兼容性。
*/
declare module "vscode" {
	// https://github.com/microsoft/vscode/blob/f0417069c62e20f3667506f4b7e53ca0004b4e3e/src/vscode-dts/vscode.d.ts#L10794
	interface Window {
		onDidStartTerminalShellExecution?: (
			listener: (e: any) => any,
			thisArgs?: any,
			disposables?: vscode.Disposable[],
		) => vscode.Disposable // 声明 onDidStartTerminalShellExecution 事件
	}
}

// 扩展 Terminal 类型以包含我们的自定义属性
type ExtendedTerminal = vscode.Terminal & {
	shellIntegration?: {
		cwd?: vscode.Uri // 当前工作目录
		executeCommand?: (command: string) => {
			read: () => AsyncIterable<string> // 执行命令并读取输出
		}
	}
}

export class TerminalManager {
	private terminalIds: Set<number> = new Set() // 存储终端 ID 的集合
	private processes: Map<number, TerminalProcess> = new Map() // 存储终端进程的映射
	private disposables: vscode.Disposable[] = [] // 存储可释放资源的数组

	constructor() {
		let disposable: vscode.Disposable | undefined
		try {
			disposable = (vscode.window as vscode.Window).onDidStartTerminalShellExecution?.(async (e) => {
				// 在这里创建读取流会产生更一致的输出。这在运行 `date` 命令时最为明显。
				e?.execution?.read()
			})
		} catch (error) {
			// console.error("设置 onDidEndTerminalShellExecution 时出错", error)
		}
		if (disposable) {
			this.disposables.push(disposable) // 将可释放资源添加到数组中
		}
	}

	runCommand(terminalInfo: TerminalInfo, command: string): TerminalProcessResultPromise {
		terminalInfo.busy = true // 将终端状态设置为繁忙
		terminalInfo.lastCommand = command // 设置最后执行的命令
		const process = new TerminalProcess() // 创建新的终端进程
		this.processes.set(terminalInfo.id, process) // 将终端进程添加到映射中

		process.once("completed", () => {
			terminalInfo.busy = false // 命令完成后将终端状态设置为不繁忙
		})

		// 如果 shell 集成不可用，移除终端以防止重用，因为它可能正在运行一个长时间运行的进程
		process.once("no_shell_integration", () => {
			console.log(`收到终端 ${terminalInfo.id} 的 no_shell_integration`)
			// 移除终端以防止重用（以防它正在运行一个长时间运行的进程）
			TerminalRegistry.removeTerminal(terminalInfo.id)
			this.terminalIds.delete(terminalInfo.id)
			this.processes.delete(terminalInfo.id)
		})

		const promise = new Promise<void>((resolve, reject) => {
			process.once("continue", () => {
				resolve() // 解析 promise
			})
			process.once("error", (error) => {
				console.error(`终端 ${terminalInfo.id} 出现错误:`, error)
				reject(error) // 拒绝 promise
			})
		})

		// 如果 shell 集成已激活，立即运行命令
		const terminal = terminalInfo.terminal as ExtendedTerminal
		if (terminal.shellIntegration) {
			process.waitForShellIntegration = false
			process.run(terminal, command)
		} else {
			// 文档建议等待 3 秒以激活 shell 集成
			pWaitFor(() => (terminalInfo.terminal as ExtendedTerminal).shellIntegration !== undefined, {
				timeout: 4000,
			}).finally(() => {
				const existingProcess = this.processes.get(terminalInfo.id)
				if (existingProcess && existingProcess.waitForShellIntegration) {
					existingProcess.waitForShellIntegration = false
					existingProcess.run(terminal, command)
				}
			})
		}

		return mergePromise(process, promise) // 合并终端进程和 promise
	}

	async getOrCreateTerminal(cwd: string): Promise<TerminalInfo> {
		const terminals = TerminalRegistry.getAllTerminals() // 获取所有终端

		// 首先从我们的池中查找可用终端（为此任务创建的）
		const matchingTerminal = terminals.find((t) => {
			if (t.busy) {
				return false // 如果终端繁忙，返回 false
			}
			const terminal = t.terminal as ExtendedTerminal
			const terminalCwd = terminal.shellIntegration?.cwd // 终端的当前工作目录可能已被 cline 的命令更改
			if (!terminalCwd) {
				return false // 如果没有工作目录，返回 false
			}
			return arePathsEqual(vscode.Uri.file(cwd).fsPath, terminalCwd.fsPath) // 比较路径是否相同
		})
		if (matchingTerminal) {
			this.terminalIds.add(matchingTerminal.id) // 添加终端 ID 到集合中
			return matchingTerminal // 返回匹配的终端
		}

		// 如果没有匹配的终端，尝试查找任何不繁忙的终端
		const availableTerminal = terminals.find((t) => !t.busy)
		if (availableTerminal) {
			// 导航回到所需目录
			await this.runCommand(availableTerminal, `cd "${cwd}"`)
			this.terminalIds.add(availableTerminal.id) // 添加终端 ID 到集合中
			return availableTerminal // 返回可用的终端
		}

		// 如果所有终端都繁忙，创建一个新的终端
		const newTerminalInfo = TerminalRegistry.createTerminal(cwd)
		this.terminalIds.add(newTerminalInfo.id) // 添加新终端 ID 到集合中
		return newTerminalInfo // 返回新终端信息
	}

	getTerminals(busy: boolean): { id: number; lastCommand: string }[] {
		return Array.from(this.terminalIds)
			.map((id) => TerminalRegistry.getTerminal(id)) // 获取终端信息
			.filter((t): t is TerminalInfo => t !== undefined && t.busy === busy) // 过滤终端信息
			.map((t) => ({ id: t.id, lastCommand: t.lastCommand })) // 映射终端信息
	}

	getUnretrievedOutput(terminalId: number): string {
		if (!this.terminalIds.has(terminalId)) {
			return "" // 如果终端 ID 不存在，返回空字符串
		}
		const process = this.processes.get(terminalId)
		return process ? process.getUnretrievedOutput() : "" // 获取未检索的输出
	}

	isProcessHot(terminalId: number): boolean {
		const process = this.processes.get(terminalId)
		return process ? process.isHot : false // 检查进程是否处于热状态
	}

	disposeAll() {
		// for (const info of this.terminals) {
		// 	//info.terminal.dispose() // 不希望在任务中止时释放终端
		// }
		this.terminalIds.clear() // 清空终端 ID 集合
		this.processes.clear() // 清空终端进程映射
		this.disposables.forEach((disposable) => disposable.dispose()) // 释放所有可释放资源
		this.disposables = [] // 清空可释放资源数组
	}

	/**
	 * 根据要包含的命令数量获取终端内容
	 * @param commands 要包含的前一个命令的数量（-1 表示全部）
	 * @returns 选定的终端内容
	 */
	public async getTerminalContents(commands = -1): Promise<string> {
		// 保存当前剪贴板内容
		const tempCopyBuffer = await vscode.env.clipboard.readText()

		try {
			// 选择终端内容
			if (commands < 0) {
				await vscode.commands.executeCommand("workbench.action.terminal.selectAll")
			} else {
				for (let i = 0; i < commands; i++) {
					await vscode.commands.executeCommand("workbench.action.terminal.selectToPreviousCommand")
				}
			}

			// 复制选择并清除它
			await vscode.commands.executeCommand("workbench.action.terminal.copySelection")
			await vscode.commands.executeCommand("workbench.action.terminal.clearSelection")

			// 获取复制的内容
			let terminalContents = (await vscode.env.clipboard.readText()).trim()

			// 恢复原始剪贴板内容
			await vscode.env.clipboard.writeText(tempCopyBuffer)

			if (tempCopyBuffer === terminalContents) {
				// 没有复制终端内容
				return ""
			}

			// 处理多行内容
			const lines = terminalContents.split("\n")
			const lastLine = lines.pop()?.trim()
			if (lastLine) {
				let i = lines.length - 1
				while (i >= 0 && !lines[i].trim().startsWith(lastLine)) {
					i--
				}
				terminalContents = lines.slice(Math.max(i, 0)).join("\n")
			}

			return terminalContents
		} catch (error) {
			// 确保即使发生错误也能恢复剪贴板
			await vscode.env.clipboard.writeText(tempCopyBuffer)
			throw error
		}
	}
}
