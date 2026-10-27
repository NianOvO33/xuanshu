/**
 * 玄枢 · AI 解读代理（Cloudflare Worker）
 * ------------------------------------------------------------
 * 用途：给不支持浏览器跨域（CORS）的模型接口加一层转发，
 *      例如智谱 open.bigmodel.cn；同时解决 https 页面无法访问
 *      http://localhost 的问题。
 *
 * 部署（约两分钟，免费额度足够个人使用）：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件全部内容粘进去，按需修改下面的 UPSTREAM
 *   3. Deploy，得到一个 https://xxx.workers.dev 地址
 *   4. 回到玄枢 → 顶栏 ✦ → 接口地址填：
 *        https://xxx.workers.dev/chat/completions
 *      模型与 Key 保持不变（与官方文档一致）
 *
 * 注意：Worker 会把请求原样转发给 UPSTREAM，Key 由你自己的浏览器发出，
 *      不会保存在 Worker 里（除非你主动开启下面的 INJECT_KEY）。
 */

// 目标接口的域名，按你用的服务商改这一行即可
const UPSTREAM = 'https://api.deepseek.com';

// 可选：若希望访客无需自带 Key，取消注释，并在 Worker 的
// Settings → Variables 里添加加密变量 DEEPSEEK_KEY。
// ⚠️ 这样任何拿到地址的人都能消耗你的额度，请自行加限流或仅自用。
// const INJECT_KEY = env.DEEPSEEK_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'POST') {
      return json({ error: '只支持 POST' }, 405);
    }

    const url = new URL(request.url);
    const target = UPSTREAM.replace(/\/+$/, '') + url.pathname + url.search;

    const auth = request.headers.get('authorization');
    const injected = env && env.DEEPSEEK_KEY ? 'Bearer ' + env.DEEPSEEK_KEY : '';

    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: auth } : injected ? { Authorization: injected } : {})
        },
        body: await request.arrayBuffer()
      });
    } catch (err) {
      return json({ error: '上游不可达：' + err.message }, 502);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
