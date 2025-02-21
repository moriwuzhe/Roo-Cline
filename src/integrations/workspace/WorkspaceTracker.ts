import * as vscode from "vscode" // 导入 VS Code API
import * as path from "path" // 导入 path 模块
import { listFiles } from "../../services/glob/list-files" // 导入 listFiles 函数
import { ClineProvider } from "../../core/webview/ClineProvider" // 导入 ClineProvider
import { toRelativePath } from "../../utils/path" // 导入 toRelativePath 函数

const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) // 获取当前工作区目录
const MAX_INITIAL_FILES = 1_000 // 最大初始文件数

// 注意：这不是任务开始时 listFiles 的替代品，因为在没有选择工作区时会为桌面执行此操作
class WorkspaceTracker {
	private providerRef: WeakRef<ClineProvider> // ClineProvider 的弱引用
	private disposables: vscode.Disposable[] = [] // 可释放的资源
	private filePaths: Set<string> = new Set() // 文件路径集合
	private updateTimer: NodeJS.Timeout | null = null // 更新计时器

	constructor(provider: ClineProvider) {
		this.providerRef = new WeakRef(provider) // 初始化弱引用
		this.registerListeners() // 注册监听器
	}

	async initializeFilePaths() {
		// 不应自动获取桌面的文件路径，因为在 Cline 创建文件之前会立即显示权限弹出窗口
		if (!cwd) {
			return
		}
		const [files, _] = await listFiles(cwd, true, MAX_INITIAL_FILES) // 列出文件
		files.slice(0, MAX_INITIAL_FILES).forEach((file) => this.filePaths.add(this.normalizeFilePath(file))) // 添加文件路径
		this.workspaceDidUpdate() // 更新工作区
	}

	private registerListeners() {
		const watcher = vscode.workspace.createFileSystemWatcher("**") // 创建文件系统监视器

		this.disposables.push(
			watcher.onDidCreate(async (uri) => {
				await this.addFilePath(uri.fsPath) // 添加文件路径
				this.workspaceDidUpdate() // 更新工作区
			}),
		)

		// 重命名文件会触发删除和创建事件
		this.disposables.push(
			watcher.onDidDelete(async (uri) => {
				if (await this.removeFilePath(uri.fsPath)) {
					this.workspaceDidUpdate() // 更新工作区
				}
			}),
		)

		this.disposables.push(watcher) // 添加监视器到可释放资源

		this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(() => this.workspaceDidUpdate())) // 监听标签组变化
	}

	private getOpenedTabsInfo() {
		return vscode.window.tabGroups.all.flatMap((group) =>
			group.tabs
				.filter((tab) => tab.input instanceof vscode.TabInputText) // 过滤文本标签
				.map((tab) => {
					const path = (tab.input as vscode.TabInputText).uri.fsPath // 获取文件路径
					return {
						label: tab.label, // 标签
						isActive: tab.isActive, // 是否活动
						path: toRelativePath(path, cwd || ""), // 相对路径
					}
				}),
		)
	}

	private workspaceDidUpdate() {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer) // 清除更新计时器
		}

		this.updateTimer = setTimeout(() => {
			if (!cwd) {
				return
			}

			const relativeFilePaths = Array.from(this.filePaths).map((file) => toRelativePath(file, cwd)) // 获取相对文件路径
			this.providerRef.deref()?.postMessageToWebview({
				type: "workspaceUpdated", // 消息类型
				filePaths: relativeFilePaths, // 文件路径
				openedTabs: this.getOpenedTabsInfo(), // 打开的标签信息
			})
			this.updateTimer = null // 重置更新计时器
		}, 300) // 防抖 300 毫秒
	}

	private normalizeFilePath(filePath: string): string {
		const resolvedPath = cwd ? path.resolve(cwd, filePath) : path.resolve(filePath) // 解析文件路径
		return filePath.endsWith("/") ? resolvedPath + "/" : resolvedPath // 返回标准化路径
	}

	private async addFilePath(filePath: string): Promise<string> {
		// 允许一些缓冲区以考虑任务期间创建/删除的文件
		if (this.filePaths.size >= MAX_INITIAL_FILES * 2) {
			return filePath
		}

		const normalizedPath = this.normalizeFilePath(filePath) // 标准化文件路径
		try {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.file(normalizedPath)) // 获取文件状态
			const isDirectory = (stat.type & vscode.FileType.Directory) !== 0 // 是否为目录
			const pathWithSlash = isDirectory && !normalizedPath.endsWith("/") ? normalizedPath + "/" : normalizedPath // 添加斜杠
			this.filePaths.add(pathWithSlash) // 添加路径
			return pathWithSlash
		} catch {
			// 如果 stat 失败，假设它是一个文件（这可能发生在新创建的文件上）
			this.filePaths.add(normalizedPath) // 添加路径
			return normalizedPath
		}
	}

	private async removeFilePath(filePath: string): Promise<boolean> {
		const normalizedPath = this.normalizeFilePath(filePath) // 标准化文件路径
		return this.filePaths.delete(normalizedPath) || this.filePaths.delete(normalizedPath + "/") // 删除路径
	}

	public dispose() {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer) // 清除更新计时器
			this.updateTimer = null // 重置更新计时器
		}
		this.disposables.forEach((d) => d.dispose()) // 释放资源
	}
}

export default WorkspaceTracker // 导出 WorkspaceTracker
