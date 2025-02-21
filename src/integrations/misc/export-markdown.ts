import { Anthropic } from "@anthropic-ai/sdk" // 导入 Anthropic SDK
import os from "os" // 导入 os 模块，用于操作系统相关操作
import * as path from "path" // 导入 path 模块，用于路径操作
import * as vscode from "vscode" // 导入 VSCode 模块
import * as fs from 'fs'; // 导入 fs 模块，用于文件系统操作

export async function downloadTask(dateTs: number, conversationHistory: Anthropic.MessageParam[]) {
	// 文件名
	const date = new Date(dateTs) // 创建日期对象
	const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase() // 获取月份
	const day = date.getDate() // 获取日期
	const year = date.getFullYear() // 获取年份
	let hours = date.getHours() // 获取小时
	const minutes = date.getMinutes().toString().padStart(2, "0") // 获取分钟并补齐
	const seconds = date.getSeconds().toString().padStart(2, "0") // 获取秒数并补齐
	const ampm = hours >= 12 ? "pm" : "am" // 判断上午还是下午
	hours = hours % 12 // 转换为 12 小时制
	hours = hours ? hours : 12 // 如果小时为 0，则设置为 12
	const fileName = `cline_task_${month}-${day}-${year}_${hours}-${minutes}-${seconds}-${ampm}.md` // 构建文件名

	// 生成 markdown 内容
	const markdownContent = conversationHistory
		.map((message) => {
			const role = message.role === "user" ? "**User:**" : "**Assistant:**" // 判断角色
			const content = Array.isArray(message.content)
				? message.content.map((block) => formatContentBlockToMarkdown(block)).join("\n") // 格式化内容块
				: message.content
			return `${role}\n\n${content}\n\n` // 返回格式化后的内容
		})
		.join("---\n\n") // 用分隔符连接

	// 提示用户选择保存位置
	const saveUri = await vscode.window.showSaveDialog({
		filters: { Markdown: ["md"] }, // 过滤器
		defaultUri: vscode.Uri.file(path.join(os.homedir(), "Downloads", fileName)), // 默认保存路径
	})

	if (saveUri) {
		// 将内容写入选定位置
		await vscode.workspace.fs.writeFile(saveUri, Buffer.from(markdownContent)) // 写入文件
		vscode.window.showTextDocument(saveUri, { preview: true }) // 显示文件
	}
}

export function formatContentBlockToMarkdown(
	block:
		| Anthropic.TextBlockParam
		| Anthropic.ImageBlockParam
		| Anthropic.ToolUseBlockParam
		| Anthropic.ToolResultBlockParam,
	// messages: Anthropic.MessageParam[]
): string {
	switch (block.type) {
		case "text":
			return block.text // 返回文本内容
		case "image":
			return `[Image]` // 返回图像占位符
		case "tool_use":
			let input: string
			if (typeof block.input === "object" && block.input !== null) {
				input = Object.entries(block.input)
					.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`) // 格式化输入
					.join("\n")
			} else {
				input = String(block.input) // 转换输入为字符串
			}
			return `[Tool Use: ${block.name}]\n${input}` // 返回工具使用信息
		case "tool_result":
			// 目前我们不进行工具名称查找，因为我们不再使用工具
			// const toolName = findToolName(block.tool_use_id, messages)
			const toolName = "Tool" // 工具名称
			if (typeof block.content === "string") {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}` // 返回工具结果
			} else if (Array.isArray(block.content)) {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content
					.map((contentBlock) => formatContentBlockToMarkdown(contentBlock)) // 格式化内容块
					.join("\n")}`
			} else {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]`
			}
		default:
			return "[Unexpected content type]" // 返回意外内容类型
	}
}

export function findToolName(toolCallId: string, messages: Anthropic.MessageParam[]): string {
	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "tool_use" && block.id === toolCallId) {
					return block.name // 返回工具名称
				}
			}
		}
	}
	return "Unknown Tool" // 返回未知工具
}

// 定义导出 Markdown 文件的函数
export async function exportMarkdown(content: string, fileName: string): Promise<void> {
    // 获取工作区文件夹路径
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open');
    }

    // 构建文件路径
    const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);

    // 写入文件
    await fs.promises.writeFile(filePath, content, 'utf8');

    // 显示信息消息
    vscode.window.showInformationMessage(`Markdown file exported to ${filePath}`);
}
