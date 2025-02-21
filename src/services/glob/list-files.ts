import { globby, Options } from "globby" // 导入 globby 和 Options 模块
import os from "os" // 导入 os 模块
import * as path from "path" // 导入 path 模块
import { arePathsEqual } from "../../utils/path" // 导入 arePathsEqual 函数

export async function listFiles(dirPath: string, recursive: boolean, limit: number): Promise<[string[], boolean]> {
	const absolutePath = path.resolve(dirPath) // 将 dirPath 解析为绝对路径
	// 不允许列出根目录或主目录中的文件，当用户的提示不明确时，cline 往往会这样做。
	const root = process.platform === "win32" ? path.parse(absolutePath).root : "/" // 获取根目录
	const isRoot = arePathsEqual(absolutePath, root) // 检查是否为根目录
	if (isRoot) {
		return [[root], false] // 如果是根目录，返回根目录路径和 false
	}
	const homeDir = os.homedir() // 获取主目录
	const isHomeDir = arePathsEqual(absolutePath, homeDir) // 检查是否为主目录
	if (isHomeDir) {
		return [[homeDir], false] // 如果是主目录，返回主目录路径和 false
	}

	const dirsToIgnore = [
		"node_modules",
		"__pycache__",
		"env",
		"venv",
		"target/dependency",
		"build/dependencies",
		"dist",
		"out",
		"bundle",
		"vendor",
		"tmp",
		"temp",
		"deps",
		"pkg",
		"Pods",
		".*", // '!**/.*' 排除隐藏目录，而 '!**/.*/**' 仅排除其内容。这样我们至少可以知道隐藏目录的存在。
	].map((dir) => `**/${dir}/**`) // 将目录映射为 glob 模式

	const options = {
		cwd: dirPath, // 设置当前工作目录
		dot: true, // 不忽略隐藏文件/目录
		absolute: true, // 返回绝对路径
		markDirectories: true, // 在匹配的目录后面添加 /
		gitignore: recursive, // globby 忽略任何被 gitignore 忽略的文件
		ignore: recursive ? dirsToIgnore : undefined, // 如果没有 gitignore，我们忽略默认的目录
		onlyFiles: false, // 默认为 true，false 表示它也会列出单独的目录
	}
	// * 匹配一个目录中的所有文件，** 匹配嵌套目录中的文件
	const files = recursive ? await globbyLevelByLevel(limit, options) : (await globby("*", options)).slice(0, limit) // 根据是否递归列出文件
	return [files, files.length >= limit] // 返回文件列表和是否达到限制

}

// 广度优先遍历目录结构，逐级遍历直到达到限制：
async function globbyLevelByLevel(limit: number, options?: Options) {
	let results: Set<string> = new Set() // 使用 Set 存储结果，避免重复
	let queue: string[] = ["*"] // 初始化队列，开始模式为 *

	const globbingProcess = async () => {
		while (queue.length > 0 && results.size < limit) { // 当队列不为空且结果数量小于限制时
			const pattern = queue.shift()! // 从队列中取出一个模式
			const filesAtLevel = await globby(pattern, options) // 使用 globby 获取匹配的文件

			for (const file of filesAtLevel) {
				if (results.size >= limit) {
					break // 如果结果数量达到限制，跳出循环
				}
				results.add(file) // 将文件添加到结果集中
				if (file.endsWith("/")) {
					queue.push(`${file}*`) // 如果是目录，将其子目录添加到队列中
				}
			}
		}
		return Array.from(results).slice(0, limit) // 返回结果集的数组形式，限制数量
	}

	// 10 秒后超时并返回部分结果
	const timeoutPromise = new Promise<string[]>((_, reject) => {
		setTimeout(() => reject(new Error("Globbing timeout")), 10_000) // 设置超时
	})
	try {
		return await Promise.race([globbingProcess(), timeoutPromise]) // 竞赛执行 globbingProcess 和 timeoutPromise
	} catch (error) {
		console.warn("Globbing timed out, returning partial results") // 捕获超时错误并警告
		return Array.from(results) // 返回部分结果
	}
}
