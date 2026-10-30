# 四层架构图示例

在 MDWork 中直接打开本文件，即可预览和导出下面的静态分层架构图。修改 `layers` 围栏中的文本即可调整层、分组、条目、跨列和连线。

```layers
layer 第一层
title 用户角色
color green
columns 3
item 店长
item 仓库员工
item 管理员

layer 第二层
title 前后端交互
color yellow
columns 2
group 前端
item 页面展示
item 表单校验
end
group 后端
item 接口服务
item 权限验证
end
link 前端 -> 后端 | 请求
link 后端 -> 前端 | 响应

layer 第三层
title 业务功能
color orange
columns 3
group 店长功能
item 销售报表
item 员工管理
item 商品定价
end
group 仓库员工功能
item 入库登记
item 出库登记
item 库存盘点
end
group 管理员功能
columns 2
item 账号管理
item 角色权限
item 参数配置
item 操作日志
item 数据备份
item 系统监控
item 全局系统设置
span 2
end

layer 第四层
title 基础设施
color red
columns 2
group 数据服务
item 业务数据库
item 缓存与消息队列
end
group 运行保障
item 日志与监控
item 备份与恢复
end
```

`columns` 支持 1–4 列；`span` 设置上一条目的跨列数；`link` 支持 `->`、`<-` 和 `<>`。完整语法见 [Mermaid 与图表详细教程](../mermaid-guide.zh-CN.md#9-固定分层架构图layers)。
