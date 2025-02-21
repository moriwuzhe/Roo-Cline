/*
提及正则表达式：
- **目的**： 
  - 识别并突出显示以 '@' 开头的特定提及。
  - 这些提及可以是文件路径、URL 或确切的单词 'problems'。
  - 确保不包括尾随标点符号（如逗号、句号等），允许标点符号跟随提及而不成为其一部分。

- **正则表达式解析**：
  - `/@`: 
	- **@**：提及必须以 '@' 符号开头。
  
  - `((?:\/|\w+:\/\/)[^\s]+?|problems\b|git-changes\b)`:
	- **捕获组 (`(...)`)**：捕获与指定模式匹配的字符串部分。
	- `(?:\/|\w+:\/\/)`: 
	  - **非捕获组 (`(?:...)`)**：分组替代项而不捕获它们以供反向引用。
	  - `\/`: 
		- **斜杠 (`/`)**：表示提及是以 '/' 开头的文件或文件夹路径。
	  - `|`：逻辑或。
	  - `\w+:\/\/`: 
		- **协议 (`\w+://`)**：匹配以单词字符序列开头并以 '://' 结尾的 URL，例如 'http://', 'https://', 'ftp://' 等。
	- `[^\s]+?`: 
	  - **非空白字符 (`[^\s]+`)**：匹配一个或多个非空白字符。
	  - **非贪婪 (`+?`)**：确保尽可能小的匹配，防止包含尾随标点符号。
	- `|`：逻辑或。
	- `problems\b`: 
	  - **确切单词 ('problems')**：匹配确切的单词 'problems'。
	  - **单词边界 (`\b`)**：确保 'problems' 作为一个完整的单词匹配，而不是作为另一个单词的一部分（例如 'problematic'）。
		- `|`：逻辑或。
	- `problems\b`: 
	  - **确切单词 ('git-changes')**：匹配确切的单词 'git-changes'。
	  - **单词边界 (`\b`)**：确保 'git-changes' 作为一个完整的单词匹配，而不是作为另一个单词的一部分。  

  - `(?=[.,;:!?]?(?=[\s\r\n]|$))`:
	- **正向前瞻 (`(?=...)`)**：确保匹配后跟随特定模式而不包括它们在匹配中。
	- `[.,;:!?]?`: 
	  - **可选标点符号 (`[.,;:!?]?`)**：匹配零个或一个指定的标点符号。
	- `(?=[\s\r\n]|$)`: 
	  - **嵌套正向前瞻 (`(?=[\s\r\n]|$)`)**：确保标点符号（如果存在）后跟随一个空白字符、换行符或字符串的结尾。
  
- **总结**：
  - 正则表达式有效匹配：
	- 以 '/' 开头并包含任何非空白字符（包括路径中的句点）的文件或文件夹路径的提及。
	- 以协议（如 'http://'）开头并跟随任何非空白字符（包括查询参数）的 URL。
	- 确切的单词 'problems'。
	- 确切的单词 'git-changes'。
  - 它确保任何尾随标点符号（如 ','，'.'，'!' 等）不包括在匹配的提及中，允许标点符号自然地跟随提及在文本中。

- **全局正则表达式**：
  - `mentionRegexGlobal`：创建 `mentionRegex` 的全局版本，以在给定字符串中查找所有匹配项。

*/
export const mentionRegex =
	/@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/
export const mentionRegexGlobal = new RegExp(mentionRegex.source, "g")

export interface MentionSuggestion {
	type: "file" | "folder" | "git" | "problems"
	label: string
	description?: string
	value: string
	icon?: string
}

export interface GitMentionSuggestion extends MentionSuggestion {
	type: "git"
	hash: string
	shortHash: string
	subject: string
	author: string
	date: string
}

export function formatGitSuggestion(commit: {
	hash: string
	shortHash: string
	subject: string
	author: string
	date: string
}): GitMentionSuggestion {
	return {
		type: "git",
		label: commit.subject,
		description: `${commit.shortHash} by ${commit.author} on ${commit.date}`,
		value: commit.hash,
		icon: "$(git-commit)", // VSCode git commit icon
		hash: commit.hash,
		shortHash: commit.shortHash,
		subject: commit.subject,
		author: commit.author,
		date: commit.date,
	}
}
