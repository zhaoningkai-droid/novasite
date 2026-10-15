# V1 重点模板与代码入口

本文说明当前源码中的重点模板结构。它是代码导航，不宣称三套模板已完成所有视觉矩阵、客户验收或独立部署验证。

## V1 重点模板

| 产品方向 | 模板 key | 当前实现入口 | 页面结构/数据来源 |
| --- | --- | --- | --- |
| 古建演示 | `executive-industrial-pro-v1` | `src/platform/legacy-templates`；注册描述在 `src/platform/legacy-template-catalog.ts` | 独立模板演示路由使用演示模型与 `public/template-demos/executive-industrial-pro-v1` 素材；客户站由 tenant renderer 读取租户内容 |
| 配电柜 | `power-705-v1` | `src/platform/new-templates/registry.ts`、`src/platform/industry-templates` | 行业模板演示/租户 renderer 支持首页、产品目录、详情、新闻、案例、关于、FAQ、联系等页面模型；素材见 `public/template-demos/industry` |
| 紧固件 | `autoparts-571-v1` | 同一 registry 与 `src/platform/industry-templates` | 标准件产品目录、参数资料和询盘；演示模型与客户租户内容应隔离 |

注册表仍含家居、通用机械、光伏测试等历史/演示条目。它们不是当前用户指定的 V1 三套重点，但可能仍被库中 tenant 或历史记录引用。清理或隐藏需要单独确认，不属于这次 Git 同步。

## 演示预览与客户网站的数据边界

- `/template-demo/...` 或受控模板预览用于展示填充好的示例内容。
- `/s/{site}/{lang}/...` 是租户网站渲染路由，读取所选公司的数据。
- 产品要求：演示数据不得写入新客户租户；客户选择模板后，其未填写内容应为空；切换模板保留已有客户内容。
- 以上数据隔离要求不是把 demo JSON 放进客户 collection 的理由。变更模板展示和模板应用逻辑前，应分别检查 demo route、tenant route、`applyTemplate` endpoint、公司关系过滤和模板历史回退。

## 公共素材

行业演示资源由 Pexels 图片和此前已授权复用的生成图构成。图片来源/用途摘要在 `public/template-demos/industry/assets-manifest.json`。古建演示的 Pexels 来源见专用 manifest。模板演示 PDF 明确为示例，不代表真实产品保证。

发现演示内容中的企业联系方式可能指向真实企业；在确认其为虚构测试数据或经授权公开之前，不要将含该内容的演示代码和 PDF 作为公开候选上传。具体审核项记录在 `PROJECT_STATUS.md`。

## 后续验收建议

1. 在只含空租户的隔离环境打开每个重点模板，确认预览显示示例、客户站不继承示例内容。
2. 添加真实测试租户内容后切换模板，确认产品、新闻、案例、FAQ、关于、联系信息与媒体不丢失。
3. 分别覆盖桌面和窄屏，核对列表、详情、报价弹窗、语言和表单。
4. 验证素材清单中的文件 hash/source、第三方许可和 PDF 可见的示例标识。
