import * as vscode from "vscode" // 导入 VSCode 模块
import fs from "fs/promises" // 导入 fs/promises 模块，用于文件系统操作
import * as path from "path" // 导入 path 模块，用于路径操作

export async function selectImages(): Promise<string[]> {
	const options: vscode.OpenDialogOptions = {
		canSelectMany: true, // 允许选择多个文件
		openLabel: "Select", // 打开对话框的标签
		filters: {
			Images: ["png", "jpg", "jpeg", "webp"], // 支持的图像格式
		},
	}

	const fileUris = await vscode.window.showOpenDialog(options) // 显示打开对话框

	if (!fileUris || fileUris.length === 0) {
		return [] // 如果没有选择文件，返回空数组
	}

	return await Promise.all(
		fileUris.map(async (uri) => {
			const imagePath = uri.fsPath // 获取文件路径
			const buffer = await fs.readFile(imagePath) // 读取文件内容
			const base64 = buffer.toString("base64") // 将文件内容转换为 base64 编码
			const mimeType = getMimeType(imagePath) // 获取文件的 MIME 类型
			const dataUrl = `data:${mimeType};base64,${base64}` // 构建 data URL
			return dataUrl // 返回 data URL
		}),
	)
}

function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase() // 获取文件扩展名并转换为小写
	switch (ext) {
		case ".png":
			return "image/png" // 返回 PNG 的 MIME 类型
		case ".jpeg":
		case ".jpg":
			return "image/jpeg" // 返回 JPEG 的 MIME 类型
		case ".webp":
			return "image/webp" // 返回 WEBP 的 MIME 类型
		default:
			throw new Error(`Unsupported file type: ${ext}`) // 抛出不支持的文件类型错误
	}
}
