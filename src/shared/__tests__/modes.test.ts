import { isToolAllowedForMode, FileRestrictionError, ModeConfig } from "../modes"

// 测试 isToolAllowedForMode 函数
describe("isToolAllowedForMode", () => {
	// 自定义模式配置
	const customModes: ModeConfig[] = [
		{
			slug: "markdown-editor",
			name: "Markdown Editor",
			roleDefinition: "You are a markdown editor",
			groups: ["read", ["edit", { fileRegex: "\\.md$" }], "browser"],
		},
		{
			slug: "css-editor",
			name: "CSS Editor",
			roleDefinition: "You are a CSS editor",
			groups: ["read", ["edit", { fileRegex: "\\.css$" }], "browser"],
		},
		{
			slug: "test-exp-mode",
			name: "Test Exp Mode",
			roleDefinition: "You are an experimental tester",
			groups: ["read", "edit", "browser"],
		},
	]

	// 测试始终可用的工具
	it("allows always available tools", () => {
		expect(isToolAllowedForMode("ask_followup_question", "markdown-editor", customModes)).toBe(true)
		expect(isToolAllowedForMode("attempt_completion", "markdown-editor", customModes)).toBe(true)
	})

	// 测试不受限制的工具
	it("allows unrestricted tools", () => {
		expect(isToolAllowedForMode("read_file", "markdown-editor", customModes)).toBe(true)
		expect(isToolAllowedForMode("browser_action", "markdown-editor", customModes)).toBe(true)
	})

	// 测试文件限制
	describe("file restrictions", () => {
		// 测试允许编辑匹配的文件
		it("allows editing matching files", () => {
			// 测试 markdown 编辑器模式
			const mdResult = isToolAllowedForMode("write_to_file", "markdown-editor", customModes, undefined, {
				path: "test.md",
				content: "# Test",
			})
			expect(mdResult).toBe(true)

			 // 测试 CSS 编辑器模式
			const cssResult = isToolAllowedForMode("write_to_file", "css-editor", customModes, undefined, {
				path: "styles.css",
				content: ".test { color: red; }",
			})
			expect(cssResult).toBe(true)
		})

		// 测试拒绝编辑不匹配的文件
		it("rejects editing non-matching files", () => {
			// 测试 markdown 编辑器模式下的非 markdown 文件
			expect(() =>
				isToolAllowedForMode("write_to_file", "markdown-editor", customModes, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(FileRestrictionError)
			expect(() =>
				isToolAllowedForMode("write_to_file", "markdown-editor", customModes, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(/\\.md\$/)

			// 测试 CSS 编辑器模式下的非 CSS 文件
			expect(() =>
				isToolAllowedForMode("write_to_file", "css-editor", customModes, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(FileRestrictionError)
			expect(() =>
				isToolAllowedForMode("write_to_file", "css-editor", customModes, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(/\\.css\$/)
		})

		// 测试处理部分流式传输的情况（仅路径，没有内容/差异）
		it("handles partial streaming cases (path only, no content/diff)", () => {
			// 应该允许仅路径的匹配文件（由于未提供内容/差异，因此尚未验证）
			expect(
				isToolAllowedForMode("write_to_file", "markdown-editor", customModes, undefined, {
					path: "test.js",
				}),
			).toBe(true)

			expect(
				isToolAllowedForMode("apply_diff", "markdown-editor", customModes, undefined, {
					path: "test.js",
				}),
			).toBe(true)

			// 也应该允许仅路径的 ask 模式
			expect(
				isToolAllowedForMode("write_to_file", "ask", [], undefined, {
					path: "test.js",
				}),
			).toBe(true)
		})

		// 测试将限制应用于 write_to_file 和 apply_diff
		it("applies restrictions to both write_to_file and apply_diff", () => {
			// 测试 write_to_file
			const writeResult = isToolAllowedForMode("write_to_file", "markdown-editor", customModes, undefined, {
				path: "test.md",
				content: "# Test",
			})
			expect(writeResult).toBe(true)

			// 测试 apply_diff
			const diffResult = isToolAllowedForMode("apply_diff", "markdown-editor", customModes, undefined, {
				path: "test.md",
				diff: "- old\n+ new",
			})
			expect(diffResult).toBe(true)

			// 测试不匹配文件的情况
			expect(() =>
				isToolAllowedForMode("write_to_file", "markdown-editor", customModes, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(FileRestrictionError)

			expect(() =>
				isToolAllowedForMode("apply_diff", "markdown-editor", customModes, undefined, {
					path: "test.js",
					diff: "- old\n+ new",
				}),
			).toThrow(FileRestrictionError)
		})

		// 测试自定义模式下的文件限制错误描述
		it("uses description in file restriction error for custom modes", () => {
			const customModesWithDescription: ModeConfig[] = [
				{
					slug: "docs-editor",
					name: "Documentation Editor",
					roleDefinition: "You are a documentation editor",
					groups: [
						"read",
						["edit", { fileRegex: "\\.(md|txt)$", description: "Documentation files only" }],
						"browser",
					],
				},
			]

			// 测试 write_to_file 的不匹配文件
			expect(() =>
				isToolAllowedForMode("write_to_file", "docs-editor", customModesWithDescription, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(FileRestrictionError)
			expect(() =>
				isToolAllowedForMode("write_to_file", "docs-editor", customModesWithDescription, undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(/Documentation files only/)

			// 测试 apply_diff 的不匹配文件
			expect(() =>
				isToolAllowedForMode("apply_diff", "docs-editor", customModesWithDescription, undefined, {
					path: "test.js",
					diff: "- old\n+ new",
				}),
			).toThrow(FileRestrictionError)
			expect(() =>
				isToolAllowedForMode("apply_diff", "docs-editor", customModesWithDescription, undefined, {
					path: "test.js",
					diff: "- old\n+ new",
				}),
			).toThrow(/Documentation files only/)

			// 测试匹配文件的情况
			expect(
				isToolAllowedForMode("write_to_file", "docs-editor", customModesWithDescription, undefined, {
					path: "test.md",
					content: "# Test",
				}),
			).toBe(true)

			expect(
				isToolAllowedForMode("write_to_file", "docs-editor", customModesWithDescription, undefined, {
					path: "test.txt",
					content: "Test content",
				}),
			).toBe(true)

			// 测试部分流式传输的情况
			expect(
				isToolAllowedForMode("write_to_file", "docs-editor", customModesWithDescription, undefined, {
					path: "test.js",
				}),
			).toBe(true)
		})

		// 测试 ask 模式仅允许编辑 markdown 文件
		it("allows ask mode to edit markdown files only", () => {
			// 应该允许编辑 markdown 文件
			expect(
				isToolAllowedForMode("write_to_file", "ask", [], undefined, {
					path: "test.md",
					content: "# Test",
				}),
			).toBe(true)

			// 应该允许对 markdown 文件应用差异
			expect(
				isToolAllowedForMode("apply_diff", "ask", [], undefined, {
					path: "readme.md",
					diff: "- old\n+ new",
				}),
			).toBe(true)

			// 应该拒绝非 markdown 文件
			expect(() =>
				isToolAllowedForMode("write_to_file", "ask", [], undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(FileRestrictionError)
			expect(() =>
				isToolAllowedForMode("write_to_file", "ask", [], undefined, {
					path: "test.js",
					content: "console.log('test')",
				}),
			).toThrow(/Markdown files only/)

			// 应该保持读取功能
			expect(isToolAllowedForMode("read_file", "ask", [])).toBe(true)
			expect(isToolAllowedForMode("browser_action", "ask", [])).toBe(true)
			expect(isToolAllowedForMode("use_mcp_tool", "ask", [])).toBe(true)
		})
	})

	// 测试处理不存在的模式
	it("handles non-existent modes", () => {
		expect(isToolAllowedForMode("write_to_file", "non-existent", customModes)).toBe(false)
	})

	// 测试尊重工具要求
	it("respects tool requirements", () => {
		const toolRequirements = {
			write_to_file: false,
		}

		expect(isToolAllowedForMode("write_to_file", "markdown-editor", customModes, toolRequirements)).toBe(false)
	})

	// 测试实验性工具
	describe("experimental tools", () => {
		// 测试在实验禁用时禁用工具
		it("disables tools when experiment is disabled", () => {
			const experiments = {
				search_and_replace: false,
				insert_content: false,
			}

			expect(
				isToolAllowedForMode(
					"search_and_replace",
					"test-exp-mode",
					customModes,
					undefined,
					undefined,
					experiments,
				),
			).toBe(false)

			expect(
				isToolAllowedForMode("insert_content", "test-exp-mode", customModes, undefined, undefined, experiments),
			).toBe(false)
		})

		// 测试在实验启用时允许工具
		it("allows tools when experiment is enabled", () => {
			const experiments = {
				search_and_replace: true,
				insert_content: true,
			}

			expect(
				isToolAllowedForMode(
					"search_and_replace",
					"test-exp-mode",
					customModes,
					undefined,
					undefined,
					experiments,
				),
			).toBe(true)

			expect(
				isToolAllowedForMode("insert_content", "test-exp-mode", customModes, undefined, undefined, experiments),
			).toBe(true)
		})

		// 测试在实验禁用时允许非实验性工具
		it("allows non-experimental tools when experiments are disabled", () => {
			const experiments = {
				search_and_replace: false,
				insert_content: false,
			}

			expect(
				isToolAllowedForMode("read_file", "markdown-editor", customModes, undefined, undefined, experiments),
			).toBe(true)
			expect(
				isToolAllowedForMode(
					"write_to_file",
					"markdown-editor",
					customModes,
					undefined,
					{ path: "test.md" },
					experiments,
				),
			).toBe(true)
		})
	})
})

// 测试 FileRestrictionError
describe("FileRestrictionError", () => {
	// 测试在未提供描述时格式化错误消息
	it("formats error message with pattern when no description provided", () => {
		const error = new FileRestrictionError("Markdown Editor", "\\.md$", undefined, "test.js")
		expect(error.message).toBe(
			"This mode (Markdown Editor) can only edit files matching pattern: \\.md$. Got: test.js",
		)
		expect(error.name).toBe("FileRestrictionError")
	})

	// 测试在提供描述时格式化错误消息
	it("formats error message with description when provided", () => {
		const error = new FileRestrictionError("Markdown Editor", "\\.md$", "Markdown files only", "test.js")
		expect(error.message).toBe(
			"This mode (Markdown Editor) can only edit files matching pattern: \\.md$ (Markdown files only). Got: test.js",
		)
		expect(error.name).toBe("FileRestrictionError")
	})
})
