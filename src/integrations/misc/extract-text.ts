import * as path from "path" // 导入 path 模块，用于路径操作
// @ts-ignore-next-line
import pdf from "pdf-parse/lib/pdf-parse" // 导入 pdf-parse 模块，用于解析 PDF 文件
import mammoth from "mammoth" // 导入 mammoth 模块，用于解析 DOCX 文件
import fs from "fs/promises" // 导入 fs/promises 模块，用于文件系统操作
import { isBinaryFile } from "isbinaryfile" // 导入 isbinaryfile 模块，用于检查文件是否为二进制文件

export async function extractTextFromFile(filePath: string): Promise<string> {
	try {
		await fs.access(filePath) // 检查文件是否存在
	} catch (error) {
		throw new Error(`File not found: ${filePath}`) // 抛出文件未找到错误
	}
	const fileExtension = path.extname(filePath).toLowerCase() // 获取文件扩展名并转换为小写
	switch (fileExtension) {
		case ".pdf":
			return extractTextFromPDF(filePath) // 提取 PDF 文件中的文本
		case ".docx":
			return extractTextFromDOCX(filePath) // 提取 DOCX 文件中的文本
		case ".ipynb":
			return extractTextFromIPYNB(filePath) // 提取 IPYNB 文件中的文本
		default:
			const isBinary = await isBinaryFile(filePath).catch(() => false) // 检查文件是否为二进制文件
			if (!isBinary) {
				return addLineNumbers(await fs.readFile(filePath, "utf8")) // 添加行号并返回文本内容
			} else {
				throw new Error(`Cannot read text for file type: ${fileExtension}`) // 抛出不支持的文件类型错误
			}
	}
}

async function extractTextFromPDF(filePath: string): Promise<string> {
	const dataBuffer = await fs.readFile(filePath) // 读取 PDF 文件内容
	const data = await pdf(dataBuffer) // 解析 PDF 文件
	return addLineNumbers(data.text) // 添加行号并返回文本内容
}

async function extractTextFromDOCX(filePath: string): Promise<string> {
	const result = await mammoth.extractRawText({ path: filePath }) // 解析 DOCX 文件
	return addLineNumbers(result.value) // 添加行号并返回文本内容
}

async function extractTextFromIPYNB(filePath: string): Promise<string> {
	const data = await fs.readFile(filePath, "utf8") // 读取 IPYNB 文件内容
	const notebook = JSON.parse(data) // 解析 JSON 数据
	let extractedText = ""

	for (const cell of notebook.cells) {
		if ((cell.cell_type === "markdown" || cell.cell_type === "code") && cell.source) {
			extractedText += cell.source.join("\n") + "\n" // 提取单元格内容
		}
	}

	return addLineNumbers(extractedText) // 添加行号并返回文本内容
}

export function addLineNumbers(content: string, startLine: number = 1): string {
	const lines = content.split("\n") // 按换行符分割内容
	const maxLineNumberWidth = String(startLine + lines.length - 1).length // 计算最大行号宽度
	return lines
		.map((line, index) => {
			const lineNumber = String(startLine + index).padStart(maxLineNumberWidth, " ") // 补齐行号
			return `${lineNumber} | ${line}` // 拼接行号和内容
		})
		.join("\n") // 重新连接行
}

// 检查内容中的每一行是否都有行号前缀（例如 "1 | content" 或 "123 | content"）
// 行号后必须跟一个管道字符（不是双管道）
export function everyLineHasLineNumbers(content: string): boolean {
	const lines = content.split(/\r?\n/) // 按换行符分割内容
	return lines.length > 0 && lines.every((line) => /^\s*\d+\s+\|(?!\|)/.test(line)) // 检查每一行是否都有行号
}

// 在保留实际内容的同时去除内容中的行号
// 处理格式如 "1 | content", " 12 | content", "123 | content"
// 保留自然以管道字符开头的内容
export function stripLineNumbers(content: string): string {
	// 分割成行以单独处理每一行
	const lines = content.split(/\r?\n/)

	// 处理每一行
	const processedLines = lines.map((line) => {
		// 匹配行号模式并捕获管道后的所有内容
		const match = line.match(/^\s*\d+\s+\|(?!\|)\s?(.*)$/)
		return match ? match[1] : line // 返回捕获的内容或原始行
	})

	// 使用原始换行符重新连接
	const lineEnding = content.includes("\r\n") ? "\r\n" : "\n"
	return processedLines.join(lineEnding) // 返回处理后的内容
}

/**
 * 截断多行输出，同时保留开头和结尾的上下文。
 * 当需要截断时，它会保留 20% 的开头行和 80% 的结尾行，
 * 并在中间添加一个清晰的指示，表明省略了多少行。
 *
 * @param content 要截断的多行字符串
 * @param lineLimit 可选的最大行数。如果未提供或为 0，则返回原始内容
 * @returns 截断后的字符串，带有省略行的指示，或原始内容（如果不需要截断）
 *
 * @example
 * // 对 25 行内容设置 10 行限制：
 * // - 保留前 2 行（10 的 20%）
 * // - 保留最后 8 行（10 的 80%）
 * // - 在中间添加 "[...15 lines omitted...]"
 */
export function truncateOutput(content: string, lineLimit?: number): string {
	if (!lineLimit) {
		return content // 如果没有行数限制，返回原始内容
	}

	const lines = content.split("\n") // 按换行符分割内容
	if (lines.length <= lineLimit) {
		return content // 如果行数在限制内，返回原始内容
	}

	const beforeLimit = Math.floor(lineLimit * 0.2) // 20% 的开头行数
	const afterLimit = lineLimit - beforeLimit // 剩余 80% 的结尾行数
	return [
		...lines.slice(0, beforeLimit), // 保留开头行
		`\n[...${lines.length - lineLimit} lines omitted...]\n`, // 添加省略行的指示
		...lines.slice(-afterLimit), // 保留结尾行
	].join("\n") // 重新连接行
}
