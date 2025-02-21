import * as vscode from "vscode" // 导入 VSCode 模块
import * as childProcess from "child_process" // 导入子进程模块
import * as path from "path" // 导入路径模块
import * as fs from "fs" // 导入文件系统模块
import * as readline from "readline" // 导入 readline 模块

/*
此文件提供使用 ripgrep 在文件上执行正则表达式搜索的功能。
灵感来源：https://github.com/DiscreteTom/vscode-ripgrep-utils

关键组件：
1. getBinPath: 在 VSCode 安装中定位 ripgrep 二进制文件。
2. execRipgrep: 执行 ripgrep 命令并返回输出。
3. regexSearchFiles: 执行文件上的正则表达式搜索的主要函数。
   - 参数：
     * cwd: 当前工作目录（用于相对路径计算）
     * directoryPath: 要搜索的目录
     * regex: 要搜索的正则表达式（Rust 正则表达式语法）
     * filePattern: 可选的全局模式以过滤文件（默认：'*'）
   - 返回：包含上下文的格式化搜索结果字符串

搜索结果包括：
- 相对文件路径
- 每个匹配项之前和之后的 2 行上下文
- 使用管道字符格式化的匹配项，便于阅读

使用示例：
const results = await regexSearchFiles('/path/to/cwd', '/path/to/search', 'TODO:', '*.ts');

rel/path/to/app.ts
│----
│function processData(data: any) {
│  // Some processing logic here
│  // TODO: Implement error handling
│  return processedData;
│}
│----

rel/path/to/helper.ts
│----
│  let result = 0;
│  for (let i = 0; i < input; i++) {
│    // TODO: Optimize this function for performance
│    result += Math.pow(i, 2);
│  }
│----
*/

const isWindows = /^win/.test(process.platform) // 检查当前平台是否为 Windows
const binName = isWindows ? "rg.exe" : "rg" // 根据平台设置 ripgrep 二进制文件名

interface SearchResult {
	file: string // 文件路径
	line: number // 行号
	column: number // 列号
	match: string // 匹配的文本
	beforeContext: string[] // 匹配项之前的上下文
	afterContext: string[] // 匹配项之后的上下文
}

const MAX_RESULTS = 300 // 最大结果数

async function getBinPath(vscodeAppRoot: string): Promise<string | undefined> {
	const checkPath = async (pkgFolder: string) => {
		const fullPath = path.join(vscodeAppRoot, pkgFolder, binName) // 拼接完整路径
		return (await pathExists(fullPath)) ? fullPath : undefined // 检查路径是否存在
	}

	return (
		(await checkPath("node_modules/@vscode/ripgrep/bin/")) ||
		(await checkPath("node_modules/vscode-ripgrep/bin")) ||
		(await checkPath("node_modules.asar.unpacked/vscode-ripgrep/bin/")) ||
		(await checkPath("node_modules.asar.unpacked/@vscode/ripgrep/bin/"))
	)
}

async function pathExists(path: string): Promise<boolean> {
	return new Promise((resolve) => {
		fs.access(path, (err) => {
			resolve(err === null) // 检查路径是否可访问
		})
	})
}

async function execRipgrep(bin: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(bin, args) // 启动 ripgrep 进程
		const rl = readline.createInterface({
			input: rgProcess.stdout, // 读取 ripgrep 标准输出
			crlfDelay: Infinity, // 处理跨平台的换行符
		})

		let output = ""
		let lineCount = 0
		const maxLines = MAX_RESULTS * 5 // 限制 ripgrep 输出的最大行数

		rl.on("line", (line) => {
			if (lineCount < maxLines) {
				output += line + "\n" // 收集输出
				lineCount++
			} else {
				rl.close() // 关闭 readline 接口
				rgProcess.kill() // 终止 ripgrep 进程
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString() // 收集错误输出
		})
		rl.on("close", () => {
			if (errorOutput) {
				reject(new Error(`ripgrep process error: ${errorOutput}`)) // 处理错误
			} else {
				resolve(output) // 返回输出
			}
		})
		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`)) // 处理进程错误
		})
	})
}

export async function regexSearchFiles(
	cwd: string,
	directoryPath: string,
	regex: string,
	filePattern?: string,
): Promise<string> {
	const vscodeAppRoot = vscode.env.appRoot // 获取 VSCode 应用根目录
	const rgPath = await getBinPath(vscodeAppRoot) // 获取 ripgrep 二进制文件路径

	if (!rgPath) {
		throw new Error("Could not find ripgrep binary") // 找不到 ripgrep 二进制文件时抛出错误
	}

	const args = ["--json", "-e", regex, "--glob", filePattern || "*", "--context", "1", directoryPath] // 设置 ripgrep 参数

	let output: string
	try {
		output = await execRipgrep(rgPath, args) // 执行 ripgrep 命令
	} catch {
		return "No results found" // 处理没有结果的情况
	}
	const results: SearchResult[] = []
	let currentResult: Partial<SearchResult> | null = null

	output.split("\n").forEach((line) => {
		if (line) {
			try {
				const parsed = JSON.parse(line) // 解析 JSON 输出
				if (parsed.type === "match") {
					if (currentResult) {
						results.push(currentResult as SearchResult) // 添加当前结果
					}
					currentResult = {
						file: parsed.data.path.text, // 文件路径
						line: parsed.data.line_number, // 行号
						column: parsed.data.submatches[0].start, // 列号
						match: parsed.data.lines.text, // 匹配的文本
						beforeContext: [], // 匹配项之前的上下文
						afterContext: [], // 匹配项之后的上下文
					}
				} else if (parsed.type === "context" && currentResult) {
					if (parsed.data.line_number < currentResult.line!) {
						currentResult.beforeContext!.push(parsed.data.lines.text) // 添加上下文
					} else {
						currentResult.afterContext!.push(parsed.data.lines.text) // 添加上下文
					}
				}
			} catch (error) {
				console.error("Error parsing ripgrep output:", error) // 处理解析错误
			}
		}
	})

	if (currentResult) {
		results.push(currentResult as SearchResult) // 添加最后一个结果
	}

	return formatResults(results, cwd) // 格式化结果
}

function formatResults(results: SearchResult[], cwd: string): string {
	const groupedResults: { [key: string]: SearchResult[] } = {}

	let output = ""
	if (results.length >= MAX_RESULTS) {
		output += `Showing first ${MAX_RESULTS} of ${MAX_RESULTS}+ results. Use a more specific search if necessary.\n\n` // 显示前 MAX_RESULTS 个结果
	} else {
		output += `Found ${results.length === 1 ? "1 result" : `${results.length.toLocaleString()} results`}.\n\n` // 显示结果数量
	}

	// 按文件名分组结果
	results.slice(0, MAX_RESULTS).forEach((result) => {
		const relativeFilePath = path.relative(cwd, result.file) // 计算相对路径
		if (!groupedResults[relativeFilePath]) {
			groupedResults[relativeFilePath] = []
		}
		groupedResults[relativeFilePath].push(result)
	})

	for (const [filePath, fileResults] of Object.entries(groupedResults)) {
		output += `${filePath.toPosix()}\n│----\n` // 添加文件路径

		fileResults.forEach((result, index) => {
			const allLines = [...result.beforeContext, result.match, ...result.afterContext] // 收集所有行
			allLines.forEach((line) => {
				output += `│${line?.trimEnd() ?? ""}\n` // 添加行内容
			})

			if (index < fileResults.length - 1) {
				output += "│----\n" // 添加分隔符
			}
		})

		output += "│----\n\n" // 添加分隔符
	}

	return output.trim() // 返回格式化结果
}
