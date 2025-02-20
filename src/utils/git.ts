import { exec } from "child_process" // 导入 child_process 模块中的 exec 函数
import { promisify } from "util" // 导入 util 模块中的 promisify 函数
import { truncateOutput } from "../integrations/misc/extract-text" // 导入 truncateOutput 函数

const execAsync = promisify(exec) // 将 exec 函数转换为返回 Promise 的异步函数
const GIT_OUTPUT_LINE_LIMIT = 500 // Git 输出行数限制

export interface GitCommit {
	hash: string // 提交哈希
	shortHash: string // 短哈希
	subject: string // 提交主题
	author: string // 提交作者
	date: string // 提交日期
}

async function checkGitRepo(cwd: string): Promise<boolean> {
	try {
		await execAsync("git rev-parse --git-dir", { cwd }) // 检查是否为 Git 仓库
		return true
	} catch (error) {
		return false
	}
}

async function checkGitInstalled(): Promise<boolean> {
	try {
		await execAsync("git --version") // 检查是否安装了 Git
		return true
	} catch (error) {
		return false
	}
}

export async function searchCommits(query: string, cwd: string): Promise<GitCommit[]> {
	try {
		const isInstalled = await checkGitInstalled() // 检查是否安装了 Git
		if (!isInstalled) {
			console.error("Git is not installed")
			return []
		}

		const isRepo = await checkGitRepo(cwd) // 检查是否为 Git 仓库
		if (!isRepo) {
			console.error("Not a git repository")
			return []
		}

		// 通过哈希或消息搜索提交，限制为 10 个结果
		const { stdout } = await execAsync(
			`git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short ` + `--grep="${query}" --regexp-ignore-case`,
			{ cwd },
		)

		let output = stdout
		if (!output.trim() && /^[a-f0-9]+$/i.test(query)) {
			// 如果 grep 搜索没有结果且查询看起来像哈希，则尝试通过哈希搜索
			const { stdout: hashStdout } = await execAsync(
				`git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short ` + `--author-date-order ${query}`,
				{ cwd },
			).catch(() => ({ stdout: "" }))

			if (!hashStdout.trim()) {
				return []
			}

			output = hashStdout
		}

		const commits: GitCommit[] = []
		const lines = output
			.trim()
			.split("\n")
			.filter((line) => line !== "--")

		for (let i = 0; i < lines.length; i += 5) {
			commits.push({
				hash: lines[i],
				shortHash: lines[i + 1],
				subject: lines[i + 2],
				author: lines[i + 3],
				date: lines[i + 4],
			})
		}

		return commits
	} catch (error) {
		console.error("Error searching commits:", error)
		return []
	}
}

export async function getCommitInfo(hash: string, cwd: string): Promise<string> {
	try {
		const isInstalled = await checkGitInstalled() // 检查是否安装了 Git
		if (!isInstalled) {
			return "Git is not installed"
		}

		const isRepo = await checkGitRepo(cwd) // 检查是否为 Git 仓库
		if (!isRepo) {
			return "Not a git repository"
		}

		// 分别获取提交信息、统计信息和差异
		const { stdout: info } = await execAsync(`git show --format="%H%n%h%n%s%n%an%n%ad%n%b" --no-patch ${hash}`, {
			cwd,
		})
		const [fullHash, shortHash, subject, author, date, body] = info.trim().split("\n")

		const { stdout: stats } = await execAsync(`git show --stat --format="" ${hash}`, { cwd })

		const { stdout: diff } = await execAsync(`git show --format="" ${hash}`, { cwd })

		const summary = [
			`Commit: ${shortHash} (${fullHash})`,
			`Author: ${author}`,
			`Date: ${date}`,
			`\nMessage: ${subject}`,
			body ? `\nDescription:\n${body}` : "",
			"\nFiles Changed:",
			stats.trim(),
			"\nFull Changes:",
		].join("\n")

		const output = summary + "\n\n" + diff.trim()
		return truncateOutput(output, GIT_OUTPUT_LINE_LIMIT)
	} catch (error) {
		console.error("Error getting commit info:", error)
		return `Failed to get commit info: ${error instanceof Error ? error.message : String(error)}`
	}
}

export async function getWorkingState(cwd: string): Promise<string> {
	try {
		const isInstalled = await checkGitInstalled() // 检查是否安装了 Git
		if (!isInstalled) {
			return "Git is not installed"
		}

		const isRepo = await checkGitRepo(cwd) // 检查是否为 Git 仓库
		if (!isRepo) {
			return "Not a git repository"
		}

		// 获取工作目录的状态
		const { stdout: status } = await execAsync("git status --short", { cwd })
		if (!status.trim()) {
			return "No changes in working directory"
		}

		// 获取与 HEAD 比较的所有更改（包括已暂存和未暂存的更改）
		const { stdout: diff } = await execAsync("git diff HEAD", { cwd })
		const lineLimit = GIT_OUTPUT_LINE_LIMIT
		const output = `Working directory changes:\n\n${status}\n\n${diff}`.trim()
		return truncateOutput(output, lineLimit)
	} catch (error) {
		console.error("Error getting working state:", error)
		return `Failed to get working state: ${error instanceof Error ? error.message : String(error)}`
	}
}
