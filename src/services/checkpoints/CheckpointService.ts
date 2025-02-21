import fs from "fs/promises" // 导入 fs/promises 模块
import { existsSync } from "fs" // 导入 fs 模块中的 existsSync 函数
import path from "path" // 导入 path 模块

import simpleGit, { SimpleGit, CleanOptions } from "simple-git" // 导入 simple-git 模块及其类型

export type CheckpointServiceOptions = {
	taskId: string // 任务 ID
	git?: SimpleGit // 可选的 SimpleGit 实例
	baseDir: string // 基础目录
	log?: (message: string) => void // 可选的日志函数
}

/**
 * CheckpointService 提供了一种机制，用于在每次执行 Roo Code 工具时存储当前 VSCode 工作区的快照。它在底层使用 Git。
 *
 * 工作原理
 *
 * 使用两个分支：
 *  - 一个用于正常操作的主分支（当前所在的分支）。
 *  - 一个用于存储检查点的隐藏分支。
 *
 * 保存检查点：
 *  - 当前更改被暂存（包括未跟踪的文件）。
 *  - 隐藏分支被重置为与主分支匹配。
 *  - 暂存的更改被应用并作为检查点提交到隐藏分支。
 *  - 返回主分支并恢复原始状态。
 *
 * 恢复检查点：
 *  - 使用 `git restore` 和 `git clean` 将工作区恢复到指定检查点的状态。
 *
 * 这种方法允许：
 *  - 非破坏性的版本控制（主分支保持不变）。
 *  - 保留检查点的完整历史记录。
 *  - 安全地恢复到任何先前的检查点。
 *
 * 注意事项
 *
 *  - 必须安装 Git。
 *  - 如果当前工作目录不是 Git 仓库，我们将初始化一个新的仓库并添加一个 .gitkeep 文件。
 *  - 如果手动编辑文件然后恢复检查点，更改将会丢失。解决这个问题会增加一些复杂性，目前尚不清楚是否值得。
 */

export class CheckpointService {
	private static readonly USER_NAME = "Roo Code" // 默认的 Git 用户名
	private static readonly USER_EMAIL = "support@roocode.com" // 默认的 Git 用户邮箱

	private _currentCheckpoint?: string // 当前检查点的哈希值

	public get currentCheckpoint() {
		return this._currentCheckpoint // 获取当前检查点
	}

	private set currentCheckpoint(value: string | undefined) {
		this._currentCheckpoint = value // 设置当前检查点
	}

	constructor(
		public readonly taskId: string, // 任务 ID
		private readonly git: SimpleGit, // SimpleGit 实例
		public readonly baseDir: string, // 基础目录
		public readonly mainBranch: string, // 主分支名称
		public readonly baseCommitHash: string, // 基础提交哈希值
		public readonly hiddenBranch: string, // 隐藏分支名称
		private readonly log: (message: string) => void, // 日志函数
	) {}

	private async pushStash() {
		const status = await this.git.status() // 获取 Git 状态

		if (status.files.length > 0) {
			await this.git.stash(["-u"]) // 包括跟踪和未跟踪的文件
			return true // 返回 true 表示有暂存的更改
		}

		return false // 返回 false 表示没有暂存的更改
	}

	private async applyStash() {
		const stashList = await this.git.stashList() // 获取暂存列表

		if (stashList.all.length > 0) {
			await this.git.stash(["apply"]) // 应用最近的暂存
			return true // 返回 true 表示应用了暂存
		}

		return false // 返回 false 表示没有应用暂存
	}

	private async popStash() {
		const stashList = await this.git.stashList() // 获取暂存列表

		if (stashList.all.length > 0) {
			await this.git.stash(["pop", "--index"]) // 弹出最近的暂存
			return true // 返回 true 表示弹出了暂存
		}

		return false // 返回 false 表示没有弹出暂存
	}

	private async ensureBranch(expectedBranch: string) {
		const branch = await this.git.revparse(["--abbrev-ref", "HEAD"]) // 获取当前分支名称

		if (branch.trim() !== expectedBranch) {
			throw new Error(`Git branch mismatch: expected '${expectedBranch}' but found '${branch}'`) // 如果分支不匹配，抛出错误
		}
	}

	public async getDiff({ from, to }: { from?: string; to: string }) {
		const result = []

		if (!from) {
			from = this.baseCommitHash // 如果没有指定 from，使用基础提交哈希值
		}

		const { files } = await this.git.diffSummary([`${from}..${to}`]) // 获取差异摘要

		for (const file of files.filter((f) => !f.binary)) {
			const relPath = file.file // 相对路径
			const absPath = path.join(this.baseDir, relPath) // 绝对路径

			let beforeContent = ""
			let afterContent = ""

			try {
				beforeContent = await this.git.show([`${from}:${relPath}`]) // 获取 from 提交的文件内容
			} catch (err) {
				// 文件在旧提交中不存在
			}

			try {
				afterContent = await this.git.show([`${to}:${relPath}`]) // 获取 to 提交的文件内容
			} catch (err) {
				// 文件在新提交中不存在
			}

			result.push({
				paths: { relative: relPath, absolute: absPath }, // 文件路径
				content: { before: beforeContent, after: afterContent }, // 文件内容
			})
		}

		return result // 返回差异结果
	}

	public async saveCheckpoint(message: string) {
		await this.ensureBranch(this.mainBranch) // 确保在主分支上

		const pendingChanges = await this.pushStash() // 尝试暂存待处理的更改

		const latestHash = await this.git.revparse([this.hiddenBranch]) // 获取隐藏分支的最新提交哈希值

		if (!pendingChanges) {
			const diff = await this.git.diff([latestHash]) // 检查相对于最新提交的差异

			if (!diff) {
				this.log(`[saveCheckpoint] No changes detected, giving up`) // 如果没有差异，记录日志并返回
				return undefined
			}
		}

		await this.git.checkout(this.hiddenBranch) // 切换到隐藏分支

		const reset = async () => {
			await this.git.reset(["HEAD", "."]) // 重置隐藏分支
			await this.git.clean([CleanOptions.FORCE, CleanOptions.RECURSIVE]) // 清理隐藏分支
			await this.git.reset(["--hard", latestHash]) // 硬重置隐藏分支
			await this.git.checkout(this.mainBranch) // 切换回主分支
			await this.popStash() // 弹出暂存
		}

		try {
			await this.git.reset(["--hard", this.mainBranch]) // 将隐藏分支重置为与主分支匹配

			if (pendingChanges) {
				await this.applyStash() // 应用暂存的更改
			}

			await this.git.add(["-A"]) // 添加所有更改
			const diff = await this.git.diff([latestHash]) // 获取差异

			if (!diff) {
				this.log(`[saveCheckpoint] No changes detected, resetting and giving up`) // 如果没有差异，记录日志并重置
				await reset()
				return undefined
			}

			const status = await this.git.status() // 获取 Git 状态
			this.log(`[saveCheckpoint] Changes detected, committing ${JSON.stringify(status)}`) // 记录日志

			const commit = await this.git.commit(message, undefined, {
				"--allow-empty": null, // 允许空提交
				"--no-verify": null, // 跳过预提交钩子
			})

			await this.git.checkout(this.mainBranch) // 切换回主分支

			if (pendingChanges) {
				await this.popStash() // 弹出暂存
			}

			this.currentCheckpoint = commit.commit // 设置当前检查点

			return commit // 返回提交信息
		} catch (err) {
			this.log(`[saveCheckpoint] Failed to save checkpoint: ${err instanceof Error ? err.message : String(err)}`) // 记录错误日志

			const currentBranch = await this.git.revparse(["--abbrev-ref", "HEAD"]) // 获取当前分支名称

			if (currentBranch.trim() !== this.mainBranch) {
				await reset() // 如果不在主分支上，触发重置
			}

			throw err // 抛出错误
		}
	}

	public async restoreCheckpoint(commitHash: string) {
		await this.ensureBranch(this.mainBranch) // 确保在主分支上
		await this.git.clean([CleanOptions.FORCE, CleanOptions.RECURSIVE]) // 清理工作区
		await this.git.raw(["restore", "--source", commitHash, "--worktree", "--", "."]) // 恢复到指定检查点
		this.currentCheckpoint = commitHash // 设置当前检查点
	}

	public static async create({ taskId, git, baseDir, log = console.log }: CheckpointServiceOptions) {
		if (process.platform === "win32") {
			throw new Error("Checkpoints are not supported on Windows.") // 不支持 Windows 平台
		}

		git = git || simpleGit({ baseDir }) // 初始化 SimpleGit 实例

		const version = await git.version() // 获取 Git 版本

		if (!version?.installed) {
			throw new Error(`Git is not installed. Please install Git if you wish to use checkpoints.`) // 如果未安装 Git，抛出错误
		}

		if (!baseDir || !existsSync(baseDir)) {
			throw new Error(`Base directory is not set or does not exist.`) // 如果基础目录不存在，抛出错误
		}

		const { currentBranch, currentSha, hiddenBranch } = await CheckpointService.initRepo({
			taskId,
			git,
			baseDir,
			log,
		})

		log(
			`[CheckpointService] taskId = ${taskId}, baseDir = ${baseDir}, currentBranch = ${currentBranch}, currentSha = ${currentSha}, hiddenBranch = ${hiddenBranch}`,
		) // 记录日志

		return new CheckpointService(taskId, git, baseDir, currentBranch, currentSha, hiddenBranch, log) // 返回 CheckpointService 实例
	}

	private static async initRepo({ taskId, git, baseDir, log }: Required<CheckpointServiceOptions>) {
		const isExistingRepo = existsSync(path.join(baseDir, ".git")) // 检查是否为现有仓库

		if (!isExistingRepo) {
			await git.init() // 初始化新的 Git 仓库
			log(`[initRepo] Initialized new Git repository at ${baseDir}`) // 记录日志
		}

		const globalUserName = await git.getConfig("user.name", "global") // 获取全局用户名
		const localUserName = await git.getConfig("user.name", "local") // 获取本地用户名
		const userName = localUserName.value || globalUserName.value // 使用本地用户名或全局用户名

		const globalUserEmail = await git.getConfig("user.email", "global") // 获取全局用户邮箱
		const localUserEmail = await git.getConfig("user.email", "local") // 获取本地用户邮箱
		const userEmail = localUserEmail.value || globalUserEmail.value // 使用本地用户邮箱或全局用户邮箱

		if (globalUserName.value && localUserName.value === CheckpointService.USER_NAME) {
			await git.raw(["config", "--unset", "--local", "user.name"]) // 如果本地用户名与默认用户名匹配，且存在全局用户名，则移除本地用户名配置
		}

		if (globalUserEmail.value && localUserEmail.value === CheckpointService.USER_EMAIL) {
			await git.raw(["config", "--unset", "--local", "user.email"]) // 如果本地用户邮箱与默认用户邮箱匹配，且存在全局用户邮箱，则移除本地用户邮箱配置
		}

		if (!userName) {
			await git.addConfig("user.name", CheckpointService.USER_NAME) // 如果未配置用户名，则设置默认用户名
		}

		if (!userEmail) {
			await git.addConfig("user.email", CheckpointService.USER_EMAIL) // 如果未配置用户邮箱，则设置默认用户邮箱
		}

		if (!isExistingRepo) {
			await fs.writeFile(path.join(baseDir, ".gitkeep"), "") // 创建 .gitkeep 文件
			await git.add(".gitkeep") // 添加 .gitkeep 文件
			const commit = await git.commit("Initial commit") // 创建初始提交

			if (!commit.commit) {
				throw new Error("Failed to create initial commit") // 如果初始提交失败，抛出错误
			}

			log(`[initRepo] Initial commit: ${commit.commit}`) // 记录日志
		}

		const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]) // 获取当前分支名称
		const currentSha = await git.revparse(["HEAD"]) // 获取当前提交哈希值

		const hiddenBranch = `roo-code-checkpoints-${taskId}` // 隐藏分支名称
		const branchSummary = await git.branch() // 获取分支摘要

		if (!branchSummary.all.includes(hiddenBranch)) {
			await git.checkoutBranch(hiddenBranch, currentBranch) // 创建并切换到隐藏分支
			await git.checkout(currentBranch) // 切换回主分支
		}

		return { currentBranch, currentSha, hiddenBranch } // 返回分支信息
	}
}
