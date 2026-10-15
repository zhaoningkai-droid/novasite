# 第三方声明

本声明说明仓库中已知的上游代码、依赖和演示素材边界。请结合各组件随附的原始许可阅读；本项目 MIT License 不会覆盖第三方材料。

## Payload 上游

NovaSite 的部分结构和初始文件来自 Payload CMS 的 Website Template，使用 Payload CMS、Next.js adapter、插件及其公开 API。Payload 相关代码遵循其原有 MIT 许可和版权归属。上游项目及模板：

- <https://github.com/payloadcms/payload>
- <https://github.com/payloadcms/payload/tree/3.x/templates/website>

本项目保留了来源声明；NovaSite 业务代码的具体许可见根目录 [LICENSE](./LICENSE)。

## 依赖项

运行依赖和开发依赖按 `package.json`、npm/pnpm lockfile 中的精确版本选择，各自许可独立适用。分发二进制构建或第三方依赖时，应按相应包发布的 NOTICE/许可要求补全归属。不得把依赖项整体描述为 NovaSite 自有代码。

## 演示图片与产品资料

- 古建演示模板的远程图片清单见 `public/template-demos/executive-industrial-pro-v1/assets-manifest.json`。清单包含 Pexels 来源页、摄影者和记录状态；来源或摄影者标为未核实的图片应在公开商业复用前单独复核。
- 配电柜和紧固件演示图的来源清单见 `public/template-demos/industry/assets-manifest.json`。其中图片注明 Pexels 来源页，或注明系用户先前授权复用的已生成演示图。演示图不得写入客户媒体或描述为真实客户案例、企业资质或交付成果。
- Pexels 的许可允许按其条款使用照片/视频，但不等于素材可按 MIT 再许可；尤其不能把素材作为独立图库或未变更原图包再分发。详见 [Pexels License](https://www.pexels.com/license/)。
- 演示 PDF 带有演示用途标识，不代表真实报价、产品规格承诺或客户资料。

模板素材的来源记录不是法律意见或永久权利保证；在改变用途、离线打包或商业再分发前，应复核来源页和适用条款。

## 设计参考

若干早期管理后台参考截图不属于生产运行时素材，权利来源无法仅凭仓库确认，因此它们已从本候选的当前文件树移除。保留的历史 Git commits 中仍可能包含这些旧二进制对象；本次没有改写 Git 历史。公开同步前应由仓库负责人确认是否需要另行处理历史对象和通知。
