import { TerminalProcess, mergePromise } from "../TerminalProcess" // 导入 TerminalProcess 和 mergePromise 模块
import * as vscode from "vscode" // 导入 VSCode 模块
import { EventEmitter } from "events" // 导入事件发射器模块

// 模拟 vscode
jest.mock("vscode")

describe("TerminalProcess", () => {
	let terminalProcess: TerminalProcess
	let mockTerminal: jest.Mocked<
		vscode.Terminal & {
			shellIntegration: {
				executeCommand: jest.Mock
			}
		}
	>
	let mockExecution: any
	let mockStream: AsyncIterableIterator<string>

	beforeEach(() => {
		terminalProcess = new TerminalProcess() // 创建新的 TerminalProcess 实例

		// 创建正确类型的模拟终端
		mockTerminal = {
			shellIntegration: {
				executeCommand: jest.fn(), // 模拟 executeCommand 函数
			},
			name: "Mock Terminal", // 模拟终端名称
			processId: Promise.resolve(123), // 模拟进程 ID
			creationOptions: {}, // 模拟创建选项
			exitStatus: undefined, // 模拟退出状态
			state: { isInteractedWith: true }, // 模拟终端状态
			dispose: jest.fn(), // 模拟 dispose 函数
			hide: jest.fn(), // 模拟 hide 函数
			show: jest.fn(), // 模拟 show 函数
			sendText: jest.fn(), // 模拟 sendText 函数
		} as unknown as jest.Mocked<
			vscode.Terminal & {
				shellIntegration: {
					executeCommand: jest.Mock
				}
			}
		>

			// 重置事件监听器
		terminalProcess.removeAllListeners()
	})

	describe("run", () => {
		it("handles shell integration commands correctly", async () => {
			const lines: string[] = []
			terminalProcess.on("line", (line) => {
					// 跳过用于加载指示器的空行
				if (line !== "") {
					lines.push(line)
				}
			})

			// 使用 shell 集成序列模拟流数据
			mockStream = (async function* () {
				// 第一个数据块包含命令开始序列
				yield "Initial output\n"
				yield "More output\n"
				// 最后一个数据块包含命令结束序列
				yield "Final output"
			})()

			mockExecution = {
				read: jest.fn().mockReturnValue(mockStream), // 模拟 read 函数
			}

			mockTerminal.shellIntegration.executeCommand.mockReturnValue(mockExecution) // 模拟 executeCommand 函数返回值

			const completedPromise = new Promise<void>((resolve) => {
				terminalProcess.once("completed", resolve) // 监听 completed 事件
			})

			await terminalProcess.run(mockTerminal, "test command") // 运行命令
			await completedPromise // 等待命令完成

			expect(lines).toEqual(["Initial output", "More output", "Final output"]) // 断言输出行
			expect(terminalProcess.isHot).toBe(false) // 断言 isHot 属性
		})

		it("handles terminals without shell integration", async () => {
			const noShellTerminal = {
				sendText: jest.fn(), // 模拟 sendText 函数
				shellIntegration: undefined, // 没有 shell 集成
			} as unknown as vscode.Terminal

			const noShellPromise = new Promise<void>((resolve) => {
				terminalProcess.once("no_shell_integration", resolve) // 监听 no_shell_integration 事件
			})

			await terminalProcess.run(noShellTerminal, "test command") // 运行命令
			await noShellPromise // 等待命令完成

			expect(noShellTerminal.sendText).toHaveBeenCalledWith("test command", true) // 断言 sendText 函数被调用
		})

		it("sets hot state for compiling commands", async () => {
			const lines: string[] = []
			terminalProcess.on("line", (line) => {
				if (line !== "") {
					lines.push(line)
				}
			})

				// 创建一个在处理第一个数据块时解析的 promise
			const firstChunkProcessed = new Promise<void>((resolve) => {
				terminalProcess.on("line", () => resolve())
			})

			mockStream = (async function* () {
				yield "compiling...\n"
				// 等待以确保在第一个数据块之后进行热状态检查
				await new Promise((resolve) => setTimeout(resolve, 10))
				yield "still compiling...\n"
				yield "done"
			})()

			mockExecution = {
				read: jest.fn().mockReturnValue(mockStream), // 模拟 read 函数
			}

			mockTerminal.shellIntegration.executeCommand.mockReturnValue(mockExecution) // 模拟 executeCommand 函数返回值

			// 开始命令执行
			const runPromise = terminalProcess.run(mockTerminal, "npm run build")

			// 等待第一个数据块被处理
			await firstChunkProcessed

			// 编译时热状态应为 true
			expect(terminalProcess.isHot).toBe(true)

			// 完成执行
			const completedPromise = new Promise<void>((resolve) => {
				terminalProcess.once("completed", resolve) // 监听 completed 事件
			})

			await runPromise
			await completedPromise

			expect(lines).toEqual(["compiling...", "still compiling...", "done"]) // 断言输出行
		})
	})

	describe("buffer processing", () => {
		it("correctly processes and emits lines", () => {
			const lines: string[] = []
			terminalProcess.on("line", (line) => lines.push(line))

			// 模拟传入的数据块
			terminalProcess["emitIfEol"]("first line\n")
			terminalProcess["emitIfEol"]("second")
			terminalProcess["emitIfEol"](" line\n")
			terminalProcess["emitIfEol"]("third line")

			expect(lines).toEqual(["first line", "second line"])

			// 处理剩余的缓冲区
			terminalProcess["emitRemainingBufferIfListening"]()
			expect(lines).toEqual(["first line", "second line", "third line"])
		})

		it("handles Windows-style line endings", () => {
			const lines: string[] = []
			terminalProcess.on("line", (line) => lines.push(line))

			terminalProcess["emitIfEol"]("line1\r\nline2\r\n")

			expect(lines).toEqual(["line1", "line2"])
		})
	})

	describe("removeLastLineArtifacts", () => {
		it("removes terminal artifacts from output", () => {
			const cases = [
				["output%", "output"],
				["output$ ", "output"],
				["output#", "output"],
				["output> ", "output"],
				["multi\nline%", "multi\nline"],
				["no artifacts", "no artifacts"],
			]

			for (const [input, expected] of cases) {
				expect(terminalProcess["removeLastLineArtifacts"](input)).toBe(expected)
			}
		})
	})

	describe("continue", () => {
		it("stops listening and emits continue event", () => {
			const continueSpy = jest.fn()
			terminalProcess.on("continue", continueSpy)

			terminalProcess.continue()

			expect(continueSpy).toHaveBeenCalled()
			expect(terminalProcess["isListening"]).toBe(false)
		})
	})

	describe("getUnretrievedOutput", () => {
		it("returns and clears unretrieved output", () => {
			terminalProcess["fullOutput"] = "previous\nnew output"
			terminalProcess["lastRetrievedIndex"] = 9 // 在 "previous\n" 之后

			const unretrieved = terminalProcess.getUnretrievedOutput()

			expect(unretrieved).toBe("new output")
			expect(terminalProcess["lastRetrievedIndex"]).toBe(terminalProcess["fullOutput"].length)
		})
	})

	describe("mergePromise", () => {
		it("merges promise methods with terminal process", async () => {
			const process = new TerminalProcess()
			const promise = Promise.resolve()

			const merged = mergePromise(process, promise)

			expect(merged).toHaveProperty("then")
			expect(merged).toHaveProperty("catch")
			expect(merged).toHaveProperty("finally")
			expect(merged instanceof TerminalProcess).toBe(true)

			await expect(merged).resolves.toBeUndefined()
		})
	})
})
