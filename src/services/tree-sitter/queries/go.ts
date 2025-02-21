/*
- function declarations (with associated comments)
- method declarations (with associated comments)
- type specifications
*/
export default `
(
  (comment)* @doc // 匹配注释
  .
  (function_declaration
    name: (identifier) @name.definition.function) @definition.function // 匹配函数声明，并捕获函数名
  (#strip! @doc "^//\\s*") // 去除注释中的无关字符
  (#set-adjacent! @doc @definition.function) // 选择与函数定义相邻的注释
)

(
  (comment)* @doc // 匹配注释
  .
  (method_declaration
    name: (field_identifier) @name.definition.method) @definition.method // 匹配方法声明，并捕获方法名
  (#strip! @doc "^//\\s*") // 去除注释中的无关字符
  (#set-adjacent! @doc @definition.method) // 选择与方法定义相邻的注释
)

(type_spec
  name: (type_identifier) @name.definition.type) @definition.type // 匹配类型规范，并捕获类型名
`
