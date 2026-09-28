import * as migration_contact_third_qr from './20260927_020000_contact_third_qr'
import * as migration_20260905_153403_initial_platform_schema from './20260905_153403_initial_platform_schema';
import * as migration_20260906_010110_navigation_information_architecture from './20260906_010110_navigation_information_architecture';
import * as migration_20260906_020031_storage_adapter_boundary from './20260906_020031_storage_adapter_boundary';
import * as migration_20260906_094218_phase_b_site_settings from './20260906_094218_phase_b_site_settings';
import * as migration_20260906_104311_phase_c_fastener_content from './20260906_104311_phase_c_fastener_content';
import * as migration_20260906_150940_phase_d_editable_fixed_pages from './20260906_150940_phase_d_editable_fixed_pages';
import * as migration_20260906_152657_phase_d_navigation_documents from './20260906_152657_phase_d_navigation_documents';
import * as migration_20260906_155420_phase_e_product_specifications from './20260906_155420_phase_e_product_specifications';
import * as migration_20260907_144259_step11_category_hierarchy from './20260907_144259_step11_category_hierarchy';
import * as migration_20260908_010239_step12_product_content_fields from './20260908_010239_step12_product_content_fields';
import * as migration_20260908_020000_step13_news_content_fields from './20260908_020000_step13_news_content_fields';
import * as migration_20260908_030000_step14_case_content_fields from './20260908_030000_step14_case_content_fields';
import * as migration_20260908_050000_step18_homepage_modules from './20260908_050000_step18_homepage_modules';
import * as migration_20260908_060000_step19_about_modules from './20260908_060000_step19_about_modules';
import * as migration_20260908_144543_homepage_management_fields from './20260908_144543_homepage_management_fields';
import * as migration_20260909_010000_strength_item_images from './20260909_010000_strength_item_images';
import * as migration_20260927_010000_template_catalog_and_history from './20260927_010000_template_catalog_and_history';
import * as migration_20260927_010001_template_history_locked_document_relations from './20260927_010001_template_history_locked_document_relations';

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
  { up: migration_contact_third_qr.up, down: migration_contact_third_qr.down, name: '20260927_020000_contact_third_qr' },
];
