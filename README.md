<p align="center"><img src="assets/icon.png" width="96" alt="DKIP"></p>

<h1 align="center">DKIP</h1>
<p align="center">Windows için Xtream Codes destekli IPTV oynatıcı</p>

<p align="center">
  <a href="https://github.com/dkarakurt/dkip/releases/latest/download/DKIP-Windows.zip"><b>⬇ Windows için indir</b></a>
</p>

---

DKIP, IPTV sağlayıcınızın verdiği **sunucu adresi, kullanıcı adı ve şifre** ile çalışan bir masaüstü oynatıcıdır.
Uygulamanın içinde herhangi bir kanal, film veya yayın listesi **bulunmaz**; içerik tamamen kullanıcının kendi aboneliğinden gelir.

## Özellikler

- **Canlı TV** — kategoriler, kanal listesi, yayın akışı (EPG), ↑ ↓ ile kanal değiştirme
- **Filmler** — afiş ızgarası, film detayları, kaldığın yerden devam et
- **Diziler** — sezon/bölüm listesi, otomatik sonraki bölüm
- Arama, favoriler, "İzlemeye devam et" listesi
- Birden fazla hesap kaydetme
- M3U linkinden (`get.php?username=…&password=…`) otomatik bilgi doldurma
- Açılmayan içerik için tek tıkla **VLC'de aç**

## Kurulum

1. [DKIP-Windows.zip](https://github.com/dkarakurt/dkip/releases/latest/download/DKIP-Windows.zip) dosyasını indirin.
2. Bir klasöre çıkarın ve `DKIP\DKIP.exe` dosyasını çalıştırın. Kurulum gerekmez.
3. Windows SmartScreen "Bilinmeyen yayımcı" uyarısı verirse **Ek bilgi → Yine de çalıştır** deyin.

Kısayollar ve sorun giderme için [BENIOKU.txt](BENIOKU.txt) dosyasına bakın.

## Geliştirme

[Node.js](https://nodejs.org) 20+ gerekir.

```bash
npm install
npm start          # uygulamayı geliştirme modunda açar
npm run dist       # Windows paketini dist/ klasörüne derler
```

## Yeni sürüm yayınlama

1. GitHub'da **Releases → Draft a new release** sayfasını açın.
2. **Choose a tag** kutusuna yeni sürümü yazın (ör. `v1.0.2`) ve **Create new tag** deyin.
3. Başlık ve açıklamayı girip **Publish release**'e basın.

GitHub Actions birkaç dakika içinde Windows paketini derleyip `DKIP-Windows.zip` olarak o sürüme ekler.
Uygulamanın sürüm numarası etiketten otomatik alınır.

İndirme linki her zaman en son sürümü gösterir:
`https://github.com/dkarakurt/dkip/releases/latest/download/DKIP-Windows.zip`

## Teknik

Electron · [hls.js](https://github.com/video-dev/hls.js) · [mpegts.js](https://github.com/xqq/mpegts.js)
