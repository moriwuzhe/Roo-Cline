import { Anthropic } from "@anthropic-ai/sdk"
import * as path from "path"
import * as diff from "diff"

// 定义一个对象，包含各种格式化响应的方法
export const formatResponse = {
	// 工具被拒绝时的响应
	toolDenied: () => `The user denied this operation.`,

	// 工具被拒绝并提供反馈时的响应
	toolDeniedWithFeedback: (feedback?: string) =>
		`The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`,

	// 工具被批准并提供反馈时的响应
	toolApprovedWithFeedback: (feedback?: string) =>
		`The user approved this operation and provided the following context:\n<feedback>\n${feedback}\n</feedback>`,

	// 工具执行失败时的响应
	toolError: (error?: string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`,

	// 未使用工具时的响应
	noToolsUsed: () =>
		`[ERROR] You did not use a tool in your previous response! Please retry with a tool use.

${toolUseInstructionsReminder}

# Next Steps

If you have completed the user's task, use the attempt_completion tool. 
If you require additional information from the user, use the ask_followup_question tool. 
Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. 
(This is an automated message, so do not respond to it conversationally.)`,

	// 出现太多错误时的响应
	tooManyMistakes: (feedback?: string) =>
		`You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,

	// 缺少工具参数时的响应
	missingToolParameterError: (paramName: string) =>
		`Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${toolUseInstructionsReminder}`,

	// MCP 工具参数无效时的响应
	invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
		`Invalid JSON argument used with ${serverName} for ${toolName}. Please retry with a properly formatted JSON argument.`,

	// 工具结果的响应
	toolResult: (
		text: string,
		images?: string[],
	): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
		if (images && images.length > 0) {
			const textBlock: Anthropic.TextBlockParam = { type: "text", text }
			const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
			// 将图像放在文本之后会得到更好的结果
			return [textBlock, ...imageBlocks]
		} else {
			return text
		}
	},

	// 图像块的响应
	imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
		return formatImagesIntoBlocks(images)
	},

	// 格式化文件列表的响应
	formatFilesList: (absolutePath: string, files: string[], didHitLimit: boolean): string => {
		const sorted = files
			.map((file) => {
				// 将绝对路径转换为相对路径
				const relativePath = path.relative(absolutePath, file).toPosix()
				return file.endsWith("/") ? relativePath + "/" : relativePath
			})
			// 排序，使文件按其各自的目录列出，以便清楚哪些文件是哪些目录的子文件。由于我们从上到下构建文件列表，即使文件列表被截断，它也会显示可以进一步探索的目录。
			.sort((a, b) => {
				const aParts = a.split("/") // 仅在我们先使用 toPosix 时有效
				const bParts = b.split("/")
				for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
					if (aParts[i] !== bParts[i]) {
						// 如果其中一个在此级别是目录而另一个不是，则先排序目录
						if (i + 1 === aParts.length && i + 1 < bParts.length) {
							return -1
						}
						if (i + 1 === bParts.length && i + 1 < aParts.length) {
							return 1
						}
						// 否则按字母顺序排序
						return aParts[i].localeCompare(bParts[i], undefined, { numeric: true, sensitivity: "base" })
					}
				}
				// 如果所有部分在较短路径的长度内都相同，则较短的路径排在前面
				return aParts.length - bParts.length
			})
		if (didHitLimit) {
			return `${sorted.join(
				"\n",
			)}\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)`
		} else if (sorted.length === 0 || (sorted.length === 1 && sorted[0] === "")) {
			return "No files found."
		} else {
			return sorted.join("\n")
		}
	},

	// 创建漂亮的补丁的响应
	createPrettyPatch: (filename = "file", oldStr?: string, newStr?: string) => {
		// 字符串不能为 undefined，否则 diff 会抛出异常
		const patch = diff.createPatch(filename.toPosix(), oldStr || "", newStr || "")
		const lines = patch.split("\n")
		const prettyPatchLines = lines.slice(4)
		return prettyPatchLines.join("\n")
	},
}

// 为避免循环依赖，定义一个辅助函数，将图像格式化为块
const formatImagesIntoBlocks = (images?: string[]): Anthropic.ImageBlockParam[] => {
	return images
		? images.map((dataUrl) => {
				// data:image/png;base64,base64string
				const [rest, base64] = dataUrl.split(",")
				const mimeType = rest.split(":")[1].split(";")[0]
				return {
					type: "image",
					source: { type: "base64", media_type: mimeType, data: base64 },
				} as Anthropic.ImageBlockParam
			})
		: []
}

// 工具使用说明提醒
const toolUseInstructionsReminder = `# Reminder: Instructions for Tool Use

Tool uses are formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

Always adhere to this format for all tool uses to ensure proper parsing and execution.`
