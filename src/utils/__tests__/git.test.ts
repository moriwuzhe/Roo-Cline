import { jest } from "@jest/globals" // 导入 jest
import { searchCommits, getCommitInfo, getWorkingState, GitCommit } from "../git" // 导入 git 模块中的函数和类型
import { ExecException } from "child_process" // 导入 ExecException 类型

type ExecFunction = (
	// 定义 ExecFunction 类型
	command: string,
	options: { cwd?: string },
	callback: (error: ExecException | null, result?: { stdout: string; stderr: string }) => void,
) => void

type PromisifiedExec = (command: string, options?: { cwd?: string }) => Promise<{ stdout: string; stderr: string }> // 定义 PromisifiedExec 类型

// 模拟 child_process.exec
jest.mock("child_process", () => ({
	exec: jest.fn(),
}))

// 模拟 util.promisify 以返回我们自己的模拟函数
jest.mock("util", () => ({
	promisify: jest.fn((fn: ExecFunction): PromisifiedExec => {
		return async (command: string, options?: { cwd?: string }) => {
			// 调用原始模拟以保持模拟实现
			return new Promise((resolve, reject) => {
				fn(
					command,
					options || {},
					(error: ExecException | null, result?: { stdout: string; stderr: string }) => {
						if (error) {
							reject(error)
						} else {
							resolve(result!)
						}
					},
				)
			})
		}
	}),
}))

// 模拟 extract-text
jest.mock("../../integrations/misc/extract-text", () => ({
	truncateOutput: jest.fn((text) => text),
}))

describe("git utils", () => {
	// 描述 "git utils" 测试套件
	// 获取具有正确类型的模拟
	const { exec } = jest.requireMock("child_process") as { exec: jest.MockedFunction<ExecFunction> }
	const cwd = "/test/path" // 定义当前工作目录

	beforeEach(() => {
		jest.clearAllMocks() // 清除所有模拟
	})

	describe("searchCommits", () => {
		// 描述 "searchCommits" 测试套件
		const mockCommitData = [
			// 模拟提交数据
			"abc123def456",
			"abc123",
			"fix: test commit",
			"John Doe",
			"2024-01-06",
			"def456abc789",
			"def456",
			"feat: new feature",
			"Jane Smith",
			"2024-01-05",
		].join("\n")

		it("should return commits when git is installed and repo exists", async () => {
			// 测试在安装 git 并存在仓库时是否返回提交
			// 设置模拟响应
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", { stdout: ".git", stderr: "" }],
				[
					'git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short --grep="test" --regexp-ignore-case',
					{ stdout: mockCommitData, stderr: "" },
				],
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				// 查找匹配的响应
				for (const [cmd, response] of responses) {
					if (command === cmd) {
						callback(null, response)
						return
					}
				}
				callback(new Error(`Unexpected command: ${command}`))
			})

			const result = await searchCommits("test", cwd) // 搜索提交

			// 首先验证结果是否正确
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({
				hash: "abc123def456",
				shortHash: "abc123",
				subject: "fix: test commit",
				author: "John Doe",
				date: "2024-01-06",
			})

			// 然后验证所有命令是否正确调用
			expect(exec).toHaveBeenCalledWith("git --version", {}, expect.any(Function))
			expect(exec).toHaveBeenCalledWith("git rev-parse --git-dir", { cwd }, expect.any(Function))
			expect(exec).toHaveBeenCalledWith(
				'git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short --grep="test" --regexp-ignore-case',
				{ cwd },
				expect.any(Function),
			)
		})

		it("should return empty array when git is not installed", async () => {
			// 测试在未安装 git 时是否返回空数组
			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				if (command === "git --version") {
					callback(new Error("git not found"))
					return
				}
				callback(new Error("Unexpected command"))
			})

			const result = await searchCommits("test", cwd) // 搜索提交
			expect(result).toEqual([]) // 断言结果是否为空数组
			expect(exec).toHaveBeenCalledWith("git --version", {}, expect.any(Function))
		})

		it("should return empty array when not in a git repository", async () => {
			// 测试在不在 git 仓库中时是否返回空数组
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", null], // null 表示应调用错误
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				const response = responses.get(command)
				if (response === null) {
					callback(new Error("not a git repository"))
				} else if (response) {
					callback(null, response)
				} else {
					callback(new Error("Unexpected command"))
				}
			})

			const result = await searchCommits("test", cwd) // 搜索提交
			expect(result).toEqual([]) // 断言结果是否为空数组
			expect(exec).toHaveBeenCalledWith("git --version", {}, expect.any(Function))
			expect(exec).toHaveBeenCalledWith("git rev-parse --git-dir", { cwd }, expect.any(Function))
		})

		it("should handle hash search when grep search returns no results", async () => {
			// 测试在 grep 搜索返回无结果时是否处理哈希搜索
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", { stdout: ".git", stderr: "" }],
				[
					'git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short --grep="abc123" --regexp-ignore-case',
					{ stdout: "", stderr: "" },
				],
				[
					'git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short --author-date-order abc123',
					{ stdout: mockCommitData, stderr: "" },
				],
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				for (const [cmd, response] of responses) {
					if (command === cmd) {
						callback(null, response)
						return
					}
				}
				callback(new Error("Unexpected command"))
			})

			const result = await searchCommits("abc123", cwd) // 搜索提交
			expect(result).toHaveLength(2) // 断言结果长度是否为 2
			expect(result[0]).toEqual({
				hash: "abc123def456",
				shortHash: "abc123",
				subject: "fix: test commit",
				author: "John Doe",
				date: "2024-01-06",
			})
		})
	})

	describe("getCommitInfo", () => {
		// 描述 "getCommitInfo" 测试套件
		const mockCommitInfo = [
			// 模拟提交信息
			"abc123def456",
			"abc123",
			"fix: test commit",
			"John Doe",
			"2024-01-06",
			"Detailed description",
		].join("\n")
		const mockStats = "1 file changed, 2 insertions(+), 1 deletion(-)" // 模拟统计信息
		const mockDiff = "@@ -1,1 +1,2 @@\n-old line\n+new line" // 模拟差异信息

		it("should return formatted commit info", async () => {
			// 测试是否返回格式化的提交信息
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", { stdout: ".git", stderr: "" }],
				[
					'git show --format="%H%n%h%n%s%n%an%n%ad%n%b" --no-patch abc123',
					{ stdout: mockCommitInfo, stderr: "" },
				],
				['git show --stat --format="" abc123', { stdout: mockStats, stderr: "" }],
				['git show --format="" abc123', { stdout: mockDiff, stderr: "" }],
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				for (const [cmd, response] of responses) {
					if (command.startsWith(cmd)) {
						callback(null, response)
						return
					}
				}
				callback(new Error("Unexpected command"))
			})

			const result = await getCommitInfo("abc123", cwd) // 获取提交信息
			expect(result).toContain("Commit: abc123") // 断言结果是否包含提交信息
			expect(result).toContain("Author: John Doe") // 断言结果是否包含作者信息
			expect(result).toContain("Files Changed:") // 断言结果是否包含文件更改信息
			expect(result).toContain("Full Changes:") // 断言结果是否包含完整更改信息
		})

		it("should return error message when git is not installed", async () => {
			// 测试在未安装 git 时是否返回错误信息
			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				if (command === "git --version") {
					callback(new Error("git not found"))
					return
				}
				callback(new Error("Unexpected command"))
			})

			const result = await getCommitInfo("abc123", cwd) // 获取提交信息
			expect(result).toBe("Git is not installed") // 断言结果是否为 "Git is not installed"
		})

		it("should return error message when not in a git repository", async () => {
			// 测试在不在 git 仓库中时是否返回错误信息
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", null], // null 表示应调用错误
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				const response = responses.get(command)
				if (response === null) {
					callback(new Error("not a git repository"))
				} else if (response) {
					callback(null, response)
				} else {
					callback(new Error("Unexpected command"))
				}
			})

			const result = await getCommitInfo("abc123", cwd) // 获取提交信息
			expect(result).toBe("Not a git repository") // 断言结果是否为 "Not a git repository"
		})
	})

	describe("getWorkingState", () => {
		// 描述 "getWorkingState" 测试套件
		const mockStatus = " M src/file1.ts\n?? src/file2.ts" // 模拟状态信息
		const mockDiff = "@@ -1,1 +1,2 @@\n-old line\n+new line" // 模拟差异信息

		it("should return working directory changes", async () => {
			// 测试是否返回工作目录更改
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", { stdout: ".git", stderr: "" }],
				["git status --short", { stdout: mockStatus, stderr: "" }],
				["git diff HEAD", { stdout: mockDiff, stderr: "" }],
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				for (const [cmd, response] of responses) {
					if (command === cmd) {
						callback(null, response)
						return
					}
				}
				callback(new Error("Unexpected command"))
			})

			const result = await getWorkingState(cwd) // 获取工作状态
			expect(result).toContain("Working directory changes:") // 断言结果是否包含工作目录更改信息
			expect(result).toContain("src/file1.ts") // 断言结果是否包含文件1信息
			expect(result).toContain("src/file2.ts") // 断言结果是否包含文件2信息
		})

		it("should return message when working directory is clean", async () => {
			// 测试在工作目录干净时是否返回消息
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", { stdout: ".git", stderr: "" }],
				["git status --short", { stdout: "", stderr: "" }],
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				for (const [cmd, response] of responses) {
					if (command === cmd) {
						callback(null, response)
						return
					}
				}
				callback(new Error("Unexpected command"))
			})

			const result = await getWorkingState(cwd) // 获取工作状态
			expect(result).toBe("No changes in working directory") // 断言结果是否为 "No changes in working directory"
		})

		it("should return error message when git is not installed", async () => {
			// 测试在未安装 git 时是否返回错误信息
			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				if (command === "git --version") {
					callback(new Error("git not found"))
					return
				}
				callback(new Error("Unexpected command"))
			})

			const result = await getWorkingState(cwd) // 获取工作状态
			expect(result).toBe("Git is not installed") // 断言结果是否为 "Git is not installed"
		})

		it("should return error message when not in a git repository", async () => {
			// 测试在不在 git 仓库中时是否返回错误信息
			const responses = new Map([
				["git --version", { stdout: "git version 2.39.2", stderr: "" }],
				["git rev-parse --git-dir", null], // null 表示应调用错误
			])

			exec.mockImplementation((command: string, options: { cwd?: string }, callback: Function) => {
				const response = responses.get(command)
				if (response === null) {
					callback(new Error("not a git repository"))
				} else if (response) {
					callback(null, response)
				} else {
					callback(new Error("Unexpected command"))
				}
			})

			const result = await getWorkingState(cwd) // 获取工作状态
			expect(result).toBe("Not a git repository") // 断言结果是否为 "Not a git repository"
		})
	})
})
