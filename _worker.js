export default {
  // 处理普通的 HTTP 请求（通过链接访问动态生成 M3U）
  async fetch(request, env, ctx) {
    return await generateM3U();
  },

  // 处理 Cron 定时任务触发（如果你绑定了 Cron 触发器）
  async scheduled(event, env, ctx) {
    // 默认情况下 Cron 只是执行一下，如果要把结果存起来，你需要配置 KV 空间。
    // 这里执行抓取逻辑以保持活跃，或在此处添加 KV 写入逻辑。
    console.log("Cron triggered, fetching latest schedule...");
    await generateM3U();
  }
};

async function generateM3U() {
  const apiUrl = 'https://www.kafeizhibo.com/api/v1/schedule';
  
  try {
    // 1. 抓取 API 数据
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const json = await response.json();

    if (json.code !== 200 || !json.data) {
      return new Response('API returned an error or no data.', { status: 500 });
    }

    let matches = json.data;
    const now = Date.now();

    // 2. 过滤掉没有直播链接 (stream_url) 的无效数据
    matches = matches.filter(item => item.archor && item.archor.stream_url);

    // 3. 按时间距离当前时间最近的排名靠前排序
    matches.sort((a, b) => {
      // 将 "2026-04-22 15:30" 转换为兼容性更好的 "2026/04/22 15:30" 获取时间戳
      const timeA = new Date(a.start_time.replace(/-/g, '/')).getTime();
      const timeB = new Date(b.start_time.replace(/-/g, '/')).getTime();
      
      const diffA = Math.abs(timeA - now);
      const diffB = Math.abs(timeB - now);
      
      return diffA - diffB;
    });

    // 4. 拼接 M3U 头部
    let m3u = '#EXTM3U x-tvg-url=""\n';

    // 5. 遍历格式化输出
    matches.forEach(item => {
      // 提取字段并去除所有空格
      const cleanTime = item.start_time.replace(/\s+/g, '');
      const cleanLeague = (item.league_name || '未知联赛').replace(/\s+/g, '');
      const cleanHome = (item.home_team || '未知').replace(/\s+/g, '');
      const cleanAway = (item.away_team || '未知').replace(/\s+/g, '');
      
      // 组合频道名：名字:时间联赛名:AvsB
      const channelName = `${cleanTime}${cleanLeague}:${cleanHome}vs${cleanAway}`;
      
      // 获取 Logo（优先使用主队 Logo，如果没有则用默认截图）
      const logo = item.home_team_logo || item.screenshot || '';
      
      // 直播流地址
      const streamUrl = item.archor.stream_url;

      // 写入 M3U 格式，统一分组叫 "咖啡线路"
      m3u += `#EXTINF:-1 tvg-logo="${logo}" group-title="咖啡线路",${channelName}\n`;
      m3u += `${streamUrl}\n`;
    });

    // 6. 返回 M3U 文件
    return new Response(m3u, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Content-Disposition': 'inline; filename="kafeizhibo.m3u"',
        // 设置缓存时间为 60 秒，避免被播放器频繁重试导致请求过多
        'Cache-Control': 'max-age=60' 
      }
    });

  } catch (error) {
    return new Response(`Error generating M3U: ${error.message}`, { status: 500 });
  }
}
