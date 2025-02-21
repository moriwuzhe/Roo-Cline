import * as vscode from "vscode" // 导入 VS Code API
import WorkspaceTracker from "../WorkspaceTracker" // 导入 WorkspaceTracker
import { ClineProvider } from "../../../core/webview/ClineProvider" // 导入 ClineProvider
import { listFiles } from "../../../services/glob/list-files" // 导入 listFiles 函数

// 模拟模块
const mockOnDidCreate = jest.fn() // 模拟文件创建事件
const mockOnDidDelete = jest.fn() // 模拟文件删除事件
const mockOnDidChange = jest.fn() // 模拟标签变化事件
const mockDispose = jest.fn() // 模拟释放资源

const mockWatcher = {
	onDidCreate: mockOnDidCreate.mockReturnValue({ dispose: mockDispose }), // 模拟文件创建事件
	onDidDelete: mockOnDidDelete.mockReturnValue({ dispose: mockDispose }), // 模拟文件删除事件
	dispose: mockDispose, // 模拟释放资源
}

jest.mock("vscode", () => ({
	window: {
		tabGroups: {
			onDidChangeTabs: jest.fn(() => ({ dispose: jest.fn() })), // 模拟标签变化事件
			all: [], // 模拟所有标签组
		},
	},
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" }, // 模拟工作区文件夹路径
				name: "test", // 模拟工作区名称
				index: 0, // 模拟工作区索引
			},
		],
		createFileSystemWatcher: jest.fn(() => mockWatcher), // 模拟创建文件系统监视器
		fs: {
			stat: jest.fn().mockResolvedValue({ type: 1 }), // 模拟文件状态（FileType.File = 1）
		},
	},
	FileType: { File: 1, Directory: 2 }, // 模拟文件类型
}))

jest.mock("../../../services/glob/list-files") // 模拟 listFiles 函数

describe("WorkspaceTracker", () => {
	let workspaceTracker: WorkspaceTracker // 工作区跟踪器实例
	let mockProvider: ClineProvider // 模拟 ClineProvider

	beforeEach(() => {
		jest.clearAllMocks() // 清除所有模拟
		jest.useFakeTimers() // 使用模拟计时器

		// 创建模拟的 ClineProvider
		mockProvider = {
			postMessageToWebview: jest.fn().mockResolvedValue(undefined), // 模拟发送消息到 Webview
		} as unknown as ClineProvider & { postMessageToWebview: jest.Mock }

		// 创建工作区跟踪器实例
		workspaceTracker = new WorkspaceTracker(mockProvider)
	})

	it("should initialize with workspace files", async () => {
		const mockFiles = [["/test/workspace/file1.ts", "/test/workspace/file2.ts"], false] // 模拟文件列表
		;(listFiles as jest.Mock).mockResolvedValue(mockFiles) // 模拟 listFiles 函数返回值

		await workspaceTracker.initializeFilePaths() // 初始化文件路径
		jest.runAllTimers() // 运行所有计时器

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "workspaceUpdated", // 消息类型
			filePaths: expect.arrayContaining(["file1.ts", "file2.ts"]), // 文件路径
			openedTabs: [], // 打开的标签
		})
		expect((mockProvider.postMessageToWebview as jest.Mock).mock.calls[0][0].filePaths).toHaveLength(2) // 检查文件路径长度
	})

	it("should handle file creation events", async () => {
		// 获取创建回调并调用它
		const [[callback]] = mockOnDidCreate.mock.calls
		await callback({ fsPath: "/test/workspace/newfile.ts" }) // 模拟文件创建事件
		jest.runAllTimers() // 运行所有计时器

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "workspaceUpdated", // 消息类型
			filePaths: ["newfile.ts"], // 文件路径
			openedTabs: [], // 打开的标签
		})
	})

	it("should handle file deletion events", async () => {
		// 首先添加一个文件
		const [[createCallback]] = mockOnDidCreate.mock.calls
		await createCallback({ fsPath: "/test/workspace/file.ts" }) // 模拟文件创建事件
		jest.runAllTimers() // 运行所有计时器

		// 然后删除它
		const [[deleteCallback]] = mockOnDidDelete.mock.calls
		await deleteCallback({ fsPath: "/test/workspace/file.ts" }) // 模拟文件删除事件
		jest.runAllTimers() // 运行所有计时器

		// 最后一次调用应该有空的文件路径
		expect(mockProvider.postMessageToWebview).toHaveBeenLastCalledWith({
			type: "workspaceUpdated", // 消息类型
			filePaths: [], // 文件路径
			openedTabs: [], // 打开的标签
		})
	})

	it("should handle directory paths correctly", async () => {
		// 模拟 stat 返回目录类型
		;(vscode.workspace.fs.stat as jest.Mock).mockResolvedValueOnce({ type: 2 }) // FileType.Directory = 2

		const [[callback]] = mockOnDidCreate.mock.calls
		await callback({ fsPath: "/test/workspace/newdir" }) // 模拟文件创建事件
		jest.runAllTimers() // 运行所有计时器

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "workspaceUpdated", // 消息类型
			filePaths: expect.arrayContaining(["newdir"]), // 文件路径
			openedTabs: [], // 打开的标签
		})
		const lastCall = (mockProvider.postMessageToWebview as jest.Mock).mock.calls.slice(-1)[0]
		expect(lastCall[0].filePaths).toHaveLength(1) // 检查文件路径长度
	})

	it("should respect file limits", async () => {
		// 创建唯一文件路径数组用于初始加载
		const files = Array.from({ length: 1001 }, (_, i) => `/test/workspace/file${i}.ts`)
		;(listFiles as jest.Mock).mockResolvedValue([files, false]) // 模拟 listFiles 函数返回值

		await workspaceTracker.initializeFilePaths() // 初始化文件路径
		jest.runAllTimers() // 运行所有计时器

		// 初始加载应只有 1000 个文件
		const expectedFiles = Array.from({ length: 1000 }, (_, i) => `file${i}.ts`).sort()
		const calls = (mockProvider.postMessageToWebview as jest.Mock).mock.calls

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "workspaceUpdated", // 消息类型
			filePaths: expect.arrayContaining(expectedFiles), // 文件路径
			openedTabs: [], // 打开的标签
		})
		expect(calls[0][0].filePaths).toHaveLength(1000) // 检查文件路径长度

		// 应允许添加最多 2000 个文件
		const [[callback]] = mockOnDidCreate.mock.calls
		for (let i = 0; i < 1000; i++) {
			await callback({ fsPath: `/test/workspace/extra${i}.ts` }) // 模拟文件创建事件
		}
		jest.runAllTimers() // 运行所有计时器

		const lastCall = (mockProvider.postMessageToWebview as jest.Mock).mock.calls.slice(-1)[0]
		expect(lastCall[0].filePaths).toHaveLength(2000) // 检查文件路径长度

		// 添加超过 2000 个文件不应增加计数
		await callback({ fsPath: "/test/workspace/toomany.ts" }) // 模拟文件创建事件
		jest.runAllTimers() // 运行所有计时器

		const finalCall = (mockProvider.postMessageToWebview as jest.Mock).mock.calls.slice(-1)[0]
		expect(finalCall[0].filePaths).toHaveLength(2000) // 检查文件路径长度
	})

	it("should clean up watchers and timers on dispose", () => {
		workspaceTracker.dispose() // 释放资源
		expect(mockDispose).toHaveBeenCalled() // 检查是否调用了释放资源
		jest.runAllTimers() // 确保清除所有待处理的计时器
	})
})
