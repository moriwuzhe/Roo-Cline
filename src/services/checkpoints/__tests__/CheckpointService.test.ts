// npx jest src/services/checkpoints/__tests__/CheckpointService.test.ts

import fs from "fs/promises" // 导入 fs/promises 模块
import path from "path" // 导入 path 模块
import os from "os" // 导入 os 模块

import { simpleGit, SimpleGit } from "simple-git" // 导入 simple-git 模块及其类型

import { CheckpointService } from "../CheckpointService" // 导入 CheckpointService 类

describe("CheckpointService", () => {
	const taskId = "test-task" // 定义任务 ID

	let git: SimpleGit // 定义 git 变量
	let testFile: string // 定义测试文件路径变量
	let service: CheckpointService // 定义 CheckpointService 实例变量
	let originalPlatform: string // 定义原始平台变量

	const initRepo = async ({
		baseDir,
		userName = "Roo Code",
		userEmail = "support@roocode.com",
		testFileName = "test.txt",
		textFileContent = "Hello, world!",
	}: {
		baseDir: string
		userName?: string
		userEmail?: string
		testFileName?: string
		textFileContent?: string
	}) => {
			// 创建用于测试的临时目录
			await fs.mkdir(baseDir)

			// 初始化 git 仓库
			const git = simpleGit(baseDir)
			await git.init()
			await git.addConfig("user.name", userName)
			await git.addConfig("user.email", userEmail)

			// 创建测试文件
			const testFile = path.join(baseDir, testFileName)
			await fs.writeFile(testFile, textFileContent)

			// 创建初始提交
			await git.add(".")
			await git.commit("Initial commit")!

			return { git, testFile }
		}

	beforeAll(() => {
		originalPlatform = process.platform // 保存原始平台
		Object.defineProperty(process, "platform", {
			value: "darwin", // 将平台设置为 darwin
		})
	})

	afterAll(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform, // 恢复原始平台
		})
	})

	beforeEach(async () => {
		const baseDir = path.join(os.tmpdir(), `checkpoint-service-test-${Date.now()}`) // 创建临时目录
		const repo = await initRepo({ baseDir }) // 初始化仓库

		git = repo.git // 设置 git 变量
		testFile = repo.testFile // 设置测试文件路径
		service = await CheckpointService.create({ taskId, git, baseDir, log: () => {} }) // 创建 CheckpointService 实例
	})

	afterEach(async () => {
		await fs.rm(service.baseDir, { recursive: true, force: true }) // 删除临时目录
		jest.restoreAllMocks() // 恢复所有模拟
	})

	describe("getDiff", () => {
		it("returns the correct diff between commits", async () => {
			await fs.writeFile(testFile, "Ahoy, world!") // 修改测试文件内容
			const commit1 = await service.saveCheckpoint("First checkpoint") // 保存第一个检查点
			expect(commit1?.commit).toBeTruthy() // 检查提交是否成功

			await fs.writeFile(testFile, "Goodbye, world!") // 再次修改测试文件内容
			const commit2 = await service.saveCheckpoint("Second checkpoint") // 保存第二个检查点
			expect(commit2?.commit).toBeTruthy() // 检查提交是否成功

			const diff1 = await service.getDiff({ to: commit1!.commit }) // 获取第一个检查点的差异
			expect(diff1).toHaveLength(1) // 检查差异长度
			expect(diff1[0].paths.relative).toBe("test.txt") // 检查相对路径
			expect(diff1[0].paths.absolute).toBe(testFile) // 检查绝对路径
			expect(diff1[0].content.before).toBe("Hello, world!") // 检查修改前内容
			expect(diff1[0].content.after).toBe("Ahoy, world!") // 检查修改后内容

			const diff2 = await service.getDiff({ to: commit2!.commit }) // 获取第二个检查点的差异
			expect(diff2).toHaveLength(1) // 检查差异长度
			expect(diff2[0].paths.relative).toBe("test.txt") // 检查相对路径
			expect(diff2[0].paths.absolute).toBe(testFile) // 检查绝对路径
			expect(diff2[0].content.before).toBe("Hello, world!") // 检查修改前内容
			expect(diff2[0].content.after).toBe("Goodbye, world!") // 检查修改后内容

			const diff12 = await service.getDiff({ from: commit1!.commit, to: commit2!.commit }) // 获取两个检查点之间的差异
			expect(diff12).toHaveLength(1) // 检查差异长度
			expect(diff12[0].paths.relative).toBe("test.txt") // 检查相对路径
			expect(diff12[0].paths.absolute).toBe(testFile) // 检查绝对路径
			expect(diff12[0].content.before).toBe("Ahoy, world!") // 检查修改前内容
			expect(diff12[0].content.after).toBe("Goodbye, world!") // 检查修改后内容
		})

		it("handles new files in diff", async () => {
			const newFile = path.join(service.baseDir, "new.txt") // 创建新文件路径
			await fs.writeFile(newFile, "New file content") // 写入新文件内容
			const commit = await service.saveCheckpoint("Add new file") // 保存检查点
			expect(commit?.commit).toBeTruthy() // 检查提交是否成功

			const changes = await service.getDiff({ to: commit!.commit }) // 获取差异
			const change = changes.find((c) => c.paths.relative === "new.txt") // 查找新文件的差异
			expect(change).toBeDefined() // 检查差异是否存在
			expect(change?.content.before).toBe("") // 检查修改前内容
			expect(change?.content.after).toBe("New file content") // 检查修改后内容
		})

		it("handles deleted files in diff", async () => {
			const fileToDelete = path.join(service.baseDir, "new.txt") // 创建要删除的文件路径
			await fs.writeFile(fileToDelete, "New file content") // 写入文件内容
			const commit1 = await service.saveCheckpoint("Add file") // 保存第一个检查点
			expect(commit1?.commit).toBeTruthy() // 检查提交是否成功

			await fs.unlink(fileToDelete) // 删除文件
			const commit2 = await service.saveCheckpoint("Delete file") // 保存第二个检查点
			expect(commit2?.commit).toBeTruthy() // 检查提交是否成功

			const changes = await service.getDiff({ from: commit1!.commit, to: commit2!.commit }) // 获取两个检查点之间的差异
			const change = changes.find((c) => c.paths.relative === "new.txt") // 查找删除文件的差异
			expect(change).toBeDefined() // 检查差异是否存在
			expect(change!.content.before).toBe("New file content") // 检查修改前内容
			expect(change!.content.after).toBe("") // 检查修改后内容
		})
	})

	describe("saveCheckpoint", () => {
		it("creates a checkpoint if there are pending changes", async () => {
			await fs.writeFile(testFile, "Ahoy, world!") // 修改测试文件内容
			const commit1 = await service.saveCheckpoint("First checkpoint") // 保存第一个检查点
			expect(commit1?.commit).toBeTruthy() // 检查提交是否成功
			const details1 = await git.show([commit1!.commit]) // 获取提交详情
			expect(details1).toContain("-Hello, world!") // 检查提交详情
			expect(details1).toContain("+Ahoy, world!") // 检查提交详情

			await fs.writeFile(testFile, "Hola, world!") // 再次修改测试文件内容
			const commit2 = await service.saveCheckpoint("Second checkpoint") // 保存第二个检查点
			expect(commit2?.commit).toBeTruthy() // 检查提交是否成功
			const details2 = await git.show([commit2!.commit]) // 获取提交详情
			expect(details2).toContain("-Hello, world!") // 检查提交详情
			expect(details2).toContain("+Hola, world!") // 检查提交详情

			// 切换到第一个检查点
			await service.restoreCheckpoint(commit1!.commit)
			expect(await fs.readFile(testFile, "utf-8")).toBe("Ahoy, world!") // 检查文件内容

			// 切换到第二个检查点
			await service.restoreCheckpoint(commit2!.commit)
			expect(await fs.readFile(testFile, "utf-8")).toBe("Hola, world!") // 检查文件内容

			// 切换回初始提交
			await service.restoreCheckpoint(service.baseCommitHash)
			expect(await fs.readFile(testFile, "utf-8")).toBe("Hello, world!") // 检查文件内容
		})

		it("preserves workspace and index state after saving checkpoint", async () => {
			// 创建三个不同状态的文件：未暂存、已暂存和混合状态
			const unstagedFile = path.join(service.baseDir, "unstaged.txt")
			const stagedFile = path.join(service.baseDir, "staged.txt")
			const mixedFile = path.join(service.baseDir, "mixed.txt")

			await fs.writeFile(unstagedFile, "Initial unstaged")
			await fs.writeFile(stagedFile, "Initial staged")
			await fs.writeFile(mixedFile, "Initial mixed")
			await git.add(["."])
			const result = await git.commit("Add initial files")
			expect(result?.commit).toBeTruthy() // 检查提交是否成功

			await fs.writeFile(unstagedFile, "Modified unstaged") // 修改未暂存文件

			await fs.writeFile(stagedFile, "Modified staged") // 修改已暂存文件
			await git.add([stagedFile])

			await fs.writeFile(mixedFile, "Modified mixed - staged") // 修改混合状态文件
			await git.add([mixedFile])
			await fs.writeFile(mixedFile, "Modified mixed - unstaged")

			// 保存检查点
			const commit = await service.saveCheckpoint("Test checkpoint")
			expect(commit?.commit).toBeTruthy() // 检查提交是否成功

			// 验证工作区状态是否保留
			const status = await git.status()

			// 所有文件都应该被修改
			expect(status.modified).toContain("unstaged.txt")
			expect(status.modified).toContain("staged.txt")
			expect(status.modified).toContain("mixed.txt")

			// 只有已暂存和混合状态文件应该被暂存
			expect(status.staged).not.toContain("unstaged.txt")
			expect(status.staged).toContain("staged.txt")
			expect(status.staged).toContain("mixed.txt")

				// 验证文件内容
				expect(await fs.readFile(unstagedFile, "utf-8")).toBe("Modified unstaged")
				expect(await fs.readFile(stagedFile, "utf-8")).toBe("Modified staged")
				expect(await fs.readFile(mixedFile, "utf-8")).toBe("Modified mixed - unstaged")

				// 验证已暂存的更改（--cached 仅显示已暂存的更改）
				const stagedDiff = await git.diff(["--cached", "mixed.txt"])
				expect(stagedDiff).toContain("-Initial mixed")
				expect(stagedDiff).toContain("+Modified mixed - staged")

				// 验证未暂存的更改（显示工作目录中的更改）
				const unstagedDiff = await git.diff(["mixed.txt"])
				expect(unstagedDiff).toContain("-Modified mixed - staged")
				expect(unstagedDiff).toContain("+Modified mixed - unstaged")
			})

		it("does not create a checkpoint if there are no pending changes", async () => {
			await fs.writeFile(testFile, "Ahoy, world!") // 修改测试文件内容
			const commit = await service.saveCheckpoint("First checkpoint") // 保存第一个检查点
			expect(commit?.commit).toBeTruthy() // 检查提交是否成功

			const commit2 = await service.saveCheckpoint("Second checkpoint") // 尝试保存第二个检查点
			expect(commit2?.commit).toBeFalsy() // 检查提交是否成功
		})

		it("includes untracked files in checkpoints", async () => {
			// 创建一个未跟踪的文件
			const untrackedFile = path.join(service.baseDir, "untracked.txt")
			await fs.writeFile(untrackedFile, "I am untracked!")

			// 保存包含未跟踪文件的检查点
			const commit1 = await service.saveCheckpoint("Checkpoint with untracked file")
			expect(commit1?.commit).toBeTruthy() // 检查提交是否成功

			// 验证未跟踪文件是否包含在检查点中
			const details = await git.show([commit1!.commit])
			expect(details).toContain("+I am untracked!")

			// 创建另一个检查点，文件状态不同
			await fs.writeFile(testFile, "Changed tracked file")
			const commit2 = await service.saveCheckpoint("Second checkpoint")
			expect(commit2?.commit).toBeTruthy() // 检查提交是否成功

			// 恢复第一个检查点并验证未跟踪文件是否保留
			await service.restoreCheckpoint(commit1!.commit)
			expect(await fs.readFile(untrackedFile, "utf-8")).toBe("I am untracked!")
			expect(await fs.readFile(testFile, "utf-8")).toBe("Hello, world!")

			// 恢复第二个检查点并验证未跟踪文件是否保留（因为恢复会保留未跟踪文件）
			await service.restoreCheckpoint(commit2!.commit)
			expect(await fs.readFile(untrackedFile, "utf-8")).toBe("I am untracked!")
			expect(await fs.readFile(testFile, "utf-8")).toBe("Changed tracked file")
		})

		it("throws if we're on the wrong branch", async () => {
			// 创建并切换到一个功能分支
			await git.checkoutBranch("feature", service.mainBranch)

			// 尝试从功能分支保存检查点
			await expect(service.saveCheckpoint("test")).rejects.toThrow(
				`Git branch mismatch: expected '${service.mainBranch}' but found 'feature'`,
			)

			// 尝试从功能分支恢复检查点
			await expect(service.restoreCheckpoint(service.baseCommitHash)).rejects.toThrow(
				`Git branch mismatch: expected '${service.mainBranch}' but found 'feature'`,
			)
		})

		it("cleans up staged files if a commit fails", async () => {
			await fs.writeFile(testFile, "Changed content") // 修改测试文件内容

			// 模拟提交失败
			jest.spyOn(git, "commit").mockRejectedValue(new Error("Simulated commit failure"))

			// 尝试保存检查点
			await expect(service.saveCheckpoint("test")).rejects.toThrow("Simulated commit failure")

			// 验证文件是否已取消暂存
			const status = await git.status()
			expect(status.staged).toHaveLength(0)
		})

		it("handles file deletions correctly", async () => {
			await fs.writeFile(testFile, "I am tracked!") // 写入测试文件内容
			const untrackedFile = path.join(service.baseDir, "new.txt")
			await fs.writeFile(untrackedFile, "I am untracked!")
			const commit1 = await service.saveCheckpoint("First checkpoint")
			expect(commit1?.commit).toBeTruthy() // 检查提交是否成功

			await fs.unlink(testFile) // 删除测试文件
			await fs.unlink(untrackedFile) // 删除未跟踪文件
			const commit2 = await service.saveCheckpoint("Second checkpoint")
			expect(commit2?.commit).toBeTruthy() // 检查提交是否成功

			// 验证文件是否已删除
			await expect(fs.readFile(testFile, "utf-8")).rejects.toThrow()
			await expect(fs.readFile(untrackedFile, "utf-8")).rejects.toThrow()

			// 恢复第一个检查点
			await service.restoreCheckpoint(commit1!.commit)
			expect(await fs.readFile(testFile, "utf-8")).toBe("I am tracked!")
			expect(await fs.readFile(untrackedFile, "utf-8")).toBe("I am untracked!")

			// 恢复第二个检查点
			await service.restoreCheckpoint(commit2!.commit)
			await expect(fs.readFile(testFile, "utf-8")).rejects.toThrow()
			await expect(fs.readFile(untrackedFile, "utf-8")).rejects.toThrow()
		})
	})

	describe("create", () => {
		it("initializes a git repository if one does not already exist", async () => {
			const baseDir = path.join(os.tmpdir(), `checkpoint-service-test2-${Date.now()}`) // 创建临时目录
			await fs.mkdir(baseDir)
			const newTestFile = path.join(baseDir, "test.txt")
			await fs.writeFile(newTestFile, "Hello, world!") // 写入测试文件内容

			const newGit = simpleGit(baseDir)
			const initSpy = jest.spyOn(newGit, "init")
			const newService = await CheckpointService.create({ taskId, git: newGit, baseDir, log: () => {} })

			// 确保 git 仓库已初始化
			expect(initSpy).toHaveBeenCalled()

			// 保存检查点：Hello, world!
			const commit1 = await newService.saveCheckpoint("Hello, world!")
			expect(commit1?.commit).toBeTruthy() // 检查提交是否成功
			expect(await fs.readFile(newTestFile, "utf-8")).toBe("Hello, world!") // 检查文件内容

			// 恢复初始提交；文件不应存在
			await newService.restoreCheckpoint(newService.baseCommitHash)
			await expect(fs.access(newTestFile)).rejects.toThrow()

			// 恢复到检查点 1；文件应存在
			await newService.restoreCheckpoint(commit1!.commit)
			expect(await fs.readFile(newTestFile, "utf-8")).toBe("Hello, world!") // 检查文件内容

			// 保存新检查点：Ahoy, world!
			await fs.writeFile(newTestFile, "Ahoy, world!")
			const commit2 = await newService.saveCheckpoint("Ahoy, world!")
			expect(commit2?.commit).toBeTruthy() // 检查提交是否成功
			expect(await fs.readFile(newTestFile, "utf-8")).toBe("Ahoy, world!") // 检查文件内容

			// 恢复“Hello, world!”
			await newService.restoreCheckpoint(commit1!.commit)
			expect(await fs.readFile(newTestFile, "utf-8")).toBe("Hello, world!") // 检查文件内容

			// 恢复“Ahoy, world!”
			await newService.restoreCheckpoint(commit2!.commit)
			expect(await fs.readFile(newTestFile, "utf-8")).toBe("Ahoy, world!") // 检查文件内容

			// 恢复初始提交
			await newService.restoreCheckpoint(newService.baseCommitHash)
			await expect(fs.access(newTestFile)).rejects.toThrow()

			await fs.rm(newService.baseDir, { recursive: true, force: true }) // 删除临时目录
		})

		it("respects existing git user configuration", async () => {
			const baseDir = path.join(os.tmpdir(), `checkpoint-service-test-config2-${Date.now()}`) // 创建临时目录
			const userName = "Custom User"
			const userEmail = "custom@example.com"
			const repo = await initRepo({ baseDir, userName, userEmail }) // 初始化仓库
			const newGit = repo.git

			await CheckpointService.create({ taskId, git: newGit, baseDir, log: () => {} }) // 创建 CheckpointService 实例

			expect((await newGit.getConfig("user.name")).value).toBe(userName) // 检查用户名配置
			expect((await newGit.getConfig("user.email")).value).toBe(userEmail) // 检查用户邮箱配置

			await fs.rm(baseDir, { recursive: true, force: true }) // 删除临时目录
		})

		it("removes local git config if it matches default and global exists", async () => {
			const baseDir = path.join(os.tmpdir(), `checkpoint-service-test-config2-${Date.now()}`) // 创建临时目录
			const repo = await initRepo({ baseDir }) // 初始化仓库
			const newGit = repo.git

			const originalGetConfig = newGit.getConfig.bind(newGit)

			jest.spyOn(newGit, "getConfig").mockImplementation(
				(
					key: string,
					scope?: "system" | "global" | "local" | "worktree",
					callback?: SimpleGitTaskCallback<string>,
				) => {
					if (scope === "global") {
						if (key === "user.email") {
							return Promise.resolve({ value: "global@example.com" }) as any
						}
						if (key === "user.name") {
							return Promise.resolve({ value: "Global User" }) as any
						}
					}

					return originalGetConfig(key, scope, callback)
				},
			)

			await CheckpointService.create({ taskId, git: newGit, baseDir, log: () => {} }) // 创建 CheckpointService 实例

			// 验证本地配置已删除并使用全局配置
			const localName = await newGit.getConfig("user.name", "local")
			const localEmail = await newGit.getConfig("user.email", "local")
			const globalName = await newGit.getConfig("user.name", "global")
			const globalEmail = await newGit.getConfig("user.email", "global")

			expect(localName.value).toBeNull() // 本地配置应已删除
			expect(localEmail.value).toBeNull()
			expect(globalName.value).toBe("Global User") // 全局配置应保留
			expect(globalEmail.value).toBe("global@example.com")

			await fs.rm(baseDir, { recursive: true, force: true }) // 删除临时目录
		})
	})
})
