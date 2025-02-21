/*
- class declarations
- function definitions
- method declarations
*/
export default `
(class_declaration
  name: (name) @name.definition.class) @definition.class // 匹配类声明，并捕获类名

(function_definition
  name: (name) @name.definition.function) @definition.function // 匹配函数定义，并捕获函数名

(method_declaration
  name: (name) @name.definition.function) @definition.function // 匹配方法声明，并捕获方法名
`
