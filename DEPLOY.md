# 部署到公网 Linux VPS

目标:同学用手机访问 `http://<VPS_IP>:5123/request` 点歌,大屏开 `/play` 播放。

## 架构(只需对外开放 1 个端口)

```
公网用户 ──http──> ② Flask 后端 :5123  ← 只有它对外(安全组/防火墙放行 5123)
                     ├─ 托管页面 /request /play 和 /api/*
                     └─ 本机转发 ──> ③ Node 网易云 API :3000(仅 localhost,不对外)
前端是静态构建产物,由 Flask 托管,不单独跑。
```

## 前置(VPS 上一次性装好)

```bash
# Node(给 api-server)、Python3、pip、可选 pnpm
sudo apt update
sudo apt install -y nodejs npm python3 python3-venv python3-pip
sudo npm i -g pnpm        # 可选
```

---

## 步骤 1:Node 网易云 API(:3000)

`services/api-server` 是第三方 NeteaseCloudMusicApi。**不要从 Windows 拷 node_modules**,在 VPS 上重装:

```bash
cd services/api-server
pnpm install          # 或 npm install
node app.js           # 监听 3000;先手动确认能起来
```

## 步骤 2:前端构建产物(在你本机构建,拷到 VPS)

服务器**不需要**构建前端(省去 vendor-amll / junction / svgr 那套)。在你 Windows 本机:

```powershell
cd frontend
pnpm build
# 把 frontend/dist/ 整个内容拷到 VPS 的 services/backend/player-dist/
# 例如:scp -r frontend/dist/* user@VPS:/path/music-request-player/services/backend/player-dist/
```
> 以后改了前端,只需本机重新 build 再 scp 覆盖 `player-dist/` 即可。

## 步骤 3:Flask 后端(:5123,对外)

```bash
cd services/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt    # flask + requests
.venv/bin/pip install gunicorn               # 生产服务器

# 手动起一次确认(生产用 gunicorn,不要用 app.py 自带的开发服务器):
NETEASE_API_BASE=http://localhost:3000 \
  .venv/bin/gunicorn -w 2 -b 0.0.0.0:5123 app:app
```

确认 `http://<VPS_IP>:5123/request` 能打开后,进入下面的常驻配置。

---

## 常驻运行(systemd,开机自启 + 崩溃重启)

`/etc/systemd/system/ncm-api.service`:
```ini
[Unit]
Description=NeteaseCloudMusicApi
After=network.target
[Service]
WorkingDirectory=/path/music-request-player/services/api-server
ExecStart=/usr/bin/node app.js
Restart=always
[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/ncm-web.service`:
```ini
[Unit]
Description=Music Request Flask backend
After=ncm-api.service
[Service]
WorkingDirectory=/path/music-request-player/services/backend
Environment=NETEASE_API_BASE=http://localhost:3000
ExecStart=/path/music-request-player/services/backend/.venv/bin/gunicorn -w 2 -b 0.0.0.0:5123 app:app
Restart=always
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ncm-api ncm-web
sudo systemctl status ncm-web     # 看是否 running
```

## 开放端口

云厂商**安全组**放行 TCP 5123(入站),以及 VPS 本机防火墙:
```bash
sudo ufw allow 5123/tcp
```

## 访问

- 点歌页:`http://<VPS_IP>:5123/request`
- 大屏播放器:`http://<VPS_IP>:5123/play`

---

## 注意事项

- **网易云登录**:VIP/版权歌的播放地址需登录。开 `/play` 右上角菜单扫码,cookie 持久化在 `services/backend/data/ncm_auth.txt`,重启后端会自动加载。
- **没有密码**:当前后端已去掉访问密码,放行公网后**任何人都能点歌**。仅班级内用可接受;否则建议加 nginx Basic Auth 或恢复密码。
- **HTTPS(可选)**:用 nginx 反代 5123 + certbot 上证书,即可 `https://你的域名`;手机端某些场景(如需要麦克风/剪贴板)也更友好。
- **代码上传**:仓库目前无远程。可在 VPS `git clone`(先推到新远程),或本机 `rsync -av --exclude node_modules --exclude .venv ./ user@VPS:/path/`(api-server 的 node_modules、backend 的 .venv 都在 VPS 上重建)。
