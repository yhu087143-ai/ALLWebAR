// Runs HTTP Next.js dev server + HTTPS proxy for mobile testing.
// Usage: node scripts/dev-https.mjs
// Desktop: http://localhost:3002
// Mobile:  https://<本机局域网IP>:3011 (install mkcert CA first)
//
// 端口可用环境变量覆盖；默认 HTTPS 3011（原来写死 3001，和 AR 平台后端 3001 撞车，
// 一起跑的时候两边必有一个起不来）。
import { createServer as https } from "https";
import { networkInterfaces } from "os";
import { createServer as http, request as httpReq } from "http";
import { readFileSync } from "fs";
import next from "next";

const HTTPS_PORT = Number(process.env.PH_HTTPS_PORT || 3011);
const HTTP_PORT = Number(process.env.PH_HTTP_PORT || 3002);

function lanIp() {
  for (const name of Object.keys(networkInterfaces())) {
    for (const iface of networkInterfaces()[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

// HTTP Next.js dev server
const app = next({ dev: true, hostname: "0.0.0.0", port: HTTP_PORT });
const handle = app.getRequestHandler();
app.prepare().then(() => {
  http((req, res) => handle(req, res)).listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`> HTTP dev  http://localhost:${HTTP_PORT}`);
  });
});

// HTTPS proxy (simple forward without header munging)
const opts = { key: readFileSync("./localhost+2-key.pem"), cert: readFileSync("./localhost+2.pem") };
https(opts, (req, res) => {
  const pr = httpReq(
    { hostname: "127.0.0.1", port: HTTP_PORT, path: req.url, method: req.method, headers: req.headers },
    (prs) => { res.writeHead(prs.statusCode, prs.headers); prs.pipe(res); }
  );
  pr.on("error", () => res.destroy());
  req.pipe(pr);
}).listen(HTTPS_PORT, "0.0.0.0", () => {
  console.log(`> HTTPS proxy https://localhost:${HTTPS_PORT} → http://127.0.0.1:${HTTP_PORT}`);
  console.log(`> Network     https://${lanIp()}:${HTTPS_PORT}`);
});
