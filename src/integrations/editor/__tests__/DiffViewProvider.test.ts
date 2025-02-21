import { DiffViewProvider } from "../DiffViewProvider" // 导入 DiffViewProvider 模块
import * as vscode from "vscode" // 导入 VSCode 模块

// 模拟 vscode
jest.mock("vscode", () => ({
	workspace: {
		applyEdit: jest.fn(), // 模拟 applyEdit 函数
	},
	window: {
		createTextEditorDecorationType: jest.fn(), // 模拟 createTextEditorDecorationType 函数
	},
	WorkspaceEdit: jest.fn().mockImplementation(() => ({
		replace: jest.fn(), // 模拟 replace 函数
		delete: jest.fn(), // 模拟 delete 函数
	})),
	Range: jest.fn(), // 模拟 Range 构造函数
	Position: jest.fn(), // 模拟 Position 构造函数
	Selection: jest.fn(), // 模拟 Selection 构造函数
	TextEditorRevealType: {
		InCenter: 2, // 模拟 TextEditorRevealType 枚举
	},
}))

// 模拟 DecorationController
jest.mock("../DecorationController", () => ({
	DecorationController: jest.fn().mockImplementation(() => ({
		setActiveLine: jest.fn(), // 模拟 setActiveLine 函数
		updateOverlayAfterLine: jest.fn(), // 模拟 updateOverlayAfterLine 函数
		clear: jest.fn(), // 模拟 clear 函数
	})),
}))

describe("DiffViewProvider", () => {
	let diffViewProvider: DiffViewProvider
	const mockCwd = "/mock/cwd" // 模拟当前工作目录
	let mockWorkspaceEdit: { replace: jest.Mock; delete: jest.Mock }

	beforeEach(() => {
		jest.clearAllMocks() // 清除所有模拟
		mockWorkspaceEdit = {
			replace: jest.fn(), // 模拟 replace 函数
			delete: jest.fn(), // 模拟 delete 函数
		}
		;(vscode.WorkspaceEdit as jest.Mock).mockImplementation(() => mockWorkspaceEdit)

		diffViewProvider = new DiffViewProvider(mockCwd)
		// 模拟必要的属性和方法
		;(diffViewProvider as any).relPath = "test.txt"
		;(diffViewProvider as any).activeDiffEditor = {
			document: {
				uri: { fsPath: `${mockCwd}/test.txt` },
				getText: jest.fn(),
				lineCount: 10,
			},
			selection: {
				active: { line: 0, character: 0 },
				anchor: { line: 0, character: 0 },
			},
			edit: jest.fn().mockResolvedValue(true),
			revealRange: jest.fn(),
		}
		;(diffViewProvider as any).activeLineController = { setActiveLine: jest.fn(), clear: jest.fn() }
		;(diffViewProvider as any).fadedOverlayController = { updateOverlayAfterLine: jest.fn(), clear: jest.fn() }
	})

	describe("update method", () => {
		it("should preserve empty last line when original content has one", async () => {
			;(diffViewProvider as any).originalContent = "Original content\n"
			await diffViewProvider.update("New content", true)

			expect(mockWorkspaceEdit.replace).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				"New content\n",
			)
		})

		it("should not add extra newline when accumulated content already ends with one", async () => {
			;(diffViewProvider as any).originalContent = "Original content\n"
			await diffViewProvider.update("New content\n", true)

			expect(mockWorkspaceEdit.replace).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				"New content\n",
			)
		})

		it("should not add newline when original content does not end with one", async () => {
			;(diffViewProvider as any).originalContent = "Original content"
			await diffViewProvider.update("New content", true)

			expect(mockWorkspaceEdit.replace).toHaveBeenCalledWith(expect.anything(), expect.anything(), "New content")
		})
	})
})
