import * as vscode from "vscode" // 导入 VSCode 模块
import { TerminalRegistry } from "../TerminalRegistry" // 导入 TerminalRegistry 模块

// 模拟 vscode.window.createTerminal
const mockCreateTerminal = jest.fn()
jest.mock("vscode", () => ({
	window: {
		createTerminal: (...args: any[]) => {
			mockCreateTerminal(...args) // 调用模拟的 createTerminal 函数
			return {
				exitStatus: undefined, // 返回一个包含 exitStatus 属性的对象
			}
		},
	},
	ThemeIcon: jest.fn(), // 模拟 ThemeIcon 函数
}))

describe("TerminalRegistry", () => {
	beforeEach(() => {
		mockCreateTerminal.mockClear() // 在每个测试之前清除模拟函数的调用记录
	})

	describe("createTerminal", () => {
		it("creates terminal with PAGER set to cat", () => {
			TerminalRegistry.createTerminal("/test/path") // 创建终端

			expect(mockCreateTerminal).toHaveBeenCalledWith({
				cwd: "/test/path", // 检查是否使用正确的工作目录调用了 createTerminal
				name: "Roo Code", // 检查是否使用正确的终端名称调用了 createTerminal
				iconPath: expect.any(Object), // 检查是否使用了图标路径
				env: {
					PAGER: "cat", // 检查是否设置了 PAGER 环境变量
				},
			})
		})
	})
})
