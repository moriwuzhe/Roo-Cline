import { stringifyVsCodeLmModelSelector, SELECTOR_SEPARATOR } from "../vsCodeSelectorUtils"
import { LanguageModelChatSelector } from "vscode"

describe("vsCodeSelectorUtils", () => {
	describe("stringifyVsCodeLmModelSelector", () => {
		it("should join all defined selector properties with separator", () => {
			// 定义一个包含所有属性的选择器对象
			const selector: LanguageModelChatSelector = {
				vendor: "test-vendor",
				family: "test-family",
				version: "v1",
				id: "test-id",
			}

			// 调用 stringifyVsCodeLmModelSelector 函数并断言结果
			const result = stringifyVsCodeLmModelSelector(selector)
			expect(result).toBe("test-vendor/test-family/v1/test-id")
		})

		it("should skip undefined properties", () => {
			// 定义一个包含部分属性的选择器对象
			const selector: LanguageModelChatSelector = {
				vendor: "test-vendor",
				family: "test-family",
			}

			// 调用 stringifyVsCodeLmModelSelector 函数并断言结果
			const result = stringifyVsCodeLmModelSelector(selector)
			expect(result).toBe("test-vendor/test-family")
		})

		it("should handle empty selector", () => {
			// 定义一个空的选择器对象
			const selector: LanguageModelChatSelector = {}

			// 调用 stringifyVsCodeLmModelSelector 函数并断言结果
			const result = stringifyVsCodeLmModelSelector(selector)
			expect(result).toBe("")
		})

		it("should handle selector with only one property", () => {
			// 定义一个仅包含一个属性的选择器对象
			const selector: LanguageModelChatSelector = {
				vendor: "test-vendor",
			}

			// 调用 stringifyVsCodeLmModelSelector 函数并断言结果
			const result = stringifyVsCodeLmModelSelector(selector)
			expect(result).toBe("test-vendor")
		})
	})
})
