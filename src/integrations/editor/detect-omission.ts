/**
 * 检测给定文件内容中的潜在 AI 生成代码遗漏。
 * @param originalFileContent 文件的原始内容。
 * @param newFileContent 要检查的文件的新内容。
 * @param predictedLineCount 新内容的预测行数。
 * @returns 如果检测到潜在遗漏，则返回 true，否则返回 false。
 */
export function detectCodeOmission(
	originalFileContent: string,
	newFileContent: string,
	predictedLineCount: number,
): boolean {
	// 如果预测行数小于 100，则跳过所有检查
	if (!predictedLineCount || predictedLineCount < 100) {
		return false
	}

	const actualLineCount = newFileContent.split("\n").length // 实际行数
	const lengthRatio = actualLineCount / predictedLineCount // 长度比

	const originalLines = originalFileContent.split("\n") // 原始内容的行
	const newLines = newFileContent.split("\n") // 新内容的行
	const omissionKeywords = [
		"remain", // 保持
		"remains", // 保持
		"unchanged", // 不变
		"rest", // 其余
		"previous", // 以前的
		"existing", // 现有的
		"content", // 内容
		"same", // 相同
		"...", // 省略号
	]

	const commentPatterns = [
		/^\s*\/\//, // 大多数语言的单行注释
		/^\s*#/, // Python、Ruby 等的单行注释
		/^\s*\/\*/, // 多行注释开头
		/^\s*{\s*\/\*/, // JSX 注释开头
		/^\s*<!--/, // HTML 注释开头
		/^\s*\[/, // 方括号表示法
	]

	// 如果注释不在原始文件中并且包含遗漏关键字，则将其视为可疑
	for (const line of newLines) {
		if (commentPatterns.some((pattern) => pattern.test(line))) {
			const words = line.toLowerCase().split(/\s+/) // 将行拆分为单词
			if (omissionKeywords.some((keyword) => words.includes(keyword))) {
				if (!originalLines.includes(line)) {
					// 对于 100 行以上的文件，仅在内容减少超过 20% 时标记
					if (lengthRatio <= 0.8) {
						return true
					}
				}
			}
		}
	}

	return false
}
