/*
- 方法定义（包括单例方法和别名，带有相关注释）
- 类定义（包括单例类，带有相关注释）
- 模块定义
*/
export default `
(
  (comment)* @doc // 匹配零个或多个注释
  .
  [
    (method
      name: (_) @name.definition.method) @definition.method // 方法定义，匹配方法名称
    (singleton_method
      name: (_) @name.definition.method) @definition.method // 单例方法定义，匹配方法名称
  ]
  (#strip! @doc "^#\\s*") // 去除注释中的井号和空格
  (#select-adjacent! @doc @definition.method) // 选择与方法定义相邻的注释
)

(alias
  name: (_) @name.definition.method) @definition.method // 方法别名，匹配方法名称

(
  (comment)* @doc // 匹配零个或多个注释
  .
  [
    (class
      name: [
        (constant) @name.definition.class // 类定义，匹配类名称
        (scope_resolution
          name: (_) @name.definition.class) // 作用域解析，匹配类名称
      ]) @definition.class
    (singleton_class
      value: [
        (constant) @name.definition.class // 单例类定义，匹配类名称
        (scope_resolution
          name: (_) @name.definition.class) // 作用域解析，匹配类名称
      ]) @definition.class
  ]
  (#strip! @doc "^#\\s*") // 去除注释中的井号和空格
  (#select-adjacent! @doc @definition.class) // 选择与类定义相邻的注释
)

(
  (module
    name: [
      (constant) @name.definition.module // 模块定义，匹配模块名称
      (scope_resolution
        name: (_) @name.definition.module) // 作用域解析，匹配模块名称
    ]) @definition.module
)
`
