/*
- class definitions
- function definitions
*/
export default `
(class_definition
  name: (identifier) @name.definition.class) @definition.class // 匹配类定义，并捕获类名

(function_definition
  name: (identifier) @name.definition.function) @definition.function // 匹配函数定义，并捕获函数名
`
