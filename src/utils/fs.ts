import fs from "fs/promises" // 导入 fs/promises 模块
import * as path from "path" // 导入路径模块

/**
 * 异步创建给定文件路径的所有不存在的子目录
 * 并将它们收集到一个数组中以便稍后删除。
 *
 * @param filePath - 文件的完整路径。
 * @returns 一个 Promise，解析为新创建的目录数组。
 */
export async function createDirectoriesForFile(filePath: string): Promise<string[]> {
	const newDirectories: string[] = []
	const normalizedFilePath = path.normalize(filePath) // 规范化路径以实现跨平台兼容性
	const directoryPath = path.dirname(normalizedFilePath)

	let currentPath = directoryPath
	const dirsToCreate: string[] = []

	// 向上遍历目录树并收集缺失的目录
	while (!(await fileExistsAtPath(currentPath))) {
		dirsToCreate.push(currentPath)
		currentPath = path.dirname(currentPath)
	}

	// 从最上层的缺失目录到目标目录依次创建目录
	for (let i = dirsToCreate.length - 1; i >= 0; i--) {
		await fs.mkdir(dirsToCreate[i])
		newDirectories.push(dirsToCreate[i])
	}

	return newDirectories
}

/**
 * 辅助函数检查路径是否存在。
 *
 * @param path - 要检查的路径。
 * @returns 一个 Promise，解析为 true 如果路径存在，否则为 false。
 */
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath) // 检查路径是否可访问
		return true
	} catch {
		return false
	}
}
