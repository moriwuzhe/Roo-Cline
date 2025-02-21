import * as path from "path" // 导入 path 模块，用于路径操作
import * as os from "os" // 导入 os 模块，用于操作系统相关操作
import * as vscode from "vscode" // 导入 VSCode 模块
import { arePathsEqual } from "../../utils/path" // 导入路径比较工具函数

export async function openImage(dataUri: string) {
	const matches = dataUri.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/) // 匹配 data URI 格式
	if (!matches) {
		vscode.window.showErrorMessage("Invalid data URI format") // 显示错误消息
		return
	}
	const [, format, base64Data] = matches // 解构匹配结果
	const imageBuffer = Buffer.from(base64Data, "base64") // 将 base64 数据转换为缓冲区
	const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.${format}`) // 构建临时文件路径
	try {
		await vscode.workspace.fs.writeFile(vscode.Uri.file(tempFilePath), imageBuffer) // 写入临时文件
		await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tempFilePath)) // 打开临时文件
	} catch (error) {
		vscode.window.showErrorMessage(`Error opening image: ${error}`) // 显示错误消息
	}
}

interface OpenFileOptions {
	create?: boolean // 是否创建文件
	content?: string // 文件内容
}

export async function openFile(filePath: string, options: OpenFileOptions = {}) {
	try {
		// 获取工作区根目录
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!workspaceRoot) {
			throw new Error("No workspace root found") // 抛出错误
		}

		// 如果路径以 ./ 开头，则相对于工作区根目录解析
		const fullPath = filePath.startsWith("./") ? path.join(workspaceRoot, filePath.slice(2)) : filePath

		const uri = vscode.Uri.file(fullPath) // 创建文件 URI

		// 检查文件是否存在
		try {
			await vscode.workspace.fs.stat(uri)
		} catch {
			// 文件不存在
			if (!options.create) {
				throw new Error("File does not exist") // 抛出错误
			}

			// 使用提供的内容或空字符串创建文件
			const content = options.content || ""
			await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"))
		}

		// 检查文档是否已在活动编辑器的列中打开
		try {
			for (const group of vscode.window.tabGroups.all) {
				const existingTab = group.tabs.find(
					(tab) =>
						tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, uri.fsPath),
				)
				if (existingTab) {
					const activeColumn = vscode.window.activeTextEditor?.viewColumn
					const tabColumn = vscode.window.tabGroups.all.find((group) =>
						group.tabs.includes(existingTab),
					)?.viewColumn
					if (activeColumn && activeColumn !== tabColumn && !existingTab.isDirty) {
						await vscode.window.tabGroups.close(existingTab)
					}
					break
				}
			}
		} catch {} // 非必要操作，有时标签操作会失败

		const document = await vscode.workspace.openTextDocument(uri) // 打开文本文档
		await vscode.window.showTextDocument(document, { preview: false }) // 显示文本文档
	} catch (error) {
		if (error instanceof Error) {
			vscode.window.showErrorMessage(`Could not open file: ${error.message}`) // 显示错误消息
		} else {
			vscode.window.showErrorMessage(`Could not open file!`) // 显示错误消息
		}
	}
}
