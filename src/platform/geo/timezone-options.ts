export type GeoTimezoneOption = { value: string; label: string }
export type GeoTimezoneGroup = { label: string; options: GeoTimezoneOption[] }

/** Region-grouped choices shown by the reference GEO publishing page. */
export const geoTimezoneGroups: GeoTimezoneGroup[] = [
  {
    label: '亚洲',
    options: [
      { value: 'Asia/Shanghai', label: '中国/新加坡/马来西亚/菲律宾 (UTC+8)' },
      { value: 'Asia/Tokyo', label: '日本/韩国 (UTC+9)' },
      { value: 'Asia/Bangkok', label: '泰国/柬埔寨/老挝/印度尼西亚西部/越南 (UTC+7)' },
      { value: 'Asia/Dubai', label: '阿联酋/阿曼/阿塞拜疆/亚美尼亚/格鲁吉亚 (UTC+4)' },
      { value: 'Asia/Karachi', label: '巴基斯坦/乌兹别克斯坦/塔吉克斯坦/土库曼斯坦 (UTC+5)' },
      { value: 'Asia/Kolkata', label: '印度/斯里兰卡 (UTC+5:30)' },
      { value: 'Asia/Dhaka', label: '孟加拉国/不丹/哈萨克斯坦 (UTC+6)' },
      { value: 'Asia/Yangon', label: '缅甸 (UTC+6:30)' },
      { value: 'Asia/Riyadh', label: '沙特阿拉伯/伊拉克/科威特/卡塔尔/巴林/也门 (UTC+3)' },
      { value: 'Asia/Tehran', label: '伊朗 (UTC+3:30)' },
      { value: 'Asia/Vladivostok', label: '俄罗斯/远东 (UTC+10)' },
    ],
  },
  {
    label: '北美',
    options: [
      { value: 'Pacific/Honolulu', label: '美国/夏威夷 (UTC-10)' },
      { value: 'America/Anchorage', label: '美国/阿拉斯加 (UTC-9/-8)' },
      { value: 'America/Los_Angeles', label: '美国/加拿大/太平洋沿岸 (UTC-8/-7)' },
      { value: 'America/Denver', label: '美国/加拿大/山地时区 (UTC-7/-6)' },
      { value: 'America/Phoenix', label: '美国/亚利桑那 (UTC-7)' },
      { value: 'America/Chicago', label: '美国/加拿大/墨西哥/危地马拉/洪都拉斯/萨尔瓦多 (UTC-6/-5)' },
      { value: 'America/New_York', label: '美国/加拿大/古巴/巴哈马/海地 (UTC-5/-4)' },
      { value: 'America/Halifax', label: '加拿大/新斯科舍/新不伦瑞克 (UTC-4/-3)' },
      { value: 'America/St_Johns', label: '加拿大/纽芬兰 (UTC-3:30/-2:30)' },
    ],
  },
  {
    label: '南美',
    options: [
      { value: 'America/Lima', label: '秘鲁/厄瓜多尔/哥伦比亚/巴拿马 (UTC-5)' },
      { value: 'America/Caracas', label: '玻利维亚/委内瑞拉 (UTC-4)' },
      { value: 'America/Santiago', label: '智利/巴拉圭 (UTC-4/-3)' },
      { value: 'America/Sao_Paulo', label: '巴西/苏里南/法属圭亚那 (UTC-3/-2)' },
      { value: 'America/Argentina/Buenos_Aires', label: '阿根廷/乌拉圭 (UTC-3)' },
    ],
  },
  {
    label: '欧洲',
    options: [
      { value: 'Europe/London', label: '英国/爱尔兰/葡萄牙/冰岛 (UTC+0/+1)' },
      { value: 'Europe/Berlin', label: '法国/德国/意大利/西班牙/瑞士/奥地利/波兰/荷兰/比利时/瑞典/挪威/丹麦/捷克/匈牙利等 (UTC+1/+2)' },
      { value: 'Europe/Helsinki', label: '希腊/芬兰/保加利亚/罗马尼亚/乌克兰/塞浦路斯/爱沙尼亚/拉脱维亚/立陶宛 (UTC+2/+3)' },
      { value: 'Europe/Moscow', label: '俄罗斯西部/白俄罗斯/土耳其 (UTC+3)' },
      { value: 'Europe/Samara', label: '俄罗斯/萨马拉地区 (UTC+4)' },
    ],
  },
  {
    label: '非洲',
    options: [
      { value: 'Africa/Accra', label: '加纳/科特迪瓦/塞内加尔/马里/布基纳法索/冈比亚/几内亚比绍 (UTC+0)' },
      { value: 'Africa/Lagos', label: '尼日利亚/阿尔及利亚/喀麦隆/突尼斯/摩洛哥/乍得/贝宁/加蓬/尼日尔 (UTC+1)' },
      { value: 'Africa/Cairo', label: '埃及/南非/利比亚/苏丹/南苏丹/津巴布韦/赞比亚/博茨瓦纳/莫桑比克 (UTC+2)' },
      { value: 'Africa/Nairobi', label: '肯尼亚/埃塞俄比亚/乌干达/坦桑尼亚/索马里/马达加斯加/吉布提/科摩罗 (UTC+3)' },
    ],
  },
  {
    label: '大洋洲',
    options: [
      { value: 'Australia/Perth', label: '澳大利亚/西澳 (UTC+8)' },
      { value: 'Australia/Darwin', label: '澳大利亚/北领地 (UTC+9:30)' },
      { value: 'Australia/Adelaide', label: '澳大利亚/南澳 (UTC+9:30/+10:30)' },
      { value: 'Australia/Brisbane', label: '澳大利亚/昆士兰 (UTC+10)' },
      { value: 'Australia/Sydney', label: '澳大利亚/新南威尔士/维多利亚/塔斯马尼亚 (UTC+10/+11)' },
      { value: 'Pacific/Noumea', label: '新喀里多尼亚/所罗门群岛/瓦努阿图 (UTC+11)' },
      { value: 'Pacific/Auckland', label: '新西兰/斐济 (UTC+12/+13)' },
      { value: 'Pacific/Tongatapu', label: '汤加 (UTC+13)' },
      { value: 'Pacific/Kiritimati', label: '基里巴斯/莱恩群岛 (UTC+14)' },
    ],
  },
  {
    label: '其他',
    options: [
      { value: 'Etc/GMT+12', label: '贝克岛/豪兰岛 (UTC-12)' },
      { value: 'Pacific/Pago_Pago', label: '美属萨摩亚/纽埃 (UTC-11)' },
      { value: 'Atlantic/South_Georgia', label: '南乔治亚岛/费尔南多-迪诺罗尼亚 (UTC-2)' },
      { value: 'Atlantic/Azores', label: '葡萄牙/亚速尔群岛 (UTC-1/+0)' },
      { value: 'Atlantic/Cape_Verde', label: '佛得角 (UTC-1)' },
      { value: 'UTC', label: '协调世界时 (UTC+0)' },
      { value: 'Etc/GMT', label: '格林威治标准时间 (UTC+0)' },
    ],
  },
]

export const geoTimezoneOptions = geoTimezoneGroups.flatMap((group) => group.options)
