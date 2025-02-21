/*
- function definitions
- struct definitions
- enum definitions
*/
export default `
(function_item
  name: (identifier) @name.definition.function) @definition.function // 匹配函数定义，并捕获函数名

(struct_item
  name: (type_identifier) @name.definition.class) @definition.class // 匹配结构体定义，并捕获结构体名

(enum_item
  name: (type_identifier) @name.definition.enum) @definition.enum // 匹配枚举定义，并捕获枚举名
`
