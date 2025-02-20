<div align="center">
  <h2>加入 Roo Code 社区</h2>
  <p>与开发者联系，贡献想法，并保持最新的 AI 驱动编码工具。</p>
  
  <a href="https://discord.gg/roocode" target="_blank"><img src="https://img.shields.io/badge/Join%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="加入 Discord" height="60"></a>
  <a href="https://www.reddit.com/r/RooCode/" target="_blank"><img src="https://img.shields.io/badge/Join%20Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white" alt="加入 Reddit" height="60"></a>
  
</div>
<br>
<br>

<div align="center">
<h1>Roo Code（原名 Roo Cline）</h1>

<a href="https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline" target="_blank"><img src="https://img.shields.io/badge/Download%20on%20VS%20Marketplace-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="在 VS Marketplace 下载"></a>
<a href="https://github.com/RooVetGit/Roo-Code/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop" target="_blank"><img src="https://img.shields.io/badge/Feature%20Requests-yellow?style=for-the-badge" alt="功能请求"></a>
<a href="https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline&ssr=false#review-details" target="_blank"><img src="https://img.shields.io/badge/Rate%20%26%20Review-green?style=for-the-badge" alt="评分与评论"></a>

</div>

**Roo Code** 是一个 AI 驱动的 **自主编码代理**，它存在于你的编辑器中。它可以：

- 用自然语言交流
- 直接在你的工作区中读取和写入文件
- 运行终端命令
- 自动化浏览器操作
- 与任何 OpenAI 兼容或自定义 API/模型集成
- 通过 **自定义模式** 适应其“个性”和能力

无论你是在寻找一个灵活的编码伙伴、系统架构师，还是像 QA 工程师或产品经理这样的专业角色，Roo Code 都可以帮助你更高效地构建软件。

查看 [更新日志](CHANGELOG.md) 了解详细的更新和修复。

---

## 3.3 版新功能：代码操作、更强大的模式和新的 Discord！🚀

此版本带来了与 Roo Code 交互的重大改进：

### 代码操作

Roo Code 现在直接与 VS Code 的本地代码操作系统集成，在你的编辑器中提供快速修复和重构选项。寻找灯泡 💡 以访问 Roo Code 的功能，而无需切换上下文。

### 增强的模式功能

- **Markdown 编辑**：响应最受欢迎的功能请求，Ask 和 Architect 模式现在可以创建和编辑 markdown 文件！
- **自定义文件限制**：一般来说，自定义模式现在可以限制特定的文件模式（例如，一个只能编辑 markdown 文件的技术写作者 👋）。目前还没有 UI，但你可以直接让 Roo 设置。
- **自发模式切换**：模式可以根据任务智能地请求切换。例如，Code 模式在准备编写测试时可能会请求切换到 Test Engineer 模式。

### 加入我们的 Discord！

我们推出了一个新的 Discord 社区！加入我们：[https://roocode.com/discord](https://roocode.com/discord)：

- 分享你的自定义模式
- 获取帮助和支持
- 与其他 Roo Code 用户联系
- 了解最新功能

## 3.2 版新功能：引入自定义模式，以及从 Roo Cline → Roo Code 的品牌重塑！🚀

### 引入 Roo Code

我们最大的更新来了——我们正式将名称从 Roo Cline 改为 Roo Code！在 VS Marketplace 和 Open VSX 上安装量超过 50,000 次后，我们准备开辟自己的道路。衷心感谢 Cline 社区的每一位成员，帮助我们达到了这一里程碑。

### 自定义模式

为了标志这一新篇章，我们引入了将 Roo Code 变成你需要的任何角色的能力。你现在可以创建一个由深度定制的提示组成的代理团队：

- 编写详细测试用例并捕捉边缘情况的 QA 工程师
- 擅长用户故事和功能优先级的产品经理
- 设计美观、可访问界面的 UI/UX 设计师
- 确保质量和可维护性的代码审查员

最棒的是，Roo 可以帮助你创建这些新模式！只需在聊天中输入“为 <X> 创建新模式”即可开始，然后进入提示选项卡或（小心地）编辑 JSON 表示来定制提示和允许的工具。

我们迫不及待地想听到你构建的内容以及我们如何继续发展 Roo Code 平台以支持你。请加入我们的新 https://www.reddit.com/r/RooCode subreddit 分享你的自定义模式，并成为我们下一章的一部分。🚀

## 3.1 版新功能：聊天模式提示自定义和提示增强

紧随 **v3.0** 引入 Code、Architect 和 Ask 聊天模式之后，最受欢迎的功能之一来了：**每种模式的可定制提示**！🎉

你现在可以为每个聊天模式量身定制 **角色定义** 和 **自定义指令**，以完美适应你的工作流程。想调整 Architect 模式以更关注系统可扩展性？或调整 Ask 模式以进行更深入的研究查询？搞定。此外，你可以通过 **模式特定的 `.clinerules-[mode]` 文件** 定义这些。你会在新的 **提示** 选项卡中找到所有这些。

此版本的第二大功能是 **提示增强** 的全面改进。此功能帮助你编写消息，以从 Cline 获得更好的结果。以下是新功能：

- 适用于 **任何提供商** 和 API 配置，不仅限于 OpenRouter。
- 完全可定制的提示，以匹配你的独特需求。
- 同样简单的工作流程：只需点击聊天输入中的 ✨ **增强提示** 按钮即可试用。

无论你是使用 GPT-4、其他 API 还是切换配置，这都能让你完全控制提示的优化方式。

一如既往，我们很想听到你的想法和建议！你希望在 **v3.2** 中看到哪些功能？访问 https://www.reddit.com/r/roocline 并加入讨论——我们一起构建 Roo Cline。🚀

## 3.0 版新功能 - 聊天模式！

你现在可以选择不同的提示，以更好地适应你的工作流程。以下是可用的模式：

- **Code**：（现有行为）默认模式，Cline 帮助你编写代码和执行任务。

- **Architect**：“你是 Cline，一位软件架构专家……” 适合思考高层次的技术设计和系统架构。不能编写代码或运行命令。

- **Ask**：“你是 Cline，一位知识渊博的技术助手……” 适合询问代码库或深入研究概念。也不能编写代码或运行命令。

**切换模式：**
非常简单！在聊天输入的左下角有一个下拉菜单可以切换模式。旁边还有一个切换当前模式关联的 API 配置文件的方法（在设置屏幕上配置）。

**为什么添加这个？**

- 它可以防止 Cline 过于急于解决问题，当你只是想思考或提问时。
- 每个模式都会记住你上次使用的 API 配置。例如，你可以在 Architect 和 Ask 模式中使用更深思熟虑的模型，如 OpenAI o1，而在编码任务中使用 Sonnet 或 DeepSeek。
- 它基于研究表明，将“思考”与“编码”分开可以获得更好的结果，这在 aider 的这篇非常有见地的 [文章](https://aider.chat/2024/09/26/architect.html) 中得到了很好的解释。

目前，切换模式是一个手动过程。未来，我们希望让 Cline 能够根据上下文建议模式切换。现在，我们非常感谢你对这个功能的反馈。

---

## 主要功能

### 自适应自主性

Roo Code 以 **自然语言** 进行交流并提出操作建议——文件编辑、终端命令、浏览器测试等。你可以选择它的行为方式：

- **手动批准**：审查并批准每一步，以保持完全控制。
- **自主/自动批准**：授予 Roo Code 执行任务的权限，无需中断，加快日常工作流程。
- **混合**：自动批准特定操作（例如文件写入），但需要确认风险较高的任务（如部署代码）。

无论你的偏好如何，你始终对 Roo Code 的操作拥有最终决定权。

---

### 支持任何 API 或模型

使用 Roo Code：

- **OpenRouter**、Anthropic、Glama、OpenAI、Google Gemini、AWS Bedrock、Azure、GCP Vertex 或本地模型（LM Studio/Ollama）——任何 **OpenAI 兼容** 的模型。
- 每种模式使用不同的模型。例如，架构使用高级模型，而日常编码任务使用便宜的模型。
- **使用跟踪**：Roo Code 监控每个会话的令牌和成本使用情况。

---

### 自定义模式

**自定义模式** 让你可以塑造 Roo Code 的角色、指令和权限：

- **内置**：
    - **Code** – 默认的多用途编码助手
    - **Architect** – 高层次系统和设计见解
    - **Ask** – 深入探索的研究和问答
- **用户创建**：输入 `Create a new mode for <X>`，Roo Code 会为该角色生成一个全新的角色——包括定制的提示和可选的工具限制。

每种模式都可以有独特的指令和技能集。在 **提示** 选项卡中管理它们。

**高级模式功能：**

- **文件限制**：模式可以限制特定文件类型（例如，Ask 和 Architect 模式可以编辑 markdown 文件）
- **自定义文件规则**：定义你自己的文件访问模式（例如，仅限 `.test.ts` 测试文件）
- **直接模式切换**：模式可以请求切换到其他模式（例如，切换到 Code 模式进行实现）
- **自我创建**：Roo Code 可以帮助创建新模式，包括角色定义和文件限制

---

### 文件和编辑器操作

Roo Code 可以：

- **创建和编辑** 项目中的文件（显示差异）。
- **响应** 自动修复 linting 或编译时错误（缺少导入、语法错误等）。
- **跟踪更改** 通过编辑器的时间线，以便你可以审查或还原。

---

### 命令行集成

轻松在终端中运行命令——Roo Code：

- 安装包、运行构建或执行测试。
- 监控输出并在检测到错误时进行调整。
- 让你在继续工作时保持开发服务器运行。

你可以批准或拒绝每个命令，或为常规操作设置自动批准。

---

### 浏览器自动化

Roo Code 还可以打开 **浏览器** 会话：

- 启动本地或远程 web 应用。
- 点击、输入、滚动和捕获屏幕截图。
- 收集控制台日志以调试运行时或 UI/UX 问题。

非常适合 **端到端测试** 或在不需要不断复制粘贴的情况下进行视觉验证。

---

### 使用 MCP 添加工具

使用 **模型上下文协议（MCP）** 扩展 Roo Code：

- “添加一个管理 AWS EC2 资源的工具。”
- “添加一个查询公司 Jira 的工具。”
- “添加一个拉取最新 PagerDuty 事件的工具。”

Roo Code 可以自主构建和配置新工具（需要你的批准），以立即扩展其功能。

---

### 上下文提及

当你需要提供额外的上下文时：

- **@file** – 在对话中嵌入文件内容。
- **@folder** – 包含整个文件夹结构。
- **@problems** – 拉取工作区错误/警告供 Roo Code 修复。
- **@url** – 从 URL 获取文档，将其转换为 markdown。
- **@git** – 提供 Git 提交或差异列表供 Roo Code 分析代码历史。

帮助 Roo Code 专注于最相关的细节，而不会超出令牌预算。

---

## 安装

Roo Code 可在以下平台获取：

- **[VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)**
- **[Open-VSX](https://open-vsx.org/extension/RooVeterinaryInc/roo-cline)**

1. **在编辑器的扩展面板中搜索“Roo Code”** 以直接安装。
2. 或从 Marketplace / Open-VSX 获取 `.vsix` 文件并 **拖放** 到编辑器中。
3. **从活动栏或命令面板中打开** Roo Code 开始聊天。

> **提示**：使用 `Cmd/Ctrl + Shift + P` → “Roo Code: Open in New Tab” 将 AI 助手停靠在文件资源管理器旁边。

---

## 本地设置与开发

1. **克隆** 仓库：
    ```bash
    git clone https://github.com/RooVetGit/Roo-Code.git
    ```
2. **安装依赖**：
    ```bash
    npm run install:all
    ```
3. **构建** 扩展：
    ```bash
    npm run build
    ```
    - 一个 `.vsix` 文件将出现在 `bin/` 目录中。
4. **手动安装** `.vsix` 文件（如果需要）：
    ```bash
    code --install-extension bin/roo-code-4.0.0.vsix
    ```
5. **启动 webview（Vite/React 应用，带 HMR）**：
    ```bash
    npm run dev
    ```
6. **调试**：
    - 在 VSCode 中按 `F5`（或 **运行** → **开始调试**）以打开一个加载了 Roo Code 的新会话。

对 webview 的更改将立即生效。对核心扩展的更改需要重新启动扩展主机。

我们使用 [changesets](https://github.com/changesets/changesets) 进行版本控制和发布。查看我们的 [CHANGELOG.md](http://_vscodecontentref_/1) 了解发布说明。

---

## 免责声明

**请注意**，Roo Veterinary, Inc 不对 Roo Code 提供或提供的任何代码、模型或其他工具，任何相关的第三方工具或任何结果输出做出任何陈述或保证。你承担使用任何此类工具或输出的 **所有风险**；此类工具按 **“原样”** 和 **“可用”** 基础提供。此类风险可能包括但不限于知识产权侵权、网络漏洞或攻击、偏见、不准确、错误、缺陷、病毒、停机、财产损失或损坏和/或人身伤害。你对使用任何此类工具或输出（包括但不限于其合法性、适当性和结果）负全部责任。

---

## 贡献

我们欢迎社区贡献！以下是参与方式：

1. **检查问题和请求**：查看 [开放问题](https://github.com/RooVetGit/Roo-Code/issues) 或 [功能请求](https://github.com/RooVetGit/Roo-Code/discussions/categories/feature-requests)。
2. **从 `main` 分支 fork 并创建分支**。
3. **提交 Pull Request** 一旦你的功能或修复准备就绪。
4. **加入** 我们的 [Reddit 社区](https://www.reddit.com/r/RooCode/) 和 [Discord](https://roocode.com/discord) 获取反馈、提示和公告。

---

## 许可证

Apache 2.0 © 2025 Roo Veterinary, Inc.

---

**享受 Roo Code！** 无论你是将其保持在短绳上还是让它自主漫游，我们都迫不及待地想看到你构建的内容。如果你有问题或功能想法，请访问我们的 [Reddit 社区](https://www.reddit.com/r/RooCode/) 或 [Discord](https://roocode.com/discord)。祝编码愉快！<div align="center">

  <h2>Join the Roo Code Community</h2>
  <p>Connect with developers, contribute ideas, and stay ahead with the latest AI-powered coding tools.</p>
  
  <a href="https://discord.gg/roocode" target="_blank"><img src="https://img.shields.io/badge/Join%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord" height="60"></a>
  <a href="https://www.reddit.com/r/RooCode/" target="_blank"><img src="https://img.shields.io/badge/Join%20Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white" alt="Join Reddit" height="60"></a>
  
</div>
<br>
<br>

<div align="center">
<h1>Roo Code (prev. Roo Cline)</h1>

<a href="https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline" target="_blank"><img src="https://img.shields.io/badge/Download%20on%20VS%20Marketplace-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="Download on VS Marketplace"></a>
<a href="https://github.com/RooVetGit/Roo-Code/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop" target="_blank"><img src="https://img.shields.io/badge/Feature%20Requests-yellow?style=for-the-badge" alt="Feature Requests"></a>
<a href="https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline&ssr=false#review-details" target="_blank"><img src="https://img.shields.io/badge/Rate%20%26%20Review-green?style=for-the-badge" alt="Rate & Review"></a>

</div>

**Roo Code** is an AI-powered **autonomous coding agent** that lives in your editor. It can:

- Communicate in natural language
- Read and write files directly in your workspace
- Run terminal commands
- Automate browser actions
- Integrate with any OpenAI-compatible or custom API/model
- Adapt its “personality” and capabilities through **Custom Modes**

Whether you’re seeking a flexible coding partner, a system architect, or specialized roles like a QA engineer or product manager, Roo Code can help you build software more efficiently.

Check out the [CHANGELOG](CHANGELOG.md) for detailed updates and fixes.

---

## New in 3.3: Code Actions, More Powerful Modes, and a new Discord! 🚀

This release brings significant improvements to how you interact with Roo Code:

### Code Actions

Roo Code now integrates directly with VS Code's native code actions system, providing quick fixes and refactoring options right in your editor. Look for the lightbulb 💡 to access Roo Code's capabilities without switching context.

### Enhanced Mode Capabilities

- **Markdown Editing**: Addressing one of the most requested features, Ask and Architect modes can now create and edit markdown files!
- **Custom File Restrictions**: In general, custom modes can now be restricted to specific file patterns (for example, a technical writer who can only edit markdown files 👋). There's no UI for this yet, but who needs that when you can just ask Roo to set it up for you?
- **Self-Initiated Mode Switching**: Modes can intelligently request to switch between each other based on the task at hand. For instance, Code mode might request to switch to Test Engineer mode once it's ready to write tests.

### Join Our Discord!

We've launched a new Discord community! Join us at [https://roocode.com/discord](https://roocode.com/discord) to:

- Share your custom modes
- Get help and support
- Connect with other Roo Code users
- Stay updated on the latest features

## New in 3.2: Introducing Custom Modes, plus rebranding from Roo Cline → Roo Code! 🚀

### Introducing Roo Code

Our biggest update yet is here - we're officially changing our name from Roo Cline to Roo Code! After growing beyond 50,000 installations across VS Marketplace and Open VSX, we're ready to chart our own course. Our heartfelt thanks to everyone in the Cline community who helped us reach this milestone.

### Custom Modes

To mark this new chapter, we're introducing the power to shape Roo Code into any role you need. You can now create an entire team of agents with deeply customized prompts:

- QA Engineers who write thorough test cases and catch edge cases
- Product Managers who excel at user stories and feature prioritization
- UI/UX Designers who craft beautiful, accessible interfaces
- Code Reviewers who ensure quality and maintainability

The best part is that Roo can help you create these new modes! Just type "Create a new mode for <X>" in the chat to get started, and go into the Prompts tab or (carefully) edit the JSON representation to customize the prompt and allowed tools to your liking.

We can't wait to hear more about what you build and how we can continue to evolve the Roo Code platform to support you. Please join us in our new https://www.reddit.com/r/RooCode subreddit to share your custom modes and be part of our next chapter. 🚀

## New in 3.1: Chat Mode Prompt Customization & Prompt Enhancements

Hot off the heels of **v3.0** introducing Code, Architect, and Ask chat modes, one of the most requested features has arrived: **customizable prompts for each mode**! 🎉

You can now tailor the **role definition** and **custom instructions** for every chat mode to perfectly fit your workflow. Want to adjust Architect mode to focus more on system scalability? Or tweak Ask mode for deeper research queries? Done. Plus, you can define these via **mode-specific `.clinerules-[mode]` files**. You’ll find all of this in the new **Prompts** tab in the top menu.

The second big feature in this release is a complete revamp of **prompt enhancements**. This feature helps you craft messages to get even better results from Cline. Here’s what’s new:

- Works with **any provider** and API configuration, not just OpenRouter.
- Fully customizable prompts to match your unique needs.
- Same simple workflow: just hit the ✨ **Enhance Prompt** button in the chat input to try it out.

Whether you’re using GPT-4, other APIs, or switching configurations, this gives you total control over how your prompts are optimized.

As always, we’d love to hear your thoughts and ideas! What features do you want to see in **v3.2**? Drop by https://www.reddit.com/r/roocline and join the discussion - we're building Roo Cline together. 🚀

## New in 3.0 - Chat Modes!

You can now choose between different prompts for Roo Cline to better suit your workflow. Here’s what’s available:

- **Code:** (existing behavior) The default mode where Cline helps you write code and execute tasks.

- **Architect:** "You are Cline, a software architecture expert..." Ideal for thinking through high-level technical design and system architecture. Can’t write code or run commands.

- **Ask:** "You are Cline, a knowledgeable technical assistant..." Perfect for asking questions about the codebase or digging into concepts. Also can’t write code or run commands.

**Switching Modes:**
It’s super simple! There’s a dropdown in the bottom left of the chat input to switch modes. Right next to it, you’ll find a way to switch between the API configuration profiles associated with the current mode (configured on the settings screen).

**Why Add This?**

- It keeps Cline from being overly eager to jump into solving problems when you just want to think or ask questions.
- Each mode remembers the API configuration you last used with it. For example, you can use more thoughtful models like OpenAI o1 for Architect and Ask, while sticking with Sonnet or DeepSeek for coding tasks.
- It builds on research suggesting better results when separating "thinking" from "coding," explained well in this very thoughtful [article](https://aider.chat/2024/09/26/architect.html) from aider.

Right now, switching modes is a manual process. In the future, we’d love to give Cline the ability to suggest mode switches based on context. For now, we’d really appreciate your feedback on this feature.

---

## Key Features

### Adaptive Autonomy

Roo Code communicates in **natural language** and proposes actions—file edits, terminal commands, browser tests, etc. You choose how it behaves:

- **Manual Approval**: Review and approve every step to keep total control.
- **Autonomous/Auto-Approve**: Grant Roo Code the ability to run tasks without interruption, speeding up routine workflows.
- **Hybrid**: Auto-approve specific actions (e.g., file writes) but require confirmation for riskier tasks (like deploying code).

No matter your preference, you always have the final say on what Roo Code does.

---

### Supports Any API or Model

Use Roo Code with:

- **OpenRouter**, Anthropic, Glama, OpenAI, Google Gemini, AWS Bedrock, Azure, GCP Vertex, or local models (LM Studio/Ollama)—anything **OpenAI-compatible**.
- Different models per mode. For instance, an advanced model for architecture vs. a cheaper model for daily coding tasks.
- **Usage Tracking**: Roo Code monitors token and cost usage for each session.

---

### Custom Modes

**Custom Modes** let you shape Roo Code’s persona, instructions, and permissions:

- **Built-in**:
    - **Code** – Default, multi-purpose coding assistant
    - **Architect** – High-level system and design insights
    - **Ask** – Research and Q&A for deeper exploration
- **User-Created**: Type `Create a new mode for <X>` and Roo Code generates a brand-new persona for that role—complete with tailored prompts and optional tool restrictions.

Modes can each have unique instructions and skill sets. Manage them in the **Prompts** tab.

**Advanced Mode Features:**

- **File Restrictions**: Modes can be restricted to specific file types (e.g., Ask and Architect modes can edit markdown files)
- **Custom File Rules**: Define your own file access patterns (e.g., `.test.ts` for test files only)
- **Direct Mode Switching**: Modes can request to switch to other modes when needed (e.g., switching to Code mode for implementation)
- **Self-Creation**: Roo Code can help create new modes, complete with role definitions and file restrictions

---

### File & Editor Operations

Roo Code can:

- **Create and edit** files in your project (showing you diffs).
- **React** to linting or compile-time errors automatically (missing imports, syntax errors, etc.).
- **Track changes** via your editor’s timeline so you can review or revert if needed.

---

### Command Line Integration

Easily run commands in your terminal—Roo Code:

- Installs packages, runs builds, or executes tests.
- Monitors output and adapts if it detects errors.
- Lets you keep dev servers running in the background while continuing to work.

You approve or decline each command, or set auto-approval for routine operations.

---

### Browser Automation

Roo Code can also open a **browser** session to:

- Launch your local or remote web app.
- Click, type, scroll, and capture screenshots.
- Collect console logs to debug runtime or UI/UX issues.

Ideal for **end-to-end testing** or visually verifying changes without constant copy-pasting.

---

### Adding Tools with MCP

Extend Roo Code with the **Model Context Protocol (MCP)**:

- “Add a tool that manages AWS EC2 resources.”
- “Add a tool that queries the company Jira.”
- “Add a tool that pulls the latest PagerDuty incidents.”

Roo Code can build and configure new tools autonomously (with your approval) to expand its capabilities instantly.

---

### Context Mentions

When you need to provide extra context:

- **@file** – Embed a file’s contents in the conversation.
- **@folder** – Include entire folder structures.
- **@problems** – Pull in workspace errors/warnings for Roo Code to fix.
- **@url** – Fetch docs from a URL, converting them to markdown.
- **@git** – Supply a list of Git commits or diffs for Roo Code to analyze code history.

Help Roo Code focus on the most relevant details without blowing the token budget.

---

## Installation

Roo Code is available on:

- **[VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)**
- **[Open-VSX](https://open-vsx.org/extension/RooVeterinaryInc/roo-cline)**

1. **Search “Roo Code”** in your editor’s Extensions panel to install directly.
2. Or grab the `.vsix` file from Marketplace / Open-VSX and **drag-and-drop** into your editor.
3. **Open** Roo Code from the Activity Bar or Command Palette to start chatting.

> **Tip**: Use `Cmd/Ctrl + Shift + P` → “Roo Code: Open in New Tab” to dock the AI assistant alongside your file explorer.

---

## Local Setup & Development

1. **Clone** the repo:
    ```bash
    git clone https://github.com/RooVetGit/Roo-Code.git
    ```
2. **Install dependencies**:
    ```bash
    npm run install:all
    ```
3. **Build** the extension:
    ```bash
    npm run build
    ```
    - A `.vsix` file will appear in the `bin/` directory.
4. **Install** the `.vsix` manually if desired:
    ```bash
    code --install-extension bin/roo-code-4.0.0.vsix
    ```
5. **Start the webview (Vite/React app with HMR)**:
    ```bash
    npm run dev
    ```
6. **Debug**:
    - Press `F5` (or **Run** → **Start Debugging**) in VSCode to open a new session with Roo Code loaded.

Changes to the webview will appear immediately. Changes to the core extension will require a restart of the extension host.

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing. Check our `CHANGELOG.md` for release notes.

---

## Disclaimer

**Please note** that Roo Veterinary, Inc does **not** make any representations or warranties regarding any code, models, or other tools provided or made available in connection with Roo Code, any associated third-party tools, or any resulting outputs. You assume **all risks** associated with the use of any such tools or outputs; such tools are provided on an **"AS IS"** and **"AS AVAILABLE"** basis. Such risks may include, without limitation, intellectual property infringement, cyber vulnerabilities or attacks, bias, inaccuracies, errors, defects, viruses, downtime, property loss or damage, and/or personal injury. You are solely responsible for your use of any such tools or outputs (including, without limitation, the legality, appropriateness, and results thereof).

---

## Contributing

We love community contributions! Here’s how to get involved:

1. **Check Issues & Requests**: See [open issues](https://github.com/RooVetGit/Roo-Code/issues) or [feature requests](https://github.com/RooVetGit/Roo-Code/discussions/categories/feature-requests).
2. **Fork & branch** off `main`.
3. **Submit a Pull Request** once your feature or fix is ready.
4. **Join** our [Reddit community](https://www.reddit.com/r/RooCode/) and [Discord](https://roocode.com/discord) for feedback, tips, and announcements.

---

## License

[Apache 2.0 © 2025 Roo Veterinary, Inc.](./LICENSE)

---

**Enjoy Roo Code!** Whether you keep it on a short leash or let it roam autonomously, we can’t wait to see what you build. If you have questions or feature ideas, drop by our [Reddit community](https://www.reddit.com/r/RooCode/) or [Discord](https://roocode.com/discord). Happy coding!
