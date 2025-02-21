import { ClineMessage } from "./ExtensionMessage"

/**
 * 将命令和命令输出消息的序列组合在一起。
 *
 * 该函数处理一个 ClineMessages 对象数组，查找 'command' 消息后跟一个或多个 'command_output' 消息的序列。
 * 当找到这样的序列时，它将它们组合成一条消息，合并它们的文本内容。
 *
 * @param messages - 要处理的 ClineMessage 对象数组。
 * @returns 一个新的 ClineMessage 对象数组，组合了命令序列。
 *
 * @example
 * const messages: ClineMessage[] = [
 *   { type: 'ask', ask: 'command', text: 'ls', ts: 1625097600000 },
 *   { type: 'ask', ask: 'command_output', text: 'file1.txt', ts: 1625097601000 },
 *   { type: 'ask', ask: 'command_output', text: 'file2.txt', ts: 1625097602000 }
 * ];
 * const result = simpleCombineCommandSequences(messages);
 * // 结果: [{ type: 'ask', ask: 'command', text: 'ls\nfile1.txt\nfile2.txt', ts: 1625097600000 }]
 */
export function combineCommandSequences(messages: ClineMessage[]): ClineMessage[] {
	const combinedCommands: ClineMessage[] = []

	// 第一步：将命令与其输出组合
	for (let i = 0; i < messages.length; i++) {
		if (messages[i].type === "ask" && messages[i].ask === "command") {
			let combinedText = messages[i].text || ""
			let didAddOutput = false
			let j = i + 1

			while (j < messages.length) {
				if (messages[j].type === "ask" && messages[j].ask === "command") {
					// 如果遇到下一个命令，则停止
					break
				}
				if (messages[j].ask === "command_output" || messages[j].say === "command_output") {
					if (!didAddOutput) {
						// 在第一个输出之前添加换行符
						combinedText += `\n${COMMAND_OUTPUT_STRING}`
						didAddOutput = true
					}
					// 处理接收到空的 command_output 的情况（例如扩展放弃控制退出命令按钮时）
					const output = messages[j].text || ""
					if (output.length > 0) {
						combinedText += "\n" + output
					}
				}
				j++
			}

			combinedCommands.push({
				...messages[i],
				text: combinedText,
			})

			i = j - 1 // 移动到下一个命令或数组末尾之前的索引
		}
	}

	// 第二步：删除 command_outputs 并用组合的命令替换原始命令
	return messages
		.filter((msg) => !(msg.ask === "command_output" || msg.say === "command_output"))
		.map((msg) => {
			if (msg.type === "ask" && msg.ask === "command") {
				const combinedCommand = combinedCommands.find((cmd) => cmd.ts === msg.ts)
				return combinedCommand || msg
			}
			return msg
		})
}
export const COMMAND_OUTPUT_STRING = "Output:"
