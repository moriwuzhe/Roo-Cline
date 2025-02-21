/*
- class definitions
- method definitions
- named function declarations
- arrow functions and function expressions assigned to variables
*/
export default `
(
  (comment)* @doc // 匹配注释
  .
  (method_definition
    name: (property_identifier) @name) @definition.method // 匹配方法定义，并捕获方法名
  (#not-eq? @name "constructor") // 排除构造函数
  (#strip! @doc "^[\\s\\*/]+|^[\\s\\*/]$") // 去除注释中的无关字符
  (#select-adjacent! @doc @definition.method) // 选择与方法定义相邻的注释
)

(
  (comment)* @doc // 匹配注释
  .
  [
    (class
      name: (_) @name) // 匹配类定义，并捕获类名
    (class_declaration
      name: (_) @name) // 匹配类声明，并捕获类名
  ] @definition.class
  (#strip! @doc "^[\\s\\*/]+|^[\\s\\*/]$") // 去除注释中的无关字符
  (#select-adjacent! @doc @definition.class) // 选择与类定义相邻的注释
)

(
  (comment)* @doc // 匹配注释
  .
  [
    (function_declaration
      name: (identifier) @name) // 匹配函数声明，并捕获函数名
    (generator_function_declaration
      name: (identifier) @name) // 匹配生成器函数声明，并捕获函数名
  ] @definition.function
  (#strip! @doc "^[\\s\\*/]+|^[\\s\\*/]$") // 去除注释中的无关字符
  (#select-adjacent! @doc @definition.function) // 选择与函数定义相邻的注释
)

(
  (comment)* @doc // 匹配注释
  .
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(arrow_function) (function_expression)]) @definition.function) // 匹配箭头函数和函数表达式，并捕获变量名
  (#strip! @doc "^[\\s\\*/]+|^[\\s\\*/]$") // 去除注释中的无关字符
  (#select-adjacent! @doc @definition.function) // 选择与函数定义相邻的注释
)

(
  (comment)* @doc // 匹配注释
  .
  (variable_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(arrow_function) (function_expression)]) @definition.function) // 匹配箭头函数和函数表达式，并捕获变量名
  (#strip! @doc "^[\\s\\*/]+|^[\\s\\*/]$") // 去除注释中的无关字符
  (#select-adjacent! @doc @definition.function) // 选择与函数定义相邻的注释
)
`
