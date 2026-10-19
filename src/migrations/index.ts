import * as migration_geo_publishing from './20261017_040000_geo_publishing'
import * as migration_geo_articles from './20261017_030000_geo_articles'
import * as migration_geo_creation_tasks from './20261017_020000_geo_creation_tasks'
import * as migration_geo_material_hierarchy from './20261017_050000_geo_material_hierarchy'
import * as migration_geo_publish_plans from './20261017_060000_geo_publish_plans'
import * as migration_geo_visibility from './20261017_070000_geo_visibility'
import * as migration_geo_manual_articles from './20261017_080000_geo_manual_articles'
import * as migration_geo_task_archive from './20261017_090000_geo_task_archive'
import * as migration_geo_plan_archive from './20261017_100000_geo_plan_archive'
import * as migration_geo_term_source_links from './20261018_010000_geo_term_source_links'
import * as migration_20261017_010000_geo_materials_sources from './20261017_010000_geo_materials_sources'
import * as migration_20261016_020000_geo_optimizations from './20261016_020000_geo_optimizations'
import * as migration_20261004_010000_navigation_branding from './20261004_010000_navigation_branding'
import * as migration_20261016_010000_ga4_property_id from './20261016_010000_ga4_property_id'
import * as migration_contact_third_qr from './20260927_020000_contact_third_qr'
import * as migration_20260929_010000_executive_homepage_settings from './20260929_010000_executive_homepage_settings'
import * as migration_20260929_020000_lead_address from './20260929_020000_lead_address'
import * as migration_20260929_030000_faq_tenant_limit from './20260929_030000_faq_tenant_limit'
import * as migration_20260930_010000_register_executive_industrial_pro_template from './20260930_010000_register_executive_industrial_pro_template'
import * as migration_20260930_020000_site_navigation_language_codes from './20260930_020000_site_navigation_language_codes'
import * as migration_20260930_030000_product_translation_jobs from './20260930_030000_product_translation_jobs'
import * as migration_20261001_010000_inquiry_delivery from './20261001_010000_inquiry_delivery'
import * as migration_20261001_020000_translation_usage from './20261001_020000_translation_usage'
import * as migration_20261003_010000_runtime_schema_gaps from './20261003_010000_runtime_schema_gaps'
import * as migration_20260905_153403_initial_platform_schema from './20260905_153403_initial_platform_schema'
import * as migration_20260906_010110_navigation_information_architecture from './20260906_010110_navigation_information_architecture'
import * as migration_20260906_020031_storage_adapter_boundary from './20260906_020031_storage_adapter_boundary'
import * as migration_20260906_094218_phase_b_site_settings from './20260906_094218_phase_b_site_settings'
import * as migration_20260906_104311_phase_c_fastener_content from './20260906_104311_phase_c_fastener_content'
import * as migration_20260906_150940_phase_d_editable_fixed_pages from './20260906_150940_phase_d_editable_fixed_pages'
import * as migration_20260906_152657_phase_d_navigation_documents from './20260906_152657_phase_d_navigation_documents'
import * as migration_20260906_155420_phase_e_product_specifications from './20260906_155420_phase_e_product_specifications'
import * as migration_20260907_144259_step11_category_hierarchy from './20260907_144259_step11_category_hierarchy'
import * as migration_20260908_010239_step12_product_content_fields from './20260908_010239_step12_product_content_fields'
import * as migration_20260908_020000_step13_news_content_fields from './20260908_020000_step13_news_content_fields'
import * as migration_20260908_030000_step14_case_content_fields from './20260908_030000_step14_case_content_fields'
import * as migration_20260908_050000_step18_homepage_modules from './20260908_050000_step18_homepage_modules'
import * as migration_20260908_060000_step19_about_modules from './20260908_060000_step19_about_modules'
import * as migration_20260908_144543_homepage_management_fields from './20260908_144543_homepage_management_fields'
import * as migration_20260909_010000_strength_item_images from './20260909_010000_strength_item_images'
import * as migration_20260927_010000_template_catalog_and_history from './20260927_010000_template_catalog_and_history'
import * as migration_20260927_010001_template_history_locked_document_relations from './20260927_010001_template_history_locked_document_relations'

export const migrations = [
  {
    up: migration_20260905_153403_initial_platform_schema.up,
    down: migration_20260905_153403_initial_platform_schema.down,
    name: '20260905_153403_initial_platform_schema',
  },
  {
    up: migration_20260906_010110_navigation_information_architecture.up,
    down: migration_20260906_010110_navigation_information_architecture.down,
    name: '20260906_010110_navigation_information_architecture',
  },
  {
    up: migration_20260906_020031_storage_adapter_boundary.up,
    down: migration_20260906_020031_storage_adapter_boundary.down,
    name: '20260906_020031_storage_adapter_boundary',
  },
  {
    up: migration_20260906_094218_phase_b_site_settings.up,
    down: migration_20260906_094218_phase_b_site_settings.down,
    name: '20260906_094218_phase_b_site_settings',
  },
  {
    up: migration_20260906_104311_phase_c_fastener_content.up,
    down: migration_20260906_104311_phase_c_fastener_content.down,
    name: '20260906_104311_phase_c_fastener_content',
  },
  {
    up: migration_20260906_150940_phase_d_editable_fixed_pages.up,
    down: migration_20260906_150940_phase_d_editable_fixed_pages.down,
    name: '20260906_150940_phase_d_editable_fixed_pages',
  },
  {
    up: migration_20260906_152657_phase_d_navigation_documents.up,
    down: migration_20260906_152657_phase_d_navigation_documents.down,
    name: '20260906_152657_phase_d_navigation_documents',
  },
  {
    up: migration_20260906_155420_phase_e_product_specifications.up,
    down: migration_20260906_155420_phase_e_product_specifications.down,
    name: '20260906_155420_phase_e_product_specifications',
  },
  {
    up: migration_20260907_144259_step11_category_hierarchy.up,
    down: migration_20260907_144259_step11_category_hierarchy.down,
    name: '20260907_144259_step11_category_hierarchy',
  },
  {
    up: migration_20260908_010239_step12_product_content_fields.up,
    down: migration_20260908_010239_step12_product_content_fields.down,
    name: '20260908_010239_step12_product_content_fields',
  },
  {
    up: migration_20260908_020000_step13_news_content_fields.up,
    down: migration_20260908_020000_step13_news_content_fields.down,
    name: '20260908_020000_step13_news_content_fields',
  },
  {
    up: migration_20260908_030000_step14_case_content_fields.up,
    down: migration_20260908_030000_step14_case_content_fields.down,
    name: '20260908_030000_step14_case_content_fields',
  },
  {
    up: migration_20260908_050000_step18_homepage_modules.up,
    down: migration_20260908_050000_step18_homepage_modules.down,
    name: '20260908_050000_step18_homepage_modules',
  },
  {
    up: migration_20260908_060000_step19_about_modules.up,
    down: migration_20260908_060000_step19_about_modules.down,
    name: '20260908_060000_step19_about_modules',
  },
  {
    up: migration_20260908_144543_homepage_management_fields.up,
    down: migration_20260908_144543_homepage_management_fields.down,
    name: '20260908_144543_homepage_management_fields',
  },
  {
    up: migration_20260909_010000_strength_item_images.up,
    down: migration_20260909_010000_strength_item_images.down,
    name: '20260909_010000_strength_item_images',
  },
  {
    up: migration_20260927_010000_template_catalog_and_history.up,
    down: migration_20260927_010000_template_catalog_and_history.down,
    name: '20260927_010000_template_catalog_and_history',
  },
  {
    up: migration_20260927_010001_template_history_locked_document_relations.up,
    down: migration_20260927_010001_template_history_locked_document_relations.down,
    name: '20260927_010001_template_history_locked_document_relations',
  },
  {
    up: migration_contact_third_qr.up,
    down: migration_contact_third_qr.down,
    name: '20260927_020000_contact_third_qr',
  },
  {
    up: migration_20260929_010000_executive_homepage_settings.up,
    down: migration_20260929_010000_executive_homepage_settings.down,
    name: '20260929_010000_executive_homepage_settings',
  },
  {
    up: migration_20260929_020000_lead_address.up,
    down: migration_20260929_020000_lead_address.down,
    name: '20260929_020000_lead_address',
  },
  {
    up: migration_20260929_030000_faq_tenant_limit.up,
    down: migration_20260929_030000_faq_tenant_limit.down,
    name: '20260929_030000_faq_tenant_limit',
  },
  {
    up: migration_20260930_010000_register_executive_industrial_pro_template.up,
    down: migration_20260930_010000_register_executive_industrial_pro_template.down,
    name: '20260930_010000_register_executive_industrial_pro_template',
  },
  {
    up: migration_20260930_020000_site_navigation_language_codes.up,
    down: migration_20260930_020000_site_navigation_language_codes.down,
    name: '20260930_020000_site_navigation_language_codes',
  },
  {
    up: migration_20260930_030000_product_translation_jobs.up,
    down: migration_20260930_030000_product_translation_jobs.down,
    name: '20260930_030000_product_translation_jobs',
  },
  {
    up: migration_20261001_010000_inquiry_delivery.up,
    down: migration_20261001_010000_inquiry_delivery.down,
    name: '20261001_010000_inquiry_delivery',
  },
  {
    up: migration_20261001_020000_translation_usage.up,
    down: migration_20261001_020000_translation_usage.down,
    name: '20261001_020000_translation_usage',
  },
  {
    up: migration_20261003_010000_runtime_schema_gaps.up,
    down: migration_20261003_010000_runtime_schema_gaps.down,
    name: '20261003_010000_runtime_schema_gaps',
  },
  {
    up: migration_20261004_010000_navigation_branding.up,
    down: migration_20261004_010000_navigation_branding.down,
    name: '20261004_010000_navigation_branding',
  },
  {
    up: migration_20261016_010000_ga4_property_id.up,
    down: migration_20261016_010000_ga4_property_id.down,
    name: '20261016_010000_ga4_property_id',
  },
  {
    up: migration_20261016_020000_geo_optimizations.up,
    down: migration_20261016_020000_geo_optimizations.down,
    name: '20261016_020000_geo_optimizations',
  },
  {
    up: migration_20261017_010000_geo_materials_sources.up,
    down: migration_20261017_010000_geo_materials_sources.down,
    name: '20261017_010000_geo_materials_sources',
  },
  {
    up: migration_geo_creation_tasks.up,
    down: migration_geo_creation_tasks.down,
    name: '20261017_020000_geo_creation_tasks',
  },
  {
    up: migration_geo_articles.up,
    down: migration_geo_articles.down,
    name: '20261017_030000_geo_articles',
  },
  {
    up: migration_geo_publishing.up,
    down: migration_geo_publishing.down,
    name: '20261017_040000_geo_publishing',
  },
  {
    up: migration_geo_material_hierarchy.up,
    down: migration_geo_material_hierarchy.down,
    name: '20261017_050000_geo_material_hierarchy',
  },
  {
    up: migration_geo_publish_plans.up,
    down: migration_geo_publish_plans.down,
    name: '20261017_060000_geo_publish_plans',
  },
  {
    up: migration_geo_visibility.up,
    down: migration_geo_visibility.down,
    name: '20261017_070000_geo_visibility',
  },
  {
    up: migration_geo_manual_articles.up,
    down: migration_geo_manual_articles.down,
    name: '20261017_080000_geo_manual_articles',
  },
  {
    up: migration_geo_task_archive.up,
    down: migration_geo_task_archive.down,
    name: '20261017_090000_geo_task_archive',
  },
  {
    up: migration_geo_plan_archive.up,
    down: migration_geo_plan_archive.down,
    name: '20261017_100000_geo_plan_archive',
  },
  {
    up: migration_geo_term_source_links.up,
    down: migration_geo_term_source_links.down,
    name: '20261018_010000_geo_term_source_links',
  },
]
