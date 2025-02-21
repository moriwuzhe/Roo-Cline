import { EventEmitter } from "events" // 导入事件发射器模块
import stripAnsi from "strip-ansi" // 导入 strip-ansi 模块，用于去除 ANSI 转义码
import * as vscode from "vscode" // 导入 VSCode 模块

export interface TerminalProcessEvents {
	line: [line: string] // 行事件，包含一行输出
	continue: [] // 继续事件
	completed: [] // 完成事件
	error: [error: Error] // 错误事件，包含错误信息
	no_shell_integration: [] // 无 shell 集成事件
}

// 进程输出后等待多长时间才认为它“冷却”了
const PROCESS_HOT_TIMEOUT_NORMAL = 2_000 // 普通命令的冷却时间
const PROCESS_HOT_TIMEOUT_COMPILING = 15_000 // 编译命令的冷却时间

// 定义终端进程类
export class TerminalProcess extends EventEmitter<TerminalProcessEvents> {
	waitForShellIntegration: boolean = true // 是否等待 shell 集成
	private isListening: boolean = true // 是否正在监听
	private buffer: string = "" // 缓冲区
	private fullOutput: string = "" // 完整输出
	private lastRetrievedIndex: number = 0 // 最后检索的索引
	isHot: boolean = false // 是否处于热状态
	private hotTimer: NodeJS.Timeout | null = null // 热状态计时器
	private terminal: vscode.Terminal // 终端实例
	private command: string // 命令

	constructor(terminal: vscode.Terminal, command: string) {
		super()
		this.terminal = terminal
		this.command = command
	}

	// 运行命令
	async run() {
		if (this.terminal.shellIntegration && this.terminal.shellIntegration.executeCommand) {
			const execution = this.terminal.shellIntegration.executeCommand(this.command) // 执行命令
			const stream = execution.read() // 读取命令输出流
			// todo: 需要处理错误
			let isFirstChunk = true // 是否是第一个数据块
			let didOutputNonCommand = false // 是否输出了非命令内容
			let didEmitEmptyLine = false // 是否发出了空行
			for await (let data of stream) {
				// 1. 处理数据块并移除伪影
				if (isFirstChunk) {
					/*
					我们从这个流中获取的第一个数据块需要处理得更具可读性，即移除 VSCode 的自定义转义序列和标识符，移除重复的第一个字符错误等。
					*/

					// 错误：有时命令输出会进入 VSCode shell 集成元数据
					/*
					]633 是 VSCode shell 集成使用的自定义序列号：
					- OSC 633 ; A ST - 标记提示开始
					- OSC 633 ; B ST - 标记提示结束
					- OSC 633 ; C ST - 标记命令输出开始
					- OSC 633 ; D [; <exitcode>] ST - 标记执行完成并带有可选的退出代码
					- OSC 633 ; E ; <commandline> [; <nonce>] ST - 显式设置命令行并带有可选的随机数
					*/
					// 如果打印这些数据，你可能会看到类似 "eecho hello worldo hello world;5ba85d14-e92a-40c4-b2fd-71525581eeb0]633;C" 的内容，但这实际上只是一些转义序列，忽略到第一个 ;C 为止
					/* ddateb15026-6a64-40db-b21f-2a621a9830f0]633;CTue Sep 17 06:37:04 EDT 2024 % ]633;D;0]633;P;Cwd=/Users/saoud/Repositories/test */
					 // 获取 ]633;C（命令开始）和 ]633;D（命令结束）之间的输出
					const outputBetweenSequences = this.removeLastLineArtifacts(
						data.match(/\]633;C([\s\S]*?)\]633;D/)?.[1] || "", // 匹配并移除伪影
					).trim()

					// 一旦我们检索到序列之间的任何潜在输出，我们就可以移除到最后一个序列结束的所有内容
					// https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st
					const vscodeSequenceRegex = /\x1b\]633;.[^\x07]*\x07/g // 匹配 VSCode 自定义序列
					const lastMatch = [...data.matchAll(vscodeSequenceRegex)].pop() // 获取最后一个匹配项
					if (lastMatch && lastMatch.index !== undefined) {
						data = data.slice(lastMatch.index + lastMatch[0].length) // 移除 VSCode 序列
					}
					// 移除 VSCode 序列后将输出放回
					if (outputBetweenSequences) {
						data = outputBetweenSequences + "\n" + data
					}
					// 移除 ANSI 转义码
					data = stripAnsi(data)
					// 按换行符分割数据
					let lines = data ? data.split("\n") : []
					// 从第一行中移除不可读字符
					if (lines.length > 0) {
						lines[0] = lines[0].replace(/[^\x20-\x7E]/g, "")
					}
					// 如果前两个字符相同，则移除第一个字符
					if (lines.length > 0 && lines[0].length >= 2 && lines[0][0] === lines[0][1]) {
						lines[0] = lines[0].slice(1)
					}
					// 移除前两行的所有非字母数字字符
					if (lines.length > 0) {
						lines[0] = lines[0].replace(/^[^a-zA-Z0-9]*/, "")
					}
					if (lines.length > 1) {
						lines[1] = lines[1].replace(/^[^a-zA-Z0-9]*/, "")
					}
					// 重新连接行
					data = lines.join("\n")
					isFirstChunk = false // 标记第一个数据块已处理
				} else {
					data = stripAnsi(data) // 移除 ANSI 转义码
				}

				// 前几个数据块可能是命令被回显，因此我们必须忽略
				// 注意这意味着 'echo' 命令将不起作用
				if (!didOutputNonCommand) {
					const lines = data.split("\n")
					for (let i = 0; i < lines.length; i++) {
						if (this.command.includes(lines[i].trim())) {
							lines.splice(i, 1) // 移除命令回显
							i-- // 移除后调整索引
						} else {
							didOutputNonCommand = true // 标记已输出非命令内容
							break
						}
					}
					data = lines.join("\n")
				}

				// FIXME: 目前看来从 shell 集成流返回的数据块包含随机逗号，这似乎不是预期行为。这里必须有比仅移除所有逗号更好的解决方案。
				data = data.replace(/,/g, "") // 移除所有逗号

				// 2. 根据命令设置 isHot
				// 设置为热状态以延迟 API 请求，直到终端冷却
				this.isHot = true
				if (this.hotTimer) {
					clearTimeout(this.hotTimer) // 清除热状态计时器
				}
				// 这些标记表示命令是某种本地开发服务器重新编译应用程序，我们希望在发送请求到 cline 之前等待输出
				const compilingMarkers = ["compiling", "building", "bundling", "transpiling", "generating", "starting"]
				const markerNullifiers = [
					"compiled",
					"success",
					"finish",
					"complete",
					"succeed",
					"done",
					"end",
					"stop",
					"exit",
					"terminate",
					"error",
					"fail",
				]
				const isCompiling =
					compilingMarkers.some((marker) => data.toLowerCase().includes(marker.toLowerCase())) &&
					!markerNullifiers.some((nullifier) => data.toLowerCase().includes(nullifier.toLowerCase()))
				this.hotTimer = setTimeout(
					() => {
						this.isHot = false // 设置为冷状态
					},
					isCompiling ? PROCESS_HOT_TIMEOUT_COMPILING : PROCESS_HOT_TIMEOUT_NORMAL, // 根据是否在编译设置冷却时间
				)

				// 对于非立即返回的命令，我们希望立即显示加载指示器，但这不会在它发出换行符之前发生，因此一旦我们得到任何输出，我们就发出 "" 以通知 webview 显示指示器
				if (!didEmitEmptyLine && !this.fullOutput && data) {
					this.emit("line", "") // 发出空行以指示命令输出流的开始
					didEmitEmptyLine = true // 标记已发出空行
				}

				this.fullOutput += data // 添加数据到完整输出
				if (this.isListening) {
					this.emitIfEol(data) // 如果是监听状态，发出行事件
					this.lastRetrievedIndex = this.fullOutput.length - this.buffer.length // 更新最后检索索引
				}
			}

			this.emitRemainingBufferIfListening() // 如果是监听状态，发出剩余缓冲区

			// 目前我们不希望这延迟请求，因为我们不再自动发送诊断（之前：即使命令完成，我们仍希望将其视为“热”以便 API 请求延迟以让诊断赶上）
			if (this.hotTimer) {
				clearTimeout(this.hotTimer) // 清除热状态计时器
			}
			this.isHot = false // 设置为冷状态

			this.emit("completed") // 发出完成事件
			this.emit("continue") // 发出继续事件
		} else {
			this.terminal.sendText(this.command, true) // 发送命令文本
			// 对于没有 shell 集成的终端，我们无法知道命令何时完成
			// 因此我们将在延迟后发出继续事件
			this.emit("completed") // 发出完成事件
			this.emit("continue") // 发出继续事件
			this.emit("no_shell_integration") // 发出无 shell 集成事件
			// setTimeout(() => {
			// 	console.log(`Emitting continue after delay for terminal`)
			// 	// 无法发出完成事件，因为我们不知道命令是否实际完成，它可能仍在运行服务器
			// }, 500) // 根据需要调整此延迟
		}
	}

	// 处理命令输出
	handleOutput(callback: (line: string) => void): void {
		// 模拟处理输出
		// 实际实现中应使用 VSCode 提供的 API 来处理终端输出
	}

	// 终止进程
	terminate(): void {
		this.terminal.dispose()
	}

	// 受 https://github.com/sindresorhus/execa/blob/main/lib/transform/split.js 启发
	private emitIfEol(chunk: string) {
		this.buffer += chunk // 添加数据块到缓冲区
		let lineEndIndex: number
		while ((lineEndIndex = this.buffer.indexOf("\n")) !== -1) {
			let line = this.buffer.slice(0, lineEndIndex).trimEnd() // 移除行尾的 \r
			// 如果存在 \r，则移除（适用于 Windows 风格的换行符）
			// if (line.endsWith("\r")) {
			// 	line = line.slice(0, -1)
			// }
			this.emit("line", line) // 发出行事件
			this.buffer = this.buffer.slice(lineEndIndex + 1) // 更新缓冲区
		}
	}

	private emitRemainingBufferIfListening() {
		if (this.buffer && this.isListening) {
			const remainingBuffer = this.removeLastLineArtifacts(this.buffer) // 移除伪影
			if (remainingBuffer) {
				this.emit("line", remainingBuffer) // 发出行事件
			}
			this.buffer = "" // 清空缓冲区
			this.lastRetrievedIndex = this.fullOutput.length // 更新最后检索索引
		}
	}

	continue() {
		this.emitRemainingBufferIfListening() // 发出剩余缓冲区
		this.isListening = false // 设置为不监听
		this.removeAllListeners("line") // 移除所有行事件监听器
		this.emit("continue") // 发出继续事件
	}

	getUnretrievedOutput(): string {
		const unretrieved = this.fullOutput.slice(this.lastRetrievedIndex) // 获取未检索的输出
		this.lastRetrievedIndex = this.fullOutput.length // 更新最后检索索引
		return this.removeLastLineArtifacts(unretrieved) // 移除伪影并返回
	}

	// 一些处理以移除缓冲区末尾的伪影（似乎由于 VSCode 在终端的新行开头使用 %，它进入了流）
	// 此修改将移除 '%', '$', '#', 或 '>' 后跟可选的空白字符
	removeLastLineArtifacts(output: string) {
		const lines = output.trimEnd().split("\n") // 按换行符分割并移除末尾空白
		if (lines.length > 0) {
			const lastLine = lines[lines.length - 1]
			// 移除提示字符和末尾空白
			lines[lines.length - 1] = lastLine.replace(/[%$#>]\s*$/, "")
		}
		return lines.join("\n").trimEnd() // 重新连接行并移除末尾空白
	}
}

export type TerminalProcessResultPromise = TerminalProcess & Promise<void>

// 类似于 execa 的 ResultPromise，这让我们可以创建 TerminalProcess 和 Promise 的混合体：https://github.com/sindresorhus/execa/blob/main/lib/methods/promise.js
export function mergePromise(process: TerminalProcess, promise: Promise<void>): TerminalProcessResultPromise {
	const nativePromisePrototype = (async () => {})().constructor.prototype
	const descriptors = ["then", "catch", "finally"].map(
		(property) => [property, Reflect.getOwnPropertyDescriptor(nativePromisePrototype, property)] as const,
	)
	for (const [property, descriptor] of descriptors) {
		if (descriptor) {
			const value = descriptor.value.bind(promise)
			Reflect.defineProperty(process, property, { ...descriptor, value })
		}
	}
	return process as TerminalProcessResultPromise
}
